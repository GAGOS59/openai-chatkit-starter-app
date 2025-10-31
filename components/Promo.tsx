// app/components/Promo.tsx
"use client";

import React, { useEffect, useState } from "react";
import styles from "./promo.module.css";

const Promo: React.FC = () => {
  const [visible, setVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  // détecte la largeur (client-side)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ajoute un padding-bottom sur body quand la promo est visible en mobile
  useEffect(() => {
    const prev = document.body.style.paddingBottom;
    if (visible && isMobile) {
      document.body.style.paddingBottom = "80px"; // ajuster si nécessaire
    } else {
      document.body.style.paddingBottom = prev;
    }
    return () => {
      document.body.style.paddingBottom = prev;
    };
  }, [visible, isMobile]);

  if (!visible) return null;

  return (
    <aside className={styles.promo} role="complementary" aria-label="Promotion EFTY">
      <div className={styles.inner}>
        <div className={styles.content}>
          <h3 className={styles.title}>EFTY te soutient</h3>
          <p className={styles.text}>Un petit geste pour soutenir l’application — pas d’inscription obligatoire.</p>
        </div>

        <div className={styles.controls}>
          <a className={styles.btn} href="/soutenir">Je soutiens EFTY</a>
          <button
            className={styles.close}
            aria-label="Fermer la promo"
            onClick={() => setVisible(false)}
            title="Fermer"
          >
            ×
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Promo;
