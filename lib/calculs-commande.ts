export type RegimeFiscal = "DROITS_SUSPENDUS" | "DROITS_ACQUITTES";

export type CategorieFiscaleType = "RHUM_DOM" | "ABV" | "ALCOOL";

export type ProduitCommande = {
  code_produit: string;
  libelle: string;
  tarif_base_ht: number;
  volume_l?: number | null;
  alcool_vol?: number | null;
  categorie_fiscale?: string | null;
  remise_coffret_pct: number;
};

export type LigneCommandeInput = {
  produit: ProduitCommande;
  quantite: number;
};

export type PalierRemise = {
  qte_min: number;
  qte_max?: number | null;
  taux_remise: number;
};

export type TrancheExpedition = {
  qte_min: number;
  qte_max?: number | null;
  frais_ttc: number;
};

export type ParametresFiscaux = {
  taux_droits_alcool: number;
  taux_vignette_alcool: number;
  taux_droits_rhum_dom: number;
  taux_vignette_rhum_dom: number;
  taux_droits_abv: number;
  taux_vignette_abv: number;
  taux_tva: number;
  remise_fixe_pro: number;
};

export type LigneCommandeCalculee = {
  code_produit: string;
  libelle: string;
  volume_l?: number | null;
  alcool_vol?: number | null;
  categorie_fiscale?: string | null;
  tarifBaseHT: number;
  quantite: number;
  remiseProPct: number;
  remiseParticulierePct: number;
  remiseCoffretPct: number;
  remisePalierPct: number;
  totalRemisesPct: number;
  tarifRemiseHT: number;
  totalHT: number;
  droitsLigne: number;
  tvaLigne: number;
  totalTTCLigne: number;
};

export type TotauxCommande = {
  totalQuantite: number;
  remiseProPct: number;
  remiseParticulierePct: number;
  remisePalierPct: number;
  montantHtBase: number;
  montantHtRemise: number;
  montantRemises: number;
  montantDroits: number;
  totalHtAcquitte: number;
  montantTva: number;
  fraisExpeditionTtc: number;
  montantTtc: number;
};

export type RecapCommande = {
  lignes: LigneCommandeCalculee[];
  totaux: TotauxCommande;
};

export function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function getCategorieFiscaleType(
  value?: string | null
): CategorieFiscaleType {
  const v = String(value ?? "").trim().toUpperCase();

  if (v.includes("RHUM") && v.includes("DOM")) return "RHUM_DOM";
  if (v.includes("ABV")) return "ABV";

  return "ALCOOL";
}

export function getPalierRemisePct(
  paliers: PalierRemise[],
  totalQuantite: number
): number {
  for (const palier of paliers) {
    const qteMin = toNumber(palier.qte_min);
    const rawQteMax = palier.qte_max;
    const qteMax =
      rawQteMax == null ? Number.POSITIVE_INFINITY : toNumber(rawQteMax);
    const tauxRemise = toNumber(palier.taux_remise);

    if (totalQuantite >= qteMin && totalQuantite <= qteMax) {
      return tauxRemise * 100;
    }
  }

  return 0;
}

export function getFraisExpeditionTtc(
  tranches: TrancheExpedition[],
  totalQuantite: number
): number {
  for (const tranche of tranches) {
    const qteMin = toNumber(tranche.qte_min);
    const rawQteMax = tranche.qte_max;
    const fraisTtc = toNumber(tranche.frais_ttc);

    const minOk = totalQuantite >= qteMin;
    const maxOk =
      rawQteMax == null ? true : totalQuantite <= toNumber(rawQteMax);

    if (minOk && maxOk) {
      return round2(fraisTtc);
    }
  }

  return 0;
}

export function computeDroitsLigne(
  ligne: {
    volume_l?: number | null;
    alcool_vol?: number | null;
    quantite: number;
    categorie_fiscale?: string | null;
  },
  params: ParametresFiscaux
): number {
  const volumeL = toNumber(ligne.volume_l);
  const alcoolVol = toNumber(ligne.alcool_vol);
  const quantite = toNumber(ligne.quantite);

  const alcoolPurTotal = volumeL * alcoolVol * quantite;
  const categorie = getCategorieFiscaleType(ligne.categorie_fiscale);

  let tauxDroits = params.taux_droits_alcool;
  let tauxVignette = params.taux_vignette_alcool;

  if (categorie === "RHUM_DOM") {
    tauxDroits = params.taux_droits_rhum_dom;
    tauxVignette = params.taux_vignette_rhum_dom;
  } else if (categorie === "ABV") {
    tauxDroits = params.taux_droits_abv;
    tauxVignette = params.taux_vignette_abv;
  }

  return round2(alcoolPurTotal * (tauxDroits + tauxVignette));
}

/**
 * Remise en cascade :
 * A = remise pro
 * B = remise particulière
 * C = remise coffret
 * D = remise palier
 */
export function computeTarifRemiseHT(
  tarifBaseHT: number,
  remiseProPct: number,
  remiseParticulierePct: number,
  remiseCoffretPct: number,
  remisePalierPct: number
): number {
  const coefficient =
    (1 - remiseProPct / 100) *
    (1 - remiseParticulierePct / 100) *
    (1 - remiseCoffretPct / 100) *
    (1 - remisePalierPct / 100);

  return round2(tarifBaseHT * coefficient);
}

/**
 * Convertit la cascade de remises
 * en pourcentage global équivalent.
 */
export function computeRemiseTotaleEquivalentePct(
  remiseProPct: number,
  remiseParticulierePct: number,
  remiseCoffretPct: number,
  remisePalierPct: number
): number {
  const coefficient =
    (1 - remiseProPct / 100) *
    (1 - remiseParticulierePct / 100) *
    (1 - remiseCoffretPct / 100) *
    (1 - remisePalierPct / 100);

  return round2((1 - coefficient) * 100);
}

export function normalizeLignesCommande(
  lignes: LigneCommandeInput[]
): LigneCommandeInput[] {
  return lignes
    .map(({ produit, quantite }) => ({
      produit,
      quantite: Math.floor(toNumber(quantite)),
    }))
    .filter((ligne) => ligne.quantite > 0);
}

export function computeLignesCommande(
  lignesInput: LigneCommandeInput[],
  regime: RegimeFiscal,
  paliers: PalierRemise[],
  parametresFiscaux: ParametresFiscaux
): {
  lignes: LigneCommandeCalculee[];
  totalQuantite: number;
  remiseProPct: number;
  remiseParticulierePct: number;
  remisePalierPct: number;
} {
  const lignesNormalisees = normalizeLignesCommande(lignesInput);

  const totalQuantite = lignesNormalisees.reduce(
    (sum, ligne) => sum + ligne.quantite,
    0
  );

  const remiseProPct = toNumber(parametresFiscaux.remise_fixe_pro);
  const remiseParticulierePct = regime === "DROITS_SUSPENDUS" ? 2 : 0;
  const remisePalierPct = getPalierRemisePct(paliers, totalQuantite);
  const tvaRate = toNumber(parametresFiscaux.taux_tva) / 100;

  const lignes: LigneCommandeCalculee[] = lignesNormalisees.map(
    ({ produit, quantite }) => {
      const tarifBaseHT = toNumber(produit.tarif_base_ht);
      const remiseCoffretPct = toNumber(produit.remise_coffret_pct);

      const tarifRemiseHT = computeTarifRemiseHT(
        tarifBaseHT,
        remiseProPct,
        remiseParticulierePct,
        remiseCoffretPct,
        remisePalierPct
      );

      const totalRemisesPct = computeRemiseTotaleEquivalentePct(
        remiseProPct,
        remiseParticulierePct,
        remiseCoffretPct,
        remisePalierPct
      );

      const totalHT = round2(tarifRemiseHT * quantite);

      const droitsLigne =
        regime === "DROITS_ACQUITTES"
          ? computeDroitsLigne(
              {
                volume_l: produit.volume_l,
                alcool_vol: produit.alcool_vol,
                quantite,
                categorie_fiscale: produit.categorie_fiscale,
              },
              parametresFiscaux
            )
          : 0;

      const assietteTVA = totalHT + droitsLigne;
      const tvaLigne = round2(assietteTVA * tvaRate);
      const totalTTCLigne = round2(assietteTVA + tvaLigne);

      return {
        code_produit: produit.code_produit,
        libelle: produit.libelle,
        volume_l: produit.volume_l,
        alcool_vol: produit.alcool_vol,
        categorie_fiscale: produit.categorie_fiscale,
        tarifBaseHT,
        quantite,
        remiseProPct,
        remiseParticulierePct,
        remiseCoffretPct,
        remisePalierPct,
        totalRemisesPct,
        tarifRemiseHT,
        totalHT,
        droitsLigne,
        tvaLigne,
        totalTTCLigne,
      };
    }
  );

  return {
    lignes,
    totalQuantite,
    remiseProPct,
    remiseParticulierePct,
    remisePalierPct,
  };
}

export function computeTotauxCommande(
  lignes: LigneCommandeCalculee[],
  regime: RegimeFiscal,
  tranchesExpedition: TrancheExpedition[],
  totalQuantite?: number
): TotauxCommande {
  const quantiteTotale =
    totalQuantite ??
    lignes.reduce((sum, ligne) => sum + toNumber(ligne.quantite), 0);

  const remiseProPct = lignes[0]?.remiseProPct ?? 0;
  const remiseParticulierePct = lignes[0]?.remiseParticulierePct ?? 0;
  const remisePalierPct = lignes[0]?.remisePalierPct ?? 0;

  const montantHtBase = round2(
    lignes.reduce(
      (sum, ligne) =>
        sum + toNumber(ligne.tarifBaseHT) * toNumber(ligne.quantite),
      0
    )
  );

  const montantHtRemise = round2(
    lignes.reduce((sum, ligne) => sum + toNumber(ligne.totalHT), 0)
  );

  const montantRemises = round2(montantHtBase - montantHtRemise);

  const montantDroits = round2(
    regime === "DROITS_ACQUITTES"
      ? lignes.reduce((sum, ligne) => sum + toNumber(ligne.droitsLigne), 0)
      : 0
  );

  const totalHtAcquitte = round2(montantHtRemise + montantDroits);

  const montantTva = round2(
    lignes.reduce((sum, ligne) => sum + toNumber(ligne.tvaLigne), 0)
  );

  const fraisExpeditionTtc = getFraisExpeditionTtc(
    tranchesExpedition,
    quantiteTotale
  );

  const montantTtc = round2(
    totalHtAcquitte + montantTva + fraisExpeditionTtc
  );

  return {
    totalQuantite: quantiteTotale,
    remiseProPct,
    remiseParticulierePct,
    remisePalierPct,
    montantHtBase,
    montantHtRemise,
    montantRemises,
    montantDroits,
    totalHtAcquitte,
    montantTva,
    fraisExpeditionTtc,
    montantTtc,
  };
}

export function computeRecapCommande(
  lignesInput: LigneCommandeInput[],
  regime: RegimeFiscal,
  paliers: PalierRemise[],
  tranchesExpedition: TrancheExpedition[],
  parametresFiscaux: ParametresFiscaux
): RecapCommande {
  const {
    lignes,
    totalQuantite,
    remiseProPct,
    remiseParticulierePct,
    remisePalierPct,
  } = computeLignesCommande(
    lignesInput,
    regime,
    paliers,
    parametresFiscaux
  );

  const totaux = computeTotauxCommande(
    lignes,
    regime,
    tranchesExpedition,
    totalQuantite
  );

  return {
    lignes,
    totaux: {
      ...totaux,
      remiseProPct,
      remiseParticulierePct,
      remisePalierPct,
    },
  };
}

export default {
  toNumber,
  round2,
  getCategorieFiscaleType,
  getPalierRemisePct,
  getFraisExpeditionTtc,
  computeDroitsLigne,
  computeTarifRemiseHT,
  computeRemiseTotaleEquivalentePct,
  normalizeLignesCommande,
  computeLignesCommande,
  computeTotauxCommande,
  computeRecapCommande,
};