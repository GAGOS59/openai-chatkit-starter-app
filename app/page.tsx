/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useRef, useState, useEffect, FormEvent } from "react";

type Row = { who: "bot" | "user"; text: string };
type Stage =
  | "Intake"
  | "Durée"
  | "Contexte"
  | "Évaluation"
  | "Setup"
  | "Tapping"
  | "Réévaluation"
  | "Clôture";

type SudQualifier = "" | "très présente" | "encore présente" | "reste encore un peu" | "disparue";

type Slots = {
  intake?: string;
  duration?: string;
  context?: string;
  sud?: number;
  round?: number;
  aspect?: string;
  sud_qualifier?: SudQualifier;
};

// -------- Helpers --------
function shortContext(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.split(" ").slice(0, 12).join(" ");
}
function sudQualifier(sud?: number): SudQualifier {
  if (typeof sud !== "number") return "";
  if (sud === 0) return "disparue";
  if (sud >= 7) return "très présente";
  if (sud >= 4) return "encore présente";
  return "reste encore un peu";
}
function parseSUD(s: string): number | null {
  const m = s.match(/(^|[^0-9])(10|[0-9])([^0-9]|$)/);
  if (!m) return null;
  const v = Number(m[2]);
  if (Number.isFinite(v) && v >= 0 && v <= 10) return v;
  return null;
}
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

// -------- Component --------
export default function Page() {
  // Session
  const [stage, setStage] = useState<Stage>("Intake");
  const [etape, setEtape] = useState<number>(1);
  const [round, setRound] = useState<number>(1);
  const [slots, setSlots] = useState<Slots>({ round: 1 });

  // UI
  const [rows, setRows] = useState<Row[]>([
    { who: "bot", text: "Bonjour et bienvenue. En quoi puis-je vous aider ?" },
  ]);
  const [text, setText] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [rows]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const userText = text.trim();
    if (!userText) return;

    setRows(r => [...r, { who: "user", text: userText }]);
    setText("");

    // Met à jour les slots selon l'étape (pas d'interprétation du SUD hors Évaluation / Réévaluation)
    const updated: Slots = { ...slots };

    if (stage === "Intake") {
      updated.intake = userText;                 // qualité + localisation
    } else if (stage === "Durée") {
      updated.duration = userText;               // depuis quand
    } else if (stage === "Contexte") {
      updated.context = userText;                // contexte
    } else if (stage === "Évaluation") {
      const sud = parseSUD(userText);
      if (sud !== null) updated.sud = sud;       // SUD initial
    } else if (stage === "Réévaluation") {
      const sud = parseSUD(userText);
      if (sud !== null) updated.sud = sud;       // SUD après ronde
    }

    // Construit aspect + qualifier (toujours avant l'appel API)
    const intakeText = updated.intake ?? slots.intake ?? "";
    const ctx = (updated.context ?? slots.context) ? shortContext(updated.context ?? (slots.context as string)) : "";
    const aspect = ctx ? `${intakeText}, ${ctx}` : intakeText;
    const q = sudQualifier(updated.sud);
    updated.aspect = aspect;
    updated.sud_qualifier = q;

    setSlots(updated);

    // Appel API (l'API applique les règles : zéro fillers, et n'accepte la ronde que si SUD connu)
    const res = await fetch("/api/guide-eft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userText,
        stage,
        etape,
        transcript: rows.map(r => (r.who === "user" ? `U: ${r.text}` : `A: ${r.text}`)).slice(-10).join("\n"),
        slots: updated,
      }),
    });

    const json = await res.json().catch(() => ({ answer: "" }));
    const answer: string = (json as any)?.answer ?? "";

    setRows(r => [...r, { who: "bot", text: answer }]);

    // Avancement d'étape (simple et prévisible)
    if (stage === "Intake")       { setStage("Durée");        setEtape(2); return; }
    if (stage === "Durée")        { setStage("Contexte");     setEtape(3); return; }
    if (stage === "Contexte")     { setStage("Évaluation");   setEtape(4); return; }
    if (stage === "Évaluation")   {
      if (typeof updated.sud === "number") { setStage("Setup"); setEtape(5); }
      else { setStage("Évaluation"); setEtape(4); } // tant que SUD pas compris
      return;
    }
    if (stage === "Setup")        {
      // On avance seulement si l'utilisateur a écrit "prêt/ok/c'est fait/go/terminé"
      const ready = /(?:\bpr[eé]t\b|\bok\b|c['’]est fait|cest fait|\bgo\b|termin[ée])/.test(userText.toLowerCase());
      if (ready) { setStage("Tapping"); setEtape(6); } else { setStage("Setup"); setEtape(5); }
      return;
    }
    if (stage === "Tapping")      { setStage("Réévaluation"); setEtape(7); return; }
    if (stage === "Réévaluation") {
      if (updated.sud === 0) { setStage("Clôture"); setEtape(8); }
      else if (typeof updated.sud === "number" && updated.sud > 0) {
        const nextRound = (updated.round ?? round) + 1;
        setSlots(s => ({ ...s, round: nextRound }));
        setStage("Tapping"); setEtape(6);
      } else {
        setStage("Réévaluation"); setEtape(7); // redemande SUD
      }
      return;
    }
    if (stage === "Clôture")      {
      // Fin de cycle → réinitialisation douce pour un nouveau sujet
      setStage("Intake"); setEtape(1); setSlots({ round: 1 }); return;
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

      {/* Carte des points (aide fixe) */}
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-[#0f3d69] mb-2">Carte des points EFT</h2>
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
          <li><strong>Point Karaté (PK)</strong> : tranche de la main — phrase de préparation (×3).</li>
          <li><strong>Sommet de la tête (ST)</strong> : haut du crâne</li>
          <li><strong>Début du sourcil (DS)</strong> : base du sourcil côté nez</li>
          <li><strong>Coin de l’œil (CO)</strong> : os de l’orbite côté externe</li>
          <li><strong>Sous l’œil (SO)</strong> : os sous l’orbite</li>
          <li><strong>Sous le nez (SN)</strong> : entre nez et lèvre</li>
          <li><strong>Menton (MT)</strong> : creux du menton</li>
          <li><strong>Clavicule (CL)</strong> : sous la clavicule, zone tendre</li>
          <li><strong>Sous le bras (SB)</strong> : ~10 cm sous l’aisselle</li>
        </ul>
        <p className="text-xs text-gray-600 mt-3">
          Objectif des rondes : ramener le SUD à <strong>0</strong>.
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
        <p className="text-xs mt-3 opacity-80">— Édition spéciale 30 ans d&apos;EFT — © 2025 École EFT France — Direction Geneviève Gagos</p>
      </div>
    </main>
  );
}
