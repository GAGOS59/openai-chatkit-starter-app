// app/layout.tsx
import Script from "next/script";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "École EFT France — EFTY, votre auto-séance EFT guidée.",
    template: "%s · École EFT France",
  },
  description:
    "EFTY — votre auto-séance EFT guidée, fidèle à l’EFT d’origine de Gary Craig et développée par Geneviève Gagos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // ID codé en dur pour être visible dans le HTML rendu côté serveur (détection Google OK).
  // Si tu préfères plus tard, remplace par : process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID
  const GA_ID = "G-1HHC2VHQP4";

  return (
    <html lang="fr">
      <head>
        {/* Chatkit (existant) */}
        <Script
          src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
          strategy="beforeInteractive"
        />

        {/* Google Analytics (visible côté serveur) */}
        <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}></script>

        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              // Envoi immédiat du page_view (pas d'attente de consentement)
              gtag('config', '${GA_ID}');
            `,
          }}
        />
        <link rel="manifest" href="/manifest.json">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<meta name="theme-color" content="#0f3d69">


      </head>

      <body className="antialiased">{children}</body>
    </html>
  );
}
