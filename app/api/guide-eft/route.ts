import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Types stricts pour la réponse OpenAI
interface OAChatMessage { content: string }
interface OAChatChoice { message: OAChatMessage }
interface OAResponse { choices: OAChatChoice[] }

// Vérifications de type
function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === "object" && u !== null;
}
function isOAResponse(u: unknown): u is OAResponse {
  if (!isRecord(u)) return false;
  const choices = u["choices"];
  if (!Array.isArray(choices) || choices.length === 0) return false;
  const first = choices[0];
  if (!isRecord(first)) return false;
  const msg = (first as Record<string, unknown>)["message"];
  if (!isRecord(msg)) return false;
  const content = (msg as Record<string, unknown>)["content"];
  return typeof content === "string";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body?.history) ? body.history : [];

    // 🔹 Brief EFT rigoureux
    const system =
      typeof body?.system === "string"
        ? body.system
        : [
            "Tu es un guide EFT strictement aligné avec la méthode de Gary Craig.",
            "Règles impératives :",
            "- Pas d’inductions positives ni d’affirmations valorisantes AU DÉBUT.",
            "- Rester neutre et spécifique (« cette douleur au dos », « ce tiraillement côté droit… »).",
            "- Protocoles : phrase de départ (revers psychologique) sur point Karaté, puis phrase-rappel courte sur chaque point.",
            "- Toujours demander la mesure d’intensité (SUD 0–10) avant et après une ou deux rondes.",
            "- Traiter UN ASPECT À LA FOIS (qualité de la douleur, localisation, déclencheur, émotion liée…).",
            "- NE PAS proposer de reframes/positifs tant que SUD > 2.",
            "- Si SUD stagne : tester inversion psychologique, changement d’aspect, formulation plus spécifique, ou événement-cible.",
            "- Rappeler que l’EFT ne remplace pas un avis médical et inviter à consulter si douleur persistante ou alarmante.",
            "Format attendu :",
            "1) Clarification rapide (spécificité + SUD).",
            "2) Phrase de départ (neutre/acceptation) x3 sur point Karaté.",
            "3) Séquence des points avec phrase-rappel neutre (pas de positif).",
            "4) Réévaluation SUD et choix de l’aspect suivant.",
            "5) Répéter. Reframes éventuels UNIQUEMENT quand SUD ≤ 2.",
          ].join("\n");

    if (!message) {
      return NextResponse.json({ error: "Champ 'message' requis." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API manquante côté serveur." }, { status: 500 });
    }

    const messages = [
      { role: "system", content: system },
      ...history,
      { role: "user", content: message },
    ];

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.2, // 🔹 ton neutre, pas de dérive positive
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        { error: "Service indisponible", code: upstream.status, details: text },
        { status: 502 }
      );
    }

    const raw: unknown = await upstream.json();
    if (!isOAResponse(raw)) {
      return NextResponse.json({ error: "Format de réponse inattendu." }, { status: 502 });
    }

    const answer = raw.choices[0].message.content.trim();
    if (!answer) {
      return NextResponse.json({ error: "Réponse vide du modèle." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, answer });
  } catch (error: unknown) {
    console.error("[guide-eft] route error:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

