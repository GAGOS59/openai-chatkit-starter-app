// components/EFTPointsReference.tsx
import React from "react";

export default function EFTPointsReference({ className = "" }: { className?: string }) {
  const sectionStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: 0,
    marginTop: 12,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  };

  // Cadre rouge pointillé - centré, largeur modérée
  const part1Style: React.CSSProperties = {
    maxWidth: "450px",
    width: "fit-content",
    boxSizing: "border-box",
    padding: "16px 20px",
    border: "2px dashed #dc3545",
    borderRadius: 8,
    backgroundColor: "#fff5f5",
    alignSelf: "center",
  };

  const linkStyle: React.CSSProperties = {
    textDecoration: "none",
    color: "#0f3d69",
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
  };

  // Cadre bleu pointillé - presque toute la largeur du conteneur chat
  const part2WrapperStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "none", // Enlève toute limite de largeur
    boxSizing: "border-box",
    padding: "20px 24px",
    border: "2px dashed #2980b9",
    borderRadius: 8,
    backgroundColor: "#f0f8ff",
    alignSelf: "stretch", // Force à prendre toute la largeur disponible
  };

  const part2TextStyle: React.CSSProperties = {
    color: "#2980b9",
    margin: 0,
    lineHeight: 1.6,
    textAlign: "justify",
    fontSize: 15,
  };

  return (
    <section className={className} aria-label="Repères visuels et info langue" style={sectionStyle}>
      {/* PARTIE 1 : Cadre rouge pointillé - Repères visuels (centré, plus étroit) */}
      <div style={part1Style}>
        <a
          href="https://technique-eft.com/decouvrir-eft/points-illustres.html"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Voir image et localisation des points EFT (ouvre un nouvel onglet)"
          style={linkStyle}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img" style={{ flexShrink: 0, marginTop: 2 }}>
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
            <circle cx="12" cy="8" r="1.5" fill="currentColor"/>
            <path d="M12 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>

          <div>
            <div style={{ fontWeight: 600, color: "#0f3d69", marginBottom: 4 }}>
              Repères visuels : points EFT (photo + localisation)
            </div>
            <div style={{ fontSize: 13, color: "#555", lineHeight: 1.4 }}>
              Voir la photo des points et la description précise (s&apos;ouvre dans un nouvel onglet).
            </div>
          </div>
        </a>
      </div>

      {/* PARTIE 2 : Cadre bleu pointillé - Info langue (pleine largeur du chat) */}
      <div style={part2WrapperStyle}>
        <p style={part2TextStyle}>
          Si vous souhaitez utiliser EFTY dans une autre langue, commencez toujours par demander à EFTY dans votre langue :
          <strong> « parles-tu français ? »</strong> (ou l&apos;équivalent dans votre langue — par ex. <em>&quot;Do you speak English?&quot;</em>, <em>&quot;¿Hablas español?&quot;</em>, <em>&quot;Sprichst du Deutsch?&quot;</em>, <em>&quot;Parli italiano?&quot;</em>) — puis attendez la confirmation avant de démarrer la séance.
        </p>
      </div>
    </section>
  );
}
