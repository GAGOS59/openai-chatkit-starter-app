"use client";
import React, { useRef, useState, useEffect, FormEvent } from "react";

type Row = { who: "bot" | "user"; text: string };

export default function Page() {
  // Message initial
  const [rows, setRows] = useState<Row[]>([
    { who: "bot", text: "Bonjour et bienvenue. En quoi puis-je vous aider ?" },
  ]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  // Envoi + appel API interne (sécurisé)
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const input = text.trim();
    if (!input || loading) return;

    // Affiche le message de l'utilisateur
    setRows((r) => [...r, { who: "user", text: input }]);
    setText("");
    setLoading(true);

    try {
      const resp = await fetch("/api/guide-eft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });

      const data = await resp.json();
      if (!resp.ok || !data?.answer) {
        throw new Error(data?.error || "Réponse indisponible");
      }

      // Affiche la réponse du guide
      setRows((r) => [...r, { who: "bot", text: data.answer as string }]);
    } catch (err) {
      setRows((r) => [
        ...r,
        {
          who: "bot",
          text:
            "Je rencontre un souci technique pour répondre maintenant. " +
            "Réessayez dans un instant ou rafraîchissez la page.",
        },
      ]);
      // Optionnel : console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Auto-scroll vers le bas à chaque nouveau message
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [rows]);

  // Conserver les retours à la ligne et convertir de simples listes en <ul>
  function renderPretty(s: string) {
    const paragraphs = s.split(/\n\s*\n/);
    return (
      <div className="space-y-3">
        {paragraphs.map((p, i) => {
          if (/^(?:- |\u2022 |\* )/m.test(p)) {
            const items = p
              .split(/\n/)
              .filter(Boolean)
              .map((t) => t.replace(/^(- |\u2022 |\* )/, ""));
            return (
              <ul key={i} className="list-disc pl-5 space-y-1">
                {items.map((li, j) => (
                  <li key={j} className="whitespace-pre-wrap">
                    {li}
                  </li>
                ))}
              </ul>
            );
          }
          return <p key={i} className="whitespace-pre-line leading-relaxed">{p}</p>;
        })}
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      {/* Bandeau commémoratif */}
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

      {/* Intro courte */}
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm text-gray-700">
          À l&apos;occasion des 30 ans de l&apos;EFT, ce guide interactif vous invite à explorer la méthode
          fondée par Gary Craig et transmise en France par Geneviève Gagos. Indiquez votre situation dans l&apos;espace dédié ci-dessous, puis laissez-vous guider à travers
          les étapes proposées. Et surtout, avancez à votre rythme.
        </p>
      </section>

      {/* Zone de conversation */}
      <div ref={chatRef} className="h-96 overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className={r.who === "bot" ? "flex" : "flex justify-end"}>
              <div
                className={
                  (r.who === "bot"
                    ? "bg-gray-50 text-gray-900 border-gray-200"
                    : "bg-blue-50 text-blue-900 border-blue-200") +
                  " max-w-[80%] rounded-2xl border px-4 py-3 shadow-sm"
                }
              >
                {renderPretty(r.text)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex">
              <div className="bg-gray-50 text-gray-500 border border-gray-200 max-w-[80%] rounded-2xl px-4 py-3 shadow-sm italic">
                L&apos;outil réfléchit…
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Saisie */}
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="Indiquez votre situation ici..."
          disabled={loading}
        />
        <button
          type="submit"
          className="rounded-xl border px-4 py-2 shadow-sm active:scale-[0.99] disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Envoi…" : "Envoyer"}
        </button>
      </form>

      {/* CTA formations */}
      <div className="text-center mt-6">
        <a
          href="https://ecole-eft-france.fr/pages/formations-eft.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-xl border border-[#0f3d69] text-[#0f3d69] px-4 py-2 text-sm font-medium hover:bg-[#0f3d69] hover:text-[#F3EEE6] transition-colors duration-200"
        >
          Découvrir nos formations
        </a>
        <p className="text-sm text-gray-600 mt-2">
          Pour aller plus loin dans la pratique et la transmission de l’EFT, <br />découvrez les formations proposées par l’École EFT France.
        </p>
      </div>

      {/* Note de prudence + signature */}
      <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <strong className="block mb-1">Note de prudence</strong>
        <p className="text-sm leading-relaxed">
          Ce guide est proposé à titre informatif et éducatif. Il ne remplace en aucun cas un avis médical,
          psychologique ou professionnel. L&apos;École EFT France et Geneviève Gagos déclinent toute
          responsabilité quant à l&apos;interprétation, l&apos;usage ou les conséquences liés à l&apos;application
          des informations ou protocoles présentés. Chaque utilisateur reste responsable de sa pratique et de ses choix.
        </p>
        <p className="text-xs mt-3 opacity-80">
          — Édition spéciale 30 ans de l&apos;EFT — © 2025 École EFT France — Geneviève Gagos
        </p>
      </div>
    </main>
  );
}
