// app/api/efty/route.ts
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
function isChatMessageArray(x: unknown): x is ChatMessage[] {
  if (!Array.isArray(x)) return false;
  return x.every(
    (m) =>
      typeof m === "object" &&
      m !== null &&
      "role" in m &&
      "content" in m &&
      (m as any).role &&
      typeof (m as any).content === "string"
  );
}

// micro helper to generate short rappel candidates (non-invasive)
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

/* ---------- 🔐 Sécurité suicidaire : détection & réponses (serveur) ---------- */
const CRISIS_HARD: RegExp[] = [
  /\bsuicid(e|er|aire|al|ale|aux|erai|erais|erait|eront)?\b/iu,
  /\bje\s+(veux|vais|voudrais)\s+mour(ir|ire)\b/iu,
  /\bje\s+ne\s+veux\s+plus\s+vivre\b/iu,
  /\bje\s+(veux|vais|voudrais)\s+en\s+finir\b/iu,
  /\bmettre\s+fin\s+à\s+(ma|mes)\s+jours?\b/iu,
  /\b(kill\s+myself|i\s+want\s+to\s+die|suicide)\b/i,
  /\bme\s+tu(er|é|erai|erais|erait|eront)?\b/iu,
  /\bme\s+pendre\b/iu,
  /\bplus\s+d[’']?envie\s+de\s+vivre\b/iu,
  /\bj[’']?\s*en\s+peux?\s+plus\s+de\s+vivre\b/iu,
];

const CRISIS_SOFT: RegExp[] = [
  /\bj[’']?\s*en\s+peux?\s+plus\b/iu,
  /\bj[’']?\s*en\s+ai\s+marre\b/iu,
  /\bmarre\s+de\s+vivre\b/iu,
  /\bras[-\s]?le[-\s]?bol\b/iu,
  /\bla\s+vie\s+en\s+g[ée]n[ée]ral\b/iu,
  /\bje\s+supporte\s+plus\s+(la\s+)?vie\b/iu,
  /\bla\s+vie\s+(me|m’)\s+(d[ée]go[uû]te|fatigue|saoule)\b/iu,
  /\bid[ée]es?\s+noires?\b/iu,
  /\bje\s+suis\s+(de\s+)?trop\b/iu,
];

function anyMatch(xs: RegExp[], s: string) {
  return xs.some((rx) => rx.test(s));
}

const ASK_SUICIDE_Q_TU =
  "Avant toute chose, as-tu des idées suicidaires en ce moment ? (réponds par oui ou non)";

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

const YES_PATTERNS: RegExp[] = [
  /\b(oui|ouais|yep|yes)\b/i,
  /\b(plut[oô]t\s+)?oui\b/i,
  /\b(carr[ée]ment|clairement)\b/i,
  /\b(je\s+c(r|’|')ains\s+que\s+oui)\b/i,
];
const NO_PATTERNS: RegExp[] = [
  /\b(non|nan|nope)\b/i,
  /\b(pas\s+du\s+tout|absolument\s+pas|vraiment\s+pas)\b/i,
  /\b(aucune?\s+id[ée]e\s+suicidaire)\b/i,
  /\b(je\s+n['’]?ai\s+pas\s+d['’]?id[ée]es?\s+suicidaires?)\b/i,
];

function interpretYesNoServer(text: string): "yes" | "no" | "unknown" {
  const t = (text || "").toLowerCase();
  if (YES_PATTERNS.some((rx) => rx.test(t))) return "yes";
  if (NO_PATTERNS.some((rx) => rx.test(t))) return "no";
  return "unknown";
}

function lastAssistantAskedSuicideQuestion(history: ChatMessage[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "assistant") {
      const t = (m.content || "").toLowerCase();
      return /avez[-\s]?vous\s+des\s+id[ée]es?\s+suicidaires/.test(t) ||
             /as[-\s]?tu\s+des\s+id[ée]es?\s+suicidaires/.test(t);
    }
    if (m.role === "user") break;
  }
  return false;
}


// --- POST handler
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const ALLOWED_BASE = new Set([
    "https://appli.ecole-eft-france.fr",
    "https://www.ecole-eft-france.fr",
  ]);
  function isAllowedOrigin(o: string | null) {
    if (!o) return false;
    const lo = o.toLowerCase();
    if (process.env.VERCEL_ENV === "production") return ALLOWED_BASE.has(lo);
    if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
      return lo === `https://${process.env.VERCEL_URL}` || ALLOWED_BASE.has(lo);
    }
    if (lo.startsWith("http://localhost")) return true;
    return ALLOWED_BASE.has(lo);
  }

  if (!isAllowedOrigin(origin)) {
    return new NextResponse("Origine non autorisée (CORS).", { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Configuration OPENAI manquante." }, { status: 500 });
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

  // --- Optional: inject simple rappels JSON (non-invasive); minimal keys
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

  // ---- Minimal STATE push (ONE push only) that the prompt expects
  const userTurns = history.filter((m) => m.role === "user");
  const lastUserMsg = userTurns[userTurns.length - 1]?.content?.trim() || "";
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant")?.content || "";

  // Detect whether assistant *just asked* for a SUD — loose but practical
  const askedSud = /\b(sud)\b.*(0[–-]?10|0-10|0–10|0 ?[.,] ?10)?|indique\s+(ton|un)\s+sud|donne\s+un\s+sud|indique\s+un\s+nombre/i.test(
    lastAssistant
  );

  // find previous numeric SUD in history (accept decimals with . or ,)
  let prevSud: number | null = null;
  const numericRx = /([0-9]{1,2}(?:[.,][0-9]+)?)/; // captures 0..10 and decimals
  for (let i = history.length - 2; i >= 0; i--) {
    const m = history[i];
    if (m.role === "user") {
      const mm = (m.content || "").match(numericRx);
      if (mm) {
        const v = parseFloat(mm[1].replace(",", "."));
        if (!Number.isNaN(v) && v >= 0 && v <= 10) {
          prevSud = v;
          break;
        }
      }
    }
  }

  // Does the last user message include a numeric SUD already?
  const lastUserHasNumber = Boolean(lastUserMsg.match(numericRx) && (() => {
    const mm = lastUserMsg.match(numericRx);
    if (!mm) return false;
    const v = parseFloat(mm[1].replace(",", "."));
    return !Number.isNaN(v) && v >= 0 && v <= 10;
  })());

  // awaiting_sud is helpful for the prompt but optional — minimal boolean
  const awaiting_sud = askedSud && !lastUserHasNumber;

  // Single STATE object push (minimal, prompt remains authoritative)
  const stateObj = {
    meta: "STATE",
    history_len: history.length,
    last_user: lastUserMsg,
    asked_sud: askedSud,
    awaiting_sud,
    prev_sud: prevSud,
  };

  messages.push({
    role: "user",
    content: JSON.stringify(stateObj),
  });

  // Minimal gentle reminder (do not duplicate prompt logic)
  messages.push({
    role: "user",
    content: "NOTE: STATE fourni — laisse le SYSTEM PROMPT diriger le flux. N'implémente pas de logique serveur ici.",
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

// Preflight CORS
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
