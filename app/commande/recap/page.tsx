import {
  computeRecapCommande,
  computeRemiseTotaleEquivalentePct,
  toNumber,
  type LigneCommandeInput,
  type PalierRemise,
  type ParametresFiscaux,
  type ProduitCommande,
  type RegimeFiscal,
  type TrancheExpedition,
} from "@/lib/calculs-commande";

type RecapPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleValue(
  value: string | string[] | undefined,
  fallback = ""
): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(toNumber(value));
}

function num(value?: number | null, digits = 2) {
  if (value == null) return "-";
  return toNumber(value).toFixed(digits).replace(".", ",");
}

function pct(value: number) {
  return `${toNumber(value).toFixed(2).replace(".", ",")} %`;
}

function getRemiseCoffretPct(row: Record<string, unknown>): number {
  const raw = toNumber(row.remise_coffret);
  return raw * 100;
}

export default async function RecapPage({ searchParams }: RecapPageProps) {
  const params = await searchParams;

  const code = getSingleValue(params.code, "");
  const regime = getSingleValue(params.regime, "") as RegimeFiscal | "";

  const regimeLabel =
    regime === "DROITS_SUSPENDUS"
      ? "Droits suspendus"
      : regime === "DROITS_ACQUITTES"
        ? "Droits acquittés"
        : "Non défini";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Variables d'environnement Supabase manquantes.");
  }

  if (!regime) {
    throw new Error("Le régime fiscal est manquant.");
  }

  const headers = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
  };

  const produitsResponse = await fetch(
    `${supabaseUrl}/rest/v1/produits?select=code_produit,libelle,tarif_base_ht,volume_l,alcool_vol,categorie_fiscale,remise_coffret&actif=eq.true&order=ordre_affichage.asc`,
    {
      headers,
      cache: "no-store",
    }
  );

  if (!produitsResponse.ok) {
    throw new Error(`Erreur chargement produits : ${produitsResponse.status}`);
  }

  const produitsRaw: Record<string, unknown>[] = await produitsResponse.json();

  const paliersResponse = await fetch(
    `${supabaseUrl}/rest/v1/paliers_remise?select=*&order=qte_min.asc`,
    {
      headers,
      cache: "no-store",
    }
  );

  if (!paliersResponse.ok) {
    throw new Error(
      `Erreur chargement paliers_remise : ${paliersResponse.status}`
    );
  }

  const paliersRaw: Record<string, unknown>[] = await paliersResponse.json();

  const tranchesExpeditionResponse = await fetch(
    `${supabaseUrl}/rest/v1/tranches_expedition?select=*&order=ordre.asc`,
    {
      headers,
      cache: "no-store",
    }
  );

  if (!tranchesExpeditionResponse.ok) {
    throw new Error(
      `Erreur chargement tranches_expedition : ${tranchesExpeditionResponse.status}`
    );
  }

  const tranchesExpeditionRaw: Record<string, unknown>[] =
    await tranchesExpeditionResponse.json();

  const fiscalResponse = await fetch(
    `${supabaseUrl}/rest/v1/parametres_fiscaux?select=*&actif=eq.true&order=created_at.desc&limit=1`,
    {
      headers,
      cache: "no-store",
    }
  );

  if (!fiscalResponse.ok) {
    throw new Error(
      `Erreur chargement parametres_fiscaux : ${fiscalResponse.status}`
    );
  }

  const fiscalRaw: Record<string, unknown>[] = await fiscalResponse.json();
  const fiscal = fiscalRaw[0];

  if (!fiscal) {
    throw new Error("Aucun paramètre fiscal actif trouvé.");
  }

  const parametresFiscaux: ParametresFiscaux = {
    taux_droits_alcool: toNumber(fiscal.taux_droits_alcool),
    taux_vignette_alcool: toNumber(fiscal.taux_vignette_alcool),
    taux_droits_rhum_dom: toNumber(fiscal.taux_droits_rhum_dom),
    taux_vignette_rhum_dom: toNumber(fiscal.taux_vignette_rhum_dom),
    taux_droits_abv: toNumber(fiscal.taux_droits_abv),
    taux_vignette_abv: toNumber(fiscal.taux_vignette_abv),
    taux_tva: toNumber(fiscal.taux_tva || 20),
    remise_fixe_pro: toNumber(fiscal.remise_fixe_pro || 5),
  };

  const produits: ProduitCommande[] = produitsRaw.map((row) => ({
    code_produit: String(row.code_produit ?? ""),
    libelle: String(row.libelle ?? ""),
    tarif_base_ht: toNumber(row.tarif_base_ht),
    volume_l: row.volume_l == null ? null : toNumber(row.volume_l),
    alcool_vol: row.alcool_vol == null ? null : toNumber(row.alcool_vol),
    categorie_fiscale:
      row.categorie_fiscale == null ? null : String(row.categorie_fiscale),
    remise_coffret_pct: getRemiseCoffretPct(row),
  }));

  const paliers: PalierRemise[] = paliersRaw.map((row) => ({
    qte_min: toNumber(row.qte_min),
    qte_max: row.qte_max == null ? null : toNumber(row.qte_max),
    taux_remise: toNumber(row.taux_remise),
  }));

  const tranchesExpedition: TrancheExpedition[] = tranchesExpeditionRaw.map(
    (row) => ({
      qte_min: toNumber(row.qte_min),
      qte_max: row.qte_max == null ? null : toNumber(row.qte_max),
      frais_ttc: toNumber(row.frais_ttc),
    })
  );

  const lignesInput: LigneCommandeInput[] = produits
    .map((produit) => {
      const rawQte = getSingleValue(params[`qte_${produit.code_produit}`], "0");
      const quantite = toNumber(rawQte);

      if (!Number.isFinite(quantite) || quantite <= 0) return null;

      return {
        produit,
        quantite: Math.floor(quantite),
      };
    })
    .filter(Boolean) as LigneCommandeInput[];

  const recap = computeRecapCommande(
    lignesInput,
    regime,
    paliers,
    tranchesExpedition,
    parametresFiscaux
  );

  const { lignes, totaux } = recap;

  const {
    totalQuantite,
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
  } = totaux;

  const pdfParams = new URLSearchParams();
  if (code) pdfParams.set("code", code);
  pdfParams.set("regime", regime);

  for (const ligne of lignes) {
    pdfParams.set(`qte_${ligne.code_produit}`, String(ligne.quantite));
  }

  const clientParams = new URLSearchParams();
  if (code) clientParams.set("code", code);
  clientParams.set("regime", regime);

  for (const ligne of lignes) {
    clientParams.set(`qte_${ligne.code_produit}`, String(ligne.quantite));
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-8">
          <div className="mb-3 inline-flex rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
            Précommande B2B
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Récapitulatif de la commande
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
            Vérifiez le détail de votre sélection, les remises appliquées et les
            totaux avant de générer la proforma PDF ou de passer commande.
          </p>

          <div className="mt-4 flex flex-col gap-2 text-sm text-gray-700 sm:flex-row sm:items-center sm:gap-6">
            <p>
              Régime fiscal : <strong>{regimeLabel}</strong>
            </p>
            {code ? (
              <p>
                Code client : <strong>{code}</strong>
              </p>
            ) : (
              <p>
                Client : <strong>Non encore identifié</strong>
              </p>
            )}
          </div>
        </header>

        {lignes.length === 0 ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
            <h2 className="text-lg font-semibold text-amber-900">
              Aucune quantité renseignée
            </h2>
            <p className="mt-2 text-sm text-amber-800">
              Vous devez saisir au moins une quantité supérieure à 0 pour
              accéder au récapitulatif.
            </p>

            <div className="mt-4">
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Retour à la feuille de précommande
              </a>
            </div>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Détail de la commande
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Seules les lignes avec une quantité supérieure à 0 sont
                    affichées.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-100 text-sm text-gray-700">
                        <th className="border-b border-gray-200 px-4 py-3 text-left font-semibold">
                          Code
                        </th>
                        <th className="border-b border-gray-200 px-4 py-3 text-left font-semibold">
                          Libellé
                        </th>
                        <th className="border-b border-gray-200 px-4 py-3 text-left font-semibold">
                          Volume (L)
                        </th>
                        <th className="border-b border-gray-200 px-4 py-3 text-left font-semibold">
                          Alcool (% vol.)
                        </th>
                        <th className="border-b border-gray-200 px-4 py-3 text-right font-semibold">
                          Tarif base HT
                        </th>
                        <th className="border-b border-gray-200 px-4 py-3 text-right font-semibold">
                          Remise coffret
                        </th>
                        <th className="border-b border-gray-200 px-4 py-3 text-right font-semibold">
                          Tarif remisé HT
                        </th>
                        <th className="border-b border-gray-200 px-4 py-3 text-center font-semibold">
                          Quantité
                        </th>
                        <th className="border-b border-gray-200 px-4 py-3 text-right font-semibold">
                          Total HT
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {lignes.map((ligne, index) => (
                        <tr
                          key={ligne.code_produit}
                          className={index % 2 === 0 ? "bg-white" : "bg-gray-50/40"}
                        >
                          <td className="border-b border-gray-100 px-4 py-3 text-sm text-gray-900">
                            {ligne.code_produit}
                          </td>

                          <td className="border-b border-gray-100 px-4 py-3 text-sm text-gray-900">
                            {ligne.libelle}
                          </td>

                          <td className="border-b border-gray-100 px-4 py-3 text-sm text-gray-700">
                            {num(ligne.volume_l, 2)}
                          </td>

                          <td className="border-b border-gray-100 px-4 py-3 text-sm text-gray-700">
                            {ligne.alcool_vol != null
                              ? num(toNumber(ligne.alcool_vol) * 100, 2)
                              : "-"}
                          </td>

                          <td className="border-b border-gray-100 px-4 py-3 text-right text-sm text-gray-900">
                            {euro(ligne.tarifBaseHT)}
                          </td>

                          <td className="border-b border-gray-100 px-4 py-3 text-right text-sm text-gray-900">
                            {pct(ligne.remiseCoffretPct)}
                          </td>

                          <td className="border-b border-gray-100 px-4 py-3 text-right text-sm font-medium text-gray-900">
                            {euro(ligne.tarifRemiseHT)}
                          </td>

                          <td className="border-b border-gray-100 px-4 py-3 text-center text-sm text-gray-900">
                            {ligne.quantite}
                          </td>

                          <td className="border-b border-gray-100 px-4 py-3 text-right text-sm font-medium text-gray-900">
                            {euro(ligne.totalHT)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Rappel des remises appliquées
                </h2>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-medium text-gray-500">
                      Remise Pro
                    </p>
                    <p className="mt-1 text-base font-semibold text-gray-900">
                      {pct(remiseProPct)}
                    </p>
                  </div>

                  {regime === "DROITS_SUSPENDUS" ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-sm font-medium text-gray-500">
                        Remises particulières
                      </p>
                      <p className="mt-1 text-base font-semibold text-gray-900">
                        {pct(remiseParticulierePct)}
                      </p>
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-medium text-gray-500">
                      Remise palier
                    </p>
                    <p className="mt-1 text-base font-semibold text-gray-900">
                      {pct(remisePalierPct)}
                    </p>
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-medium text-gray-500">
                      Remise totale hors coffret
                    </p>
                    <p className="mt-1 text-base font-semibold text-gray-900">
                      {pct(
                        computeRemiseTotaleEquivalentePct(
                          remiseProPct,
                          remiseParticulierePct,
                          0,
                          remisePalierPct
                        )
                      )}
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm text-gray-600">
                  La remise coffret dépend de chaque produit et est appliquée en
                  cascade avec les autres remises.
                </p>
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Récapitulatif financier
                </h2>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-600">Quantité totale</span>
                    <span className="text-right font-medium text-gray-900">
                      {totalQuantite}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-600">
                      {regime === "DROITS_ACQUITTES"
                        ? "Montant HT remisé (hors droits)"
                        : "Montant HT remisé"}
                    </span>
                    <span className="text-right font-medium text-gray-900">
                      {euro(montantHtRemise)}
                    </span>
                  </div>

                  {regime === "DROITS_ACQUITTES" ? (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-gray-600">
                          Droits + vignette totaux
                        </span>
                        <span className="text-right font-medium text-gray-900">
                          {euro(montantDroits)}
                        </span>
                      </div>

                      <div className="flex items-start justify-between gap-4">
                        <span className="text-gray-600">Total HT acquitté</span>
                        <span className="text-right font-medium text-gray-900">
                          {euro(totalHtAcquitte)}
                        </span>
                      </div>
                    </>
                  ) : null}

                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-600">TVA</span>
                    <span className="text-right font-medium text-gray-900">
                      {euro(montantTva)}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-600">Frais d'expédition TTC</span>
                    <span className="text-right font-medium text-gray-900">
                      {euro(fraisExpeditionTtc)}
                    </span>
                  </div>

                  <div className="border-t border-gray-200 pt-3">
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-base font-bold text-red-600">
                        TOTAL TTC À RÉGLER
                      </span>
                      <span className="text-right text-base font-bold text-red-600">
                        {euro(montantTtc)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-gray-900">
                  Synthèse remises
                </h2>

                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-600">Montant HT de base</span>
                    <span className="text-right font-medium text-gray-900">
                      {euro(montantHtBase)}
                    </span>
                  </div>

                  <div className="flex items-start justify-between gap-4">
                    <span className="text-gray-600">Montant remises total</span>
                    <span className="text-right font-medium text-gray-900">
                      {euro(montantRemises)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <a
                  href={`/api/proforma-pdf?${pdfParams.toString()}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Voir ma proforma PDF
                </a>

                <a
                  href="/"
                  className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
                >
                  Modifier ma commande
                </a>

                <a
                  href={`/commande/client?${clientParams.toString()}`}
                  className="inline-flex items-center justify-center rounded-xl border border-slate-900 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                >
                  Passer commande
                </a>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}