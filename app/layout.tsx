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
  // ... tu peux conserver le reste de ton metadata ici
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        {/* script existant — chatkit */}
        <Script
          src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
          strategy="beforeInteractive"
        />

        {/* --- TEST RAPIDE : insérer directement dans <head> --- */}

<script async src="https://www.googletagmanager.com/gtag/js?id=G-1HHC2VHQP4"></script>
<script
  // script inline rendu côté serveur — donc visible dans "View Source"
  dangerouslySetInnerHTML={{
    __html: `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-1HHC2VHQP4');
    `,
  }}
/>

          </>
        )}
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
