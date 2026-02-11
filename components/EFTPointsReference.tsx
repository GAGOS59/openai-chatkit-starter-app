// components/EFTPointsReference.tsx
import React from "react";

export default function EFTPointsReference({ className = "" }: { className?: string }) {
  // Ajuste ici la largeur désirée pour la partie 2 (en px)
  const PART1_WIDTH = 300; // px pour "Repères visuels" (exemple 300)
  const PART2_WIDTH = 800; // ← EXEMPLE : 720px, remplace par la valeur souhaitée (ex. largeur du chat)

  return (
    <section
      className={className}
      aria-label="Repères visuels et info langue"
      style={{ width: "100%", boxSizing: "border-box", padding: "0", marginTop: 12 }}
    >
      {/* ---------- PARTIE 1 : Repères visuels (reste décalé à gauche, inchangé) ---------- */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          alignItems: "center",
          marginBottom: 8,
          gap: 10
        }}
      >
        <a
          href="https://technique-eft.com/decouvrir-eft/points-illustres.html"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Voir image et localisation des points EFT (ouvre un nouvel onglet)"
          style={{ textDecoration: "none", color: "#0f3d69", display: "inline-flex", gap: 10, alignItems: "center" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img">
            <path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 5a2 2 0 11-.001 3.999A2 2 0 0112 7zm2 10h-4v-1c0-1 2-1.5 2-2.5 0-1-1-1-1-1v-.5a2.5 2.5 0 10-5 0V15h2v1h6v-1z"/>
          </svg>

          <div>
            <div style={{ fontWeight: 600, color: "#0f3d69" }}>Repères visuels : points EFT (photo + localisation)</div>
            <div style={{ fontSize: 13, color: "#555" }}>
              Voir la photo des points et la description précise (s&apos;ouvre dans un nouvel onglet).
            </div>
          </div>
        </a>
      </div>

      {/* ---------- PARTIE 2 : texte bleu (CENTRÉ, LARGEUR INDEPENDANTE) ---------- */}
      <div
        style={{
          maxWidth: `${PART2_WIDTH}px`, // largeur fixe; remplace par la valeur exacte du chat si tu veux
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
          padding: "0 8px" // petit padding interne pour confort sur petits écrans
        }}
      >
        <p style={{ color: "#2980b9", marginTop: 12, lineHeight: 1.6, textAlign: "justify", textJustify: "inter-word" }}>
          Si vous souhaitez utiliser EFTY dans une autre langue, commencez toujours par demander à EFTY dans votre langue :
          <strong> « parles-tu français ? »</strong> (ou l’équivalent dans votre langue — par ex. <em>“Do you speak English?”</em>, <em>“¿Hablas español?”</em>, <em>“Sprichst du Deutsch?”</em>, <em>“Parli italiano?”</em>) — puis attendez la confirmation avant de démarrer la séance.
        </p>
      </div>
    </section>
  );
}
