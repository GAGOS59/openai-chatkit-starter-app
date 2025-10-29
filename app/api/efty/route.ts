// app/api/efty/route.ts (anti-boucle SUD + ΔSUD + anti-mix d’aspects)
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

// --- Analyse historique : récupérer derniers SUD + phases implicites
function lastAssistantSaid(messages: ChatMessage[], pattern: RegExp): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    if (pattern.test(m.content)) return m.content;
  }
  return null;
}

function getLastUserMessage(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content || "";
  }
  return "";
}

function getLastTwoUserSUDs(messages: ChatMessage[]): { prev: number | null; last: number | null } {
  let found: number[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const s = extractSud(m.content || "");
    if (s != null) {
      found.push(s);
      if (found.length === 2) break;
    }
  }
  return { last: found[0] ?? null, prev: found[1] ?? null };
}

function assistantAskedOK(messages: ChatMessage[]): boolean {
  const a = lastAssistantSaid(messages, /Quand c[’']est fait, envoie un OK/i);
  return !!a;
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

  // --- Contrôleur léger d’état (anti-boucle SUD + ΔSUD + anti-mix)
  const lastAssistant = lastAssistantSaid(history, /.*/i) || "";
  const lastUser = getLastUserMessage(history);

  const assistantAskedSud = !!lastAssistantSaid(history, ASK_SUD_REGEX);
  const userGaveSud = extractSud(lastUser);
  const okJustGiven = OK_REGEX.test(lastUser);
  const { prev, last } = getLastTwoUserSUDs(history);
  const delta = prev != null && last != null ? prev - last : null;

  // ——— STATE push (lisible par le prompt) ———
  messages.push({
    role: "user",
    content: JSON.stringify({
      meta: "STATE",
      history_len: history.length,
      last_user: lastUser,
      assistant_asked_sud: assistantAskedSud,
      user_gave_sud: userGaveSud,
      prev_sud: prev,
      last_sud: last,
      delta,
    })
  });

  // ——— CONTROLLER : casser la boucle SUD dès réception ———
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

  // ——— CONTROLLER : si OK reçu après Setup, forcer la ronde (évite boucle Setup→OK) ———
  if (okJustGiven && assistantAskedOK(history)) {
    messages.push({
      role: "user",
      content: JSON.stringify({
        meta: "CONTROLLER",
        ok_after_setup: true,
        instruction:
          "Tu viens de recevoir un OK après le Setup. Passe immédiatement à la ronde standard (ST→SB) sans répéter le Setup.",
      })
    });
  }

  // ——— CONTROLLER : appliquer la bonne branche ΔSUD ———
  if (delta !== null) {
    if (delta < 0) {
      messages.push({
        role: "user",
        content: JSON.stringify({
          meta: "CONTROLLER",
          delta,
          instruction:
            "Le SUD a augmenté. N’explore pas. Annonce-le brièvement puis repars sur le même aspect : Setup adapté → OK → Ronde → Re-SUD.",
        }),
      });
    } else if (delta === 0) {
      messages.push({
        role: "user",
        content: JSON.stringify({
          meta: "CONTROLLER",
          delta,
          instruction:
            "Le SUD n’a pas changé. Par défaut, refais une ronde sur le même aspect (Setup adapté → OK → Ronde → Re-SUD). Une seule question d’exploration est possible si besoin, pas plus.",
        }),
      });
    } else if (delta === 1) {
      messages.push({
        role: "user",
        content: JSON.stringify({
          meta: "CONTROLLER",
          delta,
          instruction:
            "Le SUD a baissé d’un point. Pose une seule question d’exploration, puis reviens immédiatement au Setup adapté → OK → Ronde → Re-SUD.",
        }),
      });
    } else if (delta >= 2) {
      messages.push({
        role: "user",
        content: JSON.stringify({
          meta: "CONTROLLER",
          delta,
          instruction:
            "Baisse significative. Poursuis sur le même aspect : Setup adapté → OK → Ronde → Re-SUD.",
        }),
      });
    }
  }

  // ——— CONTROLLER : anti-mix d’aspects (ne pas combiner douleur + émotion) ———
  const combinedPattern = /(douleur|mal|\brotule\b).+\b(et|\,).*\b(je me sens|sentiment|émotion)/i;
  if (combinedPattern.test(lastAssistant)) {
    messages.push({
      role: "user",
      content: JSON.stringify({
        meta: "CONTROLLER",
        instruction:
          "Ne combine pas deux aspects dans un même Setup/ronde. Si un nouvel aspect (émotion/pensée) apparaît, mets l’aspect précédent en attente. Cible un seul aspect à la fois avec ses mots exacts.",
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

  // ——— Rappel doux global ———
  messages.push({
    role: "user",
    content:
      "NOTE: Une seule question à la fois. Si tu viens de recevoir un SUD, enchaîne Setup → OK → Ronde, puis seulement Re-SUD. Si ΔSUD < 0, ne fais pas d’exploration.",
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
