import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import {
  computeRemiseTotaleEquivalentePct,
  computeTarifRemiseHT,
  round2,
  toNumber,
} from "@/lib/calculs-commande";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function euro(value: unknown): string {
  const n = toNumber(value);
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

function num(value: unknown, digits = 2): string {
  return toNumber(value).toFixed(digits).replace(".", ",");
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function dateFr(value: unknown): string {
  if (!value) return "";
  return new Date(String(value)).toLocaleDateString("fr-FR");
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
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

function pct(value: unknown, digits = 2): string {
  return `${normalizePct(value).toFixed(digits).replace(".", ",")} %`;
}

type LigneCalculee = {
  produitCode: string;
  produitLibelle: string;
  categorieFiscale: string;
  alcoolVol: number;
  volumeL: number;
  tarifBaseHT: number;
  quantite: number;
  remiseProfessionnellePct: number;
  remiseParticulierePct: number;
  remiseCoffretPct: number;
  remisePalierPct: number;
  remiseTotaleEquivalentePct: number;
  prixUnitaireRemiseHT: number;
  droitsLigne: number;
  totalHTLigne: number;
  totalHTAcquitteLigne: number;
  tvaLigne: number;
  totalTTCLigne: number;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const proformaId = searchParams.get("proforma_id");

    if (!proformaId) {
      return NextResponse.json(
        { error: "proforma_id manquant" },
        { status: 400 }
      );
    }

    const { data: commande, error: commandeError } = await supabase
      .from("commandes")
      .select("*")
      .eq("numero_proforma", proformaId)
      .maybeSingle();

    if (commandeError || !commande) {
      return NextResponse.json(
        { error: "proforma introuvable" },
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
        tarif_base_ht,
        quantite,
        remise_professionnelle,
        remise_particuliere,
        remise_coffret,
        remise_palier,
        remise_c,
        prix_unitaire_remise_ht,
        droits_ligne,
        total_ht_ligne,
        tva_ligne,
        total_ttc_ligne
      `)
      .eq("commande_id", commande.id)
      .order("id", { ascending: true });

    if (lignesError) {
      return NextResponse.json(
        { error: "erreur chargement lignes", details: lignesError.message },
        { status: 500 }
      );
    }

    const regimeAcquitte =
      commande.client_regime_fiscal === "DROITS_ACQUITTES";

    /**
     * On recalcule ici tous les montants à partir des données source
     * afin d'éviter d'utiliser des valeurs éventuellement enregistrées
     * avec l'ancienne logique additive.
     */
    const lignesCalculees: LigneCalculee[] = (lignes ?? []).map((ligne) => {
      const tarifBaseHT = toNumber(ligne.tarif_base_ht);
      const quantite = toNumber(ligne.quantite);

      const remiseProfessionnellePct = normalizePct(
        ligne.remise_professionnelle
      );
      const remiseParticulierePct = normalizePct(ligne.remise_particuliere);
      const remiseCoffretPct = normalizePct(
        ligne.remise_coffret ?? ligne.remise_c
      );
      const remisePalierPct = normalizePct(ligne.remise_palier);

      const prixUnitaireRemiseHT = computeTarifRemiseHT(
        tarifBaseHT,
        remiseProfessionnellePct,
        remiseParticulierePct,
        remiseCoffretPct,
        remisePalierPct
      );

      const totalHTLigne = round2(prixUnitaireRemiseHT * quantite);
      const droitsLigne = round2(toNumber(ligne.droits_ligne));
      const totalHTAcquitteLigne = regimeAcquitte
        ? round2(totalHTLigne + droitsLigne)
        : totalHTLigne;

      const tvaLigne = round2(toNumber(ligne.tva_ligne));
      const totalTTCLigne = round2(totalHTAcquitteLigne + tvaLigne);

      return {
        produitCode: text(ligne.produit_code),
        produitLibelle: text(ligne.produit_libelle),
        categorieFiscale: text(ligne.categorie_fiscale),
        alcoolVol: toNumber(ligne.alcool_vol),
        volumeL: toNumber(ligne.volume_l),
        tarifBaseHT,
        quantite,
        remiseProfessionnellePct,
        remiseParticulierePct,
        remiseCoffretPct,
        remisePalierPct,
        remiseTotaleEquivalentePct: computeRemiseTotaleEquivalentePct(
          remiseProfessionnellePct,
          remiseParticulierePct,
          remiseCoffretPct,
          remisePalierPct
        ),
        prixUnitaireRemiseHT,
        droitsLigne,
        totalHTLigne,
        totalHTAcquitteLigne,
        tvaLigne,
        totalTTCLigne,
      };
    });

    const totalQuantite = lignesCalculees.reduce(
      (sum, ligne) => sum + ligne.quantite,
      0
    );

    const montantHtRemise = round2(
      lignesCalculees.reduce((sum, ligne) => sum + ligne.totalHTLigne, 0)
    );

    const montantDroits = round2(
      regimeAcquitte
        ? lignesCalculees.reduce((sum, ligne) => sum + ligne.droitsLigne, 0)
        : 0
    );

    const totalHtAcquitte = round2(montantHtRemise + montantDroits);

    const montantTva = round2(
      lignesCalculees.reduce((sum, ligne) => sum + ligne.tvaLigne, 0)
    );

    const fraisExpeditionTtc = round2(toNumber(commande.frais_expedition_ttc));

    const montantTtc = round2(
      totalHtAcquitte + montantTva + fraisExpeditionTtc
    );

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([841.89, 595.28]); // A4 paysage
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    const margin = 24;
    let y = pageHeight - 24;

    const colors = {
      black: rgb(0.1, 0.1, 0.1),
      gray: rgb(0.45, 0.45, 0.45),
      lightGray: rgb(0.94, 0.94, 0.94),
      border: rgb(0.82, 0.82, 0.82),
      blue: rgb(0.07, 0.18, 0.4),
      white: rgb(1, 1, 1),
      red: rgb(0.75, 0.1, 0.1),
    };

    function addPage() {
      page = pdfDoc.addPage([841.89, 595.28]);
      y = page.getHeight() - 24;
      drawHeader(true);
    }

    function ensureSpace(minY = 90) {
      if (y < minY) addPage();
    }

    function drawHeader(isContinuation = false) {
      page.drawRectangle({
        x: 0,
        y: pageHeight - 66,
        width: pageWidth,
        height: 66,
        color: colors.blue,
      });

      page.drawText("LES ÉDITIONS SPIRITUEUSES", {
        x: 28,
        y: pageHeight - 24,
        size: 16,
        font: fontBold,
        color: colors.white,
      });

      page.drawText(
        isContinuation ? "FACTURE PRO FORMA (suite)" : "FACTURE PRO FORMA",
        {
          x: 28,
          y: pageHeight - 44,
          size: 14,
          font: fontBold,
          color: colors.white,
        }
      );

      page.drawText(
        commande.client_regime_fiscal === "DROITS_SUSPENDUS"
          ? "Droits suspendus"
          : "Droits acquittés",
        {
          x: pageWidth - 130,
          y: pageHeight - 32,
          size: 10,
          font: fontBold,
          color: colors.white,
        }
      );

      y = pageHeight - 84;
    }

    function drawFooter(
      currentPage: typeof page,
      pageIndex: number,
      totalPages: number
    ) {
      currentPage.drawLine({
        start: { x: margin, y: 24 },
        end: { x: pageWidth - margin, y: 24 },
        thickness: 1,
        color: colors.border,
      });

      currentPage.drawText("Document généré automatiquement", {
        x: margin,
        y: 10,
        size: 8,
        font,
        color: colors.gray,
      });

      currentPage.drawText(`Page ${pageIndex + 1}/${totalPages}`, {
        x: pageWidth - 70,
        y: 10,
        size: 8,
        font,
        color: colors.gray,
      });
    }

    function drawBlockTitle(title: string) {
      page.drawRectangle({
        x: margin,
        y: y - 4,
        width: pageWidth - margin * 2,
        height: 18,
        color: colors.blue,
      });

      page.drawText(title, {
        x: margin + 8,
        y: y + 1,
        size: 10,
        font: fontBold,
        color: colors.white,
      });

      y -= 26;
    }

    drawHeader(false);

    page.drawRectangle({
      x: margin,
      y: y - 58,
      width: 330,
      height: 58,
      borderColor: colors.border,
      borderWidth: 1,
    });

    page.drawRectangle({
      x: pageWidth - margin - 260,
      y: y - 58,
      width: 260,
      height: 58,
      borderColor: colors.border,
      borderWidth: 1,
    });

    page.drawText("ÉMETTEUR", {
      x: margin + 8,
      y: y - 12,
      size: 9,
      font: fontBold,
      color: colors.gray,
    });

    page.drawText("Les Éditions Spiritueuses", {
      x: margin + 8,
      y: y - 26,
      size: 10,
      font: fontBold,
      color: colors.black,
    });

    page.drawText("Document commercial B2B", {
      x: margin + 8,
      y: y - 38,
      size: 9,
      font,
      color: colors.black,
    });

    page.drawText("France", {
      x: margin + 8,
      y: y - 50,
      size: 9,
      font,
      color: colors.black,
    });

    page.drawText("DOCUMENT", {
      x: pageWidth - margin - 252,
      y: y - 12,
      size: 9,
      font: fontBold,
      color: colors.gray,
    });

    page.drawText(`Commande : ${text(commande.numero_commande)}`, {
      x: pageWidth - margin - 252,
      y: y - 24,
      size: 8,
      font,
      color: colors.black,
    });

    page.drawText(`Proforma : ${text(commande.numero_proforma)}`, {
      x: pageWidth - margin - 252,
      y: y - 36,
      size: 8,
      font,
      color: colors.black,
    });

    page.drawText(`Création : ${dateFr(commande.date_creation)}`, {
      x: pageWidth - margin - 120,
      y: y - 24,
      size: 8,
      font,
      color: colors.black,
    });

    page.drawText(`Échéance : ${dateFr(commande.date_echeance)}`, {
      x: pageWidth - margin - 120,
      y: y - 36,
      size: 8,
      font,
      color: colors.black,
    });

    y -= 74;

    drawBlockTitle("CLIENT");

    const clientLines = [
      `Code client : ${text(commande.code_client)}`,
      `Raison sociale : ${text(commande.client_raison_sociale)}`,
      `Contact : ${text(commande.client_contact)}`,
      `Email : ${text(commande.client_email)}`,
      `Téléphone : ${text(commande.client_telephone)}`,
      `Régime fiscal : ${text(commande.client_regime_fiscal)}`,
    ];

    let clientY = y;
    for (const line of clientLines) {
      if (!line.endsWith(": ")) {
        page.drawText(line, {
          x: margin,
          y: clientY,
          size: 9,
          font,
          color: colors.black,
        });
        clientY -= 12;
      }
    }

    y = clientY - 10;

    drawBlockTitle("DÉTAIL DE LA COMMANDE");

    const cols = [
      { label: "Code", x: 24 },
      { label: "Libellé produit", x: 72 },
      { label: "Cat. fiscale", x: 206 },
      { label: "Alcool\n[%Vol]", x: 268 },
      { label: "Volume\n[L]", x: 318 },
      { label: "Tarif base\nHT", x: 364 },
      { label: "Remise\ncoffret", x: 422 },
      { label: "PU remisé\nHT", x: 476 },
      { label: "Qté", x: 534 },
      { label: "Droits +\nVignette", x: 568 },
      { label: "Total HT\nAcquitté", x: 630 },
      { label: "TVA", x: 696 },
      { label: "Total TTC\nligne", x: 742 },
    ];

    function drawTableHeader() {
      page.drawRectangle({
        x: margin,
        y: y - 2,
        width: pageWidth - margin * 2,
        height: 30,
        color: colors.blue,
      });

      for (const col of cols) {
        const parts = col.label.split("\n");
        page.drawText(parts[0], {
          x: col.x + 2,
          y: y + 10,
          size: 7,
          font: fontBold,
          color: colors.white,
        });
        if (parts[1]) {
          page.drawText(parts[1], {
            x: col.x + 2,
            y: y + 2,
            size: 7,
            font: fontBold,
            color: colors.white,
          });
        }
      }

      y -= 32;
    }

    drawTableHeader();

    for (const ligne of lignesCalculees) {
      ensureSpace(130);

      if (y < 110) {
        addPage();
        drawBlockTitle("DÉTAIL DE LA COMMANDE (suite)");
        drawTableHeader();
      }

      const alcoolVolPct = ligne.alcoolVol * 100;

      page.drawRectangle({
        x: margin,
        y: y - 2,
        width: pageWidth - margin * 2,
        height: 34,
        borderColor: colors.border,
        borderWidth: 1,
      });

      const values = [
        ligne.produitCode,
        truncate(ligne.produitLibelle, 24),
        ligne.categorieFiscale,
        num(alcoolVolPct, 2),
        num(ligne.volumeL, 2),
        euro(ligne.tarifBaseHT),
        pct(ligne.remiseCoffretPct),
        euro(ligne.prixUnitaireRemiseHT),
        text(ligne.quantite),
        euro(ligne.droitsLigne),
        euro(ligne.totalHTAcquitteLigne),
        euro(ligne.tvaLigne),
        euro(ligne.totalTTCLigne),
      ];

      for (let i = 0; i < cols.length; i++) {
        page.drawText(values[i], {
          x: cols[i].x + 2,
          y: y + 13,
          size: 7,
          font,
          color: colors.black,
        });
      }

      const remisesDetail = [
        `Pro : ${pct(ligne.remiseProfessionnellePct)}`,
        ligne.remiseParticulierePct > 0
          ? `Part. : ${pct(ligne.remiseParticulierePct)}`
          : null,
        `Coffret : ${pct(ligne.remiseCoffretPct)}`,
        `Palier : ${pct(ligne.remisePalierPct)}`,
        `Équiv. : ${pct(ligne.remiseTotaleEquivalentePct)}`,
      ]
        .filter(Boolean)
        .join("   |   ");

      page.drawText(remisesDetail, {
        x: 72,
        y: y + 3,
        size: 6.5,
        font,
        color: colors.gray,
      });

      y -= 36;
    }

    y -= 10;
    ensureSpace(120);

    drawBlockTitle("RÉCAPITULATIF FINANCIER");

    const totalX = pageWidth - 250;

    const totalLines = [
      ["Quantité totale", text(totalQuantite)],
      ["Montant HT remisé (hors droits)", euro(montantHtRemise)],
      ["Droits + Vignette totaux", euro(montantDroits)],
      ["Total HT Acquitté", euro(totalHtAcquitte)],
      ["TVA", euro(montantTva)],
      ["Frais d'expédition TTC", euro(fraisExpeditionTtc)],
      ["TOTAL TTC À RÉGLER", euro(montantTtc)],
    ];

    let totalY = y;
    for (const [label, value] of totalLines) {
      const finalLine = label === "TOTAL TTC À RÉGLER";

      page.drawText(label, {
        x: totalX,
        y: totalY,
        size: finalLine ? 9 : 8,
        font: finalLine ? fontBold : font,
        color: finalLine ? colors.red : colors.black,
      });

      page.drawText(value, {
        x: pageWidth - 90,
        y: totalY,
        size: finalLine ? 9 : 8,
        font: finalLine ? fontBold : font,
        color: finalLine ? colors.red : colors.black,
      });

      totalY -= 12;
    }

    const pages = pdfDoc.getPages();
    pages.forEach((p, index) => drawFooter(p, index, pages.length));

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="commande-${commande.numero_commande || commande.numero_proforma || commande.id}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Erreur génération PDF :", error);

    return NextResponse.json(
      { error: "erreur génération PDF", details: String(error) },
      { status: 500 }
    );
  }
}