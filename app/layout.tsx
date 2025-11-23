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
  // ID codé en dur ici pour que Google le voit dans View Source.
  // Si tu préfères, on peut remplacer par process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID.
  const GA_ID = "G-1HHC2VHQP4";

  return (
    <html lang="fr">
      <head>
        {/* Chatkit (existant) */}
        <Script
          src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
          strategy="beforeInteractive"
        />

        {/* ----- Google Analytics (visible côté serveur) ----- */}
        {/* 1) balise externe (visible dans View Source) */}
        <script
          async
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        ></script>

        {/* 2) init inline (visible aussi) — ne pas envoyer de page_view automatiquement */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              // Bloquer l'envoi automatique : attendre le consentement utilisateur
              gtag('config', '${GA_ID}', { send_page_view: false });
              // Fonction utilitaire à appeler après consentement
              window.gtagSendPageViewAfterConsent = function() {
                gtag('config', '${GA_ID}', { send_page_view: true });
              };
            `,
          }}
        />
      </head>

      <body className="antialiased">{children}</body>
    </html>
  );
}
