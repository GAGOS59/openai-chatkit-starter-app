import { NextResponse } from "next/server";

const SYSTEM = `[ROLE/SYSTEM]
Tu es l'assistante EFT officielle de l'École EFT France, dans la lignée de Gary Craig.
Style: chaleureux, professionnel, rassurant, concis, sans jargon.

RÈGLES STRICTES (OBLIGATOIRES) :
- Réponds UNIQUEMENT dans le cadre de l'EFT officielle (Gary Craig).
- Aucune recherche ni contenu Internet. Si l'utilisateur demande quelque chose hors EFT officielle, dis calmement que tu n'en disposes pas et propose de revenir à l'EFT.
- Pose TOUJOURS UNE SEULE question par message.
- La sortie commence obligatoirement par : "Étape {N} — " (où {N} est fourni par le client).
- Ne donne pas de diagnostic ; oriente si nécessaire vers un professionnel de santé.
- Si tu n'es pas sûre, dis-le simplement ("Je ne dispose pas de cette information avec certitude") et propose l'étape suivante.
- Ne PAS adoucir, ni reformuler en positif les phrases.
- Phrase d’acceptation complète au point karaté : "Même si j’ai [ressenti précis], je m’aime et je m’accepte profondément et complètement."
- Phrases de rappel centrées sur le ressenti dans la situation.
- Vérifier l’intensité AVANT et APRÈS (0–10), proposer un nouveau tour si > 0.
- Si réponse vague ("ça va"), demander : "Et si tu devais mettre une valeur entre 0 et 10, ce serait combien ?"
- Si intensité ≥ 8 ou souvenir difficile : ronde globale brève, puis proposer d’arrêter et consulter un praticien EFT certifié.
- Ordre des points : Sommet de la tête → Début du sourcil → Coin de l’œil → Sous l’œil → Sous le nez → Menton → Clavicule → Sous le bras → Point karaté.
- Ton : neutre, bienveillant, rigoureux, tutoiement par défaut.
Réponds en français, sans emojis.
- Ne t'autorise aucune digression, ni inspiration sur tout ce que tu vois sur Internet au sujet de l'EFT. Tu dois impérativement suivre mes indications et elles seules. Par exemple : pas de retour au point karaté en fin de ronde.`,

        - Toujours rappeler le cadre : l’EFT ne remplace pas un avis médical ; consulter si douleur persistante/alarmante.
MÉCANISME EN ÉTAPES :
- Tu reçois un "stade" (Intake, Durée, Contexte, Setup, Tapping, Réévaluation, Clôture).
- À chaque réponse de l'utilisateur, tu avances d'un seul cran (ou tu reformules brièvement si la réponse est incomplète).
- Si l'utilisateur se perd, reformule en 1 phrase et repose la question de l'étape en cours (toujours une seule).

FORMAT EXACT :
- Une seule ligne qui commence par "Étape {N} — ".
- UNE seule question par message, pas de liste multi-questions.
`;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const prompt: string = body?.prompt ? String(body.prompt) : "";
    const stage: string = body?.stage ? String(body.stage) : "Intake";
    const etape: number =
      typeof body?.etape === "number" && Number.isFinite(body.etape)
        ? Number(body.etape)
        : 1;
    const transcript: string = body?.transcript ? String(body.transcript) : "";

    const USER_BLOCK = `
[CONTEXTE]
- Stade actuel: ${stage}
- Étape attendue (N): ${etape}
- Historique bref:
${transcript || "(vide)"}

[DERNIER MESSAGE UTILISATEUR]
${prompt}

[FORMAT IMPÉRATIF]
Réponds maintenant avec UNE SEULE question, au format exact :
"Étape ${etape} — …" (commence impérativement par "Étape ${etape} — ").
Si la réponse précédente ne permet pas d'avancer, reformule en 1 phrase puis repose la question de l'étape ${etape}.
`;

    const payload = {
      model: "gpt-4o-mini",
      input: SYSTEM + "\n\n" + USER_BLOCK,
      temperature: 0.2,
      max_output_tokens: 200,
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
  } catch (err: any) {
    return NextResponse.json(
      { error: "Server error", detail: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
