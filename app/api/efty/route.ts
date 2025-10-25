// app/api/efty/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { EFT_SYSTEM_PROMPT } from "./eft-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // 🔒 injectée par Vercel uniquement côté serveur
});

/* ---------- Types ---------- */
type Role = "user" | "assistant" | "system";

interface ChatMessage {
  role: Exclude<Role, "system">; // "user" | "assistant"
  content: string;
}

interface BodyWithMessages {
  messages: ChatMessage[];
}

interface BodyWithMessage {
  message: string;
}

type Payload = Partial<BodyWithMessages & BodyWithMessage>;

function isChatMessageArray(x: unknown): x is ChatMessage[] {
  if (!Array.isArray(x)) return false;
  return x.every(
    (m) =>
      m &&
      typeof m === "object" &&
      (m as ChatMessage).role !== undefined &&
      (m as ChatMessage).content !== undefined &&
      (m as ChatMessage).role !== "system" &&
      (m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant" &&
      typeof (m as ChatMessage).content === "string"
  );
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const o = origin.toLowerCase();

  // Autorisations strictes en production
  const ALLOWED_BASE = new Set<string>([
    "https://appli.ecole-eft-france.fr",
    "https://www.ecole-eft-france.fr",
  ]);

  // Environnements Vercel : autoriser l’URL exacte du déploiement en preview
  // VERCEL_ENV ∈ "production" | "preview" | "development"
  const vercelEnv = process.env.VERCEL_ENV;
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;

  if (vercelEnv === "production") {
    return ALLOWED_BASE.has(o);
  }

  // En preview/dev, autoriser aussi l’URL de build courante si présente
  if (vercelEnv === "preview" && vercelUrl) {
    return o === vercelUrl || ALLOWED_BASE.has(o);
  }

  // Facultatif : conserver localhost si tu testes depuis un navigateur local
  if (o.startsWith("http://localhost:") || o === "http://localhost") {
    return true;
  }

  return ALLOWED_BASE.has(o);
}


/* ---------- Handlers ---------- */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new NextResponse("Origine non autorisée (CORS).", { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    // 🔐 Ne jamais renvoyer la valeur exacte
    return NextResponse.json({ error: "Configuration serveur manquante." }, { status: 500 });
  }

  // Parse JSON proprement et typé
  let body: Payload = {};
  try {
    const raw = (await req.json()) as unknown;
    if (raw && typeof raw === "object") {
      body = raw as Payload;
    }
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  // Supporte {messages:[...]} OU {message:"..."}
  const history: ChatMessage[] = isChatMessageArray(body.messages) ? body.messages : [];
  const single: string =
    typeof body.message === "string" ? body.message.trim() : "";

  // Construire le fil de messages pour OpenAI
  const messages: Array<{ role: Role; content: string }> = [
    { role: "system", content: EFT_SYSTEM_PROMPT }, // 🔒 prompt côté serveur uniquement
  ];

  if (history.length > 0) {
    messages.push(...history.map((m) => ({ role: m.role, content: m.content })));
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
      completion.choices?.[0]?.message?.content?.trim() ??
      "Je n’ai pas compris. Peux-tu reformuler en une phrase courte ?";

    const headers = new Headers({
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "",
      "Vary": "Origin",
    });

    return new NextResponse(JSON.stringify({ answer: text }), { headers });
  } catch {
    // 🔐 Pas de stack trace côté client
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
