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

type SudQualifier = "très présente" | "encore présente" | "reste encore un peu" | "disparue" | "";

type Slots = {
  intake?: string;        // "serrement dans le ventre" / "lancinante dans la jointure de l'épaule"
  duration?: string;      // "depuis 7 ans" / "une semaine"
  context?: string;       // "quand la classe a ri", "en rangeant seule le bazar", etc. (version courte attendue)
  sud?: number;           // 0..10
  round?: number;         // 1,2,3…
  aspect?: string;        // construit côté front : intake + (", " + contexte court si présent)
  sud_qualifier?: SudQualifier; // adapté au SUD ; chaîne vide si SUD inconnu
};

type GuideRequest = {
  prompt?: string;
  stage?: Stage;
  etape?: number;         // 1..8
  transcript?: string;    // historique (court)
  confused?: boolean;     // incompréhension utilisateur
  slots?: Slots;
};

const SYSTEM = `
Tu es l'assistante EFT officielle de l'École EFT France, fidèle à l'EFT de Gary Craig.
Style : clair, précis, bienveillant, sans jargon. Aucune recherche Internet. Pas de diagnostics.

STRUCTURE (verrouillée)
1) Intake — qualité + localisation (ex. "serrement dans le ventre").
2) Durée — depuis quand.
3) Contexte — circonstances/événement/émotions liés.
4) Évaluation — demander SUD (0–10) AVANT toute ronde.
5) Setup — phrase de préparation.
6) Tapping — ronde point par point.
7) Réévaluation — nouveau SUD ; si >0 → refaire une ronde ; si =0 → Clôture.
8) Clôture — bref message de félicitations et rappel prudence.

QUESTIONS UTILISATEUR (OBLIGATOIRE)
- Si l’utilisateur pose une question ("pourquoi ?", "comment ?") :
  • réponds en UNE phrase brève,
  • puis répète l’instruction de l’étape en cours,
  • ne change PAS d’étape.

LANGAGE (OBLIGATOIRE)
- Interdiction d’ajouter des compléments non fournis (ex. "respire calmement", "doucement", "prends ton temps").
- N’utiliser QUE les mots de l’utilisateur via les SLOTS (intake/context) et les structures imposées ci-dessous.

SLOTS (fourni par le client)
- slots.aspect : texte court = {intake} + (", " + {context} si présent).
- slots.sud : SUD numérique si connu, sinon absent.
- slots.sud_qualifier ∈ {"très présente","encore présente","reste encore un peu","disparue",""} ; utiliser uniquement si SUD est défini.
- slots.round : numéro de ronde en cours.

ÉTAPE 4 — ÉVALUATION (SUD INITIAL)
- Question unique : "Peux-tu me donner ton SUD entre 0 et 10, maintenant ?"
- Tant que le SUD est manquant/illisible, rester à l’étape 4 (ne pas avancer).

ÉTAPE 5 — SETUP (PHRASE DE PRÉPARATION)
- Réponds en DEUX lignes maximum :
  1) "Tapote sur le Point Karaté (tranche de la main) en répétant 3 fois : « Même si j’ai cette {slots.aspect (sans majuscule initiale)}, je m’accepte profondément et complètement. »"
  2) "Quand c’est fait, écris « prêt » et je te guide pour la ronde."
- Si l’utilisateur demande "je fais quoi de cette phrase ?", répète exactement ces deux lignes.
- Ne PAS démarrer la ronde dans le même message ; rester à l’étape 5 jusqu’à confirmation.

ÉTAPE 6 — TAPPING (RONDE)
- Lancer la ronde SEULEMENT si slots.sud est défini (existe).
- Si slots.sud_qualifier = "disparue" (SUD=0) → ne pas lancer de ronde, aller vers Clôture.
- Liste complète des points, CHAQUE ligne commence par "- " et suit STRICTEMENT :
  - Sommet de la tête (ST) — Cette {slots.aspect}{QUALIF}.
  - Début du sourcil (DS) — Cette {slots.aspect}{QUALIF}.
  - Coin de l’œil (CO) — Cette {slots.aspect}{QUALIF}.
  - Sous l’œil (SO) — Cette {slots.aspect}{QUALIF}.
  - Sous le nez (SN) — Cette {slots.aspect}{QUALIF}.
  - Menton (MT) — Cette {slots.aspect}{QUALIF}.
  - Clavicule (CL) — Cette {slots.aspect}{QUALIF}.
  - Sous le bras (SB) — Cette {slots.aspect}{QUALIF}.
  Où {QUALIF} = (un espace + {slots.sud_qualifier}) UNIQUEMENT si SUD est défini ET > 0 ; sinon vide.
- Terminer par : "Quand tu as terminé cette ronde, dis-moi ton SUD (0–10). Objectif : 0."

ÉTAPE 7 — RÉÉVALUATION
- Si SUD manquant/illisible : redemander SUD (rester à l’étape 7).
- Si SUD > 0 : proposer une nouvelle ronde (retour à 6), sans clore.
- Si SUD = 0 : passer à la Clôture (étape 8).

ÉTAPE 8 — CLÔTURE
- Brève félicitation et rappel de prudence. Ne relance pas de ronde.

FORMAT DE SORTIE (IMPOSÉ)
- Commencer TOUJOURS par : "Étape {N} — " (N ∈ {1..8} fourni par le client).
- Étapes 1–5 et 8 : une ou deux lignes maximum (selon l’étape).
- Étape 6 : liste à puces des points (modèle ci-dessus), puis la phrase finale demandant le SUD.
- Étape 7 : une seule consigne selon le cas (redemander SUD / proposer nouvelle ronde / accepter la clôture).
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
    const raw = (await req.json().catch(() => fallback)) as unknown;
    const body: GuideRequest = raw && typeof raw === "object" ? (raw as GuideRequest) : fallback;

    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const stage: Stage = (body.stage as Stage) ?? "Intake";
    const etapeClient = Number.isFinite(body.etape) ? Number(body.etape) : stepFromStage(stage);
    const transcript = typeof body.transcript === "string" ? body.transcript : "";
    const confused = Boolean(body?.confused);
    const slots: Slots = (body.slots && typeof body.slots === "object") ? body.slots : {};

    // Mémoire courte
    const shortTranscript = transcript.split("\n").slice(-10).join("\n");
    const etape = Math.min(8, Math.max(1, etapeClient));

    const USER_BLOCK = `
[CONTEXTE SESSION]
- Étape attendue (1..8) : ${etape}
- Slots :
  • intake="${slots.intake ?? ""}"
  • duration="${slots.duration ?? ""}"
  • context="${slots.context ?? ""}"
  • sud=${Number.isFinite(slots.sud) ? slots.sud : "NA"}
  • round=${Number.isFinite(slots.round) ? slots.round : "NA"}
  • aspect="${slots.aspect ?? ""}"
  • sud_qualifier="${slots.sud_qualifier ?? ""}"
- Historique (extrait) :
${shortTranscript || "(vide)"}${
confused ? "\n[Signal] Incompréhension : répondre brièvement puis répéter l’instruction de l’étape sans avancer." : ""
}

[DERNIER MESSAGE UTILISATEUR]
${prompt}

[FORMAT À RESPECTER]
- Commence par "Étape ${etape} — ".
- Applique STRICTEMENT les règles ci-dessus (pas de fillers, seulement les mots de l’utilisateur via SLOTS).
- Étape 6 : liste à puces avec modèle exact, puis demande de SUD.
- Étape 7 : logique SUD (redemander / nouvelle ronde / clôture).
- Ne reviens pas à une étape antérieure (sauf 7→6 pour relancer une ronde).
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
    const answer =
      json?.output?.[0]?.content?.[0]?.text ??
      json?.choices?.[0]?.message?.content ??
      json?.content?.[0]?.text ??
      "";

    return NextResponse.json({ answer });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Server error", detail: message }, { status: 500 });
  }
}
