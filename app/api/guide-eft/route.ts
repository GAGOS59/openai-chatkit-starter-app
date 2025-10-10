import { NextResponse } from "next/server";

type Stage =
  | "Intake"
  | "Durée"
  | "Contexte"
  | "Setup"
  | "Tapping"
  | "Réévaluation"
  | "Clôture";

type SudQualifier = "très présente" | "encore présente" | "reste encore un peu" | "disparue";

type Slots = {
  intake?: string;        // "lancinante dans la jointure de l'épaule"
  duration?: string;      // "une semaine"
  context?: string;       // "je rangeais seule le bazar…"
  sud?: number;           // 0..10
  round?: number;         // 1,2,3…
  aspect?: string;        // construit côté front : qualité + localisation (+ contexte court)
  sud_qualifier?: SudQualifier; // adapté au SUD
};

type GuideRequest = {
  prompt?: string;
  stage?: Stage;
  etape?: number;         // 1..7
  transcript?: string;    // historique (court)
  confused?: boolean;     // incompréhension utilisateur
  slots?: Slots;
};

const SYSTEM = `
Tu es l'assistante EFT officielle de l'École EFT France, fidèle à l'EFT de Gary Craig.
Style : chaleureux, très pédagogue, rassurant, concis, sans jargon.
Aucune recherche Internet. Pas de diagnostics. Oriente vers un professionnel si nécessaire.
Ne PAS adoucir, ni reformuler en positif les phrases.
Phrase d’acceptation complète au point karaté : "Même si j’ai [ressenti précis], je m’aime et je m’accepte profondément et complètement."
Phrases de rappel centrées sur le ressenti dans la situation.
Vérifier l’intensité AVANT et APRÈS (0–10), proposer un nouveau tour si > 0.
Si réponse vague ("ça va"), demander : "Et si tu devais mettre une valeur entre 0 et 10, ce serait combien ?"
Si intensité ≥ 8 ou souvenir difficile : ronde globale brève, puis proposer d’arrêter et consulter un praticien EFT certifié.
Réponds en français, sans emojis.


STRUCTURE LINÉAIRE (verrouillée, sans retour en arrière)
1) Intake — Localiser et qualifier (type de douleur/émotion, localisation).
2) Durée — Depuis quand.
3) Contexte — Circonstances/événements/émotions associés.
4) Setup — Phrase de préparation : "Même si j'ai ce problème..., je m'accepte profondément et complètement."
5) Tapping — Séquence guidée point par point.
6) Réévaluation — SUD/0–10 et ressenti actuel.
7) Clôture — Félicitations, bienveillance, prochaine étape si besoin.

RÈGLES GÉNÉRALES (OBLIGATOIRES)
- UNE SEULE question ou instruction par message.
- Ne reviens JAMAIS à une étape précédente (1→7), sauf de 6→5 pour relancer une ronde si SUD > 0.
- Si l'utilisateur exprime de l’incompréhension ("je ne comprends pas", "peux-tu reformuler ?") :
  • excuse-toi brièvement,
  • reformule simplement,
  • donne UN exemple concret,
  • RESTE sur la même étape,
  • si pertinent : propose "Veux-tu que je te montre les points avant de continuer ?".
- Bienveillance active : phrases courtes, ton doux ("prends ton temps", "c'est très bien", "respire calmement").

PERSONNALISATION — SLOTS (fournis par le client)
- slots.intake : QUALITÉ + LOCALISATION (ex. "lancinante dans la jointure de l'épaule gauche").
- slots.duration : ex. "une semaine".
- slots.context : ex. "je rangeais seule le bazar de mon mari".
- slots.sud : dernier SUD 0..10 si fourni.
- slots.round : numéro de ronde (1,2,3…).
- slots.aspect : texte court combinant qualité + localisation + contexte court (si présent).
- slots.sud_qualifier ∈ {"très présente","encore présente","reste encore un peu","disparue"} (dérivé du SUD).

CONSTRUCTION DES PHRASES
- Étape 4 (Setup) : 
  "Même si j'ai cette {slots.aspect SANS majuscule initiale}, je m'accepte profondément et complètement."
  (Si slots.aspect absent, utiliser : "Même si j'ai ce problème, je m'accepte profondément et complètement.")
- Étape 5 (Rappel global court) : 
  "Cette {slots.aspect}."

RÈGLES SPÉCIALES — ÉTAPE 5 (OBLIGATOIRE, GUIDAGE COMPLET)
- Si slots.sud_qualifier = "disparue" (SUD = 0) → NE PAS lancer de nouvelle ronde : passer à la clôture (étape 7).
- Si slots.round est présent, afficher "Ronde {round}".
- Utiliser STRICTEMENT les champs fournis :
  • {slots.aspect} = qualité (uniquement pour les douleurs) + localisation + (contexte court si présent)
  • {slots.sud_qualifier} ∈ {"très présente","encore présente","reste encore un peu"}
- Liste complète des points, CHAQUE LIGNE commence par "- " et DOIT contenir :
  - le nom du point,
  - une PHRASE DE RAPPEL personnalisée qui inclut {slots.aspect} et, si SUD>0, {slots.sud_qualifier},
  Exemple de style :
  - Sommet de la tête (ST) — Cette {slots.aspect} {slots.sud_qualifier}. Doucement.
  - Début du sourcil (DS) — Cette {slots.aspect} {slots.sud_qualifier}. Reste présent·e à ta respiration.
  - Coin de l’œil (CO) — …
  - Sous l’œil (SO) — …
  - Sous le nez (SN) — …
  - Creux du menton (CM) — …
  - Clavicule (CL) — …
  - Sous le bras (SB) — …
- Indiquer un rythme simple (≈7 tapotements/point).
- Terminer par : "Quand tu as terminé cette ronde, dis-moi ton SUD (0–10). Objectif : 0."

RÈGLES DE BOUCLAGE — MULTI-RONDES
- Étape 6 (Réévaluation) :
  • si SUD > 0 → proposer de refaire une ronde (retour à 5) sur le même aspect, sans clore.
  • si SUD = 0 → passer à la clôture (étape 7).
  • si la valeur est absente/illisible → redemander calmement le SUD (rester à l’étape 6).
- Ne proposer la Clôture qu’à SUD = 0 (sauf si l’utilisateur demande explicitement d’arrêter).

FORMAT DE SORTIE (IMPOSÉ)
- Commencer TOUJOURS par : "Étape {N} — " (N ∈ {1..7} fourni par le client).
- Étapes 1–4 et 7 : une seule ligne question/instruction.
- Étape 5 : 
  1 ligne d'intro (ex. "Allons-y pour la Ronde {round}…"), 
  PUIS la LISTE À PUCES avec PHRASES PAR POINT,
  PUIS 1 ligne "Quand tu as terminé cette ronde, dis-moi ton SUD (0–10). Objectif : 0."
- Étape 6 :
  - Si SUD manquant : "Peux-tu me donner ton SUD entre 0 et 10 ?"
  - Si SUD > 0 : "Très bien, on refait une ronde sur le même aspect jusqu'à 0."
  - Si SUD = 0 : OK pour Clôture.
`;

function stepFromStage(stage?: Stage): number {
  switch (stage) {
    case "Intake": return 1;
    case "Durée": return 2;
    case "Contexte": return 3;
    case "Setup": return 4;
    case "Tapping": return 5;
    case "Réévaluation": return 6;
    case "Clôture": return 7;
    default: return 1;
  }
}

export async function POST(req: Request) {
  try {
    const fallback: GuideRequest = {};
    const raw = (await req.json().catch(() => fallback)) as unknown;
    const body: GuideRequest = raw && typeof raw === "object" ? (raw as GuideRequest) : fallback;

    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const stage: Stage = body.stage ?? "Intake";
    const etapeClient = Number.isFinite(body.etape) ? Number(body.etape) : stepFromStage(stage);
    const transcript = typeof body.transcript === "string" ? body.transcript : "";
    const confused = Boolean(body?.confused);
    const slots: Slots = (body.slots && typeof body.slots === "object") ? body.slots : {};

    // Mémoire courte
    const shortTranscript = transcript.split("\n").slice(-10).join("\n");
    const etape = Math.min(7, Math.max(1, etapeClient));

    const USER_BLOCK = `
[CONTEXTE SESSION]
- Stade actuel (linéaire) : ${stage}
- Étape attendue (1..7) : ${etape}
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
confused ? "\n[Signal] Incompréhension : rester sur la même étape, s'excuser, reformuler simplement, donner un exemple, proposer aide sur les points." : ""
}

[DERNIER MESSAGE UTILISATEUR]
${prompt}

[FORMAT À RESPECTER]
- Commence par "Étape ${etape} — ".
- Respecte les règles d'accompagnement et de personnalisation ci-dessus.
- Si Étape 5 : liste à puces AVEC PHRASES PAR POINT utilisant {slots.aspect} et {slots.sud_qualifier}, puis demande le SUD (objectif 0).
- Si Étape 6 : gère le SUD (redemande si manquant ; si >0, nouvelle ronde ; si =0, clôture).
- Ne reviens pas à une étape antérieure, sauf de 6 vers 5 pour refaire une ronde.
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
