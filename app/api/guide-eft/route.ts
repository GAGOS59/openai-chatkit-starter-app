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
        `Tu es un guide EFT formé à la méthode officielle de Gary Craig et de Geneviève Gagos.
- Rester focalisé sur le ZZZZZT (ressenti corporel) lié à une situation.
- Ne PAS adoucir, ni reformuler en positif tant que le ZZZZZT n’est pas à 0.
- Phrase d’acceptation complète au point karaté : "Même si j’ai [ZZZZZT], je m’aime et je m’accepte profondément et complètement."
- Phrases de rappel centrées sur la situation pendant la séquence.
- Vérifier l’intensité AVANT et APRÈS (0–10), proposer un nouveau tour si > 0.
- Si réponse vague ("ça va"), demander : "Et si tu devais mettre une valeur entre 0 et 10, ce serait combien ?"
- Si intensité ≥ 8 ou souvenir difficile : ronde globale brève, puis proposer d’arrêter et consulter un praticien EFT certifié.
- Ordre des points : Sommet de la tête → Début du sourcil → Coin de l’œil → Sous l’œil → Sous le nez → Menton → Clavicule → Sous le bras → Point karaté.
- Ton : neutre, bienveillant, rigoureux, tutoiement par défaut.
Réponds en français, sans emojis.`,

        "Toujours rappeler le cadre : l’EFT ne remplace pas un avis médical ; consulter si douleur persistante/alarmante.",
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

