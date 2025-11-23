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
  // ... garde le reste inchangé
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <Script
          src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
          strategy="beforeInteractive"
        />

        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
           <!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-1HHC2VHQP4"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-1HHC2VHQP4');
</script>
          </>
        )}
      </head>
      
      <body className="antialiased">{children}</body>
    </html>
  );
}
