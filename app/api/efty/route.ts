import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { EFT_SYSTEM_PROMPT } from "./eft-prompt"; // garde ton fichier où il est

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
  // douleur thoracique/dyspnée
  "douleur violente à la poitrine","douleur forte à la poitrine","oppression thoracique",
  "difficulté à respirer","je n'arrive plus à respirer","essoufflement important",
  // signes neuro/AVC
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

// Question standard qu’on veut poser 2 fois max
function isCrisisQuestion(s: string) {
  const t = (s || "").toLowerCase();
  return (
    t.includes("as-tu des idées suicidaires") ||
    t.includes("as tu des idees suicidaires")
  );
}

function isExplicitYes(s: string) { return /^(oui|yes)\b/i.test((s || "").trim()); }
function isExplicitNo(s: string)  { return /^(non|no)\b/i.test((s || "").trim()); }

// Si l’assistant suggère une alerte forte
function assistantSuggestsAlert(s: string) {
  const t = (s || "").toLowerCase();
  return t.includes("danger immédiat") || t.includes("urgence") || t.includes("appelle le");
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
      { role: "user", content: userText.slice(0, 2000) }, // borne de prudence
    ],
  });
  const label = String(completion.choices[0]?.message?.content || "").trim().toLowerCase();
  return label === "hit" ? "hit" : "safe";
}

// Empathic closings
const CLOSING_SUICIDE = `Je te prends au sérieux. Je ne peux pas poursuivre une séance d’EFT en situation d’urgence.
Ta sécurité est prioritaire : appelle le 3114 (24/7, gratuit), le 112 (urgences) ou le 15 (SAMU) dès maintenant.
Je reste avec toi en pensée — prends soin de toi.`;

const CLOSING_MEDICAL = `Je comprends ta situation et je suis inquiet·ète pour ta santé. Je ne peux pas poursuivre une séance d’EFT en cas d’urgence médicale.
Merci d’appeler les secours : 112 (urgences) ou le 15 (SAMU). Si tu es avec quelqu’un, demande-lui de t’aider à appeler.`;

// Politique : 2 questions → lock si pas de NON, oui explicite → lock, non explicite → none.
// suicide/medical “hit” → lock (sans poser de diagnostic pour le médical).
function computeCrisis(
  history: ChatMessage[],
  modelAnswer: string,
  suicideLLM: "hit" | "safe",
  medicalLLM: "hit" | "safe"
): { crisis: Crisis; reason: "none" | "suicide" | "medical" } {
  const lastUser = [...history].reverse().find(m => m.role === "user")?.content ?? "";
  const lastAssistant = [...history].reverse().find(m => m.role === "assistant")?.content ?? "";

  // 1) Urgences médicales → lock direct
  if (containsAny(lastUser, MEDICAL_TRIGGERS) || medicalLLM === "hit") {
    return { crisis: "lock", reason: "medical" };
  }

  // 2) Suicidaire : règle stricte
  // indices des questions posées
  const asks: number[] = [];
  history.forEach((m, i) => { if (m.role === "assistant" && isCrisisQuestion(m.content)) asks.push(i); });
  const lastAskIdx = asks.length ? asks[asks.length - 1] : -1;

  // réponse utilisateur après la dernière question
  let userAfterLastAsk: string | null = null;
  if (lastAskIdx >= 0) {
    const nextUser = history.slice(lastAskIdx + 1).find(m => m.role === "user");
    userAfterLastAsk = nextUser?.content ?? null;
  }

  if (userAfterLastAsk && isExplicitYes(userAfterLastAsk)) return { crisis: "lock", reason: "suicide" };
  if (userAfterLastAsk && isExplicitNo(userAfterLastAsk))  return { crisis: "none", reason: "none" };

  // 2 questions déjà posées → lock si pas de NON explicite
  if (asks.length >= 2) return { crisis: "lock", reason: "suicide" };

  // 3) Sinon, passage en ASK si signaux (sans lock)
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

  // Analyse mixte du dernier message user (si inexistant, on envoie "safe")
  const lastUserMsg = [...history].reverse().find(m => m.role === "user")?.content ?? "";
  const [suicideLLM, medicalLLM] = await Promise.all([
    lastUserMsg ? llmFlag("suicide", lastUserMsg) : Promise.resolve<"hit" | "safe">("safe"),
    lastUserMsg ? llmFlag("medical", lastUserMsg) : Promise.resolve<"hit" | "safe">("safe"),
  ]);

  const { crisis, reason } = computeCrisis(history, answer, suicideLLM, medicalLLM);

  // Fermeture empathique si lock (suicide ou médical)
  if (crisis === "lock") {
    answer = reason === "medical" ? CLOSING_MEDICAL : CLOSING_SUICIDE;
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
