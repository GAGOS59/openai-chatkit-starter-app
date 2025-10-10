import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

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

type GuideRequest = {
  prompt?: string;
  stage?: Stage;
  etape?: number;
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

/* ---- utils ---- */
function clean(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\s+([,;:.!?])/g, "$1").trim();
}
function splitContext(ctx: string): string[] {
  return ctx
    .split(/[,.;]|(?:\s(?:et|quand|lorsque)\s)/gi)
    .map((p) => clean(p))
    .filter((p) => p.length > 0)
    .slice(0, 6);
}
function detectGender(intakeRaw: string): "m" | "f" {
  const s = clean(intakeRaw).toLowerCase();
  if (s.startsWith("mal ")) return "m";
  if (s.startsWith("douleur") || s.startsWith("peur") || s.startsWith("gêne") || s.startsWith("gene") || s.startsWith("tension") || s.startsWith("colère") || s.startsWith("colere") || s.startsWith("tristesse")) {
    return "f";
  }
  return "f";
}
function sudQualifierFromNumber(sud?: number, g: "m" | "f" = "f"): string {
  if (typeof sud !== "number" || sud === 0) return "";
  if (sud >= 7) return g === "m" ? " très présent" : " très présente";
  if (sud >= 4) return g === "m" ? " encore présent" : " encore présente";
  return " qui reste encore un peu";
}
function baseFromIntake(intakeRaw: string): { generic: string; short: string; g: "m" | "f" } {
  const intake = clean(intakeRaw);
  const g = detectGender(intakeRaw);
  if (g === "m" && /^mal\b/i.test(intake)) {
    return { generic: "Ce " + intake, short: "Ce " + intake, g };
  }
  if (g === "f") {
    return { generic: "Cette " + intake, short: "Cette " + intake, g };
  }
  return { generic: "Ce problème", short: "Ce problème", g: "m" };
}
function buildRappelPhrases(slots: Slots): string[] {
  const intake = clean(slots.intake ?? "");
  const ctx = clean(slots.context ?? "");
  const { generic, short, g } = baseFromIntake(intake);
  const sudQ = sudQualifierFromNumber(slots.sud, g);
  const round = slots.round ?? 1;
  const contextParts = ctx ? splitContext(ctx) : [];

  const roundMod =
    typeof slots.sud === "number" && slots.sud > 0 && round > 1
      ? (slots.sud >= 7 ? " toujours" : " encore")
      : "";

  const qOrRound = sudQ || roundMod;

  const phrases: string[] = [];
  phrases.push(`${generic}${qOrRound}.`);
  phrases.push(`${short}.`);
  for (let i = 0; i < 4; i++) {
    if (contextParts[i]) {
      const sentence = contextParts[i][0].toUpperCase() + contextParts[i].slice(1) + ".";
      phrases.push(sentence);
    } else {
      phrases.push(`${(i % 2 === 0) ? generic : short}${qOrRound}.`);
    }
  }
  if (contextParts[0]) phrases.push(`Tout ce contexte : ${contextParts[0]}.`);
  else phrases.push(`${short}.`);
  phrases.push(`${generic}.`);
  return phrases.slice(0, 8);
}
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

/* ---- SYSTEM ---- */
const SYSTEM = `
Tu es l'assistante EFT officielle de l'École EFT France (Gary Craig).
Style: clair, bienveillant, concis. Aucune recherche Internet. Pas de diagnostic.

FLUX (verrouillé)
1) Intake — qualité + localisation (ou libellé précis si émotion).
2) Durée — depuis quand.
3) Contexte — circonstances/événements/émotions.
4) Évaluation — SUD (0–10) pour la première fois.
5) Setup — Point Karaté ×3 : « Même si j’ai cette {aspect}, je m’accepte profondément et complètement. »
   Puis attendre que la personne écrive « prêt ».
6) Tapping — ronde point par point (ST→SB).
7) Réévaluation — SUD ; si >0 → nouvelle ronde ; si =0 → Clôture.
8) Clôture — remercie, félicite le travail fourni, propose une pause/hydratation, rappelle la note de prudence.
   N’ouvre pas un nouveau sujet, ne relance pas.

LANGAGE
- AUCUN filler (“respire”, “doucement”, etc.).
- Utiliser uniquement les mots de l’utilisateur via les slots fournis.
- Une seule consigne par message (sauf Setup: 2 lignes max, impératif clair).

ÉTAPE 6 — IMPORTANT
- Des phrases P1..P8 sont fournies par le serveur (rappel point par point).
- TU DOIS les utiliser EXACTEMENT, dans l’ordre, une par point (ST, DS, CO, SO, SN, MT, CL, SB).
- Ne modifie pas ces phrases, ne les réécris pas, ne les enrichis pas.

FORMAT
- Commencer par "Étape {N} — ".
- Étapes 1–4 & 7–8 : 1 ligne (2 max pour 5).
- Étape 6 : 8 puces (ST → SB) + phrase finale demandant le SUD.
`;

/* ---- Handler ---- */
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
