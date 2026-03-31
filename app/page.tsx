type CommandePageProps = {
  searchParams: Promise<{ code?: string }>;
};

type Produit = {
  code_produit: string;
  libelle: string;
  tarif_base_ht: number;
};

export default async function CommandePage({
  searchParams,
}: CommandePageProps) {
  const params = await searchParams;
  const code = params.code ?? "";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Variables d'environnement Supabase manquantes.");
  }

  const url =
    `${supabaseUrl}/rest/v1/produits` +
    `?select=code_produit,libelle,tarif_base_ht` +
    `&order=libelle.asc`;

  const response = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Erreur chargement produits : ${response.status}`);
  }

  const produits: Produit[] = await response.json();

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* HEADER */}
        <header className="mb-8">
          <div className="mb-3 inline-flex rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
            Portail de précommande B2B
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Feuille de précommande
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
            Renseignez les quantités souhaitées pour chaque produit, puis
            choisissez le régime fiscal de votre commande pour accéder au
            récapitulatif et à la proforma PDF.
          </p>

          {/* MESSAGE REMISES */}
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 font-semibold">
            Les tarifs affichés correspondent aux tarifs de base HT. Les remises exclusives B2B (remise professionnelle, remise particulière, remise par coffret et remise par palier) seront appliquées dans le récapitulatif et sur la proforma.
          </div>

          {code ? (
            <p className="mt-3 text-sm text-gray-700">
              Code client détecté : <strong>{code}</strong>
            </p>
          ) : null}
        </header>

        {/* FORMULAIRE */}
        <form action="/commande/recap" method="get">
          <input type="hidden" name="code" value={code} />

          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left">Code</th>
                  <th className="px-3 py-2 text-left">Produit</th>
                  <th className="px-3 py-2 text-right">Prix HT</th>
                  <th className="px-3 py-2 text-center">Quantité</th>
                </tr>
              </thead>

              <tbody>
                {produits.map((p) => (
                  <tr key={p.code_produit} className="border-t">
                    <td className="px-3 py-2">{p.code_produit}</td>
                    <td className="px-3 py-2">{p.libelle}</td>
                    <td className="px-3 py-2 text-right">
                      {Number(p.tarif_base_ht).toFixed(2)} €
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        name={`qte_${p.code_produit}`}
                        min="0"
                        defaultValue="0"
                        className="w-20 rounded border border-gray-300 px-2 py-1 text-center"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ACTIONS */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="submit"
              name="regime"
              value="DROITS_SUSPENDUS"
              className="flex-1 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Ma commande en droits suspendus
            </button>

            <button
              type="submit"
              name="regime"
              value="DROITS_ACQUITTES"
              className="flex-1 rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
            >
              Ma commande en droits acquittés
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}