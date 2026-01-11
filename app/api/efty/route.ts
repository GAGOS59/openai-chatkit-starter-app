import { NextResponse } from "next/server";
import OpenAI from "openai";
import { EFT_SYSTEM_PROMPT } from "./eft-prompt";
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Types Stricts
type Role = "system" | "user" | "assistant";

interface ChatMessage {
  role: Role;
  content: string;
}

interface MotsClient {
  emotion?: string;
  sensation?: string;
  localisation?: string;
  pensee?: string;
  souvenir?: string;
}

interface Payload {
  sessionId?: string;
  clientMessageId?: string;
  messages?: ChatMessage[];
  message?: string;
  mots_client?: MotsClient;
  injectRappels?: boolean;
  rappelsVoulus?: number;
}

/* ---------- CONFIGURATION DES CRISES ---------- */

const CRISIS_PHYSICAL: RegExp[] = [
  /\b(bras\s+gauche|douleur\s+poitrine|thorax|mâchoire|irradie)\b/i,
  /\b(respirer|étouffe|plus\s+d'air|respiration|lèvres\s+bleues)\b/i,
  /\b(hémorragie|saigne\s+beaucoup|sang|coupure\s+profonde)\b/i,
  /\b(avaler|médicaments|boîte|poison|intoxication)\b/i,
  /\b(paralysie|sens\s+plus\s+mon\s+côté|visage\s+déformé)\b/i
];

const CRISIS_EXPLICIT: RegExp[] = [
  /\bje\s+(vais|veux)\s+me\s+(tuer|suicider|pendre)\b/i,
  /\bje\s+vais\s+me\s+faire\s+du\s+mal\b/i,
  /\bje\s+vais\s+mourir\b/i,
  ...CRISIS_PHYSICAL
];

const WHITELIST_COLLISIONS: RegExp[] = [
  /\b(de\s+rire|pour\s+rigoler|c'est\s+pour\s+rigoler|je\s+plaisante)\b/i
];

const ASK_SUICIDE_Q_TU = "Avant toute chose, as-tu des idées suicidaires en ce moment ? (réponds par oui ou non)";

function crisisBlockMessage(): string {
  return `⚠️ Je ne peux pas continuer cette conversation : il semble que tu sois en danger. Si tu es en France, appelle immédiatement le 15 (SAMU) ou le 3114.`;
}

function matchAny(xs: RegExp[], s: string) { return xs.some(rx => rx.test(s)); }
function hasWhitelistCollision(s: string) { return WHITELIST_COLLISIONS.some(rx => rx.test(s)); }

/* ---------- GESTION SESSION ---------- */
type CrisisSession = { state: "normal" | "asked_suicide" | "blocked_crisis"; askCount: number; };
const CRISIS_SESSIONS = new Map<string, CrisisSession>();

function getSession(key: string): CrisisSession {
  if (!CRISIS_SESSIONS.has(key)) CRISIS_SESSIONS.set(key, { state: "normal", askCount: 0 });
  return CRISIS_SESSIONS.get(key)!;
}

/* ---------- POST ---------- */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "",
    Vary: "Origin",
  });

  let body: Payload = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const history: ChatMessage[] = body.messages || [];
  const single: string = body.message?.trim() || "";
  const lastUser = history.filter(m => m.role === "user").slice(-1)[0]?.content || single;
  const lastUserLower = lastUser.toLowerCase();
  const sessionKey = body.sessionId || origin || "anon";
  const sess = getSession(sessionKey);

  if (matchAny(CRISIS_PHYSICAL, lastUserLower)) {
    sess.state = "blocked_crisis";
    return new NextResponse(JSON.stringify({
      answer: "⚠️ URGENCE MÉDICALE : Tes symptômes nécessitent une assistance immédiate. Appelle le 15 (SAMU) ou le 112 tout de suite.",
      crisis: "block",
      clientAction: { blockInput: true }
    }), { headers });
  }

  if (sess.state === "blocked_crisis") {
    return new NextResponse(JSON.stringify({ answer: crisisBlockMessage(), crisis: "block", clientAction: { blockInput: true } }), { headers });
  }

  if (matchAny(CRISIS_EXPLICIT, lastUserLower) && !hasWhitelistCollision(lastUserLower)) {
    sess.state = "asked_suicide";
    return new NextResponse(JSON.stringify({ answer: ASK_SUICIDE_Q_TU, crisis: "ask", clientAction: { focusInput: true } }), { headers });
  }

  try {
    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: EFT_SYSTEM_PROMPT }
    ];

    if (history.length > 0) {
      history.forEach((m) => {
        apiMessages.push({ role: m.role, content: m.content });
      });
    } else if (single) {
      apiMessages.push({ role: "user", content: single });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: apiMessages,
      temperature: 0.5,
    });

    const text = completion.choices[0].message.content || "";
    return new NextResponse(JSON.stringify({ answer: text, crisis: "none", clientAction: { blockInput: false } }), { headers });
  } catch {
    return NextResponse.json({ error: "OpenAI Error" }, { headers, status: 503 });
  }
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }
  });
}
