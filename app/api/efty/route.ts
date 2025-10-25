// app/api/efty/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

// ⬇️ IMPORTANT : adapte l'import du prompt à TON chemin réel.
import { EFT_SYSTEM_PROMPT } from "../../lib/eft-prompt";


// Si ton alias "@" n'est pas configuré, remplace par :
// import { EFT_SYSTEM_PROMPT } from "../../../application/lib/eft-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // 🔒 injectée par Vercel (jamais côté client)
});

type ChatMessage = { role: "user" | "assistant"; content: string };
type Payload =
  | { messages?: ChatMessage[] }        // format historique
  | { message?: string };               // format simple

function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  const o = origin.toLowerCase();
  return (
    /^https?:\/\/localhost(:\d+)?$/.test(o) ||
    /^https:\/\/(www\.)?ecole-eft-france\.fr$/.test(o) ||
    /^https:\/\/appli\.ecole-eft-france\.fr$/.test(o) ||
    /^https:\/\/.*\.vercel\.app$/.test(o)
  );
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new NextResponse("Origine non autorisée (CORS).", { status: 403 });
  }

  // Sécurité : ne jamais renvoyer la valeur d'une env var
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Configuration serveur manquante." }, { status: 500 });
  }

  let body: Payload = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  // Supporte {messages:[...]} OU {message:"..."}
  const history = Array.isArray((body as any).messages)
    ? (body as any).messages.filter(
        (m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
      )
    : [];

  const single = typeof (body as any).message === "string" ? (body as any).message.trim() : "";

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: EFT_SYSTEM_PROMPT }, // 🔒 prompt côté serveur uniquement
  ];

  if (history.length > 0) {
    messages.push(...history);
  } else if (single) {
    messages.push({ role: "user", content: single });
  } else {
    return NextResponse.json({ error: "Aucun message fourni." }, { status: 400 });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2, // style stable et neutre
      messages,
    });

    const text =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Je n’ai pas compris. Peux-tu reformuler en une phrase courte ?";

    const headers = new Headers({
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "",
      "Vary": "Origin",
    });

    return new NextResponse(JSON.stringify({ answer: text }), { headers });
  } catch {
    // Pas de stack trace ni infos sensibles côté client
    return NextResponse.json(
      { error: "Service indisponible, réessaie dans un instant." },
      { status: 503 }
    );
  }
}

// Preflight CORS
export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  return new NextResponse(null, { status: 204, headers });
}
