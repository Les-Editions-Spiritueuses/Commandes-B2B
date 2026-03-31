import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Generateur B2B",
  description: "V1 du générateur de commande B2B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}