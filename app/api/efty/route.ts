// app/api/efty/route.ts (correctif anti-boucle SUD)
import { NextResponse, NextRequest } from "next/server";
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
interface MotsClient { emotion?: string; sensation?: string; localisation?: string; pensee?: string; souvenir?: string; }
type Payload = { messages?: ChatMessage[]; message?: string; mots_client?: MotsClient; injectRappels?: boolean; rappelsVoulus?: number; };

// --- Utils
const SUD_REGEX = /(?:\bSUD\s*[:=]?\s*)?(10|[0-9])(?:\s*\/\s*10)?\b/i; // 6, SUD 6, 6/10
const ASK_SUD_REGEX = /(indique|donne|évalue)\s+(ton|un|le)\s*SUD|SUD\s*\(0\s*[–-]\s*10\)/i;
const OK_REGEX = /\b(ok|ok\.|ok!|pr[eé]t(?:e)?|termin[ée]|done)\b/i;

function clean(s?: string) { return (s ?? "").replace(/\s+/g, " ").trim(); }
function isChatMessageArray(x: unknown): x is ChatMessage[] {
  return Array.isArray(x) && x.every((m) => typeof m === "object" && m !== null && "role" in m && "content" in m);
}
function extractSud(msg: string): number | null {
  const m = msg.match(SUD_REGEX);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (Number.isNaN(n) || n < 0 || n > 10) return null;
  return n;
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

// --- Micro-grammaire rappels (inchangé)
function generateRappelsBruts(m?: MotsClient): string[] {
  if (!m) return [];
  const out = new Set<string>();
  const push = (s?: string) => { if (!s) return; const t = s.trim().replace(/\s+/g," "); if (t && t.length <= 40) out.add(t); };
  if (m.emotion) push(`cette ${m.emotion}`);
  if (m.sensation && m.localisation) push(`cette ${m.sensation} dans ${m.localisation}`);
  if (m.sensation && !m.localisation) push(`cette ${m.sensation}`);
  if (m.pensee) push(`cette pensée : « ${m.pensee} »`);
  return Array.from(out).slice(0, 6);
}

/* ---------- Handlers ---------- */
export async function POST(req: NextRequest) {
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

  // Build messages
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

  // --- Contrôleur léger d’état (anti-boucle SUD)
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant")?.content || "";
  const lastUser = [...history].reverse().find((m) => m.role === "user")?.content || "";

  const assistantAskedSud = ASK_SUD_REGEX.test(lastAssistant);
  const userGaveSud = extractSud(lastUser);

  // Chercher un prevSud (dernier SUD utilisateur AVANT le dernier assistant)
  let prevSud: number | null = null;
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role !== "user") continue;
    const sud = extractSud(m.content || "");
    if (sud != null) { prevSud = sud; break; }
  }

  // ——— STATE push (lisible par le prompt) ———
  messages.push({
    role: "user",
    content: JSON.stringify({
      meta: "STATE",
      history_len: history.length,
      last_user: lastUser,
      assistant_asked_sud: assistantAskedSud,
      user_gave_sud: userGaveSud,
      prev_sud: prevSud,
    })
  });

  // ——— CONTROLLER push (directive explicite pour casser la boucle) ———
  if (assistantAskedSud && userGaveSud != null) {
    messages.push({
      role: "user",
      content: JSON.stringify({
        meta: "CONTROLLER",
        sud_received: true,
        sud_value: userGaveSud,
        instruction:
          "Tu viens de recevoir un SUD valide. Ne redemande pas le SUD. Construis immédiatement le Setup adapté, demande un OK, déroule la ronde standard, puis redemande un SUD.",
      }),
    });
  }

  // --- Optional: inject simples rappels
  const injectRappels = body.injectRappels !== false;
  const rappelsVoulus = typeof body.rappelsVoulus === "number" ? body.rappelsVoulus : 6;
  const candidats = generateRappelsBruts(body.mots_client);
  if (injectRappels && candidats.length > 0) {
    messages.push({
      role: "user",
      content: JSON.stringify({ meta: "CANDIDATS_RAPPELS", candidats_app: candidats, voulu: rappelsVoulus }),
    });
  }

  // ——— Rappel doux (respect une question à la fois) ———
  messages.push({
    role: "user",
    content:
      "NOTE: Respecte strictement le rythme décrit : une seule question à la fois. Si tu viens de recevoir un nombre 0–10, considère que c’est un SUD et enchaîne Setup → OK → Ronde sans reposer la question du SUD.",
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
    return NextResponse.json({ error: "Service temporairement indisponible." }, { status: 503 });
  }
}

export function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin! : "",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  return new NextResponse(null, { status: 204, headers });
}

