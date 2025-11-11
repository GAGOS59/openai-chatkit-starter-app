// app/api/efty/route.ts — version allégée (sans détection/nuance SUD)
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { EFT_SYSTEM_PROMPT } from "./eft-prompt";
import "server-only";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- Types (minimal)
type Role = "user" | "assistant";
interface ChatMessage { role: Role; content: string; }
interface MotsClient {
  emotion?: string;
  sensation?: string;
  localisation?: string;
  pensee?: string;
  souvenir?: string;
}
type Payload = {
  messages?: ChatMessage[];
  message?: string;
  mots_client?: MotsClient;
  injectRappels?: boolean;
  rappelsVoulus?: number;
};

// --- Utils 
function clean(s?: string) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}
function isChatMessageArray(x: unknown): x is ChatMessage[] {
  return Array.isArray(x) && x.every((m) => typeof m === "object" && m !== null && "role" in m && "content" in m);
}
function isAllowedOrigin(origin: string | null) {
  if (!origin) return false;
  const o = origin.toLowerCase();
  const ALLOWED = new Set([
    "https://appli.ecole-eft-france.fr",
    "https://www.ecole-eft-france.fr",
  ]);
  if (process.env.VERCEL_ENV === "production") return ALLOWED.has(o);
  if (o.startsWith("http://localhost")) return true;
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return o === `https://${process.env.VERCEL_URL}` || ALLOWED.has(o);
  }
  return ALLOWED.has(o);
}

// --- Micro-grammaire rappels (very small, non-invasive)
function generateRappelsBruts(m?: MotsClient): string[] {
  if (!m) return [];
  const out = new Set<string>();
  const push = (s?: string) => {
    if (!s) return;
    const t = s.trim().replace(/\s+/g, " ");
    if (t && t.length <= 40) out.add(t);
  };
  if (m.emotion) push(`cette ${m.emotion}`);
  if (m.sensation && m.localisation) push(`cette ${m.sensation} dans ${m.localisation}`);
  if (m.sensation && !m.localisation) push(`cette ${m.sensation}`);
  if (m.pensee) push(`cette pensée : « ${m.pensee} »`);
  return Array.from(out).slice(0, 6);
}


const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicide\b/i,
  /\b(me\s+tuer|me\s+suicider)\b/i,
  /\bje\s+veux\s+mourir\b/i,
  /\bje\s+ne\s+veux\s+plus\s+vivre\b/i,
  /\bj[’']en\s+ai\s+marre\s+de\s+la\s+vie\b/i,
  /\bme\s+foutre\s+en\s+l[’']air\b/i,
  /\bj[’']en\s+peux\s+plus\s+de\s+vivre\b/i,
  /\bje\s+veux\s+dispara[iî]tre\b/i
];
function isCrisis(text: string): boolean {
  const t = text.toLowerCase();
  return CRISIS_PATTERNS.some(rx => rx.test(t));
}
function crisisMessage(): string {
  return (
`⚠️ **Message important :**
Il semble que vous traversiez un moment très difficile.
Je ne suis pas un service d’urgence et votre sécurité est prioritaire.

👉 **Appelez immédiatement le 15** (urgences médicales en France),
ou contactez le **3114**, le **numéro national de prévention du suicide**,
gratuit, anonyme et disponible 24h/24, 7j/7.

Si vous êtes à l’étranger, composez le numéro d’urgence local.
Vous n’êtes pas seul·e — il existe des personnes prêtes à vous aider. ❤️`
  );
}

/* ---------- Handlers ---------- */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new NextResponse("Origine non autorisée (CORS).", { status: 403 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Configuration manquante." }, { status: 500 });
  }

  let body: Payload = {};
  try {
    const raw = (await req.json()) as unknown;
    if (raw && typeof raw === "object") body = raw as Payload;
  } catch {
    return NextResponse.json({ error: "Requête JSON invalide." }, { status: 400 });
  }

  const history: ChatMessage[] = isChatMessageArray(body.messages) ? body.messages : [];
  const single: string = typeof body.message === "string" ? body.message.trim() : "";

  // Build messages: system prompt first, then history (minimal)
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: EFT_SYSTEM_PROMPT },
  ];

  if (history.length > 0) {
    messages.push(...history.map((m) => ({ role: m.role, content: m.content })));
  } else if (single) {
    messages.push({ role: "user", content: single });
  } else {
    return NextResponse.json({ error: "Aucun message fourni." }, { status: 400 });
  }

  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin || "",
    Vary: "Origin",
  });
  
  // --- Optional: inject simple rappels JSON (non-invasive)
  const injectRappels = body.injectRappels !== false;
  const rappelsVoulus = typeof body.rappelsVoulus === "number" ? body.rappelsVoulus : 6;
  const candidats = generateRappelsBruts(body.mots_client);
  if (injectRappels && candidats.length > 0) {
    messages.push({
      role: "user",
      content: JSON.stringify({
        meta: "CANDIDATS_RAPPELS",
        candidats_app: candidats,
        voulu: rappelsVoulus,
      }),
    });
  }

  // ---- Minimal STATE push (stateless-friendly, non prescriptif)
  const lastUser = history.filter((m) => m.role === "user").slice(-1)[0]?.content?.trim() || single || "";
  messages.push({
    role: "user",
    content: JSON.stringify({
      meta: "STATE",
      history_len: history.length,
      last_user: lastUser,
    }),
  });

  // Gentle reminder : le prompt reste souverain (ΔSUD, pile d’aspects, nuances SUD…)
  messages.push({
    role: "user",
    content:
      "NOTE: Respecte strictement le rythme et le barème décrits dans le SYSTEM PROMPT. " +
      "La pile d’aspects et la logique ΔSUD sont entièrement pilotées par le prompt système. " +
      "N’ajoute aucune logique serveur, applique simplement le flux décrit.",
  });

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.5,
      messages,
    });

    const text =
      completion.choices?.[0]?.message?.content?.trim() ??
      "Je n’ai pas compris. Peux-tu reformuler en une phrase courte ?";

    return new NextResponse(JSON.stringify({ answer: text, crisis: "none" as const }), { headers });
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
