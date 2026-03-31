type CommandePageProps = {
  searchParams: Promise<{ code?: string }>;
};

type Produit = {
  code_produit: string;
  libelle: string;
  tarif_base_ht: number;
  volume_l?: number | null;
  alcool_vol?: number | null;
};

function formatPrix(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(Number(value ?? 0));
}

function formatNombre(value?: number | null, digits = 2) {
  if (value == null) return "-";
  return Number(value).toFixed(digits).replace(".", ",");
}

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
    `?select=code_produit,libelle,tarif_base_ht,volume_l,alcool_vol` +
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
      <div className="mx-auto max-w-7xl px-6 py-8">
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

          {code ? (
            <p className="mt-3 text-sm text-gray-700">
              Code client détecté : <strong>{code}</strong>
            </p>
          ) : null}
        </header>

        <form action="/commande/recap" method="get" className="space-y-6">
          <input type="hidden" name="code" value={code} />

          <section className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Produits disponibles
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Saisissez uniquement les quantités souhaitées. Les lignes à 0 ne
                seront pas retenues dans le récapitulatif.
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
                    <th className="border-b border-gray-200 px-4 py-3 text-left font-semibold">
                      Tarif base HT
                    </th>
                    <th className="border-b border-gray-200 px-4 py-3 text-left font-semibold">
                      Quantité
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {produits.map((p, index) => (
                    <tr
                      key={p.code_produit}
                      className={index % 2 === 0 ? "bg-white" : "bg-gray-50/40"}
                    >
                      <td className="border-b border-gray-100 px-4 py-3 text-sm text-gray-900">
                        {p.code_produit}
                      </td>

                      <td className="border-b border-gray-100 px-4 py-3 text-sm text-gray-900">
                        {p.libelle}
                      </td>

                      <td className="border-b border-gray-100 px-4 py-3 text-sm text-gray-700">
                        {formatNombre(p.volume_l, 2)}
                      </td>

                      <td className="border-b border-gray-100 px-4 py-3 text-sm text-gray-700">
                        {p.alcool_vol != null
                          ? formatNombre(Number(p.alcool_vol) * 100, 2)
                          : "-"}
                      </td>

                      <td className="border-b border-gray-100 px-4 py-3 text-sm text-gray-900">
                        {formatPrix(p.tarif_base_ht)}
                      </td>

                      <td className="border-b border-gray-100 px-4 py-3">
                        <input
                          type="number"
                          name={`qte_${p.code_produit}`}
                          min="0"
                          step="1"
                          defaultValue="0"
                          inputMode="numeric"
                          className="w-24 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-0 transition focus:border-gray-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <h2 className="text-lg font-semibold text-gray-900">
              Choix du régime fiscal
            </h2>

            <p className="mt-2 text-sm leading-6 text-gray-600">
              Après avoir renseigné vos quantités, choisissez le régime fiscal
              correspondant à votre commande. Le récapitulatif et la proforma
              seront générés selon ce choix.
            </p>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                name="regime"
                value="DROITS_SUSPENDUS"
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Ma commande en droits suspendus
              </button>

              <button
                type="submit"
                name="regime"
                value="DROITS_ACQUITTES"
                className="inline-flex items-center justify-center rounded-xl border border-slate-900 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
              >
                Ma commande en droits acquittés
              </button>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}