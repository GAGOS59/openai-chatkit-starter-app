"use client";
import * as React from "react";

type Msg = { role: "user" | "assistant"; content: string };

export default function GuideEFT() {
  const [messages, setMessages] = React.useState<Msg[]>([
    { role: "assistant", content: "Bonjour ! En quoi puis-je vous guider ?" },
  ]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function onSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setLoading(true);

    try {
      const resp = await fetch("/api/guide-eft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.answer) throw new Error(data?.error || "Réponse indisponible");
      setMessages((m) => [...m, { role: "assistant", content: String(data.answer) }]);
    } catch (err) {
      // on affiche un message et on utilise err pour éviter no-unused-vars si besoin
      console.error("[GuideEFT] front error:", err);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Je rencontre un souci technique. Réessayez dans un instant." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="border rounded-2xl p-4 bg-white space-y-3 max-h-[60vh] overflow-y-auto">
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "assistant"
                ? "self-start bg-gray-100 text-gray-900 px-3 py-2 rounded-2xl"
                : "self-end bg-blue-100 text-blue-900 px-3 py-2 rounded-2xl ml-auto"
            }
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="self-start bg-gray-100 text-gray-500 px-3 py-2 rounded-2xl italic">
            L&apos;outil réfléchit...
          </div>
        )}
      </div>

      <form onSubmit={onSend} className="mt-3 flex gap-2">
        <input
          className="flex-1 border rounded-xl px-3 py-2"
          placeholder="Décrivez votre situation..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
        />
        <button
          type="submit"
          className="border rounded-xl px-4 py-2 bg-blue-600 text-white disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Envoi..." : "Envoyer"}
        </button>
      </form>
    </div>
  );
}
