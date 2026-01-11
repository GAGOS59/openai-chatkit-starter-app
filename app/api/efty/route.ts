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
interface ChatMessage { role: Role; content: string; }
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
  /\bje\s+vais\s+mourir\b/i,
  /\b(id[ée]es?\s+noires?)\b/i,
  /\b(envie\s+de\s+mourir)\b/i
];

const WHITELIST_COLLISIONS: RegExp[] = [/\b(de\s+rire|pour\s+rigoler|je\s+plaisante)\b/i];

function crisisBlockMessage(): string {
  return `⚠️ Je ne peux pas continuer cette conversation : il semble que tu sois en danger. Appelle immédiatement le 3114 (prévention suicide) ou le 15 (SAMU).`;
}

function matchAny(xs: RegExp[], s: string) { return xs.some(rx => rx.test(s)); }
function interpretYesNo(t: string): "yes" | "no" | "unknown" {
  const s = t.toLowerCase();
  if (/^(oui|ouais|si|yes|yep)\b/.test(s)) return "yes";
  if (/^(non|nan|nope|no)\b/.test(s)) return "no";
  return "unknown";
}

/* ---------- GESTION SESSION ---------- */
type CrisisSession = { state: "normal" | "asked_suicide" | "asked_medical" | "blocked"; };
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

  // 1. BLOCAGE DÉFINITIF
  if (sess.state === "blocked") {
    return new NextResponse(JSON.stringify({ 
      answer: crisisBlockMessage(), 
      crisis: "block", 
      reason: "suicide", // On laisse suicide par défaut pour le rouge total
      clientAction: { blockInput: true } 
    }), { headers });
  }

  // 2. RÉPONSE À LA LEVÉE DE DOUTE
  if (sess.state === "asked_suicide" || sess.state === "asked_medical") {
    const answer = interpretYesNo(lastUserLower);
    const wasMedical = sess.state === "asked_medical";

    if (answer === "yes") {
      sess.state = "blocked";
      return new NextResponse(JSON.stringify({
        answer: crisisBlockMessage(),
        crisis: "block",
        reason: wasMedical ? "medical" : "suicide",
        clientAction: { blockInput: true }
      }), { headers });
    } else if (answer === "no") {
      sess.state = "normal";
    } else {
      return new NextResponse(JSON.stringify({
        answer: "Peux-tu répondre par « oui » ou « non » pour ta sécurité ?",
        crisis: "ask",
        reason: wasMedical ? "medical" : "suicide"
      }), { headers });
    }
  }

  // 3. DÉTECTION INITIALE
  const isPhys = matchAny(CRISIS_PHYSICAL, lastUserLower);
  const isSuic = matchAny(CRISIS_EXPLICIT, lastUserLower) && !matchAny(WHITELIST_COLLISIONS, lastUserLower);

  if (isPhys || isSuic) {
    sess.state = isPhys ? "asked_medical" : "asked_suicide";
    return new NextResponse(JSON.stringify({ 
      answer: isPhys ? "Cette douleur semble importante. Est-ce une urgence médicale ? (oui/non)" : "As-tu des idées suicidaires en ce moment ? (oui/non)", 
      crisis: "ask",
      reason: isPhys ? "medical" : "suicide",
      clientAction: { focusInput: true }
    }), { headers });
  }

  // 4. APPEL IA
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
