// app/api/guide-eft/route.ts
import { NextResponse } from "next/server";

type GuideRequest = {
  prompt?: string;
  stage?: "Intake" | "Durée" | "Contexte" | "Setup" | "Tapping" | "Réévaluation" | "Clôture";
  etape?: number;       // 1..7
  transcript?: string;  // historique texte brut
};

const SYSTEM = `
Tu es l'assistante EFT officielle de l'École EFT France, fidèle à l'EFT de Gary Craig.
Rôle : guider pas à pas la personne à travers une séance EFT classique.

STYLE
- Chaleureux, sans jargon, neutre, bienveillant, rigoureux, tutoiement par défaut.

STRUCTURE FIXE (linéaire, sans retour en arrière)
1️⃣ Intake — Identifier le problème (localisation, qualité/ressenti).
2️⃣ Durée — Depuis quand cela dure.
3️⃣ Contexte — Circonstances/événements/émotions associés.
4️⃣ Setup — Phrase de préparation ("Même si j'ai ce problème..., je m'accepte profondément et complètement.").
5️⃣ Tapping — Séquence de tapotement guidée avec mots-clés du problème.
6️⃣ Réévaluation — SUD/0-10, ressenti actuel.
7️⃣ Clôture — Félicitations, bienveillance, prochaine étape si besoin.

RÈGLES STRICTES
- Aucune recherche ni contenu Internet.
- UNE SEULE question par message.
- Tu ne reviens JAMAIS à une étape précédente.
- Si la personne dit que tu te répètes, excuse-toi brièvement et PASSE à l'étape suivante.
- Pas de diagnostic ; si nécessaire, orientation vers professionnel de santé.
- Ne PAS adoucir, ni reformuler en positif les phrases.
- Vérifier l’intensité AVANT et APRÈS (0–10), proposer un nouveau tour si > 0.
- Si réponse vague ("ça va"), demander : "Et si tu devais mettre une valeur entre 0 et 10, ce serait combien ?"
- Ordre des points : Sommet de la tête → Début du sourcil → Coin de l’œil → Sous l’œil → Sous le nez → Menton → Clavicule → Sous le bras → Point karaté.
- Réponds en français, sans emojis.
- Toujours rappeler le cadre : l’EFT ne remplace pas un avis médical ; consulter si douleur persistante/alarmante.


FORMAT IMPÉRATIF
- Commence TOUJOURS par : "Étape {N} — " (N ∈ {1..7}).
- Puis UNE question (ou instruction unique si Setup/Tapping/Clôture).
`;

function stepFromStage(stage: GuideRequest["stage"]): number {
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
    const stage: GuideRequest["stage"] = body.stage ?? "Intake";
    const etapeClient = Number.isFinite(body.etape) ? Number(body.etape) : stepFromStage(stage);
    const transcript = typeof body.transcript === "string" ? body.transcript : "";

    // Mémoire courte : on ne garde que ~10 dernières lignes
    const shortTranscript = transcript.split("\n").slice(-10).join("\n");

    // L’étape attendue est celle du client, mais bornée 1..7
    const etape = Math.min(7, Math.max(1, etapeClient));

    const USER_BLOCK = `
[CONTEXTE SESSION]
- Stade actuel (linéaire, sans retour): ${stage}
- Étape attendue (1..7): ${etape}
- Historique (extrait court):
${shortTranscript || "(vide)"}

[DERNIER MESSAGE UTILISATEUR]
${prompt}

[FORMAT À RESPECTER]
Réponds MAINTENANT avec UNE SEULE question (ou instruction unique quand approprié),
au format exact :
"Étape ${etape} — …"
Ne reviens pas à une étape précédente. Si une question semble déjà posée/répondue,
avance à l’étape suivante dans l’esprit de la structure ci-dessus.
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
