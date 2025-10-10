import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const data: unknown = await upstream.json();
    // extraction défensive sans any
    const answer =
      (typeof data === "object" &&
        data !== null &&
        Array.isArray((data as any).choices) &&
        (data as any).choices[0] &&
        (data as any).choices[0].message &&
        typeof (data as any).choices[0].message.content === "string" &&
        (data as any).choices[0].message.content.trim()) ||
      "";

    if (!answer) {
      return NextResponse.json({ error: "Réponse vide du modèle." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, answer });
  } catch (error: unknown) {
    // on utilise la variable pour éviter no-unused-vars
    console.error("[guide-eft] route error:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}
