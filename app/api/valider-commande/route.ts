import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  computeRecapCommande,
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

type Payload = {
  code?: string;
  regime: RegimeFiscal;
  quantites: Record<string, number>;

  client_raison_sociale?: string;
  client_siret?: string;
  client_tva_intracom?: string;
  client_contact?: string;
  client_email?: string;
  client_telephone?: string;

  facturation_adresse_ligne_1?: string;
  facturation_adresse_ligne_2?: string;
  facturation_code_postal?: string;
  facturation_ville?: string;
  facturation_pays?: string;
};

type ProduitRow = {
  id: string | number;
  code_produit: string;
  libelle: string | null;
  categorie_fiscale: string | null;
  alcool_vol: number | null;
  volume_l: number | null;
  tarif_base_ht: number | null;
  remise_coffret: number | null;
};

type TrancheExpeditionRow = {
  id: number;
  nom_tranche: string | null;
  qte_min: number | null;
  qte_max: number | null;
  frais_ttc: number | null;
  ordre: number | null;
};

type PalierRemiseRow = {
  id: number;
  nom_palier: string | null;
  qte_min: number | null;
  qte_max: number | null;
  taux_remise: number | null;
  ordre: number | null;
};

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function nullableText(value: unknown): string | null {
  const v = text(value);
  return v === "" ? null : v;
}

function isValidRegime(value: unknown): value is RegimeFiscal {
  return value === "DROITS_SUSPENDUS" || value === "DROITS_ACQUITTES";
}

function formatDateYYYYMMDD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function getTypeProforma(regime: RegimeFiscal): "SUSPENDUS" | "ACQUITTES" {
  return regime === "DROITS_SUSPENDUS" ? "SUSPENDUS" : "ACQUITTES";
}

function getRemiseCoffretPct(produit: ProduitRow): number {
  const raw = toNumber(produit.remise_coffret ?? 0);
  return raw * 100;
}

async function getParametresFiscaux(): Promise<ParametresFiscaux> {
  const { data, error } = await supabase
    .from("parametres_fiscaux")
    .select("*")
    .eq("actif", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Erreur chargement parametres_fiscaux : ${error.message}`);
  }

  const row = data?.[0];

  if (!row) {
    throw new Error("Aucun paramètre fiscal actif trouvé.");
  }

  return {
    taux_droits_alcool: toNumber(row.taux_droits_alcool ?? 0),
    taux_vignette_alcool: toNumber(row.taux_vignette_alcool ?? 0),
    taux_droits_rhum_dom: toNumber(row.taux_droits_rhum_dom ?? 0),
    taux_vignette_rhum_dom: toNumber(row.taux_vignette_rhum_dom ?? 0),
    taux_droits_abv: toNumber(row.taux_droits_abv ?? 0),
    taux_vignette_abv: toNumber(row.taux_vignette_abv ?? 0),
    taux_tva: toNumber(row.taux_tva ?? 20),
    remise_fixe_pro: toNumber(row.remise_fixe_pro ?? 5),
  };
}

async function getTranchesExpedition(): Promise<TrancheExpedition[]> {
  const { data, error } = await supabase
    .from("tranches_expedition")
    .select("*")
    .order("ordre", { ascending: true });

  if (error) {
    throw new Error(`Erreur chargement tranches_expedition : ${error.message}`);
  }

  return ((data ?? []) as TrancheExpeditionRow[]).map((row) => ({
    qte_min: toNumber(row.qte_min ?? 0),
    qte_max: row.qte_max == null ? null : toNumber(row.qte_max ?? 0),
    frais_ttc: toNumber(row.frais_ttc ?? 0),
  }));
}

async function getPaliersRemise(): Promise<PalierRemise[]> {
  const { data, error } = await supabase
    .from("paliers_remise")
    .select("*")
    .order("qte_min", { ascending: true });

  if (error) {
    throw new Error(`Erreur chargement paliers_remise : ${error.message}`);
  }

  return ((data ?? []) as PalierRemiseRow[]).map((row) => ({
    qte_min: toNumber(row.qte_min ?? 0),
    qte_max: row.qte_max == null ? null : toNumber(row.qte_max ?? 0),
    taux_remise: toNumber(row.taux_remise ?? 0),
  }));
}

async function generateClientCode(): Promise<string> {
  const { data, error } = await supabase.from("clients").select("code_client");

  if (error) {
    throw new Error(`Erreur génération code client : ${error.message}`);
  }

  const maxNumber = (data ?? []).reduce((max, row) => {
    const raw = String(row.code_client ?? "");
    const match = raw.match(/^CLI(\d+)$/);
    if (!match) return max;

    const n = Number(match[1]);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);

  return `CLI${String(maxNumber + 1).padStart(4, "0")}`;
}

async function generateDocumentNumbers() {
  const today = new Date();
  const ymd = formatDateYYYYMMDD(today);

  const { data, error } = await supabase
    .from("commandes")
    .select("numero_proforma")
    .like("numero_proforma", `PF-${ymd}-%`)
    .order("numero_proforma", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(`Erreur génération numéros : ${error.message}`);
  }

  const lastNumero = data?.[0]?.numero_proforma ?? "";
  const lastSeq = lastNumero
    ? Number(String(lastNumero).split("-").pop() ?? "0")
    : 0;

  const nextSeq = lastSeq + 1;
  const paddedSeq = String(nextSeq).padStart(5, "0");

  return {
    numero_proforma: `PF-${ymd}-${paddedSeq}`,
    numero_commande: `CMD-${ymd}-${paddedSeq}`,
  };
}

async function findExistingClient(payload: Payload) {
  const code = text(payload.code);
  const siret = text(payload.client_siret);
  const email = text(payload.client_email);

  if (code) {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("code_client", code)
      .maybeSingle();

    if (error) {
      throw new Error(`Erreur recherche client par code : ${error.message}`);
    }

    if (data) return data;
  }

  if (siret) {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("siret", siret)
      .maybeSingle();

    if (error) {
      throw new Error(`Erreur recherche client par SIRET : ${error.message}`);
    }

    if (data) return data;
  }

  if (email) {
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      throw new Error(`Erreur recherche client par email : ${error.message}`);
    }

    if (data) return data;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Payload;

    if (!isValidRegime(body.regime)) {
      return NextResponse.json(
        { error: "Régime fiscal invalide." },
        { status: 400 }
      );
    }

    const quantites = Object.fromEntries(
      Object.entries(body.quantites ?? {}).filter(
        ([code, qty]) => text(code) !== "" && toNumber(qty) > 0
      )
    );

    const produitCodes = Object.keys(quantites);

    if (produitCodes.length === 0) {
      return NextResponse.json(
        { error: "Aucune quantité valide transmise." },
        { status: 400 }
      );
    }

    const clientRaisonSociale = text(body.client_raison_sociale);
    const clientEmail = text(body.client_email);

    if (!clientRaisonSociale) {
      return NextResponse.json(
        { error: "La raison sociale est obligatoire." },
        { status: 400 }
      );
    }

    if (!clientEmail) {
      return NextResponse.json(
        { error: "L'email client est obligatoire." },
        { status: 400 }
      );
    }

    const { data: produits, error: produitsError } = await supabase
      .from("produits")
      .select(`
        id,
        code_produit,
        libelle,
        categorie_fiscale,
        alcool_vol,
        volume_l,
        tarif_base_ht,
        remise_coffret
      `)
      .in("code_produit", produitCodes)
      .eq("actif", true);

    if (produitsError) {
      return NextResponse.json(
        {
          error: "Erreur chargement produits",
          details: produitsError.message,
        },
        { status: 500 }
      );
    }

    if (!produits || produits.length === 0) {
      return NextResponse.json(
        { error: "Aucun produit trouvé." },
        { status: 404 }
      );
    }

    const produitsMap = new Map(
      (produits as ProduitRow[]).map((p) => [p.code_produit, p])
    );

    const missingCodes = produitCodes.filter((code) => !produitsMap.has(code));

    if (missingCodes.length > 0) {
      return NextResponse.json(
        {
          error: "Certains produits sont introuvables.",
          details: missingCodes,
        },
        { status: 400 }
      );
    }

    let client = await findExistingClient(body);

    if (client) {
      const clientUpdate = {
        raison_sociale: clientRaisonSociale,
        contact: nullableText(body.client_contact),
        regime_fiscal: body.regime,
        adresse_ligne_1: nullableText(body.facturation_adresse_ligne_1),
        adresse_ligne_2: nullableText(body.facturation_adresse_ligne_2),
        code_postal: nullableText(body.facturation_code_postal),
        ville: nullableText(body.facturation_ville),
        pays: nullableText(body.facturation_pays) || "France",
        email: clientEmail,
        telephone: nullableText(body.client_telephone),
        siret: nullableText(body.client_siret),
        tva_intracom: nullableText(body.client_tva_intracom),
      };

      const { data: updatedClient, error: updateClientError } = await supabase
        .from("clients")
        .update(clientUpdate)
        .eq("id", client.id)
        .select("*")
        .single();

      if (updateClientError) {
        return NextResponse.json(
          {
            error: "Erreur mise à jour client",
            details: updateClientError.message,
          },
          { status: 500 }
        );
      }

      client = updatedClient;
    } else {
      const code_client = await generateClientCode();

      const clientInsert = {
        code_client,
        raison_sociale: clientRaisonSociale,
        contact: nullableText(body.client_contact),
        regime_fiscal: body.regime,
        remise_particuliere: 0,
        remise_professionnelle: 0,
        adresse_ligne_1: nullableText(body.facturation_adresse_ligne_1),
        adresse_ligne_2: nullableText(body.facturation_adresse_ligne_2),
        code_postal: nullableText(body.facturation_code_postal),
        ville: nullableText(body.facturation_ville),
        pays: nullableText(body.facturation_pays) || "France",
        email: clientEmail,
        telephone: nullableText(body.client_telephone),
        siret: nullableText(body.client_siret),
        tva_intracom: nullableText(body.client_tva_intracom),
        statut_compte: "ACTIF",
        date_creation: new Date().toISOString(),
      };

      const { data: insertedClient, error: insertClientError } = await supabase
        .from("clients")
        .insert(clientInsert)
        .select("*")
        .single();

      if (insertClientError) {
        return NextResponse.json(
          {
            error: "Erreur création client",
            details: insertClientError.message,
          },
          { status: 500 }
        );
      }

      client = insertedClient;
    }

    if (!client?.code_client) {
      return NextResponse.json(
        { error: "Code client introuvable après création/mise à jour." },
        { status: 500 }
      );
    }

    const [parametresFiscaux, paliers, tranchesExpedition] = await Promise.all([
      getParametresFiscaux(),
      getPaliersRemise(),
      getTranchesExpedition(),
    ]);

    const lignesInput: LigneCommandeInput[] = produitCodes.map((codeProduit) => {
      const produit = produitsMap.get(codeProduit)!;

      const produitCommande: ProduitCommande = {
        code_produit: text(produit.code_produit),
        libelle: text(produit.libelle),
        tarif_base_ht: toNumber(produit.tarif_base_ht ?? 0),
        volume_l:
          produit.volume_l == null ? null : toNumber(produit.volume_l ?? 0),
        alcool_vol:
          produit.alcool_vol == null ? null : toNumber(produit.alcool_vol ?? 0),
        categorie_fiscale: nullableText(produit.categorie_fiscale),
        remise_coffret_pct: getRemiseCoffretPct(produit),
      };

      return {
        produit: produitCommande,
        quantite: toNumber(quantites[codeProduit] ?? 0),
      };
    });

    const recap = computeRecapCommande(
      lignesInput,
      body.regime,
      paliers,
      tranchesExpedition,
      parametresFiscaux
    );

    const lignesCalculees = recap.lignes.map((ligne) => {
      const produit = produitsMap.get(ligne.code_produit)!;

      return {
        produit_id: produit.id ?? null,
        produit_code: ligne.code_produit,
        produit_libelle: ligne.libelle,
        categorie_fiscale: nullableText(ligne.categorie_fiscale),
        alcool_vol: toNumber(ligne.alcool_vol ?? 0),
        volume_l: toNumber(ligne.volume_l ?? 0),
        quantite: toNumber(ligne.quantite ?? 0),
        tarif_base_ht: toNumber(ligne.tarifBaseHT ?? 0),
        remise_a: toNumber(ligne.remiseProPct ?? 0),
        remise_b: toNumber(ligne.remiseParticulierePct ?? 0),
        remise_c: toNumber(ligne.remiseCoffretPct ?? 0),
        remise_d: toNumber(ligne.remisePalierPct ?? 0),
        prix_unitaire_remise_ht: toNumber(ligne.tarifRemiseHT ?? 0),
        total_ht_ligne: toNumber(ligne.totalHT ?? 0),
        droits_ligne: toNumber(ligne.droitsLigne ?? 0),
        tva_ligne: toNumber(ligne.tvaLigne ?? 0),
        total_ttc_ligne: toNumber(ligne.totalTTCLigne ?? 0),
      };
    });

    const total_quantite = round2(recap.totaux.totalQuantite);
    const remisePalierAppliquee = round2(recap.totaux.remisePalierPct);
    const frais_expedition_ttc = round2(recap.totaux.fraisExpeditionTtc);
    const montant_ht_remise = round2(recap.totaux.montantHtRemise);
    const montant_droits = round2(recap.totaux.montantDroits);
    const montant_ht_acquitte = round2(recap.totaux.totalHtAcquitte);
    const montant_tva = round2(recap.totaux.montantTva);
    const montant_ttc = round2(recap.totaux.montantTtc);

    const { numero_proforma, numero_commande } =
      await generateDocumentNumbers();

    const dateCreation = new Date();
    const dateEcheance = new Date(dateCreation);
    dateEcheance.setDate(dateEcheance.getDate() + 30);

    const commandeInsert = {
      numero_proforma,
      numero_commande,
      code_client: client.code_client,
      client_raison_sociale: client.raison_sociale,
      client_contact: nullableText(client.contact),
      client_email: nullableText(client.email),
      client_telephone: nullableText(client.telephone),
      client_siret: nullableText(client.siret),
      client_tva_intracom: nullableText(client.tva_intracom),
      client_iban: nullableText(client.iban),
      client_regime_fiscal: body.regime,

      facturation_adresse_ligne_1: nullableText(client.adresse_ligne_1),
      facturation_adresse_ligne_2: nullableText(client.adresse_ligne_2),
      facturation_code_postal: nullableText(client.code_postal),
      facturation_ville: nullableText(client.ville),
      facturation_pays: nullableText(client.pays) || "France",

      livraison_diff: false,
      livraison_nom: null,
      livraison_adresse_ligne_1: null,
      livraison_adresse_ligne_2: null,
      livraison_code_postal: null,
      livraison_ville: null,
      livraison_pays: null,

      total_quantite: Number(total_quantite),
      remise_palier_appliquee: Number(remisePalierAppliquee),
      frais_expedition_ttc: Number(frais_expedition_ttc),
      montant_ht_remise: Number(montant_ht_remise),
      montant_droits: Number(montant_droits),
      montant_ht_acquitte: Number(montant_ht_acquitte),
      montant_tva: Number(montant_tva),
      montant_ttc: Number(montant_ttc),

      type_proforma: getTypeProforma(body.regime),
      statut: "BROUILLON",
      date_creation: dateCreation.toISOString(),
      date_echeance: dateEcheance.toISOString(),
      created_at: dateCreation.toISOString(),
    };

    const { data: commande, error: commandeError } = await supabase
      .from("commandes")
      .insert(commandeInsert)
      .select("*")
      .single();

    if (commandeError) {
      return NextResponse.json(
        {
          error: "Erreur création commande",
          details: commandeError.message,
        },
        { status: 500 }
      );
    }

    const lignesInsert = lignesCalculees.map((ligne) => ({
      commande_id: commande.id,
      produit_code: ligne.produit_code,
      produit_libelle: ligne.produit_libelle,
      categorie_fiscale: ligne.categorie_fiscale,
      alcool_vol: ligne.alcool_vol,
      volume_l: ligne.volume_l,
      quantite: ligne.quantite,
      tarif_base_ht: ligne.tarif_base_ht,
      remise_a: ligne.remise_a,
      remise_b: ligne.remise_b,
      remise_c: ligne.remise_c,
      remise_d: ligne.remise_d,
      prix_unitaire_remise_ht: ligne.prix_unitaire_remise_ht,
      total_ht_ligne: ligne.total_ht_ligne,
      droits_ligne: ligne.droits_ligne,
      tva_ligne: ligne.tva_ligne,
      total_ttc_ligne: ligne.total_ttc_ligne,
    }));

    const { error: lignesInsertError } = await supabase
      .from("lignes_commande")
      .insert(lignesInsert);

    if (lignesInsertError) {
      console.error("Erreur création lignes de commande :", {
        message: lignesInsertError.message,
        details: lignesInsertError.details,
        hint: lignesInsertError.hint,
        code: lignesInsertError.code,
      });

      return NextResponse.json(
        {
          error: "Erreur création lignes de commande",
          details: lignesInsertError.message,
          supabase: {
            details: lignesInsertError.details,
            hint: lignesInsertError.hint,
            code: lignesInsertError.code,
          },
        },
        { status: 500 }
      );
    }

    const requestUrl = new URL(request.url);
    const siteOrigin = requestUrl.origin;
    const pdfUrl = `${siteOrigin}/api/proforma-pdf?proforma_id=${encodeURIComponent(
      commande.numero_proforma
    )}`;

    return NextResponse.json({
      success: true,
      message:
        "Votre commande a bien été enregistrée. Vous pouvez télécharger votre proforma ci-dessous.",
      client: {
        id: client.id,
        code_client: client.code_client,
        raison_sociale: client.raison_sociale,
        contact: client.contact ?? "",
        email: client.email ?? "",
        telephone: client.telephone ?? "",
        siret: client.siret ?? "",
        tva_intracom: client.tva_intracom ?? "",
        adresse_ligne_1: client.adresse_ligne_1 ?? "",
        adresse_ligne_2: client.adresse_ligne_2 ?? "",
        code_postal: client.code_postal ?? "",
        ville: client.ville ?? "",
        pays: client.pays ?? "France",
        is_new: text(body.code) !== text(client.code_client),
      },
      commande: {
        id: commande.id,
        numero_proforma: commande.numero_proforma,
        numero_commande: commande.numero_commande,
        montant_ttc: commande.montant_ttc,
        total_quantite: commande.total_quantite,
        remise_palier_appliquee: commande.remise_palier_appliquee,
        frais_expedition_ttc: commande.frais_expedition_ttc,
        montant_droits: commande.montant_droits,
      },
      pdf_url: pdfUrl,
      proforma_id: commande.numero_proforma,
      numero_proforma: commande.numero_proforma,
      numero_commande: commande.numero_commande,
      regime: body.regime,
      email_status: "disabled",
    });
  } catch (error) {
    console.error("Erreur validation commande :", error);

    return NextResponse.json(
      {
        error: "Erreur validation commande",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}