/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useRef, useState, useEffect, FormEvent } from "react";

/* ---------- DEMO (facultatif) ---------- */
const SHOW_DEMO = false;

const DEMO_PRESETS: Array<{ label: string; steps: string[] }> = [
  {
    label: "Douleur au dos → lombaires",
    steps: ["douleur au dos", "douleur sourde aux lombaires", "fatiguée en fin de journée", "5", "OK", "3", "OK", "0"],
  },
  {
    label: "Peur des hauteurs",
    steps: ["peur des hauteurs", "serrement dans la poitrine", "quand je regarde par-dessus une rambarde", "7", "OK", "4", "OK", "1", "OK", "0"],
  },
];

function useDemoHelpers(setText: React.Dispatch<React.SetStateAction<string>>) {
  return { fill: (value: string) => setText(value) };
}

/* ---------- Types ---------- */
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
  context?: string;    // SITUATION = sensation ; EMOTION = déclencheurs
  sensation?: string;  // EMOTION = sensation corporelle
  sud?: number;
  round?: number;
  aspect?: string;
};

/* Réponse typée de l’API (sans FAQ) */
type ApiResponse =
  | { answer: string; kind?: "gate" | "crisis" | "resume" }
  | { error: string };

/* ---------- Helpers (texte) ---------- */
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
function normalizeIntake(input: string): string {
  const s = input.trim().replace(/\s+/g, " ");
  const mMal = s.match(/^j['’]ai\s+mal\s+(?:à|a)\s+(?:(?:la|le|les)\s+|l['’]\s*|au\s+|aux\s+)?(.+)$/i);
  if (mMal) return `mal ${mMal[1].trim()}`;
  const mDouleur = s.match(/^j['’]ai\s+(?:une|la)\s+douleur\s+(.*)$/i);
  if (mDouleur) return `douleur ${mDouleur[1].trim()}`;
  const mPeur1 = s.match(/^j['’]ai\s+(?:une|la)\s+peur\s+(.*)$/i);
  if (mPeur1) return `peur ${mPeur1[1].trim()}`;
  const mPeur2 = s.match(/^j['’]ai\s+peur\s+(.*)$/i);
  if (mPeur2) return `peur ${mPeur2[1].trim()}`;
  const mAutres = s.match(/^j['’]ai\s+(?:une|la)\s+(tension|gêne|gene)\s+(.*)$/i);
  if (mAutres) return `${mAutres[1]} ${mAutres[2].trim()}`;
  return s;
}
function isEmotionIntake(intake: string): boolean {
  const t = intake.toLowerCase();
  return /\b(peur|col[eè]re|tristesse|honte|culpabilit[eé]|stress|anxi[eé]t[eé]|angoisse|inqui[eè]tude|d[eé]g[oô]ut)\b/i.test(t);
}
function isMasculine(intake: string): boolean {
  const t = intake.toLowerCase().trim();
  if (t.startsWith("mal ")) return true;
  if (/^(douleur|peur|gêne|gene|tension)\b/i.test(t)) return false;
  return true;
}
function normalizeContextForAspect(ctx: string): string {
  let c = ctx.trim();
  c = c.replace(/^je\s+/i, "");
  c = c.replace(/^j['’]ai\s+/i, "");
  c = c.replace(/^j['’](?:étais|etais)\s+/i, "être ");
  c = c.replace(/^suis\b/i, "être ");
  c = c.replace(/^ai\b/i, "avoir ");
  c = c.replace(/^étais\b/i, "être ");
  c = c.replace(/,\s+/g, " ");
  return c;
}
function buildAspect(intakeTextRaw: string, ctxShort: string): string {
  const intake = normalizeIntake(intakeTextRaw).trim();
  const s = intake.toLowerCase();
  const phys = /(\bmal\b|\bdouleur\b|\btension\b|\bgêne\b|\bgene\b|\bcrispation\b|\bserrement\b)/i;
  const emo  = /(\bpeur\b|col[eè]re|tristesse|honte|culpabilit[eé]|anxi[eé]t[eé]|angoisse|inqui[eè]tude|d[eé]g[oô]ut)/i;

  const isSituation = !phys.test(s) && !emo.test(s);
  if (isSituation && ctxShort) {
    // [ressenti] quand je pense à [situation]
    return `${ctxShort} quand je pense à ${intake}`;
  }

  const masculine = isMasculine(intake);
  const liaison = masculine ? "lié à" : "liée à";
  const cleaned = normalizeContextForAspect(ctxShort);
  return ctxShort ? `${intake} ${liaison} ${cleaned}` : intake;
}

/* ---------- Rendu / liens ---------- */
function linkify(text: string): React.ReactNode[] {
  const URL_RX = /(https?:\/\/[^\s<>"']+|(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"']*)?)/gi;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RX.exec(text)) !== null) {
    const url = match[0];
    const start = match.index;
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));
    const href = url.startsWith("http") ? url : `https://${url.replace(/^www\./i, "www.")}`;
    nodes.push(<a key={`${start}-${href}`} href={href} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline">{url}</a>);
    lastIndex = start + url.length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}
function renderPretty(s: string) {
  const paragraphs: string[] = s.split(/\n\s*\n/);
  return (
    <div className="space-y-3">
      {paragraphs.map((p: string, i: number) => {
        if (/^(?:- |\u2022 |\* )/m.test(p)) {
          const items: string[] = p.split(/\n/).filter(Boolean).map((t: string) => t.replace(/^(- |\u2022 |\* )/, ""));
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {items.map((li: string, j: number) => (<li key={j} className="whitespace-pre-wrap">{linkify(li)}</li>))}
            </ul>
          );
        }
        return (<p key={i} className="whitespace-pre-line leading-relaxed">{linkify(p)}</p>);
      })}
    </div>
  );
}
/** Nettoyage d’affichage : retire "Étape X —" et "Setup :", habille le Setup */
function cleanAnswerForDisplay(ans: string, stage: Stage): string {
  let t = (ans || "").trim();
  t = t.replace(/^\s*Étape\s*\d+\s*—\s*/gmi, "");
  t = t.replace(/^\s*Setup\s*:?\s*/gmi, "");
  if (stage === "Setup") {
    const core = t.replace(/^«\s*|\s*»$/g, "").trim();
    t = `Reste bien connecté·e à ton ressenti
et, en tapotant le Point Karaté (tranche de la main), répète cette phrase 3 fois, à voix haute :
« ${core} »`;
  }
  return t;
}

/* ---------- Component ---------- */
export default function Page() {
  // Session
  const [stage, setStage] = useState<Stage>("Intake");
  const [etape, setEtape] = useState<number>(1);
  const [slots, setSlots] = useState<Slots>({ round: 1 });

  // UI
  const [rows, setRows] = useState<Row[]>([
    { who: "bot", text: "Bonjour et bienvenue. En quoi puis-je vous aider ?" },
  ]);
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  // Flag: une gate (oui/non) est-elle ouverte ?
  const [awaitingGate, setAwaitingGate] = useState<boolean>(false);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [rows]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    const userText = text.trim();
    if (!userText) { setLoading(false); return; }

    // Affiche la saisie utilisateur
    setRows((r) => [...r, { who: "user", text: userText }]);
    setText("");

    // -------- Branche 1 : si une GATE est ouverte, on ne touche à rien localement --------
    if (awaitingGate) {
      const transcriptShort = rows
        .map((r) => (r.who === "user" ? `U: ${r.text}` : `A: ${r.text}`))
        .slice(-10)
        .join("\n");

      let raw: ApiResponse | undefined;
      try {
        const res = await fetch("/api/guide-eft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userText, stage, etape, transcript: transcriptShort, slots }),
        });
        raw = (await res.json()) as ApiResponse;
      } catch {
        setRows((r) => [...r, { who: "bot", text: "Erreur de connexion au service. Veuillez réessayer." }]);
        setLoading(false);
        return;
      }

      if (raw && "error" in raw) {
        setRows((r) => [...r, { who: "bot", text: "Le service est temporairement indisponible. Réessaie dans un instant." }]);
        setLoading(false);
        return;
      }

      const answer: string = raw && "answer" in raw ? raw.answer : "";
      const kind: "gate" | "crisis" | "resume" | undefined =
        raw && "answer" in raw ? (raw as { answer: string; kind?: "gate" | "crisis" | "resume" }).kind : undefined;

      setRows((r) => [...r, { who: "bot", text: answer }]);

      if (kind === "crisis") {
        setAwaitingGate(false);
        setStage("Clôture");
        setEtape(8);
        setText("");
        setLoading(false);
        return;
      }
      if (kind === "resume") {
        // NON → accusé + retour accueil
        setAwaitingGate(false);
        setStage("Intake");
        setEtape(1);
        setSlots({ round: 1 });
        setLoading(false);
        return;
      }
      // Encore une gate → on reste en attente
      setAwaitingGate(true);
      setLoading(false);
      return;
    }

    // -------- Branche 2 : flux EFT normal --------
    const updated: Slots = { ...(stage === "Clôture" ? { round: 1 } : slots) };

    if (stage === "Intake" || (stage === "Clôture" && userText)) {
      updated.intake = normalizeIntake(userText);
    } else if (stage === "Durée") {
      updated.duration = userText;
    } else if (stage === "Contexte") {
      // SITUATION : context = sensation ; ÉMOTION : première réponse = sensation, puis contexte
      const intakeText = (updated.intake ?? slots.intake ?? "").trim();
      if (isEmotionIntake(intakeText)) {
        if (!updated.sensation) {
          updated.sensation = userText; // 1) d'abord la sensation corporelle
        } else {
          updated.context = userText;   // 2) ensuite le contexte/déclencheurs
        }
      } else {
        // SITUATION → ici, la réponse est le ressenti corporel (stocké dans context côté serveur)
        updated.context = userText;
      }
    } else if (stage === "Évaluation") {
      const sud0 = parseSUD(userText);
      if (sud0 !== null) updated.sud = sud0;
      else {
        setError("👉 Merci d’indiquer un score SUD valide entre 0 et 10.");
        setLoading(false);
        return;
      }
    } else if (stage === "Réévaluation") {
      const sud2 = parseSUD(userText);
      if (sud2 !== null) updated.sud = sud2;
    }

    if (stage === "Tapping") {
      const sudInline = parseSUD(userText);
      if (sudInline !== null) updated.sud = sudInline;
    }

    // Aspect : utilise le CONTEXTE déclencheur (pas la sensation EMOTION)
    const intakeText = (updated.intake ?? slots.intake ?? "").trim();
    const ctxRaw = (updated.context ?? slots.context ?? "").trim();
    const ctxShort = ctxRaw ? shortContext(ctxRaw) : "";
    const aspect = buildAspect(intakeText, ctxShort);
    updated.aspect = aspect;
    setSlots(updated);

    // Étape suivante (client → API) — logique corrigée
    let stageForAPI: Stage = stage;
    let etapeForAPI = etape;

    if (stage === "Intake") {
      stageForAPI = "Intake";       etapeForAPI = 1; // serveur : pose la question de ressenti selon le type
    }
    else if (stage === "Contexte") {
      const isEmo = isEmotionIntake(intakeText);
      if (isEmo && updated.sensation && !updated.context) {
        // EMOTION : on vient de capter la sensation → demander maintenant le contexte (encore étape 3)
        stageForAPI = "Contexte";   etapeForAPI = 3;
      } else {
        // SITUATION (sensations déjà en context) ou EMOTION (sensation + contexte déjà saisis)
        stageForAPI = "Évaluation"; etapeForAPI = 4;
      }
    }
    else if (stage === "Évaluation" && typeof updated.sud === "number") {
      stageForAPI = "Setup";        etapeForAPI = 5;
    }
    else if (stage === "Setup") {
      stageForAPI = "Tapping";      etapeForAPI = 6;
    }
    else if (stage === "Tapping") {
      if (typeof updated.sud === "number") {
        if (updated.sud === 0) {
          setRows((r) => [...r, {
            who: "bot",
            text:
              "Bravo pour le travail fourni. Félicitations pour cette belle avancée.\n" +
              "Maintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment !\n\n" +
              "Si tu souhaites travailler sur un nouveau sujet, rafraîchis d'abord la page.\n\n" +
              "Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical."
          }]);
          setStage("Clôture");
          setEtape(8);
          setLoading(false);
          return;
        } else {
          const nextRound = (updated.round ?? 1) + 1;
          updated.round = nextRound;
          setSlots((s) => ({ ...s, round: nextRound }));
          stageForAPI = "Setup";    etapeForAPI = 5;
        }
      } else {
        stageForAPI = "Réévaluation"; etapeForAPI = 7;
      }
    }
    else if (stage === "Réévaluation" && typeof updated.sud === "number") {
      if (updated.sud === 0) {
        setRows((r) => [...r, {
          who: "bot",
          text:
            "Bravo pour le travail fourni. Félicitations pour cette belle avancée.\n" +
            "Maintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment !\n\n" +
            "Si tu souhaites travailler sur un nouveau sujet, rafraîchis d'abord la page.\n\n" +
            "Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical."
        }]);
        setStage("Clôture");
        setEtape(8);
        setLoading(false);
        return;
      } else if (updated.sud > 0) {
        const nextRound = (updated.round ?? 1) + 1;
        updated.round = nextRound;
        setSlots((s) => ({ ...s, round: nextRound }));
        stageForAPI = "Setup";      etapeForAPI = 5;
      }
    }

    const transcriptShort = rows
      .map((r) => (r.who === "user" ? `U: ${r.text}` : `A: ${r.text}`))
      .slice(-10)
      .join("\n");

    // Appel API
    let raw: ApiResponse | undefined;
    try {
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
      raw = (await res.json()) as ApiResponse;
    } catch {
      setRows((r) => [...r, { who: "bot", text: "Erreur de connexion au service. Veuillez réessayer." }]);
      setLoading(false);
      return;
    }

    if (raw && "error" in raw) {
      setRows((r) => [...r, { who: "bot", text: "Le service est temporairement indisponible. Réessaie dans un instant." }]);
      setLoading(false);
      return;
    }

    // Si le serveur signale une gate ici
    const kindInNormalFlow: "gate" | "crisis" | "resume" | undefined =
      raw && "answer" in raw ? (raw as { answer: string; kind?: "gate" | "crisis" | "resume" }).kind : undefined;

    if (kindInNormalFlow === "gate") {
      setAwaitingGate(true);
      setRows((r) => [...r, { who: "bot", text: (raw as { answer: string }).answer }]);
      setLoading(false);
      return; // on n’avance PAS
    }
    if (kindInNormalFlow === "crisis") {
      setAwaitingGate(false);
      setRows((r) => [...r, { who: "bot", text: (raw as { answer: string }).answer }]);
      setStage("Clôture");
      setEtape(8);
      setText("");
      setLoading(false);
      return;
    }
    if (kindInNormalFlow === "resume") {
      setAwaitingGate(false);
      setStage("Intake");
      setEtape(1);
      setSlots({ round: 1 });
      setRows((r) => [
        ...r,
        { who: "bot", text: (raw as { answer: string }).answer },
        { who: "bot", text: "En quoi puis-je vous aider ?" },
      ]);
      setLoading(false);
      return;
    }

    // Affichage normal
    const answer: string = raw && "answer" in raw ? raw.answer : "";
    const cleaned = cleanAnswerForDisplay(answer, stageForAPI);
    setRows((r) => [...r, { who: "bot", text: cleaned }]);

    // Avancer localement
    if (stageForAPI === "Intake" && etapeForAPI === 1) {
      setStage("Contexte");
      setEtape(3);
    } else {
      setStage(stageForAPI);
      setEtape(etapeForAPI);
    }

    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
      {/* Chat */}
      <div
        ref={chatRef}
        className="h-[70vh] sm:h-[60vh] xl:h-[72vh] overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm"
      >
        <div className="space-y-3">
          {rows.map((r: Row, i: number) => (
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
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-xl border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm active:scale-[0.99]"
            placeholder="Sur quoi souhaitez-vous essayer l’EFT…"
            aria-label="Saisissez votre message pour l’assistante EFT"
            disabled={loading}
          />
          {(stage === "Évaluation" || stage === "Réévaluation") && (
            <p className="text-sm text-gray-500 mt-1">
              👉 Indiquez un nombre entre <strong>0</strong> et <strong>10</strong> pour évaluer l’intensité de votre ressenti.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="rounded-xl border px-4 py-2 shadow-sm active:scale-[1.00]"
        >
          {loading ? "Envoi..." : "Envoyer"}
        </button>
      </form>

      {error && <div className="text-red-600 mt-2">{error}</div>}
    </main>
  );
}
