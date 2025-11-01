// app/api/efty/route.ts
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { EFT_SYSTEM_PROMPT } from "./eft-prompt"; // garde ton fichier au même endroit

// ---------- Types ----------
type Role = "user" | "assistant";
interface ChatMessage { role: Role; content: string; }
interface RequestBody { messages?: ChatMessage[]; }
type Crisis = "none" | "ask" | "lock";

// ---------- CORS (simple) ----------
const ALLOWED_ORIGINS = [
  "https://ecole-eft-france.fr",
  "https://www.ecole-eft-france.fr",
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "",
  "http://localhost:3000",
].filter(Boolean);

function corsHeaders(origin: string | null) {
  const h: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    h["Access-Control-Allow-Origin"] = origin;
    h["Vary"] = "Origin";
  }
  return h;
}

// ---------- Détection locale : suicide & médical ----------
const SUICIDE_TRIGGERS = [
  // directs
  "suicide","me suicider","idées suicidaires","envie d'en finir",
  "mettre fin à mes jours","je veux mourir","je vais me tuer",
  // implicites fréquents
  "plus envie de vivre","je veux tout arrêter","je veux que tout s'arrête",
  "je veux disparaître","je ne vois plus de sens","tout le monde serait mieux sans moi",
  "je veux dormir pour toujours","je veux me faire du mal","me blesser","me couper",
  "plus la force","plus d'espoir","je n'en peux plus de vivre",
];

const MEDICAL_TRIGGERS = [
  // douleur thoracique / dyspnée
  "douleur violente à la poitrine","douleur forte à la poitrine","oppression thoracique",
  "difficulté à respirer","je n'arrive plus à respirer","essoufflement important",
  // signes neuro
  "faiblesse d'un côté","paralysie d'un côté","bouche de travers",
  "troubles de la parole soudains","parler devient difficile",
  // trauma/saignement
  "saignement abondant","hémorragie","traumatisme crânien",
  "perte de connaissance","je me suis évanoui","perdu connaissance",
  // douleur aiguë inhabituelle
  "douleur intense soudaine","douleur insupportable",
];

function containsAny(hay: string, list: string[]) {
  const t = (hay || "").toLowerCase();
  return list.some(k => t.includes(k));
}

// ——— Suicide : question standard posée par l’assistant
function isCrisisQuestion(s: string) {
  const t = (s || "").toLowerCase();
  return (
    t.includes("as-tu des idées suicidaires") ||
    t.includes("as tu des idees suicidaires")
  );
}
function isExplicitYes(s: string)  { return /^(oui|yes)\b/i.test((s || "").trim()); }
function isExplicitNo(s: string)   { return /^(non|no)\b/i.test((s || "").trim()); }
function assistantSuggestsAlert(s: string) {
  const t = (s || "").toLowerCase();
  return t.includes("danger immédiat") || t.includes("urgence") || t.includes("appelle le");
}

// ——— Médical : question de triage (spontané vs choc)
// (on ne considère PLUS “effort” comme rassurant)
function isMedicalClarifierQuestion(s: string) {
  const t = (s || "").toLowerCase();
  return t.includes("spontané") && t.includes("choc");
}
// Toute douleur “spontané / au repos / après effort” = urgence
// Seul un “choc / coup / trauma / après une chute” est considéré non-urgent
function classifyMedicalReply(s: string | null): "spontane" | "choc" | "unknown" {
  const t = (s || "").trim().toLowerCase();
  if (!t) return "unknown";
  if (
    /\bspontan(e|é)\b/.test(t) ||
    t.includes("au repos") ||
    t.includes("effort") ||
    t.includes("sans choc")
  ) return "spontane";
  if (
    /\bchoc\b/.test(t) ||
    t.includes("coup") ||
    t.includes("trauma") ||
    t.includes("après une chute")
  ) return "choc";
  return "unknown";
}

// ---------- OpenAI ----------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// Analyseur LLM minimaliste (retourne un label court)
async function llmFlag(
  kind: "suicide" | "medical",
  userText: string
): Promise<"hit" | "safe"> {
  const detectorPrompt =
    kind === "suicide"
      ? `Tu es un détecteur de crise suicidaire. Analyse objectivement le message.
Réponds UNIQUEMENT par "hit" si tu suspectes un risque suicidaire ou "safe" sinon. Aucune explication.`
      : `Tu es un détecteur d'urgence médicale. Analyse objectivement le message.
Réponds UNIQUEMENT par "hit" si tu suspectes une urgence médicale (douleur thoracique sévère, détresse respiratoire, signes d'AVC, hémorragie, perte de connaissance, etc.) ou "safe" sinon. Aucune explication.`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 2,
    messages: [
      { role: "system", content: detectorPrompt },
      { role: "user", content: userText.slice(0, 2000) },
    ],
  });

  const label = String(completion.choices[0]?.message?.content || "").trim().toLowerCase();
  return label === "hit" ? "hit" : "safe";
}

// ---------- Questions fixes (utilisées quand crisis === "ask") ----------
const SUICIDE_QUESTION_TEXT =
  "As-tu des idées suicidaires en ce moment ? Réponds par **oui** ou **non**, s’il te plaît.";

const MEDICAL_TRIAGE_QUESTION =
  "Cette douleur est-elle apparue **spontanément** (au repos / après un effort) ou **suite à un **choc** récent ? Réponds par **spontané** ou **choc**.";

// Fermetures empathiques
const CLOSING_SUICIDE = `Je te prends profondément au sérieux. 
Tu vis un moment très difficile et tu n’as pas à le traverser seul·e.  
Je ne peux pas poursuivre la séance d’EFT car une situation d’urgence demande un soutien humain direct.

Appelle dès maintenant :
• **3114** — Prévention du suicide (gratuit, 24h/24 et 7j/7)  
• **112** — Urgences  
• **15** — SAMU (si tu es en danger immédiat)

Si quelqu’un est près de toi, parle-lui ou demande-lui de t’aider à appeler.  
Tu comptes, ta présence est importante. ❤️  
Je reste avec toi en pensée.`;


const CLOSING_MEDICAL = `Je comprends que tu vis une situation intense et cela m’inquiète pour ta sécurité.  
Je ne peux pas poursuivre une séance d’EFT dans une situation qui peut relever d’une urgence médicale.

Je t’invite à appeler sans attendre :
• **112** — Urgences (gratuit, accessible partout dans l’UE)  
• **15** — SAMU (France)

Si quelqu’un est près de toi, demande-lui de t’aider à passer l’appel.  
Prends soin de toi avant tout, c’est la priorité absolue. ❤️ `;




// Politique : suicide = 2 questions max → lock si pas de NON ; médical = triage d’abord
function computeCrisis(
  history: ChatMessage[],
  modelAnswer: string,
  suicideLLM: "hit" | "safe",
  medicalLLM: "hit" | "safe"
): { crisis: Crisis; reason: "none" | "suicide" | "medical" } {

  const lastUser = [...history].reverse().find(m => m.role === "user")?.content ?? "";

  // ===== 1) URGENCE MÉDICALE : poser d'abord 1 question de triage
  const medicalSuspicion = containsAny(lastUser, MEDICAL_TRIGGERS) || medicalLLM === "hit";

  if (medicalSuspicion) {
    // a) si l’assistant a déjà posé la question de triage, on regarde la réponse utilisateur
    const askIdxs: number[] = [];
    history.forEach((m, i) => { if (m.role === "assistant" && isMedicalClarifierQuestion(m.content)) askIdxs.push(i); });
    const lastMedAskIdx = askIdxs.length ? askIdxs[askIdxs.length - 1] : -1;

    if (lastMedAskIdx >= 0) {
      const userAfter = history.slice(lastMedAskIdx + 1).find(m => m.role === "user")?.content ?? null;
      const cls = classifyMedicalReply(userAfter);

      if (cls === "spontane") return { crisis: "lock", reason: "medical" };
      if (cls === "choc")     return { crisis: "none", reason: "none" };
      // réponse floue/absente → on reste en ASK et on (re)pose la question
      return { crisis: "ask", reason: "medical" };
    }

    // b) suspicion médicale détectée mais question pas encore posée → ASK (pas de lock)
    return { crisis: "ask", reason: "medical" };
  }

  // ===== 2) SUICIDE : règle 2 questions → lock
  // indices des questions posées
  const asks: number[] = [];
  history.forEach((m, i) => { if (m.role === "assistant" && isCrisisQuestion(m.content)) asks.push(i); });
  const lastAskIdx = asks.length ? asks[asks.length - 1] : -1;

  // réponse utilisateur après la dernière question
  let userAfterLastAsk: string | null = null;
  if (lastAskIdx >= 0) {
    userAfterLastAsk = history.slice(lastAskIdx + 1).find(m => m.role === "user")?.content ?? null;
  }

  if (userAfterLastAsk && isExplicitYes(userAfterLastAsk)) return { crisis: "lock", reason: "suicide" };
  if (userAfterLastAsk && isExplicitNo(userAfterLastAsk))  return { crisis: "none", reason: "none" };
  if (asks.length >= 2)                                    return { crisis: "lock", reason: "suicide" };

  // signaux souples -> ASK (jamais lock sans oui / 2 questions)
  if (containsAny(lastUser, SUICIDE_TRIGGERS) || suicideLLM === "hit" || assistantSuggestsAlert(modelAnswer)) {
    return { crisis: "ask", reason: "suicide" };
  }

  return { crisis: "none", reason: "none" };
}

// ---------- ROUTES ----------
export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const body = (await req.json()) as RequestBody;
  const history: ChatMessage[] = Array.isArray(body.messages) ? body.messages : [];

  // Messages pour EFTY (prompt système + historique)
  const messagesForLLM: ChatCompletionMessageParam[] = [
    { role: "system", content: EFT_SYSTEM_PROMPT },
    ...history.map<ChatCompletionMessageParam>(m => ({ role: m.role, content: m.content })),
  ];

  // Réponse principale d’EFTY
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    messages: messagesForLLM,
  });
  let answer = String(completion.choices[0]?.message?.content ?? "").trim();

  // Analyse mixte du dernier message user
  const lastUserMsg = [...history].reverse().find(m => m.role === "user")?.content ?? "";
  const [suicideLLM, medicalLLM] = await Promise.all([
    lastUserMsg ? llmFlag("suicide", lastUserMsg) : Promise.resolve<"hit" | "safe">("safe"),
    lastUserMsg ? llmFlag("medical", lastUserMsg) : Promise.resolve<"hit" | "safe">("safe"),
  ]);

  const { crisis, reason } = computeCrisis(history, answer, suicideLLM, medicalLLM);

  // ——— Forcer le message renvoyé selon l’état d’urgence
  if (crisis === "lock") {
    // Fermeture empathique (déjà OK)
    answer = reason === "medical" ? CLOSING_MEDICAL : CLOSING_SUICIDE;
  } else if (crisis === "ask") {
    // ✅ On remplace la réponse libre du modèle par LA question obligatoire
    answer = reason === "medical" ? MEDICAL_TRIAGE_QUESTION : SUICIDE_QUESTION_TEXT;
    // (pas de lock ici : on attend la réponse utilisateur)
  }

  return new NextResponse(JSON.stringify({ answer, crisis }), {
    headers,
    status: 200,
  });
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);
  headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  return new NextResponse(null, { headers, status: 204 });
}
