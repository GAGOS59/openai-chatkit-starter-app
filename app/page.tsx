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
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [rows]);

  // Mise en forme : conserve les retours à la ligne et gère listes simples
  function renderPretty(s: string) {
    const paragraphs = s.split(/\n\s*\n/);
    return (
      <div className="space-y-3">
        {paragraphs.map((p, i) => {
          if (/^(?:- |\u2022 |\* )/m.test(p)) {
            const items = p.split(/\n/).filter(Boolean).map(t => t.replace(/^(- |\u2022 |\* )/, ""));
            return (
              <ul key={i} className="list-disc pl-5 space-y-1">
                {items.map((li, j) => (
                  <li key={j} className="whitespace-pre-wrap">{li}</li>
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
      {/* Bandeau 30 ans */}
      <div className="rounded-2xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-wide uppercase opacity-80">Edition speciale</p>
            <h1 className="text-xl sm:text-2xl font-semibold">30 ans d&apos;EFT — 1995 → 2025</h1>
            <p className="text-sm mt-1 opacity-90">
              Une pratique de liberation emotionnelle transmise avec rigueur et bienveillance.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="grid place-items-center rounded-full border border-[#d9d5ce] bg-white h-16 w-16 shadow-sm">
              <div className="text-center leading-tight">
                <div className="text-[10px] font-semibold">30 ans</div>
                <div className="text-[9px]">EFT</div>
                <div className="text-[8px] opacity-70">1995–2025</div>
              </div>
            </div>
            <img
              src="https://ecole-eft-france.fr/assets/front/logo-a8701fa15e57e02bbd8f53cf7a5de54b.png"
              alt="Logo Ecole EFT France"
              className="h-10 w-auto"
            />
          </div>
        </div>
      </div>

      {/* Intro */}
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm text-gray-700">
          A l&apos;occasion des 30 ans de l&apos;EFT, ce guide interactif vous invite à explorer la méthode fondée par Gary Craig et transmise en France par Geneviève Gagos. 
          Notez votre situation dans l'espace dédié et laissez-vous guider en suivant les étapes proposées. Et n'oubliez pas de juste avancer à votre rythme.
        </p>
      </section>

      {/* Chat */}
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
          placeholder="Posez votre question sur l EFT..."
        />
        <button type="submit" className="rounded-xl border px-4 py-2 shadow-sm active:scale-[0.99]">
          Envoyer
        </button>
      </form>

      {/* Note de prudence + signature */}
      <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <strong className="block mb-1">⚖️ Note de prudence</strong>
        <p className="text-sm leading-relaxed">
          Ce guide est propose a titre informatif et educatif. Il ne remplace en aucun cas un avis medical, psychologique ou professionnel. 
          L&apos;Ecole EFT France et ses representants declinent toute responsabilite quant a l&apos;interpretation, l&apos;usage ou les consequences lies a l&apos;application des informations ou protocoles presentes. 
          Chaque utilisateur reste responsable de sa pratique et de ses choix.
        </p>
        <p className="text-xs mt-3 opacity-80">— Edition speciale 30 ans de l EFT — © 2025 Ecole EFT France — Direction Genevieve Gagos</p>
      </div>
    </main>
  );
}
