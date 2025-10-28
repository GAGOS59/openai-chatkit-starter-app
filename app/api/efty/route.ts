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
function isChatMessageArray(x: unknown): x is ChatMessage[] {
  if (!Array.isArray(x)) return false;
  return x.every((m) => {
    if (typeof m !== "object" || m === null) return false;
    const role = (m as Record<string, unknown>).role;
    const content = (m as Record<string, unknown>).content;
    return (role === "user" || role === "assistant") && typeof content === "string";
  });
}

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

/* ---------- Sécurité suicidaire : regex précises ---------- */
const CRISIS_HARD: RegExp[] = [
  /\bsuicide\b/iu, // mot suicide exact (accent tolerant)
  /\bme\s+tuer\b/iu,
  /\bme\s+pendre\b/iu,
  /\bme\s+suicid(er|e)\b/iu,
  /\bmettre\s+fin\s+à\s+mes?\s+jours?\b/iu,
  /\bje\s+veux\s+mourir\b/iu,
];

const CRISIS_SOFT: RegExp[] = [
  /\bj[’']?\s*en\s+peux?\s+plus\b/iu,
  /\bj[’']?\s*en\s+ai\s+marre\b/iu,
  /\bmarre\s+de\s+vivre\b/iu,
  /\bidees?\s+noires?\b/iu,
  /\bje\s+ne\s+veux\s+plus\s+vivre\b/iu,
  /\bje\s+supporte\s+plus\s+la\s+vie\b/iu,
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
];
const NO_PATTERNS: RegExp[] = [
  /\b(non|nan|nope)\b/i,
  /\b(pas\s+du\s+tout|absolument\s+pas|vraiment\s+pas)\b/i,
  /\bje\s+n['’]?ai\s+pas\s+d['’]?idees?\s+suicidaires?\b/i,
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
      if (/avez[-\s]?vous\s+des\s+idees?\s+suicidaires/.test(t) || /as[-\s]?tu\s+des\s+idees?\s+suicidaires/.test(t)) {
        return true;
      }
    }
    if (m.role === "user") break;
  }
  return false;
}

/* ---------- FUZZY DETECTION ---------- */
function normalizeTextForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const v0 = new Array<number>(bl + 1);
  const v1 = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) v0[j] = j;
  for (let i = 0; i < al; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < bl; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= bl; j++) v0[j] = v1[j];
  }
  return v1[bl];
}

const KEYWORDS_HARD_RAW = [
  "suicide",
  "me tuer",
  "me pendre",
  "me suicider",
  "mettre fin a mes jours",
  "je veux mourir",
];

const KEYWORDS_SOFT_RAW = [
  "me foutre en l'air",
  "j en ai marre",
  "j en peux plus",
  "marre de vivre",
  "idees noires",
  "je ne veux plus vivre",
  "je supporte plus la vie",
];

const KEYWORDS_HARD = KEYWORDS_HARD_RAW.map(normalizeTextForMatch);
const KEYWORDS_SOFT = KEYWORDS_SOFT_RAW.map(normalizeTextForMatch);

function generateNgrams(tokens: string[], maxWords = 4): string[] {
  const out: string[] = [];
  for (let start = 0; start < tokens.length; start++) {
    for (let len = 1; len <= maxWords && start + len <= tokens.length; len++) {
      out.push(tokens.slice(start, start + len).join(" "));
    }
  }
  return out;
}

function fuzzyDetectKeywords(text: string, keywords: string[]): { matched: string; distance: number } | null {
  const norm = normalizeTextForMatch(text);
  if (!norm) return null;
  const tokens = norm.split(" ").filter(Boolean);
  const ngrams = generateNgrams(tokens, 4);

  for (const ng of ngrams) {
    for (const kw of keywords) {
      const maxDist = Math.max(1, Math.floor(Math.min(3, kw.length * 0.25)));
      const dist = levenshtein(ng, kw);
      if (dist <= maxDist) {
        return { matched: kw, distance: dist };
      }
      if (ng.includes(kw) || kw.includes(ng)) {
        return { matched: kw, distance: 0 };
      }
    }
  }
  return null;
}

/* ---------- ROUTE ---------- */
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

  const userTurns = history.filter((m) => m.role === "user");
  const lastUserMsg = userTurns[userTurns.length - 1]?.content?.trim() || "";
  const lastAssistant = [...history].reverse().find((m) => m.role === "assistant")?.content || "";

  const askedSud = /\b(sud)\b.*(0[–-]?10|0-10|0–10|0 ?[.,] ?10)?|indique\s+(ton|un)\s+sud|donne\s+un\s+sud|indique\s+un\s+nombre/i.test(
    lastAssistant
  );

  let prevSud: number | null = null;
  const numericRx = /([0-9]{1,2}(?:[.,][0-9]+)?)/;
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

  const lastUserHasNumber = Boolean(lastUserMsg.match(numericRx) && (() => {
    const mm = lastUserMsg.match(numericRx);
    if (!mm) return false;
    const v = parseFloat(mm[1].replace(",", "."));
    return !Number.isNaN(v) && v >= 0 && v <= 10;
  })());

  const awaiting_sud = askedSud && !lastUserHasNumber;

  const stateObj = {
    meta: "STATE",
    history_len: history.length,
    last_user: lastUserMsg,
    asked_sud: askedSud,
    awaiting_sud,
    prev_sud: prevSud,
    assistant_asked_suicide_question: lastAssistantAskedSuicideQuestion(history),
    recent_suicide_answer: interpretYesNoServer(lastUserMsg),
  };

  messages.push({
    role: "user",
    content: JSON.stringify(stateObj),
  });

  messages.push({
    role: "user",
    content: "NOTE: STATE fourni — laisse le SYSTEM PROMPT diriger le flux. N'implémente pas de logique serveur ici.",
  });

  // ---- SERVEUR : logique suicidaire prioritaire (PRIORITAIRE)
  const combinedText = (history.map((m) => m.content).join(" ") + " " + lastUserMsg).trim();

  // 1) Regex hard (exact) -> blocage immédiat
  if (anyMatch(CRISIS_HARD, combinedText)) {
    return new NextResponse(JSON.stringify({
      answer: crisisOrientationMessage_TU(),
      crisis: "hard",
      blocked: true,
      note: "server_detected_hard_crisis_regex",
    }), { headers });
  }

  // 2) Regex soft -> poser la question (ou interpréter si déjà posée)
  if (anyMatch(CRISIS_SOFT, combinedText)) {
    const assistantAsked = lastAssistantAskedSuicideQuestion(history);
    const recentAnswer = interpretYesNoServer(lastUserMsg);

    if (assistantAsked) {
      if (recentAnswer === "yes") {
        return new NextResponse(JSON.stringify({
          answer: crisisOrientationMessage_TU(),
          crisis: "soft_confirmed",
          blocked: true,
          note: "user_confirmed_suicidal",
        }), { headers });
      } else if (recentAnswer === "no") {
        // laisser passer : on appellera OpenAI plus bas
      } else {
        return new NextResponse(JSON.stringify({
          answer: "Je n'ai pas bien compris. " + ASK_SUICIDE_Q_TU,
          crisis: "soft",
          blocked: false,
          askQuestion: true,
          note: "clarify_yes_no",
        }), { headers });
      }
    } else {
      const empathic = `Je suis vraiment désolé·e que tu te sentes ainsi. Merci de me le dire — ta sécurité est ma priorité. ${ASK_SUICIDE_Q_TU}`;
      return new NextResponse(JSON.stringify({
        answer: empathic,
        crisis: "soft",
        blocked: false,
        askQuestion: true,
        note: "ask_yes_no_first",
      }), { headers });
    }
  }

  // 3) Fuzzy soft (prioritaire avant fuzzy hard) -> poser la question
  const fuzzySoft = fuzzyDetectKeywords(combinedText, KEYWORDS_SOFT);
  if (fuzzySoft) {
    console.warn("server: fuzzy soft match", { matched: fuzzySoft.matched, dist: fuzzySoft.distance });
    const assistantAsked = lastAssistantAskedSuicideQuestion(history);
    if (!assistantAsked) {
      const empathic = `Je suis vraiment désolé·e que tu te sentes ainsi. Merci de me le dire — ta sécurité est ma priorité. ${ASK_SUICIDE_Q_TU}`;
      return new NextResponse(JSON.stringify({
        answer: empathic,
        crisis: "soft",
        blocked: false,
        askQuestion: true,
        note: "ask_yes_no_first_fuzzy",
        matched: fuzzySoft.matched,
        distance: fuzzySoft.distance,
      }), { headers });
    } else {
      const recentAnswer = interpretYesNoServer(lastUserMsg);
      if (recentAnswer === "yes") {
        return new NextResponse(JSON.stringify({
          answer: crisisOrientationMessage_TU(),
          crisis: "soft_confirmed",
          blocked: true,
          note: "user_confirmed_suicidal_fuzzy",
          matched: fuzzySoft.matched,
          distance: fuzzySoft.distance,
        }), { headers });
      } else if (recentAnswer === "no") {
        // laisser passer
      } else {
        return new NextResponse(JSON.stringify({
          answer: "Je n'ai pas bien compris. " + ASK_SUICIDE_Q_TU,
          crisis: "soft",
          blocked: false,
          askQuestion: true,
          note: "clarify_yes_no_fuzzy",
        }), { headers });
      }
    }
  }

  // 4) Fuzzy hard (stricte) -> si exact (distance===0) hard block, si proche (distance<=1) traiter comme soft (poser question)
  const fuzzyHard = fuzzyDetectKeywords(combinedText, KEYWORDS_HARD);
  if (fuzzyHard) {
    if (fuzzyHard.distance === 0) {
      console.warn("server: fuzzy hard exact match", { matched: fuzzyHard.matched });
      return new NextResponse(JSON.stringify({
        answer: crisisOrientationMessage_TU(),
        crisis: "hard",
        blocked: true,
        note: "server_detected_hard_crisis_fuzzy_exact",
        matched: fuzzyHard.matched,
      }), { headers });
    }
    // proche typo => route as soft (ask question) to avoid immediate block
    if (fuzzyHard.distance <= 1) {
      console.warn("server: fuzzy hard close -> treat as soft", { matched: fuzzyHard.matched, dist: fuzzyHard.distance });
      const assistantAsked = lastAssistantAskedSuicideQuestion(history);
      if (!assistantAsked) {
        const empathic = `Je suis vraiment désolé·e que tu te sentes ainsi. Merci de me le dire — ta sécurité est ma priorité. ${ASK_SUICIDE_Q_TU}`;
        return new NextResponse(JSON.stringify({
          answer: empathic,
          crisis: "soft",
          blocked: false,
          askQuestion: true,
          note: "fuzzy_hard_near_treated_as_soft",
          matched: fuzzyHard.matched,
          distance: fuzzyHard.distance,
        }), { headers });
      } else {
        const recentAnswer = interpretYesNoServer(lastUserMsg);
        if (recentAnswer === "yes") {
          return new NextResponse(JSON.stringify({
            answer: crisisOrientationMessage_TU(),
            crisis: "soft_confirmed",
            blocked: true,
            note: "user_confirmed_suicidal_after_fuzzy_hard",
            matched: fuzzyHard.matched,
            distance: fuzzyHard.distance,
          }), { headers });
        } else if (recentAnswer === "no") {
          // laisser passer
        } else {
          return new NextResponse(JSON.stringify({
            answer: "Je n'ai pas bien compris. " + ASK_SUICIDE_Q_TU,
            crisis: "soft",
            blocked: false,
            askQuestion: true,
            note: "clarify_yes_no_after_fuzzy_hard",
          }), { headers });
        }
      }
    }
  }

  // 5) Aucun indice suicidaire -> appel OpenAI normal
  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.5,
      messages,
    });

    const text =
      completion.choices?.[0]?.message?.content?.trim() ??
      "Je n’ai pas compris. Peux-tu reformuler en une phrase courte ?";

    return new NextResponse(JSON.stringify({ answer: text, crisis: "none", blocked: false }), { headers });
  } catch (err) {
    console.error("openai error:", err);
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
