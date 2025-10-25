// app/api/efty/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { EFT_SYSTEM_PROMPT } from "@/app/lib/eft-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // 🔒 Vercel -> Settings -> Environment Variables
});

type ChatMessage = { role: "user" | "assistant"; content: string };
type Body = { messages?: ChatMessage[] };

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

  let payload: Body = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const history = (payload.messages || []).filter(
    (m) => m.role === "user" || m.role === "assistant"
  );

  if (!process.env.OPENAI_API_KEY) {
    // 🔐 Ne renvoie jamais la valeur. Message sobre.
    return NextResponse.json({ error: "Configuration serveur manquante." }, { status: 500 });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [{ role: "system", content: EFT_SYSTEM_PROMPT }, ...history],
    });

    const text =
      completion.choices?.[0]?.message?.content?.trim() ||
      "Peux-tu reformuler en une phrase courte ?";

    const headers = new Headers({
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "",
      "Vary": "Origin",
    });
    return new NextResponse(JSON.stringify({ answer: text }), { headers });
  } catch {
    // 🔐 Pas d’erreur verbeuse ni stack trace
    return NextResponse.json(
      { error: "Service indisponible, réessaie dans un instant." },
      { status: 503 }
    );
  }
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin") || "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  return new NextResponse(null, { status: 204, headers });
}
