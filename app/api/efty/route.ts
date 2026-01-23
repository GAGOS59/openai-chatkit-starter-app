import { NextResponse } from "next/server";
import OpenAI from "openai";
import { EFT_SYSTEM_PROMPT } from "./eft-prompt";
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Types (Restaurés selon PDF)
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

type Payload = {
  sessionId?: string;
  clientMessageId?: string;
  messages?: ChatMessage[];
  message?: string;
  mots_client?: MotsClient;
  injectRappels?: boolean;
  rappelsVoulus?: number;
};

/* --- Micro-grammaire rappels (Pages 1-2 du PDF) --- */
function generateRappelsBruts(m?: MotsClient): string[] {
  if (!m) return [];
  const out = new Set<string>();
  const push = (s?: string) => {
    if (!s) return;
    const t = s.trim().replace(/\s+/g, " ");
    if (t && t.length <= 40) out.add(t);
  };
  if (m.emotion) push(`cette ${m.emotion}`);
  if (m.sensation) push(m.sensation);
  if (m.localisation) push(m.localisation);
  if (m.pensee) push(m.pensee);
  if (m.souvenir) push(m.souvenir);
  return Array.from(out);
}

/* ---------- CONFIGURATION DES CRISES (Format Long) ---------- */
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
  /\b(envie\s+de\s+mourir)\b/i,
  /\b(en\s+finir)\b/i,
  /\b(finir\s+ma\s+vie)\b/i,
  /\b(plus\s+envie\s+de\s+vivre)\b/i
];

const WHITELIST_COLLISIONS = [
  /\b(de\s+rire|pour\s+rigoler|je\s+plaisante)\b/i
];

const ASK_SUICIDE_Q_TU = "Avant toute chose, as-tu des idées de suicide en ce moment, penses-tu à te faire du mal ou as-tu un plan pour le faire ? (réponds par oui ou non).";
const ASK_MEDICAL_Q = "Cette douleur semble importante et tu pourrais être dans une situation d&apos;urgence médicale. Te sens-tu en détresse ? (réponds par oui ou non)";

function crisisBlockMessage(): string {
  return "⚠️ Je ne peux pas continuer cette conversation car il se peut que tu sois en danger. Si tu es en France, appelle immédiatement le 15 (SAMU) ou le 3114. Si tu es à l’étranger, contacte le 112.";
}

function interpretYesNo(t: string): "yes" | "no" | "unknown" {
  const s = t.toLowerCase().trim();
  if (/^(oui|ouais|si|yes|yep|ui|oauis|affirmatif)\b/.test(s)) return "yes";
  if (/^(non|nan|nope|no|pas du tout)\b/.test(s)) return "no";
  return "unknown";
}

/* --- State Management --- */
type CrisisState = "normal" | "asked_suicide" | "asked_medical" | "blocked";
type CrisisSession = { state: CrisisState };
const CRISIS_SESSIONS = new Map<string, CrisisSession>();

function getSession(key: string): CrisisSession {
  if (!CRISIS_SESSIONS.has(key)) CRISIS_SESSIONS.set(key, { state: "normal" });
  return CRISIS_SESSIONS.get(key)!;
}

/* ---------- MAIN HANDLER ---------- */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "",
    Vary: "Origin",
  });

  let body: Payload = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const history = body.messages || [];
  const single = body.message?.trim() || "";
  const lastUser = (history.filter(m => m.role === "user").pop()?.content || single).trim();
  const lastUserLower = lastUser.toLowerCase();
  const sessionKey = body.sessionId || origin || "anon";
  const sess = getSession(sessionKey);

  // 1. BLOCAGE SÉCURITÉ
  if (sess.state === "blocked") {
    return new NextResponse(JSON.stringify({ 
      answer: crisisBlockMessage(), 
      crisis: "block", 
      reason: "suicide", 
      clientAction: { blockInput: true } 
    }), { headers });
  }

  // 2. DÉTECTION INITIALE (Priorité)
  const isPhys = CRISIS_PHYSICAL.some(rx => rx.test(lastUserLower));
  const isSuic = CRISIS_EXPLICIT.some(rx => rx.test(lastUserLower)) && 
                 !WHITELIST_COLLISIONS.some(rx => rx.test(lastUserLower));

  if ((isPhys || isSuic) && sess.state === "normal") {
    sess.state = isPhys ? "asked_medical" : "asked_suicide";
    return new NextResponse(JSON.stringify({
      answer: isPhys ? ASK_MEDICAL_Q : ASK_SUICIDE_Q_TU,
      crisis: "ask",
      reason: isPhys ? "medical" : "suicide",
      clientAction: { focusInput: true }
    }), { headers });
  }

  // 3. LOGIQUE RÉPONSE OUI/NON
  if (sess.state === "asked_suicide" || sess.state === "asked_medical") {
    const yn = interpretYesNo(lastUserLower);
    const prevAskingState = sess.state;

    if (yn === "yes") {
      sess.state = "blocked";
      return new NextResponse(JSON.stringify({
        answer: crisisBlockMessage(),
        crisis: "block",
        reason: prevAskingState === "asked_medical" ? "medical" : "suicide",
        clientAction: { blockInput: true }
      }), { headers });
    } else if (yn === "no") {
      sess.state = "normal";
    } else {
      const retryQuestion = prevAskingState === "asked_medical" ? ASK_MEDICAL_Q : ASK_SUICIDE_Q_TU;
      return new NextResponse(JSON.stringify({
        answer: `Je n'ai pas bien compris ta réponse. ${retryQuestion}`,
        crisis: "ask",
        reason: prevAskingState === "asked_medical" ? "medical" : "suicide"
      }), { headers });
    }
  }

  // 4. APPEL IA (EFT NORMAL)
  try {
    // === MODIFICATION MINIMALE AJOUTÉE ICI ===
    // On place d'abord une instruction système neutre qui demande au modèle
    // de répondre dans la même langue que le message utilisateur.
    const LANGUAGE_SYSTEM_INSTRUCTION = "Respond in the same language as the user's message.";

    const systemContent = [LANGUAGE_SYSTEM_INSTRUCTION, EFT_SYSTEM_PROMPT];
    if (body.injectRappels && body.mots_client) {
      const bruts = generateRappelsBruts(body.mots_client);
      if (bruts.length > 0) {
        systemContent.push(`\n[RAPPELS] Voici les termes du client à utiliser : ${bruts.join(", ")}`);
      }
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemContent.join("\n") }
    ];

    history.forEach((m) => {
      messages.push({ role: m.role as Role, content: m.content });
    });
    
    if (single && history.length === 0) {
      messages.push({ role: "user", content: single });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      messages,
      temperature: 0.5,
    });

    const text = completion.choices[0].message.content || "";
    return new NextResponse(JSON.stringify({
      answer: text,
      crisis: "none",
      clientAction: { blockInput: false }
    }), { headers });

  } catch (err) {
    console.error("openai error:", err);
    return NextResponse.json({ 
      error: "Service temporairement indisponible." 
    }, { status: 503 });
  }
}

/* --- CORS CHECK (Page 5 PDF) --- */
export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  const headers = {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  return new NextResponse(null, { status: 204, headers });
}

function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  const o = origin.toLowerCase();
  const ALLOWED = new Set([
    "https://appli.ecole-eft-france.fr",
    "https://www.ecole-eft-france.fr"
  ]);
  if (process.env.VERCEL_ENV === "production") return ALLOWED.has(o);
  if (o.startsWith("http://localhost")) return true;
  return false;
}
