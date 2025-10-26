/* app/page.tsx */
"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  FormEvent,
} from "react";
import Image from "next/image";

/* ---------- Types ---------- */
type Role = "user" | "assistant";
type Message = { role: Role; content: string };
type CrisisFlag = "none" | "ask" | "lock";
type ToastState = { msg: string; key: number } | null;

/* ---------- Page ---------- */
export default function Page() {
  const [messages, setMessages] = useState<Message[]>([
  {
    role: "assistant",
    content: "Bonjour 😊 je m'appelle EFTY.\nJe te propose de t’accompagner pas à pas dans ton auto-séance d’EFT, à ton rythme et en toute bienveillance.\nSur quoi souhaites-tu travailler aujourd’hui ?",
  },
]);


  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [crisisMode, setCrisisMode] = useState<CrisisFlag>("none");

  const [toast, setToast] = useState<ToastState>(null);

  // ⤵️ AJOUT : états SUD + utilitaire d'extraction
  const [lastAskedSud, setLastAskedSud] = useState(false);
  const [prevSud, setPrevSud] = useState<number | null>(null);

  function extractSud(v: string): number | null {
    const m = v.trim().match(/\b([0-9]|10)\b/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return n >= 0 && n <= 10 ? n : null;
  }

  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null); // focus auto

  // 🔔 petit message visuel temporaire (toast)
  const showToast = useCallback((message: string) => {
    setToast({ msg: message, key: Date.now() });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* Auto-scroll en bas à chaque nouveau message */
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

  /* Focus automatique sur le champ après chaque réponse (hors crisis lock) */
  useEffect(() => {
    if (!loading && crisisMode !== "lock") {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [messages, loading, crisisMode]);

  // ⤵️ AJOUT : arme le crochet quand l'assistant demande un SUD
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      const t = last.content.toLowerCase();
      const asked = /sud\s*\(?0[–-]10\)?|indique\s+(ton|un)\s+sud/.test(t);
      if (asked) setLastAskedSud(true);
    }
  }, [messages]);

  // --- Heuristiques de crise côté client ---
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
    // gère "oui", "oui.", "oui !", "yes" (au cas où), etc.
    return /^oui\b|^yes\b/.test(t);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = input.trim();
    if (!value || loading) return;

    setError(null);

    // 🔒 Si on demande oui/non et que l’utilisateur répond "oui" → lock immédiat
    if (crisisMode === "ask" && isAffirmativeYes(value)) {
      setCrisisMode("lock");
    }

    // ⤵️ AJOUT : si on vient de demander un SUD et que l'utilisateur répond par un nombre
    if (lastAskedSud) {
      const sud = extractSud(value);
      if (sud !== null) {
        setPrevSud(sud);
        setLastAskedSud(false);

        if (sud <= 1) {
  // Règle SUD ≤ 1 : investiguer le "petit reste" (PAS de clôture immédiate)
  setMessages((prev) => [
    ...prev,
    { role: "user", content: value },
    {
      role: "assistant",
      content:
        `Ton SUD est à ${sud} (≤ 1).\n` +
        `Ça pourrait être quoi, ce petit reste ?\n\n`,
    },
  ]);
  setInput("");
  return;
}

        // sinon (SUD > 1) on laisse filer le flux normal vers l'API
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
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      {/* 🌟 Bandeau – Édition spéciale 30 ans d’EFT */}
      <div className="rounded-2xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-wide uppercase opacity-80">Édition spéciale</p>
            <h1 className="text-xl sm:text-2xl font-semibold">30 ans d&apos;EFT — 1995 → 2025</h1>
            <p className="text-sm mt-1 opacity-90">
              Une pratique de libération émotionnelle transmise avec rigueur et bienveillance.
            </p>
          </div>
          {/* ⛳ version optimisée (next/image) */}
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

      {/* ⛑️ Message important en cas de crise */}
      {crisisMode !== "none" && (
        <div className="rounded-xl border bg-[#fff5f5] text-[#7a1f1f] p-4 shadow-sm space-y-2">
          <strong className="block">Message important</strong>
          <p className="text-sm">
            Il semble que tu traverses un moment très difficile. Je te prends au sérieux.
            Je ne peux pas t’accompagner avec l’EFT dans une situation d’urgence : ta sécurité est prioritaire.
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
              Ta sécurité est prioritaire. Je ne poursuivrai pas l’EFT dans cette situation.
            </p>
          )}
        </div>
      )}

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

      {/* Formulaire d’envoi */}
      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 rounded-xl border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm"
            placeholder="Écris ici… (ex. « J’ai mal au genou », « Je me sens anxieuse », …)"
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
            Réponds simplement par <strong>oui</strong> ou <strong>non</strong>, s’il te plaît.
          </p>
        )}
      </form>

      {/* 🔒 Bloc d’aide en cas de crise (persistant sous le chat) */}
      {crisisMode === "lock" && (
        <div className="rounded-xl border bg-[#fff5f5] text-[#7a1f1f] p-4 shadow-sm space-y-2">
          <p className="text-sm">
            Ta sécurité est prioritaire. Parle à quelqu’un maintenant :
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href="tel:3114"
              className="inline-block rounded-lg bg-[#7a1f1f] text-white px-4 py-2 text-sm hover:opacity-90 transition"
            >
              📞 Appeler le 3114 (24/7)
            </a>
            <a
              href="tel:112"
              className="inline-block rounded-lg bg-[#7a1f1f] text-white px-4 py-2 text-sm hover:opacity-90 transition"
            >
              🚨 Appeler le 112 (urgence)
            </a>
            <a
              href="tel:15"
              className="inline-block rounded-lg bg-[#7a1f1f] text-white px-4 py-2 text-sm hover:opacity-90 transition"
            >
              🏥 Appeler le 15 (SAMU)
            </a>
          </div>
          <p className="text-xs opacity-80">
            Tu peux aussi joindre un proche de confiance ou ton/ta médecin.  
            Je reste ici, mais je ne poursuivrai pas l’EFT dans cette situation.
          </p>
        </div>
      )}

      {/* Message d’erreur (optionnel) */}
      {error && <div className="text-red-600">{error}</div>}

      {/* ⚠️ Note de prudence */}
      <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm mb-6">
        <strong className="block mb-1">Note de prudence</strong>
        <p className="text-sm leading-relaxed">
          Ce guide est proposé à titre informatif et éducatif. Il ne remplace en aucun cas un avis médical,
          psychologique ou professionnel.<br />
          L&apos;École EFT France et ses représentants déclinent toute responsabilité quant à l&apos;interprétation,
          l&apos;usage ou les conséquences liés à l&apos;application des informations ou protocoles présentés.<br />
          Chaque utilisateur reste responsable de sa pratique et de ses choix.
          <br /><br />
          <strong>Important :</strong> L&apos;École EFT France ou Geneviève Gagos ne voit pas et n&apos;enregistre pas
          vos échanges réalisés dans ce chat.  
          Mais comme pour tout ce qui transite par Internet, nous vous invitons à rester prudents et à ne pas
          divulguer d&apos;éléments très personnels.
        </p>
        <p className="text-xs mt-3 opacity-80">
          — Édition spéciale 30 ans d&apos;EFT — © 2025 École EFT France — Direction Geneviève Gagos
        </p>
      </div>

      {/* 🔔 Toast visuel (notif) */}
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

      {/* 📞 Boutons d’urgence flottants (ASK + LOCK) */}
      {crisisMode !== "none" && (
        <div
          aria-label="Accès rapide urgence"
          className="fixed bottom-20 right-4 z-50 flex flex-col gap-2"
        >
          <a
            href="tel:3114"
            className="rounded-full bg-[#7a1f1f] text-white px-5 py-3 text-sm shadow-lg hover:opacity-90 transition"
          >
            📞 3114 — Prévention du suicide (24/7)
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
      {/* 🌿 Pour aller plus loin */}
<div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm mt-8 text-center">
  <h2 className="text-lg font-semibold mb-2">Pour aller plus loin avec l’EFT</h2>
  <p className="text-sm mb-3 leading-relaxed">
    Vous pratiquez déjà l’EFT ou vous souhaitez affiner votre approche ?  
    Le programme <strong>« Réaligner sa pratique EFT »</strong> vous aide à retrouver la fluidité et la profondeur du geste EFT d’origine,  
    tout en ouvrant la voie vers la méthode <strong>TIPS®</strong>, pour ceux qui désirent aller encore plus loin dans la compréhension du problème source.
  </p>

  <div className="flex flex-wrap justify-center gap-3 text-center">
    <a
      href="https://ecole-eft-france.fr/realigner-pratique-eft.html"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block rounded-lg bg-[#0f3d69] text-white px-4 py-2 text-sm hover:bg-[#164b84] transition"
    >
      Réaligner sa pratique EFT
    </a>
    <a
      href="https://ecole-eft-france.fr/pages/formations-eft.html"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block rounded-lg bg-[#0f3d69] text-white px-4 py-2 text-sm hover:bg-[#164b84] transition"
    >
      Formations EFT
    </a>
    <a
      href="https://ecole-eft-france.fr/pages/tips.html"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block rounded-lg bg-[#0f3d69] text-white px-4 py-2 text-sm hover:bg-[#164b84] transition"
    >
      Méthode TIPS®
    </a>
    <a
      href="https://technique-eft.com/livres-eft.html"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-block rounded-lg bg-[#0f3d69] text-white px-4 py-2 text-sm hover:bg-[#164b84] transition"
    >
      Les livres de Geneviève Gagos
    </a>
  </div>
</div>

    </main>
  );
}
