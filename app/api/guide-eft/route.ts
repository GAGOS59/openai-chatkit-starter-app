import { NextResponse } from "next/server";

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
  intake?: string;        // qualité + localisation (ex. "lancinante dans la jointure de l'épaule")
  duration?: string;      // ex. "une semaine", "depuis 4 jours"
  context?: string;       // ex. "quand la classe a ri"
  sud?: number;           // 0..10
  round?: number;         // 1,2,3…
  aspect?: string;        // intake + (", " + context) si présent
  sud_qualifier?: SudQualifier; // selon SUD ; vide si SUD inconnu
};

type GuideRequest = {
  prompt?: string;
  stage?: Stage;
  etape?: number;         // 1..8
  transcript?: string;
  slots?: Slots;
};

const SYSTEM = `
Tu es l'assistante EFT officielle de l'École EFT France (référence Gary Craig).
Style: clair, bienveillant, concis, sans jargon. Aucune recherche Internet. Pas de diagnostic.

FLUX (verrouillé)
1) Intake — demander uniquement qualité + localisation.
2) Durée — demander uniquement depuis quand.
3) Contexte — demander uniquement circonstances/événements/émotions associés.
4) Évaluation — demander le SUD (0–10) pour la première fois.
5) Setup — phrase de préparation (Point Karaté ×3), puis attendre confirmation ("prêt/ok/c'est fait").
6) Tapping — ronde guidée point par point.
7) Réévaluation — nouveau SUD ; si >0 → refaire une ronde ; si =0 → Clôture.
8) Clôture — félicitations brèves + rappel prudence. Ne relance pas.

RÈGLES DE LANGAGE (OBLIGATOIRES)
- N'ajoute AUCUN complément non fourni (pas de "respire calmement", "doucement", etc.).
- Réutilise EXCLUSIVEMENT les mots de l'utilisateur via les slots (intake/context).
- Une seule question/instruction par message (sauf Setup: 2 lignes max).

PERSONNALISATION — SLOTS (fournis par le client)
- {aspect} = {intake} + (", " + {context} si présent).
- {sud_qualifier} ∈ {"très présente","encore présente","reste encore un peu","disparue",""} ; n'utiliser que si SUD défini.
- {round} = numéro de ronde.

ÉTAPE 4 — ÉVALUATION
- Question unique: "Peux-tu me donner ton SUD entre 0 et 10, maintenant ?"
- Tant que SUD manquant/illisible → rester à l'étape 4.

ÉTAPE 5 — SETUP
- Deux lignes exactement :
  1) "Tapote sur le Point Karaté (tranche de la main) en répétant 3 fois : « Même si j’ai cette {aspect (minuscule initiale)}, je m’accepte profondément et complètement. »"
  2) "Quand c’est fait, écris « prêt » et je te guide pour la ronde."
- Ne pas lancer la ronde dans ce message.

ÉTAPE 6 — TAPPING (RONDE)
- Lancer une ronde SEULEMENT si SUD est défini (si SUD=0 → aller directement à Clôture).
- Liste stricte des points (chaque ligne commence par "- ") :
  - Sommet de la tête (ST) — Cette {aspect}{QUALIF}.
  - Début du sourcil (DS) — Cette {aspect}{QUALIF}.
  - Coin de l’œil (CO) — Cette {aspect}{QUALIF}.
  - Sous l’œil (SO) — Cette {aspect}{QUALIF}.
  - Sous le nez (SN) — Cette {aspect}{QUALIF}.
  - Menton (MT) — Cette {aspect}{QUALIF}.
  - Clavicule (CL) — Cette {aspect}{QUALIF}.
  - Sous le bras (SB) — Cette {aspect}{QUALIF}.
  où {QUALIF} = " " + {sud_qualifier} UNIQUEMENT si SUD>0 ; sinon vide.
- Terminer par : "Quand tu as terminé cette ronde, dis-moi ton SUD (0–10). Objectif : 0."

ÉTAPE 7 — RÉÉVALUATION
- Si SUD manquant/illisible : "Peux-tu me donner ton SUD entre 0 et 10 ?"
- Si SUD > 0 : proposer une nouvelle ronde (retour étape 6), sans clore.
- Si SUD = 0 : passer à Clôture.

FORMAT DE SORTIE
- Commencer par "Étape {N} — ".
- Étapes 1–3 & 4 : une seule question.
- Étape 5 : exactement 2 lignes (voir ci-dessus).
- Étape 6 : liste à puces des 8 points + phrase SUD.
- Étape 7 : une consigne selon le cas.
- Étape 8 : message bref de clôture.
`;

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

export async function POST(req: Request) {
  try {
    const fallback: GuideRequest = {};
    const raw = await req.json().catch(() => fallback);
    const body: GuideRequest = raw && typeof raw === "object" ? (raw as GuideRequest) : fallback;

    const prompt: string = typeof body.prompt === "string" ? body.prompt : "";
    const stage: Stage = (body.stage as Stage) ?? "Intake";
    const etapeClient = Number.isFinite(body.etape) ? Number(body.etape) : stepFromStage(stage);
    const transcript: string = typeof body.transcript === "string" ? body.transcript : "";
    const slots: Slots = body.slots && typeof body.slots === "object" ? body.slots : {};

    const shortTranscript = transcript.split("\n").slice(-10).join("\n");
    const etape = Math.min(8, Math.max(1, etapeClient));

    const USER_BLOCK = `
[CONTEXTE]
- Étape demandée (1..8) : ${etape}
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

[INSTRUCTIONS]
- Génère la sortie de l'étape ${etape} en appliquant STRICTEMENT le SYSTEM ci-dessus.
`;

    const payload = {
      model: "gpt-4o-mini",
      input: `${SYSTEM}\n\n${USER_BLOCK}`,
      temperature: 0.2,
      max_output_tokens: 380,
    };

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json({ error: "Server error", detail }, { status: 500 });
    }

    const json = await res.json();
    const answer: string =
      (json as any)?.output?.[0]?.content?.[0]?.text ??
      (json as any)?.choices?.[0]?.message?.content ??
      (json as any)?.content?.[0]?.text ??
      "";

    return NextResponse.json({ answer });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Server error", detail: message }, { status: 500 });
  }
}
