import { NextResponse } from "next/server";

type Stage =
  | "Intake"
  | "Durée"
  | "Contexte"
  | "Setup"
  | "Tapping"
  | "Réévaluation"
  | "Clôture";

type Slots = {
  intake?: string;   // ex: "lancinante dans la jointure de l'épaule gauche"
  duration?: string; // ex: "une semaine"
  context?: string;  // ex: "je rangeais toute seule le bazar de mon mari"
};

type GuideRequest = {
  prompt?: string;
  stage?: Stage;
  etape?: number;       // 1..7
  transcript?: string;  // historique texte brut
  confused?: boolean;   // signal d'incompréhension
  slots?: Slots;
};

const SYSTEM = `
Tu es l'assistante EFT officielle de l'École EFT France, fidèle à l'EFT de Gary Craig.
Style : chaleureux, pédagogue, rassurant, concis, sans jargon.
Aucune recherche Internet. Pas de diagnostics. Oriente vers un professionnel si nécessaire.

STRUCTURE LINÉAIRE (verrouillée, sans retour en arrière)
1) Intake — Localiser et qualifier (type de douleur/émotion, localisation).
2) Durée — Depuis quand.
3) Contexte — Circonstances/événements/émotions associés.
4) Setup — Phrase de préparation : "Même si j'ai ce problème..., je m'accepte profondément et complètement."
5) Tapping — Séquence guidée.
6) Réévaluation — SUD/0–10 et ressenti actuel.
7) Clôture — Félicitations, bienveillance, prochaine étape si besoin.

RÈGLES GÉNÉRALES (OBLIGATOIRES)
- UNE SEULE question ou instruction par message.
- Ne reviens JAMAIS à une étape précédente.
- Si l'utilisateur exprime de l'incompréhension ("je ne comprends pas", "peux-tu reformuler ?") :
  • excuse-toi brièvement,
  • reformule simplement,
  • donne UN exemple concret,
  • RESTE sur la même étape (ne pas avancer),
  • si pertinent : propose "Veux-tu que je te montre les points avant de continuer ?".
- Bienveillance active : langage simple, pas d’injonctions sèches.
- Ne PAS adoucir, ni reformuler en positif les phrases.
- Phrase d’acceptation complète au point karaté : "Même si j’ai [ressenti précis], je m’aime et je m’accepte profondément et complètement."
- Phrases de rappel centrées sur le ressenti dans la situation.
- Vérifier l’intensité AVANT et APRÈS (0–10), proposer un nouveau tour si > 0.
- Si réponse vague ("ça va"), demander : "Et si tu devais mettre une valeur entre 0 et 10, ce serait combien ?"
- Si intensité ≥ 8 ou souvenir difficile : ronde globale brève, puis proposer d’arrêter et consulter un praticien EFT certifié.
- Réponds en français, sans emojis.
- Toujours rappeler le cadre : l’EFT ne remplace pas un avis médical ; consulter si douleur persistante/alarmante.


PERSONNALISATION À PARTIR DES SLOTS (fournis par le client)
- \`slots.intake\` : texte libre sur QUALITÉ + LOCALISATION (ex. "lancinante dans la jointure de l'épaule gauche").
- \`slots.duration\` : ex. "une semaine".
- \`slots.context\` : ex. "je rangeais toute seule le bazar de mon mari".
- EXTRACTEURS (interne) depuis \`slots.intake\` :
  • QUALITÉ (ex. "lancinante", "aiguë", "sourde")
  • LOCALISATION (ex. "dans la jointure de l'épaule", "à l'épaule gauche")
- Construction obligatoire des phrases :
  • Étape 4 (Setup) : "Même si j'ai cette [QUALITÉ] [LOCALISATION]{CONTEXT_OPT}, je m'accepte profondément et complètement."
      où {CONTEXT_OPT} = ", liée à [contexte]" si \`slots.context\` est présent, sinon vide.
  • Étape 5 (Rappel) : "Cette [QUALITÉ] [LOCALISATION]{CONTEXT_SHORT}."
      où {CONTEXT_SHORT} = ", [résumé très court du contexte]" si \`slots.context\` est présent (ex. ", en rangeant seule le bazar"), sinon vide.

RÈGLES SPÉCIALES — ÉTAPE 5 (OBLIGATOIRE)
- Avant la séquence, affiche TOUJOURS la liste complète des points, sous forme de puces commençant par "- " :
  - Sommet de la tête (ST) : haut du crâne
  - Début du sourcil (DS) : base du sourcil côté nez
  - Coin de l’œil (CO) : os de l’orbite côté externe
  - Sous l’œil (SO) : os sous l’orbite
  - Sous le nez (SN) : entre nez et lèvre
  - Menton (MT) : creux du menton
  - Clavicule (CL) : sous la clavicule, zone tendre
  - Sous le bras (SB) : ~10 cm sous l’aisselle
- Indique un rythme simple (≈7 tapotements par point, respiration douce).
- Donne la PHRASE DE RAPPEL personnalisée (voir ci-dessus).
- Termine par : "Dis-moi quand tu as terminé ce cycle."

FORMAT DE SORTIE (IMPOSÉ)
- Commence TOUJOURS par : "Étape {N} — " (N ∈ {1..7} reçu du client).
- Étapes 1–4,6,7 : une seule ligne question/instruction.
- Étape 5 : 1 ligne d’instruction + LISTE À PUCES des points + 1 ligne **phrase de rappel personnalisée** + 1 ligne "Dis-moi quand tu as terminé ce cycle.".
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

    // Mémoire courte : ~10 dernières lignes
    const shortTranscript = transcript.split("\n").slice(-10).join("\n");
    const etape = Math.min(7, Math.max(1, etapeClient));

    const USER_BLOCK = `
[CONTEXTE SESSION]
- Stade actuel (linéaire, sans retour) : ${stage}
- Étape attendue (1..7) : ${etape}
- Historique (extrait court) :
${shortTranscript || "(vide)"}
- SLOTS fournis :
  • intake: ${slots.intake ?? "(vide)"} 
  • duration: ${slots.duration ?? "(vide)"} 
  • context: ${slots.context ?? "(vide)"}
${confused ? "\n[Signal] L'utilisateur vient d'exprimer une incompréhension : rester sur la même étape, s'excuser brièvement, reformuler simplement, donner un exemple, et proposer l'aide sur les points si pertinent." : ""}

[DERNIER MESSAGE UTILISATEUR]
${prompt}

[FORMAT À RESPECTER]
Réponds MAINTENANT en respectant exactement :
- Commence par : "Étape ${etape} — "
- UNE SEULE question ou instruction.
- À l'étape 4 et 5, compose les phrases (préparation/rappel) à partir des SLOTS (qualité + localisation extraites de \`slots.intake\`, et contexte si présent).
- À l'étape 5, affiche d'abord la liste complète des points (puces "- "), puis la phrase de rappel personnalisée, puis : "Dis-moi quand tu as terminé ce cycle."
- Ne reviens pas à une étape précédente.
`;

    const payload = {
      model: "gpt-4o-mini",
      input: `${SYSTEM}\n\n${USER_BLOCK}`,
      temperature: 0.2,
      max_output_tokens: 280,
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
