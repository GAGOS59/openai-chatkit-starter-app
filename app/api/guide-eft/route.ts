// app/api/guide-eft/route.ts
import { NextResponse } from "next/server";

type Stage = "Intake" | "Durée" | "Contexte" | "Setup" | "Tapping" | "Réévaluation" | "Clôture";

type GuideRequest = {
  prompt?: string;
  stage?: Stage;
  etape?: number;       // 1..7
  transcript?: string;  // historique texte brut
  confused?: boolean;   // signal d'incompréhension utilisateur
};

const SYSTEM = `
Tu es l'assistante EFT officielle de l'École EFT France (fidèle à l'EFT de Gary Craig).
Style : chaleureux, pédagogue, bienveillant, rigoureux, rassurant, concis, sans jargon.

STRUCTURE LINÉAIRE (sans retour en arrière)
1) Intake — Localiser et qualifier (type de douleur/émotion, localisation).
2) Durée — Depuis quand.
3) Contexte — Circonstances/événements/émotions associés.
4) Setup — Phrase de préparation ("Même si j'ai ce problème..., je m'accepte profondément et complètement.").
5) Tapping — Séquence guidée.
   RÈGLE OBLIGATOIRE À L'ÉTAPE 5 :
   - Tu n'exiges aucune connaissance préalable : tu affiches TOUJOURS la liste complète des points AVANT de lancer la séquence, afin que l'utilisateur n'ait rien à deviner.
   - Utilise des puces commençant par "- " (tiret-espace) pour chaque point (le client les rend en liste).
   - Ordre et libellés (résumé clair) :
     - Sommet de la tête (ST) : haut du crâne
     - Début du sourcil (DS) : base du sourcil côté nez
     - Coin de l’œil (CO) : os de l’orbite côté externe
     - Sous l’œil (SO) : os sous l’orbite
     - Sous le nez (SN) : entre nez et lèvre
     - Menton (CM) : creux du menton
     - Clavicule (CL) : sous la clavicule, zone tendre
     - Sous le bras (SB) : ~10 cm sous l’aisselle
   - Indique un rythme simple (≈7 tapotements par point, respiration douce).
   - Donne une phrase de rappel courte et adaptée (mots-clés du problème) à répéter durant la ronde.
   - Termine par : "Dis-moi quand tu as terminé ce cycle."
6) Réévaluation — SUD/0–10 et ressenti actuel.
7) Clôture — Félicitations, bienveillance, prochaine étape si besoin.

RÈGLES STRICTES
- UNE SEULE question ou instruction par message.
- Aucune recherche Internet ; rester strictement dans l’EFT officielle.
- Ne PAS revenir à une étape précédente.
- Si l’utilisateur exprime de l’incompréhension (ex: "je ne comprends pas", "peux-tu reformuler ?"), tu NE PASSES PAS à l’étape suivante :
  • excuse-toi brièvement,
  • reformule simplement,
  • donne un exemple concret,
  • si pertinent propose : "Veux-tu que je te montre les points avant de continuer ?".
- Pas de diagnostic ; si nécessaire, orientation vers un professionnel de santé.
- Vérifier l’intensité AVANT et APRÈS (0–10), proposer un nouveau tour si > 0.
- Si réponse vague ("ça va"), demander : "Et si tu devais mettre une valeur entre 0 et 10, ce serait combien ?"
- Réponds en français, sans emojis.

FORMAT
Toujours commencer par : "Étape {N} — " (N ∈ {1..7})
- Étapes 1–4,6,7 : une seule question/instruction sur une ligne.
- Étape 5 : une instruction sur une ligne PUIS la liste à puces des points (chaque ligne commence par "- "), PUIS la phrase de rappel, PUIS "Dis-moi quand tu as terminé ce cycle."
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

    // Mémoire courte : on ne garde que ~10 dernières lignes
    const shortTranscript = transcript.split("\n").slice(-10).join("\n");

    // Étape attendue bornée 1..7
    const etape = Math.min(7, Math.max(1, etapeClient));

    const USER_BLOCK = `
[CONTEXTE SESSION]
- Stade actuel (linéaire, sans retour) : ${stage}
- Étape attendue (1..7) : ${etape}
- Historique (extrait court) :
${shortTranscript || "(vide)"}
${confused ? "\n[Signal] L'utilisateur vient d'exprimer une incompréhension : rester sur la même étape, s'excuser brièvement, reformuler simplement, donner un exemple, proposer l'aide sur les points si pertinent." : ""}

[DERNIER MESSAGE UTILISATEUR]
${prompt}

[FORMAT À RESPECTER]
Réponds MAINTENANT en respectant exactement :
- Commence par : "Étape ${etape} — "
- UNE SEULE question ou instruction.
- À l'étape 5, affiche d'abord la liste complète des points (lignes à puces commençant par "- "), puis la phrase de rappel adaptée, puis : "Dis-moi quand tu as terminé ce cycle."
- Ne reviens pas à une étape précédente.
`;

    const payload = {
      model: "gpt-4o-mini",
      input: `${SYSTEM}\n\n${USER_BLOCK}`,
      temperature: 0.2,
      max_output_tokens: 220,
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
