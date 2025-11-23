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

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID; // sans fallback

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

                  // contrôle simple de consentement : si 'ga_consent' = 'granted', on init automatiquement
                  const consent = localStorage.getItem('ga_consent');
                  if (consent === 'granted') {
                    initGtag('${GA_MEASUREMENT_ID}');
                  } else {
                    // expose une fonction pour initier après consentement via ton CMP
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
