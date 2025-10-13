import NavTabs from "../components/NavTabs"; // ajuste le chemin si besoin

export default function Page() {
  return (
    <>
      <NavTabs />
      {/* ...le reste du contenu... */}
    </>
  );
}


"use client";
import React, { useState, useRef, useEffect } from "react";
import { renderPretty } from "../utils/eftHelpers.client";
import { isCrisis, crisisMessage } from "../utils/eftHelpers";

export default function ChatLibreEFT() {
  const [question, setQuestion] = useState("");
  const [rows, setRows] = useState<{ who: "user"|"bot", text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [rows]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!question.trim()) return;
    setRows(r => [...r, { who: "user", text: question }]);
    setLoading(true);

    // Protection crise côté client (optionnel, déjà dans l'API)
    if (isCrisis(question)) {
      setRows(r => [...r, { who: "bot", text: crisisMessage() }]);
      setQuestion("");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/chat-eft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: question }),
    }).catch(() => null);

    let answer = "Erreur de connexion au service. Veuillez réessayer.";
    if (res && res.ok) {
      const data = await res.json();
      answer = data.answer || answer;
    }
    setRows(r => [...r, { who: "bot", text: answer }]);
    setQuestion("");
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-bold mb-4">Chat libre — Questions sur l’EFT officielle</h1>
      <div ref={chatRef} className="min-h-60 rounded-xl border bg-white p-4 mb-4 h-80 overflow-y-auto">
        {rows.map((r, i) => (
          <div key={i} className={r.who === "bot" ? "text-blue-900 mb-3" : "text-right mb-3"}>
            <span className={r.who === "bot" ? "font-semibold" : "text-blue-700"}>{renderPretty(r.text)}</span>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={question}
          onChange={e => setQuestion(e.target.value)}
          placeholder="Posez votre question sur l’EFT officielle…"
          className="flex-1 rounded-xl border px-3 py-2"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()} className="rounded-xl border px-4 py-2 shadow-sm">
          {loading ? "Envoi..." : "Envoyer"}
        </button>
      </form>
      {error && <div className="text-red-600 mt-2">{error}</div>}
      <div className="mt-4 text-xs text-gray-500 text-center">
        Les réponses sont strictement basées sur l’EFT officielle de Gary Craig.<br />
        Aucune induction positive, reprogrammation ou promesse de résultat.
      </div>
    </main>
  );
}
