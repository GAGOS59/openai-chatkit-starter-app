// components/EFTPointsReference.tsx
import React from "react";

export default function EFTPointsReference({ className = "" }: { className?: string }) {
  /**
   * IMPORTANT :
   * - Ne touche pas au bloc lien (il est volontairement inchangé / décalé pour la mise en valeur).
   * - Ajuste CONTENT_MAX_WIDTH et HORIZONTAL_PADDING pour que le paragraphe bleu
   *   ait exactement la même largeur que la "ligne du haut du cadre" rendue ailleurs (page.tsx).
   */

  const CONTENT_MAX_WIDTH = "980px"; // ← ajuste ici pour caler sur la largeur du cadre
  const HORIZONTAL_PADDING = "32px";  // ← ajuste si ton cadre a un padding horizontal différent

  // wrapper plein largeur (permet au lien de rester décalé visuellement)
  const fullWidthWrapper: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: `0 ${HORIZONTAL_PADDING}`,
    marginTop: 12
  };

  // conteneur centré (seul ce conteneur contrôle la largeur du paragraphe bleu)
  const centerContainer: React.CSSProperties = {
    maxWidth: CONTENT_MAX_WIDTH,
    margin: "0 auto",
    boxSizing: "border-box"
  };

  // --- Styles du lien : laissé volontairement fidèle à ton code d'origine ---
  const linkStyle: React.CSSProperties = {
    textDecoration: "none",
    color: "#0f3d69",
    display: "inline-flex",
    gap: 10,
    alignItems: "center"
  };

  const leadTitleStyle: React.CSSProperties = {
    fontWeight: 600,
    color: "#0f3d69"
  };

  const leadDescStyle: React.CSSProperties = {
    fontSize: 13,
    color: "#555"
  };

  // style du paragraphe bleu (centré dans centerContainer)
  const langTextStyle: React.CSSProperties = {
    color: "#2980b9",
    marginTop: 12,
    lineHeight: 1.45
  };

  return (
    <section className={className} aria-label="Repères visuels et info langue">
      <div style={fullWidthWrapper}>

        {/* --------------------------
            1) BLOC LIEN (INCHANGÉ - DÉCALÉ / MIS EN VALEUR)
            -------------------------- */}
        <div style={{ display: "flex", justifyContent: "flex-start", alignItems: "center", marginBottom: 6 }}>
          <a
            href="https://technique-eft.com/decouvrir-eft/points-illustres.html"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Voir image et localisation des points EFT (ouvre un nouvel onglet)"
            style={linkStyle}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" focusable="false" role="img">
              <path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 5a2 2 0 11-.001 3.999A2 2 0 0112 7zm2 10h-4v-1c0-1 2-1.5 2-2.5 0-1-1-1-1-1v-.5a2.5 2.5 0 10-5 0V15h2v1h6v-1z"/>
            </svg>

            <div>
              <div style={leadTitleStyle}>Repères visuels : points EFT (photo + localisation)</div>
              <div style={leadDescStyle}>
                Voir la photo des points et la description précise (s&apos;ouvre dans un nouvel onglet).
              </div>
            </div>
          </a>
        </div>

        {/* --------------------------
            2) PARAGRAPHE BLEU (CENTRÉ, MÊME LARGEUR QUE LE CADRE)
            - Aucun autre contenu n'est ajouté ici (le cadre reste dans page.tsx).
            -------------------------- */}
        <div style={centerContainer}>
          <p style={langTextStyle}>
            Si vous souhaitez utiliser EFTY dans une autre langue, commencez toujours par demander à EFTY dans votre langue :
            <strong> « parles-tu français ? »</strong> (ou l’équivalent dans votre langue — par ex. <em>“Do you speak English?”</em>, <em>“¿Hablas español?”</em>, <em>“Sprichst du Deutsch?”</em>, <em>“Parli italiano?”</em>) — puis attendez la confirmation avant de démarrer la séance.
          </p>
        </div>

      </div>
    </section>
  );
}
