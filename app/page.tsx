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
    content:
      "Bonjour 😊 Sur quoi souhaites-tu travailler aujourd’hui ?",
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
      {/* En-tête simple */}
      <div className="rounded-2xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <h1 className="text-xl sm:text-2xl font-semibold">Guide EFT — Session assistée</h1>
        <p className="text-sm mt-1 opacity-90">
          Suivi fidèle à l’EFT d’origine (Gary Craig).
        </p>
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
          placeholder="Écrivez ici… (ex. « J’ai mal au genou », « Je me sens anxieuse », …)"
          aria-label="Saisissez votre message"
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

      {/* Note de prudence */}
      <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <strong className="block mb-1">Note de prudence</strong>
        <p className="text-sm leading-relaxed">
          Cet assistant est un outil éducatif. Il ne remplace pas un avis médical, psychologique ou
          thérapeutique. <br />
          En cas de détresse ou d’idées suicidaires : 15 (SAMU), 3114 (prévention du suicide, 24/7),
          112 (urgence).
        </p>
      </div>
    </main>
  );
}
