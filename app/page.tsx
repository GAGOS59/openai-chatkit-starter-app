/* app/page.tsx */
"use client";

import React, { useEffect, useRef, useState, FormEvent } from "react";

/* ---------- Types ---------- */
type Role = "user" | "assistant";
type Message = { role: Role; content: string };

/* ---------- Page ---------- */
export default function Page() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Bonjour 😊 Sur quoi souhaites-tu travailler aujourd’hui ?",
    },
  ]);

  const [input, setInput] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const chatRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll en bas à chaque nouveau message */
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    setError(null);
    const userMsg: Message = { role: "user", content: input.trim() };
    const historyToSend: Message[] = [...messages, userMsg];

    // Affiche immédiatement le message utilisateur
    setMessages(historyToSend);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/efty", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // On envoie tout l’historique pour un guidage fluide
        body: JSON.stringify({ messages: historyToSend }),
      });

      if (!res.ok) {
        throw new Error("Réponse serveur non valide");
      }

      const data: { answer?: string; error?: string } = await res.json();
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
          <img
            src="https://ecole-eft-france.fr/assets/front/logo-a8701fa15e57e02bbd8f53cf7a5de54b.png"
            alt="Logo École EFT France"
            className="h-10 w-auto"
          />
        </div>
      </div>

      {/* Zone de chat */}
      <div
        ref={chatRef}
        className="h-[70vh] overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm"
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
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 rounded-xl border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm"
          placeholder="Écris ici… (ex. « J’ai mal au genou », « Je me sens anxieuse », …)"
          aria-label="Saisis ton message"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl border px-4 py-2 shadow-sm bg-white hover:bg-gray-50 active:scale-[0.99]"
        >
          {loading ? "Envoi..." : "Envoyer"}
        </button>
      </form>

      {/* Message d’erreur (optionnel) */}
      {error && <div className="text-red-600">{error}</div>}

      {/* ⚠️ Note de prudence – Mention légale et confidentialité */}
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

      {/* Pour aller plus loin – Réaligner sa pratique & Ressources */}
      <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm mt-8">
        <h2 className="text-lg font-semibold mb-2">Pour aller plus loin avec l’EFT</h2>
        <p className="text-sm mb-3 leading-relaxed">
          Vous pratiquez déjà l’EFT ou vous souhaitez affiner votre approche ?  
          Le programme <strong>« Réaligner sa pratique EFT »</strong> vous aide à retrouver la fluidité et la profondeur du geste EFT d’origine,  
          tout en ouvrant la voie vers la méthode <strong>TIPS®</strong>, pour ceux qui désirent aller encore plus loin dans la compréhension du problème source.
        </p>

        <div className="flex flex-wrap gap-3">
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
            Les livres EFT
          </a>
        </div>
      </div>
    </main>
  );
}
