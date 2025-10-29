// app/api/efty/route.ts — version avec détection SUD + hint de nuance
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

// --- Utils minimal
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

// --- Détection SUD (conforme à ton parsing prompt)
function parseSudFromText(text: string): number | null {
  if (!text) return null;
  const s = text.toLowerCase();

  // priorité au nombre après "sud"
  const m1 = s.match(/sud\s*=?\s*(\d{1,2})\b/);
  if (m1) {
    const n = Number(m1[1]);
    if (Number.isFinite(n) && n >= 0 && n <= 10) return n;
  }

  // sinon, dernier nombre 0–10 du message
  const nums = Array.from(s.matchAll(/\b(\d{1,2})\b/g)).map((m) => Number(m[1]));
  const last = nums.reverse().find((n) => Number.isFinite(n) && n >= 0 && n <= 10);
  return typeof last === "number" ? last : null;
}

// --- Qualificateur SUD (nuance texte)
function sudQualifier(sud: number): string {
  if (sud <= 2) return "ce petit reste de";
  if (sud === 3) return "encore un peu de";
  if (sud === 4) return "toujours un peu de";
  if (sud === 5) return "encore";
  if (sud === 6) return "toujours";
  if (sud === 7) return "bien présent·e";
  if (sud === 8) return "fort·e";
  if (sud === 9) return "très fort·e";
  return "insupportable";
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

  // ---- STATE hint minimal (stateless-friendly)
  const lastUser = history.filter((m) => m.role === "user").slice(-1)[0]?.content?.trim() || single || "";
  messages.push({
    role: "user",
    content: JSON.stringify({
      meta: "STATE",
      history_len: history.length,
      last_user: lastUser,
    }),
  });

  // --- Nouveau : détection SUD dans le dernier message et hint de nuance
  const sud = parseSudFromText(lastUser);
  if (typeof sud === "number") {
    const qualifier = sudQualifier(sud);
    messages.push({
      role: "user",
      content: JSON.stringify({
        meta: "SUD_HINT",
        sud_detecte: sud,
        qualifier,
        instruction: "Utilise ce qualificateur dans le prochain Setup et dans au moins 3 points de la ronde, conformément au prompt système.",
      }),
    });
  }

  // gentle reminder (keeps prompt in charge) — keep the prompt authoritative about flow
  messages.push({
    role: "user",
    content:
      "NOTE: Respecte strictement le rythme décrit dans le SYSTEM PROMPT: une seule question à la fois. " +
      "La logique ΔSUD et la pile d’aspects sont gérées par le prompt. " +
      "Si un SUD a été détecté côté app, un hint de nuance a pu être fourni (meta=SUD_HINT).",
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
