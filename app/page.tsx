/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useRef, useState, useEffect, FormEvent } from "react";

// --- DEMO (facultatif) ---
const SHOW_DEMO = false; // passe à false pour masquer le panneau

const DEMO_PRESETS = [
  {
    label: "Douleur au dos → lombaires",
    steps: [
      "douleur au dos",
      "douleur sourde aux lombaires",
      "fatiguée en fin de journée",
      "5",
      "OK",
      "3",
      "OK",
      "0"
    ],
  },
  {
    label: "Peur des hauteurs",
    steps: [
      "peur des hauteurs",
      "serrement dans la poitrine",
      "quand je regarde par-dessus une rambarde",
      "7",
      "OK",
      "4",
      "OK",
      "1",
      "OK",
      "0"
    ],
  },
];

// petit utilitaire pour insérer du texte dans l’input
function useDemoHelpers(
  setText: React.Dispatch<React.SetStateAction<string>>
) {
  return {
    fill: (value: string) => setText(value),
  };
}


/* ---------- Types UI ---------- */
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

/* Réponse typée de l’API */
type ApiResponse =
  | { answer: string; kind?: "gate" | "crisis" }
  | { error: string };

if ((raw as { answer?: string; kind?: string })?.kind === "gate") {
  const gateText = (raw as { answer?: string }).answer || "Avez-vous des idées suicidaires ? (oui / non)";
  setRows(r => [...r, { who: "bot", text: gateText }]);
  setLoading(false);
  return; // on reste sur l’étape en cours
}

/* ---------- Helpers (client) ---------- */
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
  const intake = normalizeIntake(intakeTextRaw);
  if (!ctxShort) return intake;
  const masculine = isMasculine(intake);
  const liaison = masculine ? "lié à" : "liée à";
  const cleaned = normalizeContextForAspect(ctxShort);
  return `${intake} ${liaison} ${cleaned}`;
}

/* ---------- Safety (client) ---------- */
const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid(e|er|aire|al|ale|aux|erai|erais|erait|eront)?\b/i,
  /\bsu[cs]sid[ea]\b/i,
  /\bje\s+(veux|vais|voudrais)\s+mour(ir|ire)\b/i,
  /\bje\s+ne\s+veux\s+plus\s+vivre\b/i,
  /\bje\s+(veux|vais|voudrais)\s+en\s+finir\b/i,
  /\bmettre\s+fin\s+à\s+(ma|mes)\s+jours?\b/i,
  /\bid[ée]es?\s+noires?\b/i,
];

function isCrisis(text: string): boolean {
  const t = text.toLowerCase();
  return CRISIS_PATTERNS.some((rx: RegExp) => rx.test(t));
}

function crisisMessage(): string {
  return (
`Message important
Il semble que vous traversiez un moment très difficile.
Ne restez pas seul.e. Rapprochez-vous d'une personne ressource.
Je ne peux pas vous accompagner sur des situations d'urgence et votre sécurité est prioritaire.

En France : vous pouvez appeler immédiatement le 15 (SAMU) ou le 3114 (prévention du suicide, 24/7).
En danger immédiat : appelez le 112.

Vous n'êtes pas seul·e — ces services peuvent vous aider dès maintenant.`
  );
}

/* ---------- Liens cliquables ---------- */
function linkify(text: string): React.ReactNode[] {
  const URL_RX =
    /(https?:\/\/[^\s<>"'()]+|(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"']*)?)/gi;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_RX.exec(text)) !== null) {
    const url = match[0];
    const start = match.index;

    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    const href = url.startsWith("http")
      ? url
      : `https://${url.replace(/^www\./i, "www.")}`;

    nodes.push(
      <a
        key={`${start}-${href}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:no-underline"
      >
        {url}
      </a>
    );

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
          const items: string[] = p
            .split(/\n/)
            .filter(Boolean)
            .map((t: string) => t.replace(/^(- |\u2022 |\* )/, ""));
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {items.map((li: string, j: number) => (
                <li key={j} className="whitespace-pre-wrap">
                  {linkify(li)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line leading-relaxed">
            {linkify(p)}
          </p>
        );
      })}
    </div>
  );
}

/** Nettoyage d’affichage : supprime "Étape X —" / "Setup :" et habille le Setup */
function cleanAnswerForDisplay(ans: string, stage: Stage): string {
  let t = (ans || "").trim();
  t = t.replace(/^\s*Étape\s*\d+\s*—\s*/gmi, "");
  t = t.replace(/^\s*Setup\s*:?\s*/gmi, "");
  if (stage === "Setup") {
    const core = t.replace(/^«\s*|\s*»$/g, "").trim();
    t =
      "Reste bien connecté·e à ton ressenti et dis à voix haute :\n" +
      `« ${core} »\n` +
      "En tapotant le Point Karaté (tranche de la main), répète cette phrase 3 fois.";
  }
  return t;
}

/* ---------- Colonne promo ---------- */
function PromoAside() {
  return (
    <aside className="rounded-2xl border bg-white p-5 shadow-sm xl:sticky xl:top-6">
      <div className="text-center mb-4">
        <p className="text-sm text-gray-700 leading-snug">Pour aller plus loin avec</p>
        <h3 className="text-xl font-bold leading-tight break-words">Geneviève Gagos</h3>
      </div>
      <div className="flex justify-center mb-4">
        <a
          href="https://technique-eft.com/livres-eft.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50 transition"
        >
          Livres EFT
        </a>
      </div>
      <ul className="text-sm text-gray-700 space-y-1 mb-5">
        <li className="text-center">
          Site de référence :{" "}
          <a
            href="https://technique-eft.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            Technique-EFT.com
          </a>
        </li>
      </ul>
      <div className="h-px bg-gray-200 my-4" />
      <div className="space-y-3">
        <div className="text-center">
          <a
            href="https://ecole-eft-france.fr/pages/formations-eft.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-full rounded-xl border bg-[#0f3d69] text-white px-4 py-2 font-semibold hover:bg-white hover:text-[#0f3d69] transition"
          >
            Découvrir nos formations
          </a>
          <p className="text-xs text-gray-600 mt-1">
            Formations adaptées à vos besoins, proposées par l’École EFT France.
          </p>
        </div>
        <div className="text-center">
          <a
            href="https://technique-eft.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-full rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50 transition"
          >
            En savoir plus sur l’EFT
          </a>
          <p className="text-xs text-gray-600 mt-1">
            Articles, ressources et actualités sur Technique-EFT.com.
          </p>
        </div>
      </div>
    </aside>
  );
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
  const demo = useDemoHelpers(setText);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [rows]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    const userText = text.trim();
    if (!userText) {
      setLoading(false);
      return;
    }

    // 🔒 crise → coupe et clôture
    if (isCrisis(userText)) {
      const now = new Date().toISOString();
      console.warn(`⚠️ [${now}] Détection de mot-clé sensible : protocole de sécurité appliqué.`);
      setRows((r: Row[]) => [
        ...r,
        { who: "user", text: userText },
        { who: "bot", text: crisisMessage() }
      ]);
      setText("");
      setStage("Clôture");
      setEtape(8);
      setLoading(false);
      return;
    }

    // Nouveau sujet après clôture → reset
    if (stage === "Clôture") {
      setStage("Intake");
      setEtape(1);
      setSlots({ round: 1 });
    }

    setRows((r: Row[]) => [...r, { who: "user", text: userText }]);
    setText("");

    // MÀJ slots
    const updated: Slots = { ...(stage === "Clôture" ? { round: 1 } : slots) };

    if (stage === "Intake" || (stage === "Clôture" && userText)) {
      updated.intake = normalizeIntake(userText);
    } else if (stage === "Durée") {
      // On n’utilise pas "Durée" pour la progression : on passe directement au Contexte après Intake
      updated.duration = userText;
    } else if (stage === "Contexte") {
      updated.context = userText;
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

    // Aspect pour Setup & Ronde
    const intakeText = (updated.intake ?? slots.intake ?? "").trim();
    const ctxRaw = (updated.context ?? slots.context ?? "").trim();
    const ctxShort = ctxRaw ? shortContext(ctxRaw) : "";
    const aspect = buildAspect(intakeText, ctxShort);
    updated.aspect = aspect;
    setSlots(updated);

    // Étape suivante (client → API)
    let stageForAPI: Stage = stage;
    let etapeForAPI = etape;

    if (stage === "Intake") {
      // Après la réponse de précision, on demande le contexte (étape 3)
      stageForAPI = "Contexte";
      etapeForAPI = 3;
    }
    else if (stage === "Contexte") {
      stageForAPI = "Évaluation";     etapeForAPI = 4;
    }
    else if (stage === "Évaluation" && typeof updated.sud === "number") {
      stageForAPI = "Setup";          etapeForAPI = 5;
    }
    else if (stage === "Setup") {
      stageForAPI = "Tapping";        etapeForAPI = 6;
    }
    else if (stage === "Tapping") {
      if (typeof updated.sud === "number") {
        if (updated.sud === 0) {
          setRows((r: Row[]) => [...r, {
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
          setSlots((s: Slots) => ({ ...s, round: nextRound }));
          stageForAPI = "Setup";      etapeForAPI = 5;   // repasser par Setup ajusté
        }
      } else {
        stageForAPI = "Réévaluation"; etapeForAPI = 7;
      }
    }
    else if (stage === "Réévaluation" && typeof updated.sud === "number") {
      if (updated.sud === 0) {
        setRows((r: Row[]) => [...r, {
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
        setSlots((s: Slots) => ({ ...s, round: nextRound }));
        stageForAPI = "Setup";        etapeForAPI = 5;
      }
    }

    const transcriptShort = rows
      .map((r: Row) => (r.who === "user" ? `U: ${r.text}` : `A: ${r.text}`))
      .slice(-10)
      .join("\n");

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
      setRows((r: Row[]) => [...r, { who: "bot", text: "Erreur de connexion au service. Veuillez réessayer." }]);
      setLoading(false);
      return;
    }

    if (raw && "error" in raw) {
      setRows((r: Row[]) => [...r, { who: "bot", text: "Le service est temporairement indisponible. Réessaie dans un instant." }]);
      setLoading(false);
      return;
    }

    const answer: string = raw && "answer" in raw ? raw.answer : "";

    if (isCrisis(answer)) {
      const now = new Date().toISOString();
      console.warn(`⚠️ [${now}] Mot sensible détecté dans la réponse (client). Clôture sécurisée.`);
      setRows((r: Row[]) => [...r, { who: "bot", text: crisisMessage() }]);
      setStage("Clôture");
      setEtape(8);
      setText("");
      setLoading(false);
      return;
    }

    const cleaned = cleanAnswerForDisplay(answer, stageForAPI);
    setRows((r: Row[]) => [...r, { who: "bot", text: cleaned }]);

    // Avancer localement
    if (stage === "Intake") {
      setStage("Contexte"); setEtape(3);
    } else {
      setStage(stageForAPI);
      setEtape(etapeForAPI);
    }

    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
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

      {/* Grille */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Colonne principale */}
        <div className="xl:col-span-2 space-y-4">

          {SHOW_DEMO && (
  <div className="rounded-xl border bg-white p-3 shadow-sm">
    <div className="text-sm font-semibold mb-2">Mode démo (facultatif)</div>
    <div className="flex flex-wrap gap-2">
      {DEMO_PRESETS.map((preset, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="text-xs text-gray-600">{preset.label}</span>
          <div className="flex gap-1">
            {preset.steps.map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => demo.fill(s)}
                className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50"
                title={`Insérer: ${s}`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
    <p className="text-xs text-gray-500 mt-2">
      Clique sur un numéro pour pré-remplir le champ, puis appuie sur <strong>Envoyer</strong>.
    </p>
  </div>
)}

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
        </div>

        {/* Promo */}
        <div className="xl:col-span-1 xl:max-h-[72vh] xl:overflow-auto">
          <PromoAside />
        </div>
      </div>

      {/* Note de prudence */}
      <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <strong className="block mb-1">Note de prudence</strong>
        <p className="text-sm leading-relaxed">
          Ce guide est proposé à titre informatif et éducatif. Il ne remplace en aucun cas un avis médical,
          psychologique ou professionnel.<br />
          L&apos;École EFT France et ses représentants déclinent toute responsabilité quant à l&apos;interprétation, l&apos;usage ou les conséquences liés à l&apos;application
          des informations ou protocoles présentés.<br />
          Chaque utilisateur reste responsable de sa pratique et de ses choix.
          <br /><br />
          <strong>Important :</strong> L&apos;École EFT France ou Geneviève Gagos ne voit pas et n&apos;enregistre pas vos échanges réalisés dans ce chat.
          Mais comme pour tout ce qui transite par Internet, nous vous invitons à rester prudents et à ne pas divulguer des éléments très personnels.
        </p>
        <p className="text-xs mt-3 opacity-80">— Édition spéciale 30 ans d&apos;EFT — © 2025 École EFT France — Direction Geneviève Gagos</p>
      </div>
    </main>
  );
}
