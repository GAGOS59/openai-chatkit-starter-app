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

type Slots = {
  intake?: string;
  duration?: string;
  context?: string;
  sud?: number;
  round?: number;
  aspect?: string;
};

/* ---------------- Helpers ---------------- */
function shortContext(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.split(" ").slice(0, 14).join(" ");
}
function parseSUD(s: string): number | null {
  const m = s.match(/(^|[^0-9])(10|[0-9])([^0-9]|$)/);
  if (!m) return null;
  const v = Number(m[2]);
  return Number.isFinite(v) && v >= 0 && v <= 10 ? v : null;
}

/** Transforme des formulations naturelles en syntagmes corrects.
 *  ex: "j'ai mal à l'épaule" -> "mal à l'épaule" (masc)
 *      "j'ai une douleur à l'épaule" -> "douleur à l'épaule" (fem)
 */
function normalizeIntake(input: string): string {
  let s = input.trim().replace(/\s+/g, " ");
  // j'ai mal à ...
  const m1 = s.match(/^j['’]ai\s+mal\s+à\s+(.+)$/i);
  if (m1) return `mal à ${m1[1]}`;
  // j'ai une/ la douleur ...
  const m2 = s.match(/^j['’]ai\s+(?:une|la)\s+douleur\s+(.*)$/i);
  if (m2) return `douleur ${m2[1].trim()}`;
  // j'ai une peur de ...
  const m3 = s.match(/^j['’]ai\s+(?:une|la)\s+peur\s+(.*)$/i);
  if (m3) return `peur ${m3[1].trim()}`;
  // j'ai peur de ...
  const m4 = s.match(/^j['’]ai\s+peur\s+(.*)$/i);
  if (m4) return `peur ${m4[1].trim()}`;
  // j'ai une tension / gêne ...
  const m5 = s.match(/^j['’]ai\s+(?:une|la)\s+(tension|gêne|gene)\s+(.*)$/i);
  if (m5) return `${m5[1]} ${m5[2].trim()}`;
  return s;
}
function isMasculine(intake: string): boolean {
  return /^mal\b/i.test(intake);
}
function buildAspect(intakeTextRaw: string, ctxShort: string): string {
  const intake = normalizeIntake(intakeTextRaw);
  if (!ctxShort) return intake;
  const masculine = isMasculine(intake);
  const liaison = masculine ? "lié à" : "liée à";
  return `${intake} ${liaison} ${ctxShort}`;
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

/* ---------------- Component ---------------- */
export default function Page() {
  // Session
  const [stage, setStage] = useState<Stage>("Intake");
  const [etape, setEtape] = useState<number>(1);
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

    // Nouveau sujet après clôture → reset
    if (stage === "Clôture") {
      setStage("Intake");
      setEtape(1);
      setSlots({ round: 1 });
    }

    setRows(r => [...r, { who: "user", text: userText }]);
    setText("");

    // MàJ slots (après éventuel reset)
    const updated: Slots = { ...(stage === "Clôture" ? { round: 1 } : slots) };

    if (stage === "Intake" || (stage === "Clôture" && userText)) {
      // normaliser l'intake (évite "Cette j'ai mal...")
      updated.intake = normalizeIntake(userText);
    } else if (stage === "Durée") {
      updated.duration = userText;
    } else if (stage === "Contexte") {
      updated.context = userText;
    } else if (stage === "Évaluation") {
      const sud = parseSUD(userText);
      if (sud !== null) updated.sud = sud;
    } else if (stage === "Réévaluation") {
      const sud = parseSUD(userText);
      if (sud !== null) updated.sud = sud;
    }

    // — Lire un SUD si l’utilisateur le tape juste après l’étape 6 (le message “Veuillez évaluer…”)
    if (stage === "Tapping") {
      const sudInline = parseSUD(userText);
      if (sudInline !== null) updated.sud = sudInline;
    }

    // Aspect (accord + pas de virgule avant "lié(e) à")
    const intakeText = (updated.intake ?? slots.intake ?? "").trim();
    const ctxRaw = (updated.context ?? slots.context ?? "").trim();
    const ctxShort = ctxRaw ? shortContext(ctxRaw) : "";
    const aspect = buildAspect(intakeText, ctxShort);
    updated.aspect = aspect;
    setSlots(updated);

    // --- Étape pour l'API (anti-boucles) ---
    let stageForAPI: Stage = stage;
    let etapeForAPI = etape;

    // prêt ?
    const ready = /(?:\bpr[eé]t\b|\bok\b|c['’]est fait|cest fait|\bgo\b|termin[ée])/.test(userText.toLowerCase());

    if (stage === "Intake")           { stageForAPI = "Durée";        etapeForAPI = 2; }
    else if (stage === "Durée")       { stageForAPI = "Contexte";     etapeForAPI = 3; }
    else if (stage === "Contexte")    { stageForAPI = "Évaluation";   etapeForAPI = 4; }
    else if (stage === "Évaluation" && typeof updated.sud === "number") {
      stageForAPI = "Setup";          etapeForAPI = 5;
    }
    else if (stage === "Setup" && ready) {
      stageForAPI = "Tapping";        etapeForAPI = 6;
    }
    else if (stage === "Tapping") {
      // si un SUD vient d'être tapé, on agit immédiatement
      if (typeof updated.sud === "number") {
        if (updated.sud === 0) {
          stageForAPI = "Clôture";    etapeForAPI = 8;
        } else {
          const nextRound = (updated.round ?? 1) + 1;
          updated.round = nextRound;
          setSlots(s => ({ ...s, round: nextRound }));
          stageForAPI = "Tapping";    etapeForAPI = 6; // nouvelle ronde
        }
      } else {
        stageForAPI = "Réévaluation"; etapeForAPI = 7;
      }
    }
    else if (stage === "Réévaluation" && typeof updated.sud === "number") {
      if (updated.sud === 0) {
        stageForAPI = "Clôture";      etapeForAPI = 8;
      } else if (updated.sud > 0) {
        const nextRound = (updated.round ?? 1) + 1;
        updated.round = nextRound;
        setSlots(s => ({ ...s, round: nextRound }));
        stageForAPI = "Tapping";      etapeForAPI = 6;
      }
    }

    // Appel API
    const transcriptShort = rows
      .map(r => (r.who === "user" ? `U: ${r.text}` : `A: ${r.text}`))
      .slice(-10)
      .join("\n");

    const res = await fetch("/api/guide-eft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: userText,
        stage: stageForAPI,
        etape: etapeForAPI,
        transcript: transcriptShort,
        slots: updated,
      }),
    });

    const raw = await res.json().catch(() => ({}));
    let answer = "";
    if (raw && typeof raw === "object" && "answer" in raw) {
      const maybe = (raw as Record<string, unknown>).answer;
      if (typeof maybe === "string") answer = maybe;
    }

    setRows(r => [...r, { who: "bot", text: answer }]);
    setStage(stageForAPI);
    setEtape(etapeForAPI);
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

      {/* Carte des points */}
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
