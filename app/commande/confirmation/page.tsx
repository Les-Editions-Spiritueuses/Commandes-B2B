type ConfirmationPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleValue(
  value: string | string[] | undefined,
  fallback = ""
): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default async function ConfirmationPage({
  searchParams,
}: ConfirmationPageProps) {
  const params = await searchParams;

  const code = getSingleValue(params.code, "");
  const regime = getSingleValue(params.regime, "");

  const clientRaisonSociale = getSingleValue(params.client_raison_sociale, "");
  const clientSiret = getSingleValue(params.client_siret, "");
  const clientTvaIntracom = getSingleValue(params.client_tva_intracom, "");
  const clientContact = getSingleValue(params.client_contact, "");
  const clientEmail = getSingleValue(params.client_email, "");
  const clientTelephone = getSingleValue(params.client_telephone, "");
  const adresse1 = getSingleValue(params.facturation_adresse_ligne_1, "");
  const adresse2 = getSingleValue(params.facturation_adresse_ligne_2, "");
  const codePostal = getSingleValue(params.facturation_code_postal, "");
  const ville = getSingleValue(params.facturation_ville, "");
  const pays = getSingleValue(params.facturation_pays, "France");

  const proformaId =
    getSingleValue(params.proforma_id, "") ||
    getSingleValue(params.numero_proforma, "");

  const numeroProforma = getSingleValue(params.numero_proforma, proformaId);
  const numeroCommande = getSingleValue(params.numero_commande, "");
  const pdfUrlFromParams = getSingleValue(params.pdf_url, "");

  const pdfUrl = pdfUrlFromParams
    ? pdfUrlFromParams
    : proformaId
      ? `/api/proforma-pdf?proforma_id=${encodeURIComponent(proformaId)}`
      : "";

  const regimeLabel =
    regime === "DROITS_SUSPENDUS"
      ? "Droits suspendus"
      : regime === "DROITS_ACQUITTES"
        ? "Droits acquittés"
        : "Non défini";

  const addressLine = [adresse1, adresse2].filter(Boolean).join(", ");
  const cityLine = [codePostal, ville].filter(Boolean).join(" ");

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <header className="mb-8">
          <div className="mb-3 inline-flex rounded-full bg-green-100 px-3 py-1 text-sm text-green-800">
            Commande enregistrée
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Confirmation de votre commande
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600">
            Votre commande a bien été enregistrée. Vous pouvez dès maintenant
            consulter et télécharger votre proforma PDF.
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">
                Informations client transmises
              </h2>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-gray-500">
                    Raison sociale
                  </p>
                  <p className="mt-1 text-sm text-gray-900">
                    {clientRaisonSociale || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500">Contact</p>
                  <p className="mt-1 text-sm text-gray-900">
                    {clientContact || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500">SIRET</p>
                  <p className="mt-1 text-sm text-gray-900">
                    {clientSiret || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500">
                    N° TVA intracom
                  </p>
                  <p className="mt-1 text-sm text-gray-900">
                    {clientTvaIntracom || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500">Email</p>
                  <p className="mt-1 text-sm text-gray-900">
                    {clientEmail || "-"}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-gray-500">
                    Téléphone
                  </p>
                  <p className="mt-1 text-sm text-gray-900">
                    {clientTelephone || "-"}
                  </p>
                </div>

                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-gray-500">Adresse</p>
                  <p className="mt-1 text-sm text-gray-900">
                    {addressLine || "-"}
                  </p>
                  <p className="mt-1 text-sm text-gray-900">
                    {[cityLine, pays].filter(Boolean).join(" ")}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">
                Suite de votre commande
              </h2>

              <p className="mt-3 text-sm leading-6 text-gray-600">
                Votre proforma est disponible immédiatement en téléchargement
                ci-dessous. Notre équipe reviendra vers vous pour la suite du
                traitement de votre commande.
              </p>
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-gray-200 bg-gray-50 p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Synthèse</h2>

            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-600">Régime fiscal</span>
                <span className="text-right font-medium text-gray-900">
                  {regimeLabel}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-600">Code client</span>
                <span className="text-right font-medium text-gray-900">
                  {code || "Nouveau client"}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-600">N° proforma</span>
                <span className="text-right font-medium text-gray-900">
                  {numeroProforma || "-"}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-600">N° commande</span>
                <span className="text-right font-medium text-gray-900">
                  {numeroCommande || "-"}
                </span>
              </div>

              <div className="flex items-start justify-between gap-4">
                <span className="text-gray-600">Statut</span>
                <span className="text-right font-medium text-green-700">
                  Commande enregistrée
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3">
              {pdfUrl ? (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  Voir ma proforma PDF
                </a>
              ) : (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  La proforma n’est pas encore disponible.
                </div>
              )}

              <a
                href="/"
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
              >
                Retour à l’accueil
              </a>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}