"use client";
import React, { useRef, useState, useEffect, FormEvent } from "react";

type Row = { who: "bot" | "user"; text: string };
type Stage =
  | "Intake"
  | "Durée"
  | "Contexte"
  | "Setup"
  | "Tapping"
  | "Réévaluation"
  | "Clôture";

export default function Page() {
  // États de session (clé pour éviter les boucles)
  const [stage, setStage] = useState<Stage>("Intake");
  const [etape, setEtape] = useState<number>(1);
  const [transcript, setTranscript] = useState<string>("");

  // Messages UI
  const [rows, setRows] = useState<Row[]>([
    { who: "bot", text: "Bonjour et bienvenue. En quoi puis-je vous aider ?" },
  ]);
  const [text, setText] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  // Scroll auto
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [rows]);

  // Rendu joli des retours à la ligne et listes simples
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
          return (
            <p key={i} className="whitespace-pre-line leading-relaxed">
              {p}
            </p>
          );
        })}
      </div>
    );
  }

  // Règle simple d'enchaînement (ajuste à ta pédagogie)
  function advance(stageNow: Stage, etapeNow: number, userAnswer: string) {
    // Par défaut : on incrémente l'étape
    let nextStage: Stage = stageNow;
    let nextEtape: number = etapeNow + 1;

    // Exemple d'enchaînement basique :
    // Intake: 1→3, puis Durée (1→2), puis Contexte (1→2), puis Setup (1), Tapping (1→3), Réévaluation (1), Clôture (1)
    if (stageNow === "Intake" && etapeNow >= 3) {
      nextStage = "Durée";
      nextEtape = 1;
    } else if (stageNow === "Durée" && etapeNow >= 2) {
      nextStage = "Contexte";
      nextEtape = 1;
    } else if (stageNow === "Contexte" && etapeNow >= 2) {
      nextStage = "Setup";
      nextEtape = 1;
    } else if (stageNow === "Setup" && etapeNow >= 1) {
      nextStage = "Tapping";
      nextEtape = 1;
    } else if (stageNow === "Tapping" && etapeNow >= 3) {
      nextStage = "Réévaluation";
      nextEtape = 1;
    } else if (stageNow === "Réévaluation" && etapeNow >= 1) {
      nextStage = "Clôture";
      nextEtape = 1;
    }

    setStage(nextStage);
    setEtape(nextEtape);
  }

  // Envoi
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const userText = text.trim();
    if (!userText) return;

    // Afficher la saisie utilisateur
    setRows((r) => [...r, { who: "user", text: userText }]);
    setTranscript((t) => t + `\nUtilisateur: ${userText}`);
    setText("");

    // Appel API avec le contexte de session
    const res = await fetch("/api/guide-eft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: userText, stage, etape, transcript }),
    });

    const json = await res.json().catch(() => ({ answer: "" }));
    const answer: string = json?.answer ?? "";

    // Afficher la réponse du bot
    setRows((r) => [...r, { who: "bot", text: answer }]);
    setTranscript((t) => t + `\nAssistant: ${answer}`);

    // 🚀 Avancer d'un cran (clé pour éviter le blocage Étape 1)
    advance(stage, etape, userText);
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

      {/* Intro */}
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <p className="text-sm text-gray-700">
          À l&apos;occasion des 30 ans de l&apos;EFT, ce guide interactif vous invite à explorer la méthode
          fondée par Gary Craig et transmise en France par Geneviève Gagos. Posez vos questions, suivez les
          étapes proposées, et avancez à votre rythme.
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

      {/* Formulaire */}
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="Posez votre question sur l&apos;EFT…"
        />
        <button type="submit" className="rounded-xl border px-4 py-2 shadow-sm active:scale-[0.99]">
          Envoyer
        </button>
      </form>

      {/* CTA discret */}
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
          Pour aller plus loin dans la pratique et la transmission de l’EFT, découvrez les formations proposées par l’École EFT France.
        </p>
      </div>

      {/* Note de prudence + signature */}
      <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <strong className="block mb-1">⚖️ Note de prudence</strong>
        <p className="text-sm leading-relaxed">
          Ce guide est proposé à titre informatif et éducatif. Il ne remplace en aucun cas un avis médical,
          psychologique ou professionnel. L&apos;École EFT France et ses représentants déclinent toute
          responsabilité quant à l&apos;interprétation, l&apos;usage ou les conséquences liés à l&apos;application
          des informations ou protocoles présentés. Chaque utilisateur reste responsable de sa pratique et de ses choix.
        </p>
        <p className="text-xs mt-3 opacity-80">
          — Édition spéciale 30 ans de l&apos;EFT — © 2025 École EFT France — Direction Geneviève Gagos
        </p>
      </div>
    </main>
  );
}
