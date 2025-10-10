import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs"; // ✅ force l'exécution côté serveur Node.js

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

type GuideRequest = {
  prompt?: string;
  stage?: Stage;
  etape?: number; // 1..8
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
- Aucun filler (pas de « respire », « doucement », etc.).
- N’utiliser que les mots de l’utilisateur via les slots (intake/context).
- Une seule consigne par message (sauf Setup: 2 lignes max).

PERSONNALISATION
- {aspect} = {intake} + (", " + {context} si présent).
- {sud_qualifier} ∈ {"très présente","encore présente","reste encore un peu","disparue",""} ; seulement si SUD défini.

ÉTAPE 4 — Évaluation
- "Peux-tu me donner ton SUD entre 0 et 10, maintenant ?"
- Tant que SUD manquant/illisible → rester en 4.

ÉTAPE 5 — Setup (exactement 2 lignes)
1) "Tapote sur le Point Karaté (tranche de la main) en répétant 3 fois : « Même si j’ai cette {aspect (minuscule initiale)}, je m’accepte profondément et complètement. »"
2) "Quand c’est fait, écris « prêt » et je te guide pour la ronde."

ÉTAPE 6 — Tapping
- Lancer une ronde seulement si SUD défini (>0 possible, 0 → Clôture).
- Liste stricte (chaque ligne commence par "- "):
  - Sommet de la tête (ST) — Cette {aspect}{QUALIF}.
  - Début du sourcil (DS) — Cette {aspect}{QUALIF}.
  - Coin de l’œil (CO) — Cette {aspect}{QUALIF}.
  - Sous l’œil (SO) — Cette {aspect}{QUALIF}.
  - Sous le nez (SN) — Cette {aspect}{QUALIF}.
  - Menton (MT) — Cette {aspect}{QUALIF}.
  - Clavicule (CL) — Cette {aspect}{QUALIF}.
  - Sous le bras (SB) — Cette {aspect}{QUALIF}.
  où {QUALIF} = " " + {sud_qualifier} UNIQUEMENT si SUD>0, sinon vide.
- Finir par : "Quand tu as terminé cette ronde, dis-moi ton SUD (0–10). Objectif : 0."

ÉTAPE 7 — Réévaluation
- SUD manquant → redemander.
- SUD > 0 → proposer nouvelle ronde (retour 6).
- SUD = 0 → Clôture.

FORMAT
- Commencer par "Étape {N} — ".
- Étapes 1–4 & 7–8 : 1 ligne (2 max pour 5).
- Étape 6 : liste de 8 puces + phrase SUD.
`;

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

export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    // ❗ L’URL amont n’est plus en dur : passe par une variable d’environnement
    const base = (process.env.LLM_BASE_URL || "").trim() || "https://api.openai.com";
    const endpoint = `${base.replace(/\/+$/,"")}/v1/responses`;

    // Lecture bornée des entrées
    const raw = (await req.json().catch(() => ({}))) as Partial<GuideRequest>;
    const prompt = typeof raw.prompt === "string" ? raw.prompt.slice(0, 2000) : "";
    const stage = (raw.stage as Stage) ?? "Intake";
    const etapeClient = Number.isFinite(raw.etape) ? Number(raw.etape) : stepFromStage(stage);
    const transcript = typeof raw.transcript === "string" ? raw.transcript.slice(0, 4000) : "";
    const slots = (raw.slots && typeof raw.slots === "object" ? (raw.slots as Slots) : {}) ?? {};
    const etape = Math.min(8, Math.max(1, etapeClient));

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

[DERNIER MESSAGE UTILISATEUR]
${prompt}

[HISTORIQUE (court)]
${transcript}

[INSTRUCTIONS]
- Génère la sortie de l'étape ${etape} en respectant STRICTEMENT le SYSTEM ci-dessus.
`;

    // Timeout côté serveur
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // 🔐 La clé ne quitte JAMAIS le serveur
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
