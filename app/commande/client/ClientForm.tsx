"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ClientFormProps = {
  initialCode: string;
  initialRegime: string;
  quantites: Record<string, number>;
};

type ApiResponse = {
  success?: boolean;
  message?: string;
  pdf_url?: string;
  proforma_id?: string;
  numero_proforma?: string;
  numero_commande?: string;
  regime?: string;
  email_status?: string;
  client?: {
    id: string;
    code_client: string;
    raison_sociale: string;
    contact?: string;
    email?: string;
    telephone?: string;
    siret?: string;
    tva_intracom?: string;
    adresse_ligne_1?: string;
    adresse_ligne_2?: string;
    code_postal?: string;
    ville?: string;
    pays?: string;
    is_new: boolean;
  };
  commande?: {
    id: string;
    numero_proforma: string;
    numero_commande: string;
    montant_ttc: number;
    total_quantite?: number;
    remise_palier_appliquee?: number;
    frais_expedition_ttc?: number;
    montant_droits?: number;
  };
  error?: string;
  details?: string;
};

export default function ClientForm({
  initialCode,
  initialRegime,
  quantites,
}: ClientFormProps) {
  const router = useRouter();

  const [clientRaisonSociale, setClientRaisonSociale] = useState("");
  const [clientSiret, setClientSiret] = useState("");
  const [clientTvaIntracom, setClientTvaIntracom] = useState("");
  const [clientContact, setClientContact] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientTelephone, setClientTelephone] = useState("");
  const [adresse1, setAdresse1] = useState("");
  const [adresse2, setAdresse2] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [ville, setVille] = useState("");
  const [pays, setPays] = useState("France");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const regimeLabel = useMemo(() => {
    if (initialRegime === "DROITS_SUSPENDUS") return "Droits suspendus";
    if (initialRegime === "DROITS_ACQUITTES") return "Droits acquittés";
    return "Non défini";
  }, [initialRegime]);

  const totalLignes = useMemo(
    () => Object.keys(quantites).length,
    [quantites]
  );

  const totalQuantite = useMemo(
    () => Object.values(quantites).reduce((sum, qty) => sum + qty, 0),
    [quantites]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!clientRaisonSociale.trim()) {
      setErrorMessage("La raison sociale est obligatoire.");
      return;
    }

    if (!clientEmail.trim()) {
      setErrorMessage("L'email est obligatoire.");
      return;
    }

    if (
      initialRegime !== "DROITS_SUSPENDUS" &&
      initialRegime !== "DROITS_ACQUITTES"
    ) {
      setErrorMessage("Le régime fiscal est invalide.");
      return;
    }

    if (Object.keys(quantites).length === 0) {
      setErrorMessage("Aucune quantité valide n'a été transmise.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        code: initialCode || undefined,
        regime: initialRegime,
        quantites,
        client_raison_sociale: clientRaisonSociale,
        client_siret: clientSiret,
        client_tva_intracom: clientTvaIntracom,
        client_contact: clientContact,
        client_email: clientEmail,
        client_telephone: clientTelephone,
        facturation_adresse_ligne_1: adresse1,
        facturation_adresse_ligne_2: adresse2,
        facturation_code_postal: codePostal,
        facturation_ville: ville,
        facturation_pays: pays,
      };

      const response = await fetch("/api/valider-commande", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.success) {
        setErrorMessage(
          data.error ||
            data.details ||
            "Une erreur est survenue lors de la validation."
        );
        return;
      }

      const params = new URLSearchParams();

      params.set("success", "1");
      params.set("regime", data.regime || initialRegime);

      if (data.client?.code_client) {
        params.set("code", data.client.code_client);
      } else if (initialCode) {
        params.set("code", initialCode);
      }

      if (data.client?.raison_sociale) {
        params.set("client_raison_sociale", data.client.raison_sociale);
      } else if (clientRaisonSociale) {
        params.set("client_raison_sociale", clientRaisonSociale);
      }

      if (data.client?.siret) {
        params.set("client_siret", data.client.siret);
      } else if (clientSiret) {
        params.set("client_siret", clientSiret);
      }

      if (data.client?.tva_intracom) {
        params.set("client_tva_intracom", data.client.tva_intracom);
      } else if (clientTvaIntracom) {
        params.set("client_tva_intracom", clientTvaIntracom);
      }

      if (data.client?.contact) {
        params.set("client_contact", data.client.contact);
      } else if (clientContact) {
        params.set("client_contact", clientContact);
      }

      if (data.client?.email) {
        params.set("client_email", data.client.email);
      } else if (clientEmail) {
        params.set("client_email", clientEmail);
      }

      if (data.client?.telephone) {
        params.set("client_telephone", data.client.telephone);
      } else if (clientTelephone) {
        params.set("client_telephone", clientTelephone);
      }

      if (data.client?.adresse_ligne_1) {
        params.set("facturation_adresse_ligne_1", data.client.adresse_ligne_1);
      } else if (adresse1) {
        params.set("facturation_adresse_ligne_1", adresse1);
      }

      if (data.client?.adresse_ligne_2) {
        params.set("facturation_adresse_ligne_2", data.client.adresse_ligne_2);
      } else if (adresse2) {
        params.set("facturation_adresse_ligne_2", adresse2);
      }

      if (data.client?.code_postal) {
        params.set("facturation_code_postal", data.client.code_postal);
      } else if (codePostal) {
        params.set("facturation_code_postal", codePostal);
      }

      if (data.client?.ville) {
        params.set("facturation_ville", data.client.ville);
      } else if (ville) {
        params.set("facturation_ville", ville);
      }

      if (data.client?.pays) {
        params.set("facturation_pays", data.client.pays);
      } else if (pays) {
        params.set("facturation_pays", pays);
      }

      const numeroProforma =
        data.proforma_id ||
        data.numero_proforma ||
        data.commande?.numero_proforma ||
        "";

      const numeroCommande =
        data.numero_commande || data.commande?.numero_commande || "";

      if (numeroProforma) {
        params.set("proforma_id", numeroProforma);
        params.set("numero_proforma", numeroProforma);
      }

      if (numeroCommande) {
        params.set("numero_commande", numeroCommande);
      }

      if (typeof data.commande?.montant_ttc === "number") {
        params.set("montant_ttc", String(data.commande.montant_ttc));
      }

      if (data.pdf_url) {
        params.set("pdf_url", data.pdf_url);
      }

      if (data.email_status) {
        params.set("email_status", data.email_status);
      }

      router.push(`/commande/confirmation?${params.toString()}`);
    } catch {
      setErrorMessage("Impossible de contacter le serveur.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <header className="mb-8">
          <div className="mb-3 inline-flex rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700">
            Précommande B2B
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Informations client
          </h1>

          <p className="mt-3 text-sm leading-6 text-gray-600">
            Renseignez votre fiche client pour finaliser votre demande,
            enregistrer la commande et générer la proforma.
          </p>

          <div className="mt-4 flex flex-col gap-2 text-sm text-gray-700 sm:flex-row sm:flex-wrap sm:gap-6">
            <p>
              Régime fiscal : <strong>{regimeLabel}</strong>
            </p>

            {initialCode ? (
              <p>
                Code client : <strong>{initialCode}</strong>
              </p>
            ) : (
              <p>
                Code client : <strong>Nouveau client</strong>
              </p>
            )}

            <p>
              Lignes commandées : <strong>{totalLignes}</strong>
            </p>

            <p>
              Quantité totale : <strong>{totalQuantite}</strong>
            </p>
          </div>
        </header>

        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Société</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Raison sociale *
                  </label>
                  <input
                    type="text"
                    value={clientRaisonSociale}
                    onChange={(e) => setClientRaisonSociale(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    SIRET
                  </label>
                  <input
                    type="text"
                    value={clientSiret}
                    onChange={(e) => setClientSiret(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    N° TVA intracom
                  </label>
                  <input
                    type="text"
                    value={clientTvaIntracom}
                    onChange={(e) => setClientTvaIntracom(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Contact
                  </label>
                  <input
                    type="text"
                    value={clientContact}
                    onChange={(e) => setClientContact(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Coordonnées
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Téléphone
                  </label>
                  <input
                    type="text"
                    value={clientTelephone}
                    onChange={(e) => setClientTelephone(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Adresse de facturation
              </h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Adresse
                  </label>
                  <input
                    type="text"
                    value={adresse1}
                    onChange={(e) => setAdresse1(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Complément d’adresse
                  </label>
                  <input
                    type="text"
                    value={adresse2}
                    onChange={(e) => setAdresse2(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Pays
                  </label>
                  <input
                    type="text"
                    value={pays}
                    onChange={(e) => setPays(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Code postal
                  </label>
                  <input
                    type="text"
                    value={codePostal}
                    onChange={(e) => setCodePostal(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Ville
                  </label>
                  <input
                    type="text"
                    value={ville}
                    onChange={(e) => setVille(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            {errorMessage ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={() => router.back()}
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-900 transition hover:bg-gray-50"
                disabled={isSubmitting}
              >
                Retour au récapitulatif
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Validation en cours..." : "Valider la commande"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}