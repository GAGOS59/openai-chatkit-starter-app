// components/EFTPointsReference.tsx
import React from "react";

export default function EFTPointsReference({ className = "" }: { className?: string }) {
  // Ajuste ces valeurs en px si tu veux d'autres largeurs
  const PART1_WIDTH = 300; // largeur fixe du bloc "Repères visuels" (px)
  const PART2_WIDTH = 800; // largeur fixe du bloc bleu (px)

  const sectionStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: 0,
    marginTop: 12,
  };

  const part1Style: React.CSSProperties = {
    width: `${PART1_WIDTH}px`,
    boxSizing: "border-box",
    display: "block",
    textAlign: "left",
    marginBottom: 8,
  };

  const linkStyle: React.CSSProperties = {
    textDecoration: "none",
    color: "#0f3d69",
    display: "inline-flex",
    gap: 10,
    alignItems: "center",
  };

  const part2WrapperStyle: React.CSSProperties = {
    maxWidth: `${PART2_WIDTH}px`,
    width: "100%",
    margin: "0 auto",
    boxSizing: "border-box",
    padding: 0,
  };

  const part2TextStyle: React.CSSProperties = {
    color: "#2980b9",
    marginTop: 12,
    lineHeight: 1.6,
    textAlign: "justify",
  };

  return (
    <section className={className} aria-label="Repères visuels et info langue" style={sectionStyle}>
      {/* PARTIE 1 : Repères visuels (indépendante, alignée à gauche) */}
      <div style={part1Style}>
        <a
          href="https://technique-eft.com/decouvrir-eft/points-illustres.html"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Voir image et localisation des points EFT (ouvre un nouvel onglet)"
          style={linkStyle}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="8" r="1.5" fill="currentColor"/>
            <path d="M12 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>

          <div>
            <div style={{ fontWeight: 600, color: "#0f3d69" }}>Repères visuels : points EFT (photo + localisation)</div>
            <div style={{ fontSize: 13, color: "#555" }}>
              Voir la photo des points et la description précise (s&apos;ouvre dans un nouvel onglet).
            </div>
          </div>
        </a>
      </div>

      {/* PARTIE 2 : Paragraphe bleu (indépendant, centré, largeur PART2_WIDTH) */}
      <div style={part2WrapperStyle}>
        <p style={part2TextStyle}>
          Si vous souhaitez utiliser EFTY dans une autre langue, commencez toujours par demander à EFTY dans votre langue :
          <strong> « parles-tu français ? »</strong> (ou l&apos;équivalent dans votre langue — par ex. <em>&quot;Do you speak English?&quot;</em>, <em>&quot;¿Hablas español?&quot;</em>, <em>&quot;Sprichst du Deutsch?&quot;</em>, <em>&quot;Parli italiano?&quot;</em>) — puis attendez la confirmation avant de démarrer la séance.
        </p>
      </div>
    </section>
  );
}
