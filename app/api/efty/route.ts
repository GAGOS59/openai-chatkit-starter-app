import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { EFT_PROMPT } from "@/app/eft-prompt"; // ← on importe ton prompt ici

// ------------ Types ------------
type Role = "user" | "assistant" | "system";
interface ChatMessage { role: Role; content: string; }
interface RequestBody { history?: ChatMessage[]; single?: string; }

// ------------ CORS ------------
const ALLOWED_ORIGINS = [
  "https://ecole-eft-france.fr",
  "https://www.ecole-eft-france.fr",
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  "http://localhost:3000",
].filter(Boolean);

function corsHeaders(origin: string | null) {
  const h: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Vary"] = "Origin";
  }
  return h;
}

// ------------ Crise ------------
const CRISIS_PATTERNS = [
  "suicide", "me suicider", "idées suicidaires", "envie d'en finir",
  "mettre fin à mes jours", "plus envie de vivre", "détresse",
  "danger immédiat", "me faire du mal", "me blesser",
];

function isCrisis(text: string): boolean {
  const t = text.toLowerCase();
  return CRISIS_PATTERNS.some((k) => t.includes(k));
}

function assistantSuggestsCrisisCheck(answer: string): boolean {
  const t = answer.toLowerCase();
  return (
    t.includes("idées suicidaires") ||
    t.includes("danger immédiat") ||
    t.includes("appelle le") ||
    t.includes("urgence")
  );
}

// ------------ LLM ------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const body = (await req.json()) as RequestBody;
  const history: ChatMessage[] = Array.isArray(body.history) ? body.history : [];
  const single = body.single ?? "";

  const lastUser =
    [...history].reverse().find((m) => m.role === "user")?.content?.trim() ||
    String(single || "");

  const crisisFromUser = isCrisis(lastUser);

  // ✅ On utilise ton fichier `eft-prompt.ts` pour le message système
  const messagesForLLM = [
    { role: "system", content: EFT_PROMPT },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    ...(single ? [{ role: "user" as const, content: single }] : []),
  ];

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    temperature: 0.7,
    messages: messagesForLLM,
  });

  const answer = String(completion.choices[0]?.message?.content ?? "").trim();

  const crisisFromAssistant = assistantSuggestsCrisisCheck(answer);

  const crisis: "none" | "ask" | "lock" = crisisFromUser
    ? "lock"
    : crisisFromAssistant
    ? "ask"
    : "none";

  return new NextResponse(JSON.stringify({ answer, crisis }), {
    headers,
    status: 200,
  });
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  return new NextResponse(null, { headers, status: 204 });
}
