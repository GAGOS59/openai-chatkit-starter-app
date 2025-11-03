// app/layout.tsx
import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "EFTY — Auto-séance EFT guidée | École EFT France",
  description:
    "EFTY vous guide pas à pas dans une auto-séance EFT fidèle à l'EFT d'origine. Simple, sécurisé et bienveillant — par Geneviève Gagos.",
  // (optionnel) open graph minimal — utile au partage social
  openGraph: {
    title: "EFTY — Auto-séance EFT guidée",
    description:
      "EFTY vous guide pas à pas dans une auto-séance EFT fidèle à l'EFT d'origine.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head />
      <body>{children}</body>
    </html>
  );
}
