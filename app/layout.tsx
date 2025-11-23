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

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID;

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

        {/* Charge GA4 seulement si la variable existe */}
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
            />
            <Script id="gtag-init" strategy="afterInteractive">
              {`
                (function(){
                  function initGtag(id){
                    window.dataLayer = window.dataLayer || [];
                    function gtag(){dataLayer.push(arguments);}
                    window.gtag = gtag;
                    gtag('js', new Date());
                    gtag('config', id, { send_page_view: true });
                  }
                  // init automatique si consentement déjà donné
                  if (localStorage.getItem('ga_consent') === 'granted') {
                    initGtag('${GA_MEASUREMENT_ID}');
                  } else {
                    // exposer une fonction pour initier après consentement
                    window.initGtagAfterConsent = () => initGtag('${GA_MEASUREMENT_ID}');
                  }
                })();
              `}
            </Script>
          </>
        )}
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
