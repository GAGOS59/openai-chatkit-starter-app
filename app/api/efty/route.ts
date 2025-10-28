// app/api/efty/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { EFT_SYSTEM_PROMPT } from "./eft-prompt";
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Types
type Role = "user" | "assistant";
interface ChatMessage { role: Role; content: string; }
type Payload = {
  messages?: ChatMessage[];
  message?: string;
};

// --- Helpers
function normalize(s?: string): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // retire accents
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isChatMessageArray(x: unknown): x is ChatMessage[] {
  return Array.isArray(x) && x.every(m => typeof m === "object" && m !== null && "role" in m && "content" in m);
}

// --- Messages / patterns
const ASK_SUICIDE_Q_TU = "Avant toute chose, as-tu des idées suicidaires en ce moment ? (réponds par oui ou non)";

function crisisOrientationMessage_TU(): string {
  return `Message important
Il semble que tu traverses un moment très difficile. Je te prends au sérieux.
Je ne peux pas t’accompagner avec l’EFT dans une situation d’urgence : ta sécurité est prioritaire.

📞 En France :
• 3114 — Prévention du suicide (gratuit, 24/7)
• 15 — SAMU
• 112 — Urgences (si danger immédiat)

Tu n’es pas seul·e — ces services peuvent t’aider dès maintenant.`;
}

const CRISIS_HARD: RegExp[] = [
  /\bsuicide\b/i,
  /\bme\s+tuer\b/i,
  /\bme\s+pendre\b/i,
  /\bme\s+suicid(er|e)\b/i,
  /\bmettre\s+fin\s+à\s+mes?\s+jours?\b/i,
  /\bje\s+veux\s+mourir\b/i,
];

const CRISIS_SOFT: RegExp[] = [
  /\bj[’']?\s*en\s+peux?\s+plus\b/i,
  /\bj[’']?\s*en\s+ai\s+marre\b/i,
  /\bmarre\s+de\s+vivre\b/i,
  /\bidees?\s+noires?\b/i,
  /\bje\s+ne\s+veux\s+plus\s+vivre\b/i,
];

// petites fautes/variantes courantes — traitées comme SOFT (on pose la question)
const MISSPELLINGS_SOFT = [
  "suisside", "suiside", "suicdie", "suicde", "me foutre en l air", "me foutre en lair", "me foutre en lair"
].map(normalize);

function containsMisspelling(text: string): boolean {
  const n = normalize(text);
  for (const m of MISSPELLINGS_SOFT) {
    if (m && n.includes(m)) return true;
  }
  return false;
}

function interpretYesNo(text: string): "yes" | "no" | "unknown" {
  const t = normalize(text);
  if (!t) return "unknown";
  if (/\b(oui|ouais|yes|yep|absolument|si)\b/.test(t)) return "yes";
  if (/\b(non|nan|nope|pas du tout|absolument pas|vraiment pas|aucune idee)\b/.test(t)) return "no";
  return "unknown";
}

function lastAssistantAskedSuicideQuestion(history: ChatMessage[]): boolean {
  if (!Array.isArray(history) || history.length === 0) return false;
  // chercher le dernier message assistant (s'il existe) et comparer normalisé
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === "assistant") {
      const nm = normalize(history[i].content);
      const ref = normalize(ASK_SUICIDE_Q_TU);
      if (nm.includes(ref)) return true;
      // variantes possibles :
      if (nm.includes("as tu des idees suicidaires") || nm.includes("avez vous des idees suicidaires") || nm.includes("as tu des idees de te tuer")) {
        return true;
      }
      return false;
    }
    if (history[i].role === "user") break;
  }
  return false;
}

// --- Route
export async function POST(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = new Set(["https://appli.ecole-eft-france.fr", "https://www.ecole-eft-france.fr"]);
  function isAllowedOrigin(o: string) {
    if (!o) return false;
    const lo = o.toLowerCase();
    if (process.env.VERCEL_ENV === "production") return allowed.has(lo);
    if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
      return lo === `https://${process.env.VERCEL_URL}` || allowed.has(lo);
    }
    if (lo.startsWith("http://localhost")) return true;
    return allowed.has(lo);
  }

  if (!isAllowedOrigin(origin)) return new NextResponse("Origine non autorisée (CORS).", { status: 403 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Configuration OPENAI manquante." }, { status: 500 });

  let body: Payload = {};
  try {
    const raw = (await req.json()) as unknown;
    if (raw && typeof raw === "object") body = raw as Payload;
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const history: ChatMessage[] = isChatMessageArray(body.messages) ? body.messages : [];
  const single = typeof body.message === "string" ? body.message.trim() : "";

  const messages = [{ role: "system", content: EFT_SYSTEM_PROMPT } as const];
  if (history.length > 0) messages.push(...history.map(m => ({ role: m.role as Role, content: m.content })));
  else if (single) messages.push({ role: "user", content: single });
  else return NextResponse.json({ error: "Aucun message fourni." }, { status: 400 });

  const headers = new Headers({ "Content-Type": "application/json", "Access-Control-Allow-Origin": origin || "", Vary: "Origin" });

  const lastUserMsg = history.filter(m => m.role === "user").slice(-1)[0]?.content?.trim() || single || "";

  const combined = (history.map(m => m.content).join(" ") + " " + lastUserMsg).trim();

  // 1) Hard regex -> blocage immédiat
  if (CRISIS_HARD.some(rx => rx.test(combined))) {
    return new NextResponse(JSON.stringify({ answer: crisisOrientationMessage_TU(), crisis: "hard", blocked: true }), { headers });
  }

  // 2) Soft regex OR known misspelling -> flow question first
  if (CRISIS_SOFT.some(rx => rx.test(combined)) || containsMisspelling(combined)) {
    const assistantAsked = lastAssistantAskedSuicideQuestion(history);
    const recent = interpretYesNo(lastUserMsg);

    if (assistantAsked) {
      if (recent === "yes") {
        return new NextResponse(JSON.stringify({ answer: crisisOrientationMessage_TU(), crisis: "soft_confirmed", blocked: true }), { headers });
      } else if (recent === "no") {
        // taux: laisser passer -> appel OpenAI plus bas
      } else {
        // on n'a pas compris la réponse -> reprompt
        return new NextResponse(JSON.stringify({ answer: ASK_SUICIDE_Q_TU, crisis: "soft", blocked: false, askQuestion: true }), { headers });
      }
    } else {
      // poser la question et attendre la réponse (front doit renvoyer l'assistant question + user answer)
      const empathic = `Je suis vraiment désolé·e que tu te sentes ainsi. Merci de me le dire — ta sécurité est ma priorité. ${ASK_SUICIDE_Q_TU}`;
      return new NextResponse(JSON.stringify({ answer: empathic, crisis: "soft", blocked: false, askQuestion: true }), { headers });
    }
  }

  // 3) Pas de crise détectée -> appel normal OpenAI
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.5,
      messages,
    });

    const text = completion.choices?.[0]?.message?.content?.trim() ?? "Je n’ai pas compris. Peux-tu reformuler en une phrase courte ?";
    return new NextResponse(JSON.stringify({ answer: text, crisis: "none", blocked: false }), { headers });
  } catch (err) {
    console.error("openai error:", err);
    return NextResponse.json({ error: "Service temporairement indisponible." }, { status: 503 });
  }
}

export function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  return new NextResponse(null, { status: 204, headers });
}

function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  const o = origin.toLowerCase();
  const ALLOWED_BASE = new Set([
    "https://appli.ecole-eft-france.fr",
    "https://www.ecole-eft-france.fr",
  ]);
  if (process.env.VERCEL_ENV === "production") return ALLOWED_BASE.has(o);
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return o === `https://${process.env.VERCEL_URL}` || ALLOWED_BASE.has(o);
  }
  if (o.startsWith("http://localhost:")) return true;
  return ALLOWED_BASE.has(o);
}

