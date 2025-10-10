import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Types minimaux pour lire la réponse OpenAI
type OAChatMessage = { content: string };
type OAChatChoice = { message: OAChatMessage };
type OAResponse = { choices: OAChatChoice[] };

// Petits helpers de garde de type (sans `any`)
function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === "object" && u !== null;
}
function isOAResponse(u: unknown): u is OAResponse {
  if (!isRecord(u)) return false;
  const choicesUnknown = (u as { choices?: unknown }).choices;
  if (!Array.isArray(choicesUnknown) || choicesUnknown.length === 0) return false;
  const first = choicesUnknown[0];
  if (!isRecord(first)) return false;
  const msgUnknown = (first as { message?: unknown }).message;
  if (!isRecord(msgUnknown)) return false;
  const contentUnknown = (msgUnknown as { content?: unknown }).content;
  return typeof contentUnknown === "string";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body?.history) ? body.history : [];
    const system =
      typeof body?.system === "string"
        ? body.system
        : "Tu es un guide EFT bienveillant, clair et concis. Réponds en français.";

    if (!message) {
      return NextResponse.json({ error: "Champ 'message' requis." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API manquante côté serveur." }, { status: 500 });
    }

    const messages = [
      { role: "system", content: String(system) },
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
        temperature: 0.3,
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
