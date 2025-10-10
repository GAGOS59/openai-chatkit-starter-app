import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs"; // exécution serveur uniquement

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
  intake?: string;       // ex. "douleur lancinante à la jointure de l'épaule" / "peur de l'orage"
  duration?: string;     // ex. "une semaine"
  context?: string;      // ex. "je me suis retrouvée seule pour ranger le bazar de mon mari"
  sud?: number;          // 0..10
  round?: number;        // 1,2,3…
  aspect?: string;       // construit coté front
  sud_qualifier?: SudQualifier;
};

type GuideRequest = {
  prompt?: string;
  stage?: Stage;
  etape?: number;   // 1..8
  transcript?: string;
  slots?: Slots;
};

function stepFromStage(stage?: Stage): number {
  switch (stage) {
    case "Intake": return 1;
    case "Durée": return 2;
    case "Contexte": return 3;
    case "Évaluation": return 4;
    case "Setup": return 5;
    case "Tapping": return 6;
    case "Réévaluation": return 7;
    case "Clôture": return 8;
    default: return 1;
  }
}

/* ---------- utilitaires ---------- */
function lowerFirst(s: string): string {
  if (!s) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}
function clean(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\s+([,;:.!?])/g, "$1").trim();
}
function splitContext(ctx: string): string[] {
  const parts = ctx
    .split(/[,.;]|(?:\s(?:et|quand|lorsque)\s)/gi)
    .map((p) => clean(p))
    .filter((p) => p.length > 0)
    .slice(0, 6);
  return parts;
}
function qualifierFromSud(q: SudQualifier): string {
  if (q === "très présente") return " très présente";
  if (q === "encore présente") return " encore présente";
  if (q === "reste encore un peu") return " qui reste encore un peu";
  return "";
}
function buildRappelPhrases(slots: Slots): string[] {
  const intake = clean(slots.intake ?? "");
  const ctx = clean(slots.context ?? "");
  const q = qualifierFromSud(slots.sud_qualifier ?? "");
  const round = slots.round ?? 1;

  const baseGeneric = intake ? `Cette ${lowerFirst(intake)}` : "Ce problème";
  const baseShort =
    intake && /douleur|gêne|tension|peur|col[èe]re|tristesse/i.test(intake)
      ? `Cette ${lowerFirst(intake.replace(/^une |un /i, ""))}`
      : baseGeneric;

  const contextParts = ctx ? splitContext(ctx) : [];

  const roundMod =
    typeof slots.sud === "number" && slots.sud > 0 && round > 1
      ? (slots.sud >= 7 ? " toujours" : " encore")
      : "";

  const phrases: string[] = [];
  phrases.push(`${baseGeneric}${q || roundMod}.`);
  phrases.push(`${baseShort}.`);

  for (let i = 0; i < 4; i++) {
    if (contextParts[i]) {
      const sentence = contextParts[i][0].toUpperCase() + contextParts[i].slice(1) + ".";
      phrases.push(sentence);
    } else {
      phrases.push(`${(i % 2 === 0) ? baseGeneric : baseShort}${roundMod ? roundMod : q}.`);
    }
  }

  if (contextParts[0]) {
    phrases.push(`Tout ce contexte : ${contextParts[0]}.`);
  } else {
    phrases.push(`${baseShort}.`);
  }
  phrases.push(`${baseGeneric}.`);

  return phrases.slice(0, 8);
}

/* ---------- extraction réponse OpenAI (sans any) ---------- */
function extractAnswer(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const j = json as Record<string, unknown>;

  const output = j.output as unknown;
  if (Array.isArray(output) && output[0] && typeof output[0] === "object") {
    const content = (output[0] as Record<string, unknown>).content as unknown;
    if (Array.isArray(content) && content[0] && typeof content[0] === "object") {
      const text = (content[0] as Record<string, unknown>).text;
      if (typeof text === "string") return text;
    }
  }

  const choices = j.choices as unknown;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const msg = (choices[0] as Record<string, unknown>).message as unknown;
    if (msg && typeof msg === "object") {
      const content = (msg as Record<string, unknown>).content;
      if (typeof content === "string") return content;
    }
  }

  const contentTop = j.content as unknown;
  if (Array.isArray(contentTop) && contentTop[0] && typeof contentTop[0] === "object") {
    const text = (contentTop[0] as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }

  return "";
}

/* ---------- prompt système ---------- */
const SYSTEM = `
Tu es l'assistante EFT officielle de l'École EFT France (Gary Craig).
Style: clair, bienveillant, concis. Aucune recherche Internet. Pas de diagnostic.

FLUX (verrouillé)
1) Intake — qualité + localisation.
2) Durée — depuis quand.
3) Contexte — circonstances/événements/émotions.
4) Évaluation — SUD (0–10) pour la première fois.
5) Setup — PK ×3 avec la phrase, puis attendre "prêt".
6) Tapping — ronde point par point.
7) Réévaluation — SUD ; si >0 → nouvelle ronde ; si =0 → Clôture.
8) Clôture — bref + prudence. Ne relance pas.

LANGAGE
- AUCUN filler (“respire”, “doucement”, etc.).
- N’utiliser que les mots de l’utilisateur via les slots fournis.
- Une seule consigne par message (sauf Setup: 2 lignes max).

ÉTAPE 6 — IMPORTANT
- Des phrases P1..P8 sont fournies par le serveur (rappel point par point).
- TU DOIS les utiliser EXACTEMENT, dans l’ordre, une par point (ST, DS, CO, SO, SN, MT, CL, SB).
- Ne modifie pas ces phrases, ne les réécris pas, ne les enrichis pas.

FORMAT
- Commencer par "Étape {N} — ".
- Étapes 1–4 & 7–8 : 1 ligne (2 max pour 5).
- Étape 6 : liste de 8 puces (ST→SB) + phrase finale demandant le SUD.
`;

/* ---------- handler ---------- */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const base = (process.env.LLM_BASE_URL || "").trim() || "https://api.openai.com";
    const endpoint = `${base.replace(/\/+$/,"")}/v1/responses`;

    const raw = (await req.json().catch(() => ({}))) as Partial<GuideRequest>;
    const prompt = typeof raw.prompt === "string" ? raw.prompt.slice(0, 2000) : "";
    const stage = (raw.stage as Stage) ?? "Intake";
    const etapeClient = Number.isFinite(raw.etape) ? Number(raw.etape) : stepFromStage(stage);
    const transcript = typeof raw.transcript === "string" ? raw.transcript.slice(0, 4000) : "";
    const slots = (raw.slots && typeof raw.slots === "object" ? (raw.slots as Slots) : {}) ?? {};
    const etape = Math.min(8, Math.max(1, etapeClient));

    const phrases = buildRappelPhrases(slots);

    const USER_BLOCK =
`[CONTEXTE]
- Étape (1..8) : ${etape}
- Slots:
  • intake="${slots.intake ?? ""}"
  • duration="${slots.duration ?? ""}"
  • context="${slots.context ?? ""}"
  • sud=${Number.isFinite(slots.sud) ? slots.sud : "NA"}
  • round=${Number.isFinite(slots.round) ? slots.round : "NA"}
  • aspect="${slots.aspect ?? ""}"
  • sud_qualifier="${slots.sud_qualifier ?? ""}"

[PHRASES_POUR_ETAPE_6]
P1="${phrases[0]}"
P2="${phrases[1]}"
P3="${phrases[2]}"
P4="${phrases[3]}"
P5="${phrases[4]}"
P6="${phrases[5]}"
P7="${phrases[6]}"
P8="${phrases[7]}"

[DERNIER MESSAGE UTILISATEUR]
${prompt}

[HISTORIQUE (court)]
${transcript}

[INSTRUCTIONS]
- Génère la sortie de l'étape ${etape} en respectant STRICTEMENT le SYSTEM ci-dessus.
- Si étape 6 : utilise P1..P8 telles quelles (sans reformulation), point par point.
`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: `${SYSTEM}\n\n${USER_BLOCK}`,
        temperature: 0.2,
        max_output_tokens: 380,
      }),
      signal: controller.signal,
    }).catch(() => {
      throw new Error("Upstream error");
    });
    clearTimeout(timer);

    if (!res || !res.ok) {
      return NextResponse.json({ error: "Upstream failure" }, { status: 502 });
    }

    const json = (await res.json()) as unknown;
    const answer = extractAnswer(json);

    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
