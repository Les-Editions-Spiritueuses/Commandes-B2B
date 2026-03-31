import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";

import {
  computeRecapCommande,
  computeRemiseTotaleEquivalentePct,
  computeTarifRemiseHT,
  round2,
  toNumber,
  type LigneCommandeInput,
  type PalierRemise,
  type ParametresFiscaux,
  type ProduitCommande,
  type RegimeFiscal,
  type TrancheExpedition,
} from "@/lib/calculs-commande";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type LignePdf = {
  produit_code: string;
  produit_libelle: string;
  categorie_fiscale?: string | null;
  alcool_vol: number;
  volume_l: number;
  quantite: number;
  tarif_base_ht: number;
  remise_a: number;
  remise_b: number;
  remise_c: number;
  remise_d: number;
  prix_unitaire_remise_ht: number;
  total_ht_ligne: number;
  droits_ligne: number;
  tva_ligne: number;
  total_ttc_ligne: number;
};

type LignePdfCalculee = LignePdf & {
  total_ht_acquitte_ligne: number;
  remise_totale_equivalente_pct: number;
};

type CommandePdf = {
  id: string | number;
  numero_commande?: string | null;
  numero_proforma?: string | null;
  code_client?: string | null;
  client_raison_sociale?: string | null;
  client_contact?: string | null;
  client_email?: string | null;
  client_telephone?: string | null;
  client_siret?: string | null;
  client_tva_intracom?: string | null;
  client_iban?: string | null;
  client_regime_fiscal?: string | null;
  facturation_adresse_ligne_1?: string | null;
  facturation_adresse_ligne_2?: string | null;
  facturation_code_postal?: string | null;
  facturation_ville?: string | null;
  facturation_pays?: string | null;
  livraison_diff?: boolean | null;
  livraison_nom?: string | null;
  livraison_adresse_ligne_1?: string | null;
  livraison_adresse_ligne_2?: string | null;
  livraison_code_postal?: string | null;
  livraison_ville?: string | null;
  livraison_pays?: string | null;
  total_quantite?: number | null;
  remise_palier_appliquee?: number | null;
  frais_expedition_ttc?: number | null;
  montant_ht_remise?: number | null;
  montant_droits?: number | null;
  montant_ht_acquitte?: number | null;
  montant_tva?: number | null;
  montant_ttc?: number | null;
  type_proforma?: string | null;
  statut?: string | null;
  date_creation?: string | null;
  date_echeance?: string | null;
  created_at?: string | null;
};

function pdfSafe(value: unknown): string {
  return String(value ?? "")
    .replace(/\u202F/g, " ")
    .replace(/\u00A0/g, " ")
    .replace(/[’]/g, "'")
    .replace(/[–—]/g, "-");
}

function euro(value: unknown): string {
  const formatted = new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value));

  return pdfSafe(formatted);
}

function num(value: unknown, digits = 2): string {
  return pdfSafe(toNumber(value).toFixed(digits).replace(".", ","));
}

function pct(value: unknown, digits = 2): string {
  return pdfSafe(`${toNumber(value).toFixed(digits).replace(".", ",")} %`);
}

function text(value: unknown): string {
  return pdfSafe(value);
}

function dateFr(value: unknown): string {
  if (!value) return "";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "";
  return pdfSafe(d.toLocaleDateString("fr-FR"));
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function cleanRegime(value: unknown): string {
  const v = pdfSafe(value);
  if (v === "DROITS_SUSPENDUS") return "Droits suspendus";
  if (v === "DROITS_ACQUITTES") return "Droits acquittés";
  return v;
}

function safeText(value: unknown, fallback = "-"): string {
  const v = pdfSafe(value).trim();
  return v === "" ? fallback : v;
}

/**
 * Normalise un taux de remise :
 * - 5 => 5
 * - 0.05 => 5
 */
function normalizePct(value: unknown): number {
  const n = toNumber(value);
  if (n > 0 && n <= 1) return n * 100;
  return n;
}

function parseQuantities(searchParams: URLSearchParams): Record<string, number> {
  const result: Record<string, number> = {};

  for (const [key, value] of searchParams.entries()) {
    if (!key.startsWith("qte_")) continue;

    const produitCode = key.replace("qte_", "").trim();
    const quantite = Number(value ?? 0);

    if (!produitCode) continue;
    if (!Number.isFinite(quantite)) continue;
    if (quantite <= 0) continue;

    result[produitCode] = Math.floor(quantite);
  }

  return result;
}

function getRemiseCoffretPct(row: Record<string, unknown>): number {
  const raw = Number(row.remise_coffret ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return raw * 100;
}

async function getTranchesExpedition(): Promise<TrancheExpedition[]> {
  const { data, error } = await supabase
    .from("tranches_expedition")
    .select("id, qte_min, qte_max, frais_ttc, ordre")
    .order("ordre", { ascending: true });

  if (error) {
    throw new Error(`erreur chargement tranches_expedition: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    qte_min: toNumber(row.qte_min),
    qte_max: row.qte_max == null ? null : toNumber(row.qte_max),
    frais_ttc: toNumber(row.frais_ttc),
  }));
}

async function getParametresFiscaux(): Promise<ParametresFiscaux> {
  const { data, error } = await supabase
    .from("parametres_fiscaux")
    .select("*")
    .eq("actif", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`erreur chargement parametres_fiscaux: ${error.message}`);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error("Aucun paramètre fiscal actif trouvé.");
  }

  return {
    taux_droits_alcool: toNumber(row.taux_droits_alcool),
    taux_vignette_alcool: toNumber(row.taux_vignette_alcool),
    taux_droits_rhum_dom: toNumber(row.taux_droits_rhum_dom),
    taux_vignette_rhum_dom: toNumber(row.taux_vignette_rhum_dom),
    taux_droits_abv: toNumber(row.taux_droits_abv),
    taux_vignette_abv: toNumber(row.taux_vignette_abv),
    taux_tva: toNumber(row.taux_tva ?? 20),
    remise_fixe_pro: toNumber(row.remise_fixe_pro ?? 5),
  };
}

function recalculateLigneFromStored(
  ligne: LignePdf,
  regimeFiscal: string | null | undefined
): LignePdfCalculee {
  const tarifBaseHT = toNumber(ligne.tarif_base_ht);
  const quantite = toNumber(ligne.quantite);

  const remiseA = normalizePct(ligne.remise_a);
  const remiseB = normalizePct(ligne.remise_b);
  const remiseC = normalizePct(ligne.remise_c);
  const remiseD = normalizePct(ligne.remise_d);

  const prixUnitaireRemiseHT = computeTarifRemiseHT(
    tarifBaseHT,
    remiseA,
    remiseB,
    remiseC,
    remiseD
  );

  const totalHTLigne = round2(prixUnitaireRemiseHT * quantite);
  const droitsLigne = round2(toNumber(ligne.droits_ligne));
  const totalHTAcquitteLigne =
    regimeFiscal === "DROITS_ACQUITTES"
      ? round2(totalHTLigne + droitsLigne)
      : totalHTLigne;

  const tvaLigne = round2(toNumber(ligne.tva_ligne));
  const totalTTCLigne = round2(totalHTAcquitteLigne + tvaLigne);

  return {
    ...ligne,
    quantite,
    alcool_vol: toNumber(ligne.alcool_vol),
    volume_l: toNumber(ligne.volume_l),
    tarif_base_ht: tarifBaseHT,
    remise_a: remiseA,
    remise_b: remiseB,
    remise_c: remiseC,
    remise_d: remiseD,
    prix_unitaire_remise_ht: prixUnitaireRemiseHT,
    total_ht_ligne: totalHTLigne,
    droits_ligne: droitsLigne,
    tva_ligne: tvaLigne,
    total_ttc_ligne: totalTTCLigne,
    total_ht_acquitte_ligne: totalHTAcquitteLigne,
    remise_totale_equivalente_pct: computeRemiseTotaleEquivalentePct(
      remiseA,
      remiseB,
      remiseC,
      remiseD
    ),
  };
}

function enrichCommandeTotals(
  commande: CommandePdf,
  lignes: LignePdfCalculee[],
  fraisExpeditionTtc: number
): CommandePdf {
  const totalQuantiteCalc = round2(
    lignes.reduce((sum, l) => sum + toNumber(l.quantite), 0)
  );
  const montantHtRemiseCalc = round2(
    lignes.reduce((sum, l) => sum + toNumber(l.total_ht_ligne), 0)
  );
  const montantDroitsCalc = round2(
    lignes.reduce((sum, l) => sum + toNumber(l.droits_ligne), 0)
  );
  const montantTvaCalc = round2(
    lignes.reduce((sum, l) => sum + toNumber(l.tva_ligne), 0)
  );
  const montantHtAcquitteCalc = round2(montantHtRemiseCalc + montantDroitsCalc);
  const montantTtcCalc = round2(
    montantHtAcquitteCalc + montantTvaCalc + fraisExpeditionTtc
  );

  return {
    ...commande,
    total_quantite: totalQuantiteCalc,
    montant_ht_remise: montantHtRemiseCalc,
    montant_droits: montantDroitsCalc,
    montant_tva: montantTvaCalc,
    montant_ht_acquitte: montantHtAcquitteCalc,
    frais_expedition_ttc: round2(fraisExpeditionTtc),
    montant_ttc: montantTtcCalc,
    remise_palier_appliquee:
      commande.remise_palier_appliquee != null
        ? round2(toNumber(commande.remise_palier_appliquee))
        : 0,
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    const proformaIdRaw = searchParams.get("proforma_id");
    const proformaId = (proformaIdRaw ?? "").trim();

    const regimeFromQuery = searchParams.get("regime");
    const codeClientFromQuery = searchParams.get("code") ?? "";

    // MODE 1 : génération depuis une commande existante
    if (proformaId !== "") {
      let commande: CommandePdf | null = null;

      const byNumero = await supabase
        .from("commandes")
        .select("*")
        .eq("numero_proforma", proformaId)
        .maybeSingle();

      if (byNumero.error) {
        return NextResponse.json(
          {
            error: "erreur chargement commande",
            details: byNumero.error.message,
          },
          { status: 500 }
        );
      }

      if (byNumero.data) {
        commande = byNumero.data as CommandePdf;
      } else {
        const byId = await supabase
          .from("commandes")
          .select("*")
          .eq("id", proformaId)
          .maybeSingle();

        if (byId.error) {
          return NextResponse.json(
            {
              error: "erreur chargement commande",
              details: byId.error.message,
            },
            { status: 500 }
          );
        }

        if (byId.data) {
          commande = byId.data as CommandePdf;
        }
      }

      if (!commande) {
        return NextResponse.json(
          {
            error: "proforma introuvable",
            details: `Aucune commande trouvée pour proforma_id=${proformaId}`,
          },
          { status: 404 }
        );
      }

      const { data: lignes, error: lignesError } = await supabase
        .from("lignes_commande")
        .select(`
          id,
          commande_id,
          produit_code,
          produit_libelle,
          categorie_fiscale,
          alcool_vol,
          volume_l,
          quantite,
          tarif_base_ht,
          remise_a,
          remise_b,
          remise_c,
          remise_d,
          prix_unitaire_remise_ht,
          total_ht_ligne,
          droits_ligne,
          tva_ligne,
          total_ttc_ligne,
          created_at
        `)
        .eq("commande_id", commande.id)
        .order("id", { ascending: true });

      if (lignesError) {
        return NextResponse.json(
          { error: "erreur chargement lignes", details: lignesError.message },
          { status: 500 }
        );
      }

      const lignesSafeRaw = ((lignes ?? []) as LignePdf[]).map((ligne) => ({
        ...ligne,
        quantite: toNumber(ligne.quantite),
        alcool_vol: toNumber(ligne.alcool_vol),
        volume_l: toNumber(ligne.volume_l),
        tarif_base_ht: toNumber(ligne.tarif_base_ht),
        remise_a: toNumber(ligne.remise_a),
        remise_b: toNumber(ligne.remise_b),
        remise_c: toNumber(ligne.remise_c),
        remise_d: toNumber(ligne.remise_d),
        prix_unitaire_remise_ht: toNumber(ligne.prix_unitaire_remise_ht),
        total_ht_ligne: toNumber(ligne.total_ht_ligne),
        droits_ligne: toNumber(ligne.droits_ligne),
        tva_ligne: toNumber(ligne.tva_ligne),
        total_ttc_ligne: toNumber(ligne.total_ttc_ligne),
      }));

      const lignesSafe = lignesSafeRaw.map((ligne) =>
        recalculateLigneFromStored(ligne, commande?.client_regime_fiscal)
      );

      const totalQuantiteForFrais = lignesSafe.reduce(
        (sum, l) => sum + toNumber(l.quantite),
        0
      );

      const tranchesExpedition = await getTranchesExpedition();
      const fraisExpeditionTtc = (() => {
        if (commande.frais_expedition_ttc != null) {
          return round2(toNumber(commande.frais_expedition_ttc));
        }

        const tranche = tranchesExpedition.find((t) => {
          const qteMin = toNumber(t.qte_min);
          const rawQteMax = t.qte_max;
          const minOk = totalQuantiteForFrais >= qteMin;
          const maxOk =
            rawQteMax == null ? true : totalQuantiteForFrais <= toNumber(rawQteMax);
          return minOk && maxOk;
        });

        return round2(toNumber(tranche?.frais_ttc));
      })();

      const commandeComplete = enrichCommandeTotals(
        commande,
        lignesSafe,
        fraisExpeditionTtc
      );

      return await buildPdfResponse({
        commande: commandeComplete,
        lignes: lignesSafe,
        filenameSuffix: String(commande.numero_proforma || commande.id),
      });
    }

    // MODE 2 : preview depuis le récap
    const regime: RegimeFiscal | null =
      regimeFromQuery === "DROITS_SUSPENDUS" ||
      regimeFromQuery === "DROITS_ACQUITTES"
        ? regimeFromQuery
        : null;

    if (!regime) {
      return NextResponse.json(
        { error: "paramètre regime manquant ou invalide" },
        { status: 400 }
      );
    }

    const quantities = parseQuantities(searchParams);
    const produitCodes = Object.keys(quantities);

    if (produitCodes.length === 0) {
      return NextResponse.json(
        { error: "aucune quantité supérieure à 0 n'a été transmise" },
        { status: 400 }
      );
    }

    const { data: produits, error: produitsError } = await supabase
      .from("produits")
      .select(`
        code_produit,
        libelle,
        categorie_fiscale,
        alcool_vol,
        volume_l,
        tarif_base_ht,
        remise_coffret
      `)
      .in("code_produit", produitCodes)
      .eq("actif", true)
      .order("ordre_affichage", { ascending: true });

    if (produitsError) {
      return NextResponse.json(
        { error: "erreur chargement produits", details: produitsError.message },
        { status: 500 }
      );
    }

    if (!produits || produits.length === 0) {
      return NextResponse.json(
        { error: "aucun produit trouvé pour les quantités demandées" },
        { status: 404 }
      );
    }

    const { data: paliersData, error: paliersError } = await supabase
      .from("paliers_remise")
      .select("*")
      .order("qte_min", { ascending: true });

    if (paliersError) {
      return NextResponse.json(
        {
          error: "erreur chargement paliers_remise",
          details: paliersError.message,
        },
        { status: 500 }
      );
    }

    const tranchesExpedition = await getTranchesExpedition();
    const parametresFiscaux = await getParametresFiscaux();

    const produitsMapped: ProduitCommande[] = (produits as Record<string, unknown>[])
      .map((p) => ({
        code_produit: String(p.code_produit ?? ""),
        libelle: String(p.libelle ?? ""),
        tarif_base_ht: toNumber(p.tarif_base_ht),
        volume_l: p.volume_l == null ? null : toNumber(p.volume_l),
        alcool_vol: p.alcool_vol == null ? null : toNumber(p.alcool_vol),
        categorie_fiscale:
          p.categorie_fiscale == null ? null : String(p.categorie_fiscale),
        remise_coffret_pct: getRemiseCoffretPct(p),
      }))
      .filter((p) => quantities[p.code_produit] > 0);

    const paliers: PalierRemise[] = (paliersData ?? []).map((row) => ({
      qte_min: toNumber(row.qte_min),
      qte_max: row.qte_max == null ? null : toNumber(row.qte_max),
      taux_remise: toNumber(row.taux_remise),
    }));

    const lignesInput: LigneCommandeInput[] = produitsMapped.map((produit) => ({
      produit,
      quantite: toNumber(quantities[produit.code_produit]),
    }));

    const recap = computeRecapCommande(
      lignesInput,
      regime,
      paliers,
      tranchesExpedition,
      parametresFiscaux
    );

    const lignes: LignePdfCalculee[] = recap.lignes.map((ligne) => ({
      produit_code: text(ligne.code_produit),
      produit_libelle: text(ligne.libelle),
      categorie_fiscale: ligne.categorie_fiscale,
      alcool_vol: toNumber(ligne.alcool_vol),
      volume_l: toNumber(ligne.volume_l),
      quantite: toNumber(ligne.quantite),
      tarif_base_ht: toNumber(ligne.tarifBaseHT),
      remise_a: toNumber(ligne.remiseProPct),
      remise_b: toNumber(ligne.remiseParticulierePct),
      remise_c: toNumber(ligne.remiseCoffretPct),
      remise_d: toNumber(ligne.remisePalierPct),
      prix_unitaire_remise_ht: toNumber(ligne.tarifRemiseHT),
      total_ht_ligne: toNumber(ligne.totalHT),
      droits_ligne: toNumber(ligne.droitsLigne),
      tva_ligne: toNumber(ligne.tvaLigne),
      total_ttc_ligne: toNumber(ligne.totalTTCLigne),
      total_ht_acquitte_ligne:
        regime === "DROITS_ACQUITTES"
          ? round2(toNumber(ligne.totalHT) + toNumber(ligne.droitsLigne))
          : toNumber(ligne.totalHT),
      remise_totale_equivalente_pct: toNumber(ligne.totalRemisesPct),
    }));

    const today = new Date();
    const echeance = new Date(today);
    echeance.setDate(today.getDate() + 30);

    const commande: CommandePdf = {
      id: "preview",
      numero_proforma: `PREVIEW-${today.getFullYear()}${String(
        today.getMonth() + 1
      ).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`,
      numero_commande: "-",
      date_creation: today.toISOString(),
      date_echeance: echeance.toISOString(),

      code_client: codeClientFromQuery ?? "",
      client_regime_fiscal: regime,

      client_raison_sociale: "Client non renseigné",
      client_contact: "",
      client_email: "",
      client_telephone: "",
      client_siret: "",
      client_tva_intracom: "",
      client_iban: "",

      facturation_adresse_ligne_1: "",
      facturation_adresse_ligne_2: "",
      facturation_code_postal: "",
      facturation_ville: "",
      facturation_pays: "France",

      total_quantite: recap.totaux.totalQuantite,
      remise_palier_appliquee: recap.totaux.remisePalierPct,
      montant_ht_remise: recap.totaux.montantHtRemise,
      montant_droits: recap.totaux.montantDroits,
      montant_ht_acquitte: recap.totaux.totalHtAcquitte,
      montant_tva: recap.totaux.montantTva,
      frais_expedition_ttc: recap.totaux.fraisExpeditionTtc,
      montant_ttc: recap.totaux.montantTtc,
    };

    return await buildPdfResponse({
      commande,
      lignes,
      filenameSuffix: String(commande.numero_proforma),
    });
  } catch (error) {
    console.error("Erreur génération PDF :", error);
    return NextResponse.json(
      {
        error: "erreur génération PDF",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

async function buildPdfResponse({
  commande,
  lignes,
  filenameSuffix,
}: {
  commande: CommandePdf;
  lignes: LignePdfCalculee[];
  filenameSuffix: string;
}) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let logoImage: any = null;
  try {
    const logoPath = path.join(
      process.cwd(),
      "public",
      "logo-les-editions-spiritueuses.png"
    );
    if (fs.existsSync(logoPath)) {
      const logoBytes = fs.readFileSync(logoPath);
      logoImage = await pdfDoc.embedPng(logoBytes);
    }
  } catch (e) {
    console.warn("Logo non chargé :", e);
  }

  const pageWidth = page.getWidth();
  const pageHeight = page.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - margin * 2;
  let y = pageHeight - 18;

  const colors = {
    black: rgb(0.1, 0.1, 0.1),
    gray: rgb(0.42, 0.42, 0.42),
    rowAlt: rgb(0.972, 0.972, 0.972),
    border: rgb(0.8, 0.8, 0.8),
    blue: rgb(0.07, 0.18, 0.4),
    white: rgb(1, 1, 1),
    red: rgb(0.8, 0.1, 0.1),
  };

  const isDroitsSuspendus =
    commande.client_regime_fiscal === "DROITS_SUSPENDUS";

  function drawTextAligned(
    value: string,
    x: number,
    yPos: number,
    width: number,
    align: "left" | "center" | "right",
    size = 8,
    bold = false,
    color = colors.black
  ) {
    const safeValue = pdfSafe(value);
    const padding = 3;
    const usedFont = bold ? fontBold : font;
    const textWidth = usedFont.widthOfTextAtSize(safeValue, size);

    let drawX = x + padding;
    if (align === "center") {
      drawX = x + (width - textWidth) / 2;
    } else if (align === "right") {
      drawX = x + width - textWidth - padding;
    }

    page.drawText(safeValue, {
      x: drawX,
      y: yPos,
      size,
      font: usedFont,
      color,
    });
  }

  function drawHeader(isContinuation = false) {
    const headerH = 76;

    page.drawRectangle({
      x: 0,
      y: pageHeight - headerH,
      width: pageWidth,
      height: headerH,
      color: colors.blue,
    });

    if (logoImage) {
      const maxWidth = 220;
      const maxHeight = 30;
      const scale = Math.min(
        maxWidth / logoImage.width,
        maxHeight / logoImage.height
      );

      page.drawImage(logoImage, {
        x: margin,
        y: pageHeight - 44,
        width: logoImage.width * scale,
        height: logoImage.height * scale,
      });
    } else {
      page.drawText("LES EDITIONS SPIRITUEUSES", {
        x: margin,
        y: pageHeight - 30,
        size: 16,
        font: fontBold,
        color: colors.white,
      });
    }

    page.drawText(
      isContinuation ? "FACTURE PRO FORMA (suite)" : "FACTURE PRO FORMA",
      {
        x: margin,
        y: pageHeight - 62,
        size: 11,
        font: fontBold,
        color: colors.white,
      }
    );

    const regimeLabel = isDroitsSuspendus
      ? "Droits suspendus"
      : "Droits acquittes";
    const regimeLabelW = fontBold.widthOfTextAtSize(regimeLabel, 8.5);

    page.drawText(regimeLabel, {
      x: pageWidth - margin - regimeLabelW,
      y: pageHeight - 34,
      size: 8.5,
      font: fontBold,
      color: colors.white,
    });

    y = pageHeight - headerH - 10;
  }

  function addPage() {
    page = pdfDoc.addPage([595.28, 841.89]);
    y = page.getHeight() - 18;
    drawHeader(true);
  }

  function ensureSpace(minY = 90) {
    if (y < minY) addPage();
  }

  function drawFooter(
    currentPage: typeof page,
    pageIndex: number,
    totalPages: number
  ) {
    currentPage.drawLine({
      start: { x: margin, y: 22 },
      end: { x: pageWidth - margin, y: 22 },
      thickness: 0.5,
      color: colors.border,
    });

    currentPage.drawText("Document genere automatiquement", {
      x: margin,
      y: 9,
      size: 7,
      font,
      color: colors.gray,
    });

    const pageLabel = `Page ${pageIndex + 1}/${totalPages}`;
    const pageLabelW = font.widthOfTextAtSize(pageLabel, 7);

    currentPage.drawText(pageLabel, {
      x: pageWidth - margin - pageLabelW,
      y: 9,
      size: 7,
      font,
      color: colors.gray,
    });
  }

  function drawSectionTitle(title: string) {
    const safeTitle = pdfSafe(title);
    const sectionH = 18;

    page.drawRectangle({
      x: margin,
      y: y - sectionH,
      width: contentWidth,
      height: sectionH,
      color: colors.blue,
    });

    page.drawText(safeTitle, {
      x: margin + 8,
      y: y - 13,
      size: 8.5,
      font: fontBold,
      color: colors.white,
    });

    y -= sectionH + 6;
  }

  function drawLabeledRow(
    xLabel: number,
    xValue: number,
    yRow: number,
    label: string,
    value: string,
    opts?: { valueBold?: boolean; valueColor?: typeof colors.black }
  ) {
    page.drawText(pdfSafe(label), {
      x: xLabel,
      y: yRow,
      size: 7.5,
      font: fontBold,
      color: colors.blue,
    });

    page.drawText(pdfSafe(value), {
      x: xValue,
      y: yRow,
      size: 7.5,
      font: opts?.valueBold ? fontBold : font,
      color: opts?.valueColor ?? colors.black,
    });
  }

  drawHeader(false);

  const topBoxH = 82;
  const leftBoxW = Math.floor(contentWidth * 0.6);
  const rightBoxW = contentWidth - leftBoxW - 6;
  const leftBoxX = margin;
  const rightBoxX = margin + leftBoxW + 6;
  const topBoxY = y - topBoxH;

  page.drawRectangle({
    x: leftBoxX,
    y: topBoxY,
    width: leftBoxW,
    height: topBoxH,
    borderColor: colors.border,
    borderWidth: 0.8,
  });

  page.drawRectangle({
    x: rightBoxX,
    y: topBoxY,
    width: rightBoxW,
    height: topBoxH,
    borderColor: colors.border,
    borderWidth: 0.8,
  });

  page.drawText("EMETTEUR", {
    x: leftBoxX + 8,
    y: topBoxY + topBoxH - 13,
    size: 7.5,
    font: fontBold,
    color: colors.gray,
  });

  const lLX = leftBoxX + 8;
  const lVX = leftBoxX + 88;

  drawLabeledRow(lLX, lVX, topBoxY + topBoxH - 28, "Raison sociale :", "EDITHEQUE");
  drawLabeledRow(
    lLX,
    lVX,
    topBoxY + topBoxH - 41,
    "Adresse :",
    "C/O L'Optimiste - 25 rue Plumet - 75015 Paris"
  );
  drawLabeledRow(lLX, lVX, topBoxY + topBoxH - 54, "SIRET :", "99237118700012");
  drawLabeledRow(lLX, lVX, topBoxY + topBoxH - 67, "N TVA :", "FR 49992371187");

  page.drawText("REFERENCES FACTURE", {
    x: rightBoxX + 8,
    y: topBoxY + topBoxH - 13,
    size: 7.5,
    font: fontBold,
    color: colors.gray,
  });

  const rLX = rightBoxX + 8;
  const rVX = rightBoxX + 74;

  drawLabeledRow(
    rLX,
    rVX,
    topBoxY + topBoxH - 28,
    "Facture n :",
    safeText(commande.numero_proforma)
  );
  drawLabeledRow(
    rLX,
    rVX,
    topBoxY + topBoxH - 41,
    "Date :",
    dateFr(commande.date_creation)
  );
  drawLabeledRow(
    rLX,
    rVX,
    topBoxY + topBoxH - 54,
    "Echeance :",
    dateFr(commande.date_echeance)
  );
  drawLabeledRow(
    rLX,
    rVX,
    topBoxY + topBoxH - 67,
    "Commande :",
    safeText(commande.numero_commande)
  );

  y = topBoxY - 10;

  drawSectionTitle("CLIENT");

  const clientBoxH = 96;
  const clientBoxY = y - clientBoxH;

  page.drawRectangle({
    x: margin,
    y: clientBoxY,
    width: contentWidth,
    height: clientBoxH,
    borderColor: colors.border,
    borderWidth: 0.8,
  });

  const cLLX = margin + 8;
  const cLVX = margin + 100;
  const cRLX = margin + Math.floor(contentWidth * 0.54);
  const cRVX = cRLX + 68;

  const clientAddress = [
    text(commande.facturation_adresse_ligne_1),
    text(commande.facturation_adresse_ligne_2),
  ]
    .filter(Boolean)
    .join(" ");

  const clientCpVille = [
    text(commande.facturation_code_postal),
    text(commande.facturation_ville),
  ]
    .filter(Boolean)
    .join(" ");

  drawLabeledRow(
    cLLX,
    cLVX,
    clientBoxY + clientBoxH - 15,
    "Nom / Raison sociale :",
    safeText(commande.client_raison_sociale)
  );
  drawLabeledRow(
    cLLX,
    cLVX,
    clientBoxY + clientBoxH - 28,
    "Adresse :",
    safeText(clientAddress)
  );
  drawLabeledRow(
    cLLX,
    cLVX,
    clientBoxY + clientBoxH - 41,
    "CP / Ville :",
    safeText(clientCpVille)
  );
  drawLabeledRow(
    cLLX,
    cLVX,
    clientBoxY + clientBoxH - 54,
    "SIRET :",
    safeText(commande.client_siret)
  );
  drawLabeledRow(
    cLLX,
    cLVX,
    clientBoxY + clientBoxH - 67,
    "N TVA intra. :",
    safeText(commande.client_tva_intracom)
  );
  drawLabeledRow(
    cLLX,
    cLVX,
    clientBoxY + clientBoxH - 80,
    "Email :",
    safeText(commande.client_email)
  );

  drawLabeledRow(
    cRLX,
    cRVX,
    clientBoxY + clientBoxH - 15,
    "Contact :",
    safeText(commande.client_contact)
  );
  drawLabeledRow(
    cRLX,
    cRVX,
    clientBoxY + clientBoxH - 28,
    "Code client :",
    safeText(commande.code_client)
  );
  drawLabeledRow(
    cRLX,
    cRVX,
    clientBoxY + clientBoxH - 41,
    "Regime fiscal :",
    cleanRegime(commande.client_regime_fiscal),
    { valueColor: colors.red }
  );
  drawLabeledRow(
    cRLX,
    cRVX,
    clientBoxY + clientBoxH - 54,
    "Pays :",
    safeText(commande.facturation_pays, "France")
  );
  drawLabeledRow(
    cRLX,
    cRVX,
    clientBoxY + clientBoxH - 67,
    "IBAN :",
    safeText(commande.client_iban)
  );
  drawLabeledRow(
    cRLX,
    cRVX,
    clientBoxY + clientBoxH - 80,
    "Telephone :",
    safeText(commande.client_telephone)
  );

  y = clientBoxY - 8;

  page.drawText(
    pdfSafe(
      "(1) Remises en cascade : A- Remise professionnelle / B- Remise particuliere / C- Remise par coffret / D- Remise par palier"
    ),
    {
      x: margin,
      y,
      size: 6.5,
      font,
      color: colors.gray,
      maxWidth: contentWidth,
    }
  );

  y -= 14;

  drawSectionTitle("DETAIL DE LA COMMANDE");

  type ColDef = {
    key: string;
    label: string;
    width: number;
    align: "left" | "center" | "right";
  };

  const colDefs: ColDef[] = isDroitsSuspendus
    ? [
        { key: "code", label: "Code", width: 42, align: "left" },
        { key: "libelle", label: "Libelle produit", width: 98, align: "left" },
        { key: "alcool", label: "Alcool\n(%Vol)", width: 34, align: "center" },
        { key: "volume", label: "Volume\n(L)", width: 32, align: "center" },
        { key: "tarifBase", label: "Tarif base\nHT", width: 45, align: "right" },
        { key: "remiseC", label: "Remise\ncoffret", width: 42, align: "right" },
        { key: "puRemise", label: "Tarif rem.\nHT", width: 46, align: "right" },
        { key: "qte", label: "Qte", width: 22, align: "center" },
        { key: "totalHT", label: "Total HT", width: 45, align: "right" },
        { key: "tva", label: "TVA", width: 40, align: "right" },
        { key: "totalTTC", label: "Total TTC", width: 46, align: "right" },
      ]
    : [
        { key: "code", label: "Code", width: 38, align: "left" },
        { key: "libelle", label: "Libelle produit", width: 92, align: "left" },
        { key: "alcool", label: "Alcool\n(%Vol)", width: 32, align: "center" },
        { key: "volume", label: "Volume\n(L)", width: 30, align: "center" },
        { key: "tarifBase", label: "Tarif base\nHT", width: 42, align: "right" },
        { key: "remiseC", label: "Remise\ncoffret", width: 40, align: "right" },
        { key: "puRemise", label: "Tarif rem.\nHT", width: 44, align: "right" },
        { key: "qte", label: "Qte", width: 20, align: "center" },
        { key: "droits", label: "Droits", width: 40, align: "right" },
        { key: "totalHT", label: "Total HT", width: 42, align: "right" },
        { key: "tva", label: "TVA", width: 36, align: "right" },
        { key: "totalTTC", label: "Total TTC", width: 44, align: "right" },
      ];

  let totalTableWidth = colDefs.reduce((sum, c) => sum + c.width, 0);
  const deltaWidth = contentWidth - totalTableWidth;

  if (deltaWidth !== 0) {
    const libelleCol = colDefs.find((c) => c.key === "libelle");
    if (libelleCol) libelleCol.width += deltaWidth;
  }

  const cols: Array<ColDef & { x: number }> = [];
  let curX = margin;
  for (const def of colDefs) {
    cols.push({ ...def, x: curX });
    curX += def.width;
  }

  const tableHeaderH = 36;
  const rowHeight = 24;
  const headerFontSize = 6.4;
  const rowFontSize = 6.8;

  function drawTableHeader() {
    page.drawRectangle({
      x: margin,
      y: y - tableHeaderH,
      width: contentWidth,
      height: tableHeaderH,
      color: colors.blue,
    });

    for (const col of cols) {
      const parts = col.label.split("\n");

      if (parts.length === 2) {
        drawTextAligned(
          parts[0],
          col.x,
          y - 12,
          col.width,
          "center",
          headerFontSize,
          true,
          colors.white
        );
        drawTextAligned(
          parts[1],
          col.x,
          y - 21,
          col.width,
          "center",
          headerFontSize,
          true,
          colors.white
        );
      } else {
        drawTextAligned(
          parts[0],
          col.x,
          y - 17,
          col.width,
          "center",
          headerFontSize,
          true,
          colors.white
        );
      }
    }

    y -= tableHeaderH;
  }

  function getRowValues(ligne: LignePdfCalculee): Record<string, string> {
    const alcoolVolPct = toNumber(ligne.alcool_vol) * 100;
    const tarifBaseHT = toNumber(ligne.tarif_base_ht);
    const puRemiseHT = toNumber(ligne.prix_unitaire_remise_ht);
    const quantite = toNumber(ligne.quantite);
    const totalHTLigne = toNumber(ligne.total_ht_ligne);
    const droitsLigne = toNumber(ligne.droits_ligne);
    const tvaLigne = toNumber(ligne.tva_ligne);
    const totalTTCLigne = toNumber(ligne.total_ttc_ligne);

    return {
      code: text(ligne.produit_code),
      libelle: truncate(text(ligne.produit_libelle), isDroitsSuspendus ? 26 : 22),
      alcool: num(alcoolVolPct, 2),
      volume: num(ligne.volume_l, 2),
      tarifBase: euro(tarifBaseHT),
      remiseC: pct(ligne.remise_c),
      puRemise: euro(puRemiseHT),
      qte: text(quantite),
      droits: euro(droitsLigne),
      totalHT: euro(totalHTLigne),
      tva: euro(tvaLigne),
      totalTTC: euro(totalTTCLigne),
    };
  }

  drawTableHeader();

  for (let rowIndex = 0; rowIndex < (lignes ?? []).length; rowIndex++) {
    const ligne = lignes[rowIndex];

    if (y < 130) {
      addPage();
      drawSectionTitle("DETAIL DE LA COMMANDE (suite)");
      drawTableHeader();
    }

    page.drawRectangle({
      x: margin,
      y: y - rowHeight,
      width: contentWidth,
      height: rowHeight,
      color: rowIndex % 2 === 0 ? colors.white : colors.rowAlt,
      borderColor: colors.border,
      borderWidth: 0.5,
    });

    const rowValues = getRowValues(ligne);
    const textY = y - rowHeight / 2 - rowFontSize / 2 + 2;

    for (const col of cols) {
      drawTextAligned(
        rowValues[col.key] ?? "",
        col.x,
        textY,
        col.width,
        col.align,
        rowFontSize,
        false,
        colors.black
      );
    }

    y -= rowHeight;
  }

  y -= 14;
  ensureSpace(150);

  drawSectionTitle("RECAPITULATIF FINANCIER");

  const recapWidth = 230;
  const recapX = pageWidth - margin - recapWidth;
  const recapLineH = 14;

  const totalLines = isDroitsSuspendus
    ? [
        ["Quantite totale", text(commande.total_quantite)],
        ["Montant HT remise", euro(commande.montant_ht_remise)],
        ["TVA", euro(commande.montant_tva)],
        ["Frais d'expedition TTC", euro(commande.frais_expedition_ttc)],
        ["TOTAL TTC A REGLER", euro(commande.montant_ttc)],
      ]
    : [
        ["Quantite totale", text(commande.total_quantite)],
        ["Montant HT remise (hors droits)", euro(commande.montant_ht_remise)],
        ["Droits + vignette totaux", euro(commande.montant_droits)],
        ["Total HT acquitte", euro(commande.montant_ht_acquitte)],
        ["TVA", euro(commande.montant_tva)],
        ["Frais d'expedition TTC", euro(commande.frais_expedition_ttc)],
        ["TOTAL TTC A REGLER", euro(commande.montant_ttc)],
      ];

  const recapHeight = totalLines.length * recapLineH + 16;
  const recapY = y - recapHeight;

  page.drawRectangle({
    x: recapX,
    y: recapY,
    width: recapWidth,
    height: recapHeight,
    borderColor: colors.border,
    borderWidth: 0.8,
    color: colors.white,
  });

  page.drawLine({
    start: { x: recapX, y: recapY + recapLineH + 4 },
    end: { x: recapX + recapWidth, y: recapY + recapLineH + 4 },
    thickness: 0.6,
    color: colors.border,
  });

  let totalY = recapY + recapHeight - 10;

  for (const [label, value] of totalLines) {
    const isFinal = label === "TOTAL TTC A REGLER";
    const fontSize = isFinal ? 8.5 : 7.5;
    const lineColor = isFinal ? colors.red : colors.black;
    const usedFont = isFinal ? fontBold : font;

    page.drawText(pdfSafe(label), {
      x: recapX + 10,
      y: totalY,
      size: fontSize,
      font: usedFont,
      color: lineColor,
    });

    drawTextAligned(
      value,
      recapX + 140,
      totalY,
      80,
      "right",
      fontSize,
      isFinal,
      lineColor
    );

    totalY -= recapLineH;
  }

  const pages = pdfDoc.getPages();
  pages.forEach((p, index) => {
    page = p;
    drawFooter(p, index, pages.length);
  });

  const pdfBytes = await pdfDoc.save();

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="proforma-${filenameSuffix}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}