import ClientForm from "./ClientForm";

type ClientPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function getSingleValue(
  value: string | string[] | undefined,
  fallback = ""
): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

export default async function ClientPage({ searchParams }: ClientPageProps) {
  const params = await searchParams;

  const code = getSingleValue(params.code, "");
  const regime = getSingleValue(params.regime, "");

  const quantites: Record<string, number> = {};

  for (const [key, value] of Object.entries(params)) {
    if (!key.startsWith("qte_")) continue;

    const produitCode = key.replace("qte_", "").trim();
    const rawValue = getSingleValue(value, "0");
    const quantite = Number(rawValue);

    if (!produitCode) continue;
    if (!Number.isFinite(quantite)) continue;
    if (quantite <= 0) continue;

    quantites[produitCode] = Math.floor(quantite);
  }

  return (
    <ClientForm
      initialCode={code}
      initialRegime={regime}
      quantites={quantites}
    />
  );
}