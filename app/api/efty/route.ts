import { NextResponse } from "next/server";
import OpenAI from "openai";
import { EFT_SYSTEM_PROMPT } from "./eft-prompt";
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Types Stricts pour Vercel
type Role = "system" | "user" | "assistant";
interface ChatMessage { role: Role; content: string; }
interface MotsClient { emotion?: string; sensation?: string; localisation?: string; pensee?: string; souvenir?: string; }
interface Payload { sessionId?: string; messages?: ChatMessage[]; message?: string; }

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
  /\bje\s+vais\s+mourir\b/i
];

const WHITELIST_COLLISIONS: RegExp[] = [/\b(de\s+rire|pour\s+rigoler|je\s+plaisante)\b/i];
const ASK_SUICIDE_Q = "Avant toute chose, as-tu des idées suicidaires en ce moment ? (réponds par oui ou non)";
const ASK_MEDICAL_Q = "Cette douleur ou ce symptôme semble important. Est-ce une urgence médicale immédiate ? (réponds par oui ou non)";

function crisisBlockMessage(): string {
  return `⚠️ Je ne peux pas continuer : il semble que tu sois en danger. Appelle immédiatement le 15 (SAMU) ou le 112 (Urgences).`;
}

function matchAny(xs: RegExp[], s: string) { return xs.some(rx => rx.test(s)); }
function interpretYesNo(t: string): "yes" | "no" | "unknown" {
  const s = t.toLowerCase();
  if (/^(oui|ouais|si|yes|yep)\b/.test(s)) return "yes";
  if (/^(non|nan|nope|no)\b/.test(s)) return "no";
  return "unknown";
}

/* ---------- GESTION SESSION (MÉMOIRE D'ALERTE) ---------- */
type CrisisSession = { state: "normal" | "asked" | "blocked"; };
const CRISIS_SESSIONS = new Map<string, CrisisSession>();

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = new Headers({ "Content-Type": "application/json", "Access-Control-Allow-Origin": origin || "", Vary: "Origin" });

  let body: Payload = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const history = body.messages || [];
  const single = body.message?.trim() || "";
  const lastUser = history.filter(m => m.role === "user").slice(-1)[0]?.content || single;
  const lastUserLower = lastUser.toLowerCase();
  const sessionKey = body.sessionId || origin || "anon";
  
  if (!CRISIS_SESSIONS.has(sessionKey)) CRISIS_SESSIONS.set(sessionKey, { state: "normal" });
  const sess = CRISIS_SESSIONS.get(sessionKey)!;

  /* ---------- LOGIQUE DE SÉCURITÉ (POINTS 1, 2, 3) ---------- */

  // 1. Déjà bloqué ?
  if (sess.state === "blocked") {
    return new NextResponse(JSON.stringify({ answer: crisisBlockMessage(), crisis: "block", clientAction: { blockInput: true } }), { headers });
  }

  // 2. En cours de vérification (L'utilisateur répond au Oui/Non)
  if (sess.state === "asked") {
    const answer = interpretYesNo(lastUserLower);
    if (answer === "yes") {
      sess.state = "blocked";
      return new NextResponse(JSON.stringify({ answer: crisisBlockMessage(), crisis: "block", clientAction: { blockInput: true } }), { headers });
    } else if (answer === "no") {
      sess.state = "normal"; // On libère, et on laisse couler vers OpenAI plus bas
    } else {
      return new NextResponse(JSON.stringify({ answer: "Peux-tu répondre par « oui » ou « non » pour ta sécurité ?", crisis: "ask" }), { headers });
    }
  }

  // 3. Détection initiale (Physique ou Suicide)
  const isPhys = matchAny(CRISIS_PHYSICAL, lastUserLower);
  const isSuicide = matchAny(CRISIS_EXPLICIT, lastUserLower) && !matchAny(WHITELIST_COLLISIONS, lastUserLower);

  if (isPhys || isSuicide) {
    sess.state = "asked";
    return new NextResponse(JSON.stringify({ 
      answer: isPhys ? ASK_MEDICAL_Q : ASK_SUICIDE_Q, 
      crisis: "ask",
      clientAction: { focusInput: true }
    }), { headers });
  }

  /* ---------- 4. APPEL OPENAI (SI TOUT VA BIEN) ---------- */
  try {
    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: EFT_SYSTEM_PROMPT }
    ];
    history.forEach(m => apiMessages.push({ role: m.role, content: m.content }));
    if (single && history.length === 0) apiMessages.push({ role: "user", content: single });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages: apiMessages,
      temperature: 0.5,
    });

    return new NextResponse(JSON.stringify({ 
      answer: completion.choices[0].message.content, 
      crisis: "none" 
    }), { headers });
  } catch {
    return NextResponse.json({ error: "Service Error" }, { headers, status: 503 });
  }
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
