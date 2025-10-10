/* eslint-disable @next/next/no-img-element */
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

type Slots = {
  intake?: string;
  duration?: string;
  context?: string;
  sud?: number;
  round?: number;
};

export default function Page() {
  // Session
  const [stage, setStage] = useState<Stage>("Intake");
  const [etape, setEtape] = useState<number>(1);
  const [round, setRound] = useState<number>(1);
  const [transcript, setTranscript] = useState<string>("");
  const [slots, setSlots] = useState<Slots>({ round: 1 });

  // UI
  const [rows, setRows] = useState<Row[]>([
    { who: "bot", text: "Bonjour et bienvenue. En quoi puis-je vous aider ?" },
  ]);
  const [text, setText] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [rows]);

  // Mise en forme
  function renderPretty(s: string) {
    const paragraphs = s.split(/\n\s*\n/);
    return (
      <div className="space-y-3">
        {paragraphs.map((p, i) => {
          if (/^(?:- |\u2022 |\* )/m.test(p)) {
            const items = p.split(/\n/).filter(Boolean).map(t => t.replace(/^(- |\u2022 |\* )/, ""));
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

  // Confusion
  function isConfusion(s: string) {
    const t = s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return /je ne comprends pas|je comprends pas|pas compris|pas comprendre|reformule|reexpliquer|c est quoi|c'est quoi/.test(t) || t.trim() === "?";
  }

  // Avance linéaire (hors boucle SUD)
  function advanceLinear(stageNow: Stage): { nextStage: Stage; nextEtape: number } {
    const order: Stage[] = ["Intake","Durée","Contexte","Setup","Tapping","Réévaluation","Clôture"];
    const idx = order.indexOf(stageNow);
    if (idx < order.length - 1) return { nextStage: order[idx + 1], nextEtape: idx + 2 };
    return { nextStage: "Clôture", nextEtape: 7 };
  }

  // Parse SUD (0..10) d'une réponse
  function parseSUD(s: string): number | null {
    const m = s.match(/(^|[^0-9])(10|[0-9])([^0-9]|$)/);
    if (!m) return null;
    const v = Number(m[2]);
    if (Number.isFinite(v) && v >= 0 && v <= 10) return v;
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const userText = text.trim();
    if (!userText) return;

    setRows(r => [...r, { who: "user", text: userText }]);
    setTranscript(t => t + `\nUtilisateur: ${userText}`);
    setText("");

    // Met à jour les slots selon l'étape courante
    const updated: Slots = { ...slots };
    if (stage === "Intake") updated.intake = userText;
    if (stage === "Durée") updated.duration = userText;
    if (stage === "Contexte") updated.context = userText;

    // Étape Réévaluation : extraire SUD et décider de la boucle
    let forceStage: Stage | null = null;
    let forceEtape: number | null = null;
    const confused = isConfusion(userText); // ← FIX: const (pas let)

    if (stage === "Réévaluation" && !confused) {
      const sud = parseSUD(userText);
      if (sud === null) {
        // on reste à 6 et on redemande
        updated.sud = undefined;
        forceStage = "Réévaluation";
        forceEtape = 6;
      } else {
        updated.sud = sud;
        if (sud > 0) {
          // nouvelle ronde sur le même aspect (objectif strict : 0)
          const nextRound = (round || 1) + 1;
          updated.round = nextRound;
          setRound(nextRound);
          forceStage = "Tapping";
          forceEtape = 5;
        } else {
          // sud === 0 ⇒ clôture
          updated.round = round;
          forceStage = "Clôture";
          forceEtape = 7;
        }
      }
    }

    setSlots(updated);

    // Mémoire courte
    const shortTranscript = (transcript + `\nUtilisateur: ${userText}`).split("\n").slice(-10).join("\n");

    // Appel API
    const res = await fetch("/api/guide-eft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userText,
        stage: forceStage ?? stage,
        etape: forceEtape ?? etape,
        transcript: shortTranscript,
        confused,
        slots: { ...updated, round },
      }),
    });

    const json = await res.json().catch(() => ({ answer: "" }));
    const answer: string = json?.answer ?? "";

    setRows(r => [...r, { who: "bot", text: answer }]);
    setTranscript(t => t + `\nAssistant: ${answer}`);

    // Décision de progression côté client
    if (forceStage && forceEtape) {
      setStage(forceStage);
      setEtape(forceEtape);
      return;
    }

    if (!confused) {
      const { nextStage, nextEtape } = advanceLinear(stage);
      setStage(nextStage);
      setEtape(nextEtape);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      {/* Bandeau */}
      <div className="rounded-2xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-wide uppercase opacity-80">Édition spéciale</p>
            <h1 className="text-xl sm:text-2xl font-semibold">30 ans d&apos;EFT — 1995 → 2025</h1>
            <p className="text-sm mt-1 opacity-90">Une pratique de libération émotionnelle transmise avec rigueur et bienveillance.</p>
          </div>
          <img
            src="https://ecole-eft-france.fr/assets/front/logo-a8701fa15e57e02bbd8f53cf7a5de54b.png"
            alt="Logo École EFT France"
            className="h-10 w-auto"
          />
        </div>
      </div>

      {/* Carte des points (aide fixe) */}
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-[#0f3d69] mb-2">Carte des points EFT</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
          <li><strong>Sommet de la tête (ST)</strong> : haut du crâne</li>
          <li><strong>Début du sourcil (DS)</strong> : base du sourcil côté nez</li>
          <li><strong>Coin de l’œil (CO)</strong> : os de l’orbite côté externe</li>
          <li><strong>Sous l’œil (SO)</strong> : os sous l’orbite</li>
          <li><strong>Sous le nez (SN)</strong> : entre nez et lèvre</li>
          <li><strong>Creux du menton (CM)</strong> : creux du menton</li>
          <li><strong>Clavicule (CL)</strong> : sous la clavicule, zone tendre</li>
          <li><strong>Sous le bras (SB)</strong> : ~10 cm sous l’aisselle</li>
        </ul>
        <p className="text-xs text-gray-600 mt-3">
          Objectif des rondes : ramener le SUD à <strong>0</strong>, en douceur et à votre rythme.
        </p>
      </section>

      {/* Chat */}
      <div ref={chatRef} className="h-96 overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className={r.who === "bot" ? "flex" : "flex justify-end"}>
              <div className={(r.who === "bot" ? "bg-gray-50 text-gray-900 border-gray-200" : "bg-blue-50 text-blue-900 border-blue-200") + " max-w-[80%] rounded-2xl border px-4 py-3 shadow-sm"}>
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
        <button type="submit" className="rounded-xl border px-4 py-2 shadow-sm active:scale-[0.99]">Envoyer</button>
      </form>

      {/* CTA + Note */}
      <div className="text-center mt-6">
        <a href="https://ecole-eft-france.fr/pages/formations-eft.html" target="_blank" rel="noopener noreferrer" className="inline-block rounded-xl border border-[#0f3d69] text-[#0f3d69] px-4 py-2 text-sm font-medium hover:bg-[#0f3d69] hover:text-[#F3EEE6] transition-colors duration-200">
          Découvrir nos formations
        </a>
        <p className="text-sm text-gray-600 mt-2">Pour aller plus loin dans la pratique et la transmission de l’EFT, découvrez les formations proposées par l’École EFT France.</p>
      </div>

      <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <strong className="block mb-1">⚖️ Note de prudence</strong>
        <p className="text-sm leading-relaxed">
          Ce guide est proposé à titre informatif et éducatif. Il ne remplace en aucun cas un avis médical,
          psychologique ou professionnel. L&apos;École EFT France et ses représentants déclinent toute
          responsabilité quant à l&apos;interprétation, l&apos;usage ou les conséquences liés à l&apos;application
          des informations ou protocoles présentés. Chaque utilisateur reste responsable de sa pratique et de ses choix.
        </p>
        <p className="text-xs mt-3 opacity-80">— Édition spéciale 30 ans de l&apos;EFT — © 2025 École EFT France — Direction Geneviève Gagos</p>
      </div>
    </main>
  );
}
