// app/layout.tsx
import Script from "next/script";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "École EFT France — EFTY",
    template: "%s · École EFT France",
  },
  description:
    "EFTY — votre auto-séance EFT guidée, fidèle à l’EFT d’origine de Gary Craig.",
  openGraph: {
    title: "École EFT France — EFTY",
    description:
      "EFTY — auto-séance EFT guidée, simple et rigoureuse, proposée par Geneviève Gagos.",
    url: "https://appli.ecole-eft-france.fr/",
    siteName: "École EFT France — EFTY",
    images: [
      {
        url: "https://ecole-eft-france.fr/assets/front/logo-a8701fa15e57e02bbd8f53cf7a5de54b.png",
        width: 600,
        height: 200,
        alt: "Logo École EFT France",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "École EFT France — EFTY",
    description:
      "EFTY — auto-séance EFT guidée, fidèle à l’EFT d’origine et à la méthode TIPS®.",
    images: [
      "https://ecole-eft-france.fr/assets/front/logo-a8701fa15e57e02bbd8f53cf7a5de54b.png",
    ],
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        <Script
          src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
