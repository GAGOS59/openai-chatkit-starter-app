// app/page.tsx — Édition spéciale 30 ans de l'EFT
// Bandeau commémoratif + intro + signature

"use client";
import React, { useRef, useState, useEffect, FormEvent } from "react";

type Row = { who: "bot" | "user"; text: string };

export default function Page() {
  const [rows, setRows] = useState<Row[]>([
    { who: "bot", text: "Bonjour et bienvenue. En quoi puis-je vous aider ?" },
  ]);
  const [text, setText] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setRows((r) => [...r, { who: "user", text }]);
    setText("");
  }

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [rows]);

  function renderPretty(s: string) {
    const paragraphs = s.split(/\n\s*\n/);
    return (
      <div className="space-y-3">
        {paragraphs.map((p, i) => {
          if (/^(?:- |• |\* )/m.test(p)) {
            const items = p.split(/\n/).filter(Boolean).map(t => t.replace(/^(- |• |\* )/, ""));
            return (
              <ul key={i} className="list-disc pl-5 space-y-1">
                {items.map((li, j) => <li key={j} className="whitespace-pre-wrap">{li}</li>)}
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
            <h1 className="text-xl sm:text-2xl font-semibold">30 ans d'EFT — 1995 → 2025</h1>
            <p className="text-sm mt-1 opacity-90">Une pratique de libération émotionnelle transmise avec rigueur et bienveillance.</p>
          </div>
          {/* Badge 30 ans + logo (remplacer src par l'URL de ton logo) */}
          <div className="flex items-center gap-4">
            <div className="grid place-items-center rounded-full border border-[#d9d5ce] bg-white h-16 w-16 shadow-sm">
              <div className="text-center leading-tight">
                <div className="text-[10px] font-semibold">30 ans</div>
                <div className="text-[9px]">EFT</div>
                <div className="text-[8px] opacity-70">1995–2025</div>
              </div>
            </div>
            <img
              src="/logo-ecole-eft-france.png"
              alt="Logo École EFT France"
              className="h-10 w-auto"
            />
          </div>
        </div>
      </div>

      {/* Intro courte au-dessus du chat */}
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm text-gray-700">
          À l'occasion des 30 ans de l'EFT, ce guide interactif vous invite à explorer la méthode fondée par Gary Craig et transmise en France par Geneviève Gagos. Posez vos questions, suivez les étapes proposées, et avancez à votre rythme.
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
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="Pose ta question sur l'EFT..."
        />
        <button type="submit" className="rounded-xl border px-4 py-2 shadow-sm active:scale-[0.99]">Envoyer</button>
      </form>

      {/* Note de prudence + signature spéciale 30 ans */}
      <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <strong className="block mb-1">⚖️ Note de prudence</strong>
        <p className="text-sm leading-relaxed">
          Ce guide est proposé à titre informatif et éducatif. Il ne remplace en aucun cas un avis médical, psychologique ou professionnel. L'École EFT France et ses représentants déclinent toute responsabilité quant à l'interprétation, l'usage ou les conséquences liés à l'application des informations ou protocoles présentés. Chaque utilisateur reste responsable de sa pratique et de ses choix.
        </p>
        <p className="text-xs mt-3 opacity-80">— Édition spéciale "30 ans de l'EFT" — © 2025 École EFT France — Direction Geneviève Gagos</p>
      </div>
    </main>
  );
}
