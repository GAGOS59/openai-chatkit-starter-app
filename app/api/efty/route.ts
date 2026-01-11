import { NextResponse } from "next/server";
import OpenAI from "openai";
import { EFT_SYSTEM_PROMPT } from "./eft-prompt";
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

type Role = "system" | "user" | "assistant";
interface ChatMessage { role: Role; content: string; }
interface Payload { sessionId?: string; messages?: ChatMessage[]; message?: string; }

const CRISIS_PHYSICAL: RegExp[] = [
  /\b(bras\s+gauche|douleur\s+poitrine|thorax|mâchoire|irradie)\b/i,
  /\b(respirer|étouffe|plus\s+d'air|respiration)\b/i
];

const CRISIS_SUICIDE: RegExp[] = [
  /\b(tuer|suicider|pendre|mourir|mort|finir|en\s+finir)\b/i,
  /\b(id[ée]es?\s+noires?|envie\s+de\s+mourir)\b/i
];

const WHITELIST = [/\b(rigoler|plaisante)\b/i];

type CrisisSession = { state: "normal" | "asked_suicide" | "asked_medical" | "blocked"; };
const CRISIS_SESSIONS = new Map<string, CrisisSession>();

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = new Headers({ "Content-Type": "application/json", "Access-Control-Allow-Origin": origin || "", Vary: "Origin" });

  let body: Payload = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const history = body.messages || [];
  const lastUser = (history.filter(m => m.role === "user").pop()?.content || body.message || "").trim();
  const lastUserLower = lastUser.toLowerCase();
  const sessionKey = body.sessionId || origin || "anon";
  
  if (!CRISIS_SESSIONS.has(sessionKey)) CRISIS_SESSIONS.set(sessionKey, { state: "normal" });
  const sess = CRISIS_SESSIONS.get(sessionKey)!;

  // 1. GESTION DES RÉPONSES AUX QUESTIONS (OUI/NON)
  if (sess.state === "asked_suicide" || sess.state === "asked_medical") {
    const isYes = /^(oui|ouais|si|yes|yep|ui)/i.test(lastUserLower);
    const isNo = /^(non|nan|nope|no)/i.test(lastUserLower);

    if (isYes) {
      const finalReason = sess.state === "asked_medical" ? "medical" : "suicide";
      sess.state = "blocked";
      return new NextResponse(JSON.stringify({
        answer: "⚠️ URGENCE : Appelle immédiatement le 15 ou le 3114.",
        crisis: "block", // C'est ce signal qui verrouille tout en rouge
        reason: finalReason,
        clientAction: { blockInput: true }
      }), { headers });
    } else if (isNo) {
      sess.state = "normal"; // On libère pour passer à OpenAI
    } else {
      return new NextResponse(JSON.stringify({ 
        answer: "Peux-tu répondre par OUI ou par NON pour ta sécurité ?", 
        crisis: "ask",
        reason: sess.state === "asked_medical" ? "medical" : "suicide"
      }), { headers });
    }
  }

  // 2. DÉTECTION INITIALE (RESTAURATION DU "REASON")
  const isPhys = CRISIS_PHYSICAL.some(rx => rx.test(lastUserLower));
  const isSuic = CRISIS_SUICIDE.some(rx => rx.test(lastUserLower)) && !WHITELIST.some(rx => rx.test(lastUserLower));

  if (isPhys || isSuic) {
    sess.state = isPhys ? "asked_medical" : "asked_suicide";
    return new NextResponse(JSON.stringify({ 
      // Important : on remet "suicide" dans la phrase pour le filtre visuel
      answer: isPhys ? "Est-ce une urgence médicale ? (oui/non)" : "As-tu des idées de suicide en ce moment ? (oui/non)", 
      crisis: "ask",
      reason: isPhys ? "medical" : "suicide", // INDISPENSABLE POUR PAGE.TSX
      clientAction: { focusInput: true }
    }), { headers });
  }

  // 3. APPEL OPENAI
  try {
    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: "system", content: EFT_SYSTEM_PROMPT }];
    history.forEach(m => apiMessages.push({ role: m.role, content: m.content }));
    const completion = await openai.chat.completions.create({ model: "gpt-4o-mini", messages: apiMessages, temperature: 0.5 });
    return new NextResponse(JSON.stringify({ answer: completion.choices[0].message.content, crisis: "none" }), { headers });
  } catch {
    return NextResponse.json({ error: "Service Error" }, { headers, status: 503 });
  }
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  return new NextResponse(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
}
