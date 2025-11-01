/* app/page.tsx */
"use client";
import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  FormEvent,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

/* ---------- Constants & small components ---------- */
const PAYPAL_URL = "https://paypal.me/efty25";

/** Bouton AYNI réutilisable (cœur + lien PayPal, centré) */
function AyniButton({ className = "" }: { className?: string }) {
  return (
    <div className={"flex justify-center " + className}>
      <a
        href={PAYPAL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={
          "inline-flex items-center gap-3 rounded-xl border px-4 py-2 shadow-sm bg-white hover:bg-gray-50 active:scale-[0.99] transition"
        }
        aria-label="Soutenir EFTY sur PayPal"
      >
        <span aria-hidden className="text-2xl leading-none">❤️</span>
        <span className="font-medium">Soutenir EFTY</span>
      </a>
    </div>
  );
}

/* ---------- Types ---------- */
type Role = "user" | "assistant";
type Message = { role: Role; content: string };
type CrisisFlag = "none" | "ask" | "lock";
type ToastState = { msg: string; key: number } | null;

function PromoCard() {
  const [visible, setVisible] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const prev = document.body.style.paddingBottom || "";
    if (visible && isMobile) {
      document.body.style.paddingBottom = "110px"; // plus d'espace si boutons prennent la largeur
    } else {
      document.body.style.paddingBottom = prev;
    }
    return () => {
      document.body.style.paddingBottom = prev;
    };
  }, [visible, isMobile]);

  const closePromo = () => setVisible(false);
  if (!visible) return null;

  return (
    <aside
      className={
        "rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm " +
        "md:sticky md:top-6 " +
        "fixed left-0 right-0 bottom-0 md:relative md:w-auto z-50"
      }
      role="complementary"
      aria-label="Promotion EFTY"
    >
      {/* Container principal : full width mobile, constrained desktop */}
      <div className="w-full max-w-[980px] mx-auto flex flex-col md:flex-col gap-4 items-center md:items-stretch">
        {/* Header / intro */}
        <div className="w-full md:w-full">
          <h2 className="text-xl font-semibold mb-1 text-center md:text-left">
            Pour aller plus loin avec l&apos;EFT
          </h2>
          <p className="text-sm mb-3 leading-relaxed text-center md:text-left">
            Des formations fidèles à l&apos;EFT d&apos;origine et la méthode <strong>TIPS®</strong>.
          </p>
        </div>

        {/* Boutons : empilés sur mobile, alignés sur desktop */}
        <div className="w-full flex flex-col md:flex-col gap-3 items-center">
          <a
            href="https://ecole-eft-france.fr/realigner-pratique-eft.html"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full md:w-auto text-center rounded-lg border border-[#0f3d69] text-[#0f3d69] px-4 py-3 hover:bg-[#f6f9ff] transition"
          >
            Réaligner sa pratique EFT
          </a>

          <a
            href="https://ecole-eft-france.fr/pages/formations-eft.html"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full md:w-auto text-center rounded-lg bg-[#0f3d69] text-white px-4 py-3 hover:bg-[#164b84] transition"
          >
            Formations EFT
          </a>

          <a
            href="https://ecole-eft-france.fr/pages/tips.html"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full md:w-auto text-center rounded-lg border border-[#0f3d69] text-[#0f3d69] px-4 py-3 hover:bg-[#f6f9ff] transition"
          >
            Méthode TIPS®
          </a>

          {/* Bouton de soutien (Ayni) - plein width sur mobile */}
        
              

          <div className="w-full flex flex-col items-center gap-3">
  <p className="text-sm opacity-80 text-center md:text-left">
    EFTY te soutient. Voudrais-tu soutenir EFTY ?
  </p>
            
          <div className="w-full flex justify-center">
            <AyniButton className="w-full md:w-auto" />
          </div>
</div>

        {/* Petit texte / close */}
        

          <button
            onClick={closePromo}
            aria-label="Fermer la promotion"
            title="Fermer"
            className="ml-2 md:ml-0 bg-transparent border border-transparent text-[#0f3d69] hover:text-[#164b69] text-xl leading-none px-2 py-1 rounded"
          >
            ×
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ---------- Page component ---------- */
export default function Page() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Bonjour 😊 je m'appelle EFTY.\nJe te propose de t'accompagner pas à pas dans ton auto-séance d'EFT, à ton rythme et en toute bienveillance.\nSur quoi souhaites-tu travailler aujourd'hui ?",
    },
  ]);

  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [crisisMode, setCrisisMode] = useState<CrisisFlag>("none");

  const [toast, setToast] = useState<ToastState>(null);

  // états SUD + utilitaire d'extraction
  const [lastAskedSud, setLastAskedSud] = useState(false);

  function extractSud(v: string): number | null {
    const m = v.trim().match(/\b([0-9]|10)\b/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 0 && n <= 10 ? n : null;
  }

  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null); // focus auto

  // petit message visuel temporaire (toast)
  const showToast = useCallback((message: string) => {
    setToast({ msg: message, key: Date.now() });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Auto-scroll en bas à chaque nouveau message
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // Afficher un toast quand l'état de crise change
  useEffect(() => {
    if (crisisMode === "ask") {
      showToast("Sécurité : réponds simplement par oui ou non.");
    } else if (crisisMode === "lock") {
      showToast("Séance EFT verrouillée : appelle le 3114 / 112 si besoin.");
    }
  }, [crisisMode, showToast]);

  // Focus automatique sur le champ après chaque réponse (hors crisis lock)
  useEffect(() => {
    if (!loading && crisisMode !== "lock") {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [messages, loading, crisisMode]);

  // Arme le crochet quand l'assistant demande un SUD
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      const t = last.content.toLowerCase();
      const asked = /sud\s*\(?0[–-]10\)?|indique\s+(ton|un)\s+sud/.test(t);
      if (asked) setLastAskedSud(true);
    }
  }, [messages]);

  // Heuristiques de crise côté client
  function inferAskFromReply(text: string) {
    const t = text.toLowerCase();
    return (
      t.includes("as-tu des idées suicidaires") ||
      t.includes("as tu des idees suicidaires") ||
      t.includes("réponds par oui ou non") ||
      t.includes("reponds par oui ou non") ||
      t.includes("réponds par oui/non") ||
      t.includes("reponds par oui/non")
    );
  }

  function isAffirmativeYes(text: string) {
    const t = text.trim().toLowerCase();
    return /^oui\b|^yes\b/.test(t);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || loading) return;

    setError(null);

    // Si on demande oui/non et que l’utilisateur répond "oui" → lock immédiat
    if (crisisMode === "ask" && isAffirmativeYes(value)) {
      setCrisisMode("lock");
    }

    // interception SUD si on vient de le demander
    if (lastAskedSud) {
      const sud = extractSud(value);
      if (sud !== null) {
        // on "désarme" le crochet.
        setLastAskedSud(false);

        // Important : on NE génère plus de texte côté client.
        // On laisse l’API appliquer Setup/Ronde selon le prompt (anti-boucle SUD).
      }
    }

    const userMsg: Message = { role: "user", content: value };

    // Affiche immédiatement le message utilisateur
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const historyToSend: Message[] = [...messages, userMsg];
      const res = await fetch("/api/efty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyToSend }),
      });

      if (!res.ok) throw new Error("Réponse serveur non valide");

      const data: { answer?: string; error?: string; crisis?: CrisisFlag } = await res.json();
      const reply = (data.answer || data.error || "").trim();

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            reply ||
            "Je n’ai pas pu générer de réponse. Peux-tu reformuler en une phrase courte ?",
        },
      ]);

      // 1) Priorité au flag renvoyé par l'API
      if (data.crisis && data.crisis !== "none") {
        setCrisisMode(data.crisis);
      } else {
        // 2) Sinon, heuristique : si la réponse contient la question oui/non → ask
        if (inferAskFromReply(reply)) {
          setCrisisMode("ask");
        }
        // 3) Si on était déjà en ask et que l'utilisateur vient de dire "oui" → lock
        if (crisisMode === "ask" && isAffirmativeYes(value)) {
          setCrisisMode("lock");
        }
      }
    } catch {
      setError("Le service est momentanément indisponible. Réessaie dans un instant.");
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "Désolé, je n’ai pas pu répondre. Réessaie dans un instant ou reformule ta demande.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl p-6">
      {/* Bandeau – Édition spéciale 30 ans d'EFT */}
      <div className="rounded-2xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-wide uppercase opacity-80">Édition spéciale</p>
            <h1 className="text-xl sm:text-2xl font-semibold">30 ans d&apos;EFT — 1995 → 2025</h1>
            <p className="text-sm mt-1 opacity-90">
              Une pratique de libération émotionnelle transmise avec rigueur et bienveillance.
            </p>
          </div>
          <Image
            src="https://ecole-eft-france.fr/assets/front/logo-a8701fa15e57e02bbd8f53cf7a5de54b.png"
            alt="Logo École EFT France"
            width={160}
            height={40}
            className="h-10 w-auto"
            priority
          />
        </div>
      </div>

     
          {/* Zone de chat */}
          <div
            ref={chatRef}
            className="h-[60vh] overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm"
          >
            <div className="space-y-3">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "assistant" ? "flex" : "flex justify-end"}>
                  <div
                    className={
                      (m.role === "assistant"
                        ? "bg-gray-50 text-gray-900 border-gray-200"
                        : "bg-blue-50 text-blue-900 border-blue-200") +
                      " max-w-[80%] whitespace-pre-wrap rounded-2xl border px-4 py-3 shadow-sm"
                    }
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex">
                  <div className="bg-gray-50 text-gray-900 border-gray-200 rounded-2xl border px-4 py-3 shadow-sm">
                    … je réfléchis
                  </div>
                </div>
              )}
            </div>
          </div>

         
       {/* Grille : chat + sidebar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Colonne gauche : chat */}
        <div className="md:col-span-2 space-y-6">
          {/* Message important en cas de crise */}
          {crisisMode !== "none" && (
      <CrisisFloating mode={crisisMode} />
            <div className="rounded-xl border bg-[#fff5f5] text-[#7a1f1f] p-4 shadow-sm space-y-2">
              <strong className="block">Message important</strong>
              <p className="text-sm">
                Il semble que tu traverses un moment très difficile. Je te prends au sérieux.
                Je ne peux pas t&apos;accompagner avec l&apos;EFT dans une situation d&apos;urgence : ta sécurité est prioritaire.
              </p>
              <p className="text-sm">
                <span className="font-semibold">📞 En France :</span><br />
                • 3114 — Prévention du suicide (gratuit, 24/7)<br />
                • 15 — SAMU<br />
                • 112 — Urgences (si danger immédiat)
              </p>
              {crisisMode === "ask" && (
                <p className="text-sm">
                  Avant toute chose, as-tu des idées suicidaires en ce moment ? (réponds par <strong>oui</strong> ou <strong>non</strong>)
                </p>
              )}
              {crisisMode === "lock" && (
                <p className="text-sm">
                  Ta sécurité est prioritaire. Je ne poursuivrai pas l&apos;EFT dans cette situation.
                </p>
              )}
            </div>
          )}

 {/* Formulaire d’envoi */}
          <form onSubmit={onSubmit} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 rounded-xl border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm"
                placeholder="Écris ici… (ex. « J&apos;ai mal au genou », « Je me sens anxieuse », …)"
                aria-label="Saisis ton message"
                disabled={loading || crisisMode === "lock"}
              />
              <button
                type="submit"
                disabled={loading || !input.trim() || crisisMode === "lock"}
                className="rounded-xl border px-4 py-2 shadow-sm bg-white hover:bg-gray-50 active:scale-[0.99]"
              >
                {loading ? "Envoi..." : "Envoyer"}
              </button>
            </div>

            {crisisMode === "ask" && (
              <p className="text-sm text-[#0f3d69] opacity-80">
                Réponds simplement par <strong>oui</strong> ou <strong>non</strong>, s&apos;il te plaît.
              </p>
            )}
          </form>

      
          {/* Message d’erreur */}
          {error && <div className="text-red-600">{error}</div>}

          {/* Note de prudence */}
          <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm mb-2">
            <strong className="block mb-1">Note de prudence</strong>
            <p className="text-sm leading-relaxed">
              Ce guide est proposé à titre informatif et éducatif. Il ne remplace en aucun cas un avis médical,
              psychologique ou professionnel.<br />
              L&apos;École EFT France et ses représentants déclinent toute responsabilité quant à l&apos;interprétation,
              l&apos;usage ou les conséquences liés à l&apos;application des informations ou protocoles présentés.<br />
              Chaque utilisateur reste responsable de sa pratique et de ses choix.
              <br /><br />
              <strong>Important :</strong> L&apos;École EFT France ou Geneviève Gagos ne voit pas et n&apos;enregistre pas
              vos échanges réalisés dans ce chat. Mais comme pour tout ce qui transite par Internet, nous vous invitons
              à rester prudents et à ne pas divulguer d&apos;éléments très personnels.
            </p>
            <p className="text-xs mt-3 opacity-80">
              — Édition spéciale 30 ans d&apos;EFT — © 2025 École EFT France — Direction Geneviève Gagos
            </p>
          </div>

          {/* Toast visuel (notif) */}
          <div
            aria-live="assertive"
            className="pointer-events-none fixed inset-0 flex items-end px-4 py-6 sm:items-start sm:p-6 z-50"
          >
            <div className="flex w-full flex-col items-center space-y-4 sm:items-end">
              {toast && (
                <div
                  key={toast.key}
                  role="status"
                  className="pointer-events-auto w-full sm:w-auto max-w-sm overflow-hidden rounded-xl border bg-white/95 backdrop-blur shadow-lg ring-1 ring-black/5"
                >
                  <div className="p-4">
                    <p className="text-sm text-gray-900">{toast.msg}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Boutons d’urgence flottants */}
          {crisisMode !== "none" && (
            <div
              aria-label="Accès rapide urgence"
              className="fixed bottom-20 right-4 z-50 flex flex-col gap-2"
            >
              <a
                href="tel:3114"
                className="rounded-full bg-[#7a1f1f] text-white px-5 py-3 text-sm shadow-lg hover:opacity-90 transition"
              >
                📞 3114 — Prévention du suicide (gratuit, 24/7)
              </a>
              <a
                href="tel:112"
                className="rounded-full bg-[#7a1f1f] text-white px-5 py-3 text-sm shadow-lg hover:opacity-90 transition"
              >
                🚨 112 — Urgences
              </a>
              <a
                href="tel:15"
                className="rounded-full bg-[#7a1f1f] text-white px-5 py-3 text-sm shadow-lg hover:opacity-90 transition"
              >
                🏥 15 — SAMU
              </a>
            </div>
          )}
        </div>

        {/* Colonne droite : promo */}
        <div className="md:col-span-1">
          <div className="md:sticky md:top-6 flex flex-col gap-6">
            <PromoCard />
            <div className="mt-2" />
          </div>
        </div>
      </div>
          function CrisisFloating({ mode }: { mode: "ask" | "lock" | "none" }) {
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  // Styles responsive :
  // - Mobile : bas de l’écran, dégagé de ~80px pour ne pas chevaucher la promo
  // - Desktop : en haut à droite, largeur fixe confortable
  const wrapper = (
    <div
      role="region"
      aria-live="assertive"
      aria-atomic="true"
      className={[
        "fixed z-50",
        // Mobile
        "left-4 right-4 bottom-24",     // ← ajuste à 20/24/28 selon la hauteur réelle de la promo
        // Desktop
        "md:left-auto md:right-6 md:top-6 md:bottom-auto md:w-[420px]",
      ].join(" ")}
    >
      {/* Carte */}
      <div className="rounded-xl border border-rose-300 bg-rose-50 text-rose-900 shadow-xl">
        {/* Barre d’entête compacte */}
        <div className="flex items-start gap-3 px-3 py-2">
          <div className="flex-1">
            <div className="text-sm font-semibold">Message important</div>
            {!collapsed && (
              <p className="mt-0.5 text-sm opacity-80">
                Priorité à ta sécurité. En cas de danger immédiat, contacte les urgences.
              </p>
            )}
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="rounded-md border border-rose-300 bg-white px-2 py-1 text-sm"
              aria-label={collapsed ? "Développer le message" : "Réduire le message"}
              title={collapsed ? "Développer" : "Réduire"}
            >
              {collapsed ? "▾" : "▴"}
            </button>
            <button
              onClick={() => setCollapsed(true)}
              className="rounded-md border border-rose-300 bg-white px-2 py-1 text-sm"
              aria-label="Réduire"
              title="Réduire"
            >
              ×
            </button>
          </div>
        </div>

        {/* Corps détaillé */}
        {!collapsed && (
          <div className="px-3 pb-3">
            <p className="text-sm">
              Il semble que tu traverses un moment très difficile. Je te prends au sérieux.
              Je ne peux pas t’accompagner avec l’EFT dans une situation d’urgence : ta sécurité est prioritaire.
            </p>

            <div className="mt-2 rounded-lg border border-rose-200 bg-white p-2">
              <div className="text-xs font-semibold">📞 En France</div>
              <ul className="mt-1 text-sm leading-6">
                <li><strong>3114</strong> — Prévention du suicide (gratuit, 24/7)</li>
                <li><strong>15</strong> — SAMU</li>
                <li><strong>112</strong> — Urgences (si danger immédiat)</li>
              </ul>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href="tel:3114" className="rounded-md border border-rose-300 bg-rose-100 px-3 py-1 text-sm">Appeler 3114</a>
                <a href="tel:112" className="rounded-md border border-rose-300 bg-rose-100 px-3 py-1 text-sm">Appeler 112</a>
                <a href="tel:15"  className="rounded-md border border-rose-300 bg-rose-100 px-3 py-1 text-sm">Appeler le 15</a>
              </div>
            </div>

            {mode === "ask" && (
              <p className="mt-2 text-sm">
                Avant toute chose, as-tu des idées suicidaires en ce moment ? (réponds par <strong>oui</strong> ou <strong>non</strong>)
              </p>
            )}
            {mode === "lock" && (
              <p className="mt-2 text-sm">
                Ta sécurité est prioritaire. Je ne poursuivrai pas l’EFT dans cette situation.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(wrapper, document.body);
}

    </main>
  );
}
