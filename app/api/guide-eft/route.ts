import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const {
      message,
      history = [],
      system = 'Tu es un guide EFT bienveillant, clair et concis. Réponds en français.'
    } = await req.json();

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: "Champ 'message' requis." }, { status: 400 });
    }
    if (!Array.isArray(history)) {
      return NextResponse.json({ error: "'history' doit être un tableau [{role, content}]" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Clé API manquante côté serveur.' }, { status: 500 });
    }

    const messages = [
      { role: 'system', content: String(system) },
      ...history,
      { role: 'user', content: message.trim() },
    ];

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages, temperature: 0.3 }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        { error: 'Service indisponible', code: upstream.status, details: text },
        { status: 502 }
      );
    }

    const data = await upstream.json();
    const answer = data?.choices?.[0]?.message?.content?.trim?.() || '';
    if (!answer) {
      return NextResponse.json({ error: 'Réponse vide du modèle.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true, answer });
  } catch (e: any) {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}
