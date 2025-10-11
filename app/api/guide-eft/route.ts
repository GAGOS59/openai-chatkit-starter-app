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
    .split(/[,.;]|(?:\s(?:et|quand|parce que|lorsque|depuis|depuis que)\s)/gi)
    .map((p) => clean(p))
    .filter((p) => p.length > 0)
    .slice(0, 6);
}
function detectGender(intakeRaw: string): "m" | "f" {
  const s = clean(intakeRaw).toLowerCase();
  if (s.startsWith("mal")|| s.startsWith("serrement") || s.startsWith("truc") ) return "m";
  if (s.startsWith("douleur") || s.startsWith("peur") || s.startsWith("gêne") || s.startsWith("boule") ||s.startsWith("gene") || s.startsWith("tension") || s.startsWith("colère") || s.startsWith("crispation") || s.startsWith("colere") || s.startsWith("tristesse")) {
    return "f";
  }
  return "f";
}
function sudQualifierFromNumber(sud?: number, g: "m" | "f" = "f"): string {
  if (typeof sud !== "number" || sud === 0) return "";
   if (sud >= 9) return g === "m" ? " vraiment très présent" : " vraiment très présente";
  if (sud >= 7) return g === "m" ? " très présent" : " très présente";
  if (sud >= 4) return g === "m" ? " encore présent" : " encore présente";
  return " qui reste encore un peu";
}
function baseFromIntake(intakeRaw: string): { generic: string; short: string; g: "m" | "f" } {
  const intake = clean(intakeRaw);
  const g = detectGender(intakeRaw);
  if (g === "m" && /^mal\b/i.test(intake)) {
    return { generic: " Ce " + intake, short: " Ce " + intake, g };
  }
  if (g === "f") {
    return { generic: " Cette " + intake, short: " Cette " + intake, g };
  }
  return { generic: " Ce problème", short: " Ce problème", g: "m" };
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

/* ---- SYSTEM ---- */
const SYSTEM = `
Tu es l'assistante EFT officielle de l'École EFT France (Gary Craig).
Style: clair, bienveillant, concis. Aucune recherche Internet. Pas de diagnostic.

FLUX
1) Intake — qualité + localisation (ou libellé précis si émotion).
2) Durée — depuis quand.
3) Contexte — circonstances/événements/émotions.
4) Évaluation — SUD (0–10) pour la première fois.
5) Setup — Phrase de préparation (PK ×3) puis attendre un message de l'utilisateur (sans insister).
7) Réévaluation — SUD ; si >0 → nouvelle ronde ; si =0 → Clôture.
8) Clôture — remercier, féliciter, pause/hydratation, note de prudence.

LANGAGE
- Pas de fillers. Utiliser uniquement les mots fournis (slots).
- Une seule consigne par message (sauf Setup: 2 lignes max).
- Commencer par "Étape {N} — ".
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

    /* 🛑 Bloc de sécurité : prévention suicide */
    const risque = [
      "suicide", "me tuer", "je veux mourir", "je veux me tuer",
      "marre de la vie", "me foutre en l'air",
      "je n'en peux plus de vivre", "je veux disparaître", "je ne veux plus vivre", "plus vivre"
    ];
    const texte = prompt.toLowerCase();
    if (risque.some(mot => texte.includes(mot))) {
      return NextResponse.json({
        answer: `⚠️ **Message important :** ⚠️
Il semble que vous traversiez un moment très difficile.  
Je ne suis pas un service d’urgence, mais votre sécurité est prioritaire.  

**Appelez immédiatement le 15** (urgences médicales en France),  
ou contactez le **3114**, le **numéro national de prévention du suicide**,  
gratuit et disponible 24h/24, 7j/7.  

Si vous êtes à l’étranger, composez le numéro d’urgence local.  
Vous n’êtes pas seul·e — il existe des personnes prêtes à vous aider.`
      });
    }
    /* Fin du bloc sécurité */

    const stage = (raw.stage as Stage) ?? "Intake";
    const etapeClient = Number.isFinite(raw.etape) ? Number(raw.etape) : stepFromStage(stage);
    const transcript = typeof raw.transcript === "string" ? raw.transcript.slice(0, 4000) : "";
    const slots = (raw.slots && typeof raw.slots === "object" ? (raw.slots as Slots) : {}) ?? {};
    const etape = Math.min(8, Math.max(1, etapeClient));

    // Étape 5 : Setup déterministe
    if (etape === 5) {
      const aspect = clean(slots.aspect ?? slots.intake ?? "");
      const txt =
`Étape 5 — Setup : « Même si j’ai ce ${aspect}, je m’accepte profondément et complètement. »
Répétez cette phrase 3 fois en tapotant sur le Point Karaté (tranche de la main).
Quand c’est fait, envoyez un OK et nous passerons à la ronde.`;
      return NextResponse.json({ answer: txt });
    }

    // Étape 6 : Ronde
    if (etape === 6) {
      const p = buildRappelPhrases(slots);
      const txt =
`Étape 6 —

- ST : ${p[0]}
- DS : ${p[1]}
- CO : ${p[2]}
- SO : ${p[3]}
- SN : ${p[4]}
- MT : ${p[5]}
- CL : ${p[6]}
- SB : ${p[7]}
Quand tu as terminé cette ronde, dis-moi ton SUD (0–10).`;
      return NextResponse.json({ answer: txt });
    }

    // Étape 8 : Clôture
    if (etape === 8) {
      const txt =
"Étape 8 — Bravo pour le travail fourni. Félicitations pour cette belle avancée. Prends un moment pour t'hydrater et te reposer. Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical.";
      return NextResponse.json({ answer: txt });
    }

    // Étapes intermédiaires
    const USER_BLOCK =
`[CONTEXTE]
Étape demandée: ${etape}
Slots:
- intake="${slots.intake ?? ""}"
- duration="${slots.duration ?? ""}"
- context="${slots.context ?? ""}"
- sud=${Number.isFinite(slots.sud) ? slots.sud : "NA"}
- round=${Number.isFinite(slots.round) ? slots.round : "NA"}
- aspect="${slots.aspect ?? ""}"

[DERNIER MESSAGE UTILISATEUR]
${prompt}

[HISTORIQUE (court)]
${transcript}

[INSTRUCTION]
Produis UNIQUEMENT le texte de l'étape ${etape}, concis, au bon format.`;

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
        max_output_tokens: 260,
      }),
      signal: controller.signal,
    }).catch(() => {
      throw new Error("Upstream error");
    });
    clearTimeout(timer);

    if (!res || !res.ok) {
      return NextResponse.json({ error: "Upstream failure" }, { status: 502 });
    }

    const json = await res.json();
    const answer =
      (json?.output?.[0]?.content?.[0]?.text) ??
      (json?.choices?.[0]?.message?.content) ??
      (json?.content?.[0]?.text) ??
      "";
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
