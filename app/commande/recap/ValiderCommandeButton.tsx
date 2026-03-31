"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  codeClient: string;
  quantites: Record<string, number>;
  typeProforma?: "ACQUITTES" | "SUSPENDUS";
};

export default function ValiderCommandeButton({
  codeClient,
  quantites,
  typeProforma = "ACQUITTES",
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/valider-commande", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code_client: codeClient,
          type_proforma: typeProforma,
          quantites,
        }),
      });

      const rawText = await response.text();
      console.log("Réponse API brute :", rawText);

      let result: any = null;

      try {
        result = JSON.parse(rawText);
      } catch {
        throw new Error(`Réponse non JSON : ${rawText.slice(0, 200)}`);
      }

      if (!response.ok) {
        throw new Error(result?.error || "Erreur lors de l’enregistrement de la précommande");
      }

      router.push(
        `/commande/confirmation?commande_id=${result.commande_id}&numero_commande=${encodeURIComponent(
          result.numero_commande ?? ""
        )}&numero_proforma=${encodeURIComponent(
          result.numero_proforma ?? ""
        )}`
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Erreur inconnue lors de l’enregistrement"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="rounded bg-black text-white px-4 py-2 disabled:opacity-50"
      >
        {loading ? "Enregistrement..." : "Voir ma précommande"}
      </button>

      {error && <p className="mt-3 text-red-600">{error}</p>}
    </div>
  );
}