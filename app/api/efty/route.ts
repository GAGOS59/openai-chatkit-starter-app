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
  "https://appli.ecole-eft-france.fr",
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
// normalisation simple : minuscules, retire accents, supprime ponctuation excessive
function normalizeText(s: string | null): string {
  if (!s) return "";
  // supprime accents (NFD) et les marques diacritiques
  const noAccents = s.normalize("NFD").replace(/\p{M}/gu, "");
  // garde lettres/chiffres/espaces, remplace le reste par espace, compacte espaces
  return noAccents.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ——— Médical : question de triage (spontané vs choc)
// plus tolérante : reconnaît "spontané", "spontanément", "au repos", "après un effort", "effort", "en courant", ...
function isMedicalClarifierQuestion(s: string) {
  const t = normalizeText(s);
  // On identifie la question de triage si elle parle explicitement de "douleur" ET évoque les deux axes possibles
  const mentionDouleur = t.includes("douleur") || t.includes("douleurs") || t.includes("douleur poitrine") || t.includes("douleur thoracique");
  const mentionsSpontane = t.includes("spontan") || t.includes("au repos") || t.includes("apres effort") || t.includes("apres un effort") || t.includes("effort") || t.includes("en courant") || t.includes("en march");
  const mentionsChoc = t.includes("choc") || t.includes("coup") || t.includes("trauma") || t.includes("chute") || t.includes("heurter") || t.includes("collision");
  return mentionDouleur && (mentionsSpontane || mentionsChoc);
}


/**
 * Mappe la réponse utilisateur à "spontane" | "choc" | "unknown".
 * Très tolérante : accepte "effort", "en courant", "je courais", "après avoir couru", "marche", etc.
 */
function classifyMedicalReply(s: string | null): "spontane" | "choc" | "unknown" {
  const t = normalizeText(s);
  if (!t) return "unknown";

  // tokens indicateurs pour choc/trauma
  const chocTokens = [
    "choc", "coup", "traum", "chute", "heurter", "collision", "tomber", "frapper", "fracture"
  ];
  // tokens indicateurs pour effort / activité → on traite comme "spontane"
  const effortTokens = [
    "spontan", "spontane", "spontanement", "au repos",
    "apres effort", "apres un effort", "apres une effort", "apres avoir", "effort",
    "en courant", "courir", "courais", "couru", "course", "jogging",
    "marche", "marcheur", "sport", "exercice", "entrainement", "porter", "soulever"
  ];

  // d'abord les signes de choc (priorité pour éviter faux positifs)
  if (chocTokens.some(tok => t.includes(tok))) return "choc";

  // ensuite les signes d'effort/spontané
  if (effortTokens.some(tok => t.includes(tok))) return "spontane";

  // couverture explicite pour "spontané"/"spontanement"
  if (/\bspontan(?:e|ement)?\b/.test(t)) return "spontane";

  // si l'utilisateur répond par un mot court comme "effort"
  if (t === "effort" || t === "en courant" || t === "courir" || t === "cours" || t === "course") return "spontane";

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
Réponds UNIQUEMENT par "hit" si tu suspectes une urgence médicale (douleur thoracique sévère, détresse respiratoire, signes d'AVC, hémorragie, perte de connaissance, etc.) ou "safe" sinon. Conseil de consulter un médecin pour s'en assurer.`;

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
  "Cette douleur est-elle apparue **spontanément** (au repos / après un effort — ex. « effort », « en courant ») ou **suite à un choc** récent ? Réponds par **spontané** ou **choc**.";

// **Question de clarification** lorsque le message contient à la fois des signaux médicaux et suicidaires
const CLARIFY_PHYSICAL_OR_SUICIDE =
  "Je veux bien comprendre pour t'aider correctement : parles-tu d'une **douleur physique** (réponds `douleur`) ou de **pensées de te faire du mal / d'en finir** (réponds `pensées`) ?";

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
Je ne peux pas poursuivre une séance d’EFT dans une situation qui peut relever d’une urgence médicale et demander une intervention humaine rapide.

Je t’invite à appeler sans attendre :
• **112** — Urgences (gratuit, accessible partout dans l’UE)  
• **15** — SAMU (France)

Si quelqu’un est près de toi, demande-lui de t’aider à passer l’appel.  
Prends soin de toi avant tout, c’est la priorité absolue. ❤️ `;

// ---------- computeCrisis (remplacée : gère clarify, medical, suicide, none) ----------
function computeCrisis(
  history: ChatMessage[],
  modelAnswer: string,
  suicideLLM: "hit" | "safe",
  medicalLLM: "hit" | "safe"
): { crisis: Crisis; reason: "none" | "suicide" | "medical" | "clarify" } {

  const lastUser = [...history].reverse().find(m => m.role === "user")?.content ?? "";

  // Signaux individuels
  const hasSuicideKeyword = containsAny(lastUser, SUICIDE_TRIGGERS);
  const hasMedicalKeyword = containsAny(lastUser, MEDICAL_TRIGGERS);
  const suicideSignal = hasSuicideKeyword || suicideLLM === "hit" || assistantSuggestsAlert(modelAnswer);
  const medicalSignal = hasMedicalKeyword || medicalLLM === "hit";

  // 1) Si uniquement suicide -> ASK suicide
  if (suicideSignal && !medicalSignal) {
    // suicide questions / checks (comme avant)
    const asks: number[] = [];
    history.forEach((m, i) => { if (m.role === "assistant" && isCrisisQuestion(m.content)) asks.push(i); });
    const lastAskIdx = asks.length ? asks[asks.length - 1] : -1;

    let userAfterLastAsk: string | null = null;
    if (lastAskIdx >= 0) {
      userAfterLastAsk = history.slice(lastAskIdx + 1).find(m => m.role === "user")?.content ?? null;
    }

    if (userAfterLastAsk && isExplicitYes(userAfterLastAsk)) return { crisis: "lock", reason: "suicide" };
    if (userAfterLastAsk && isExplicitNo(userAfterLastAsk))  return { crisis: "none", reason: "none" };
    if (asks.length >= 2)                                    return { crisis: "lock", reason: "suicide" };

    return { crisis: "ask", reason: "suicide" };
  }

  // 2) Si uniquement médical -> ASK médical (triage)
  if (medicalSignal && !suicideSignal) {
    const askIdxs: number[] = [];
    history.forEach((m, i) => { if (m.role === "assistant" && isMedicalClarifierQuestion(m.content)) askIdxs.push(i); });
    const lastMedAskIdx = askIdxs.length ? askIdxs[askIdxs.length - 1] : -1;

    if (lastMedAskIdx >= 0) {
      const userAfter = history.slice(lastMedAskIdx + 1).find(m => m.role === "user")?.content ?? null;
      const cls = classifyMedicalReply(userAfter);

      if (cls === "spontane") return { crisis: "lock", reason: "medical" };
      if (cls === "choc")     return { crisis: "none", reason: "none" };
      return { crisis: "ask", reason: "medical" };
    }

    return { crisis: "ask", reason: "medical" };
  }

  // 3) Si les deux signaux (med + suicide) -> clarification demandée
  if (medicalSignal && suicideSignal) {
    // Cherche si on avait déjà demandé une clarification type "douleur/pensées"
    const clarifyPatterns = ["parles", "douleur", "pensées", "te faire du mal", "en finir"];
    const assistantClarifyIdxs: number[] = [];
    history.forEach((m, i) => {
      if (m.role === "assistant" && clarifyPatterns.some(p => m.content.toLowerCase().includes(p))) {
        assistantClarifyIdxs.push(i);
      }
    });
    const lastClarifyIdx = assistantClarifyIdxs.length ? assistantClarifyIdxs[assistantClarifyIdxs.length - 1] : -1;

    if (lastClarifyIdx >= 0) {
      const userAfterClarify = history.slice(lastClarifyIdx + 1).find(m => m.role === "user")?.content ?? null;
      if (!userAfterClarify) return { crisis: "ask", reason: "clarify" };

      const t = userAfterClarify.trim().toLowerCase();
      if (/^douleur\b|^douleur|^physique\b|^physique/.test(t)) {
        // utilisateur précise que c'est une douleur → on bascule vers le triage médical
        return { crisis: "ask", reason: "medical" };
      }
      if (/^pensées\b|^pensée\b|^pensées|^je veux|^je vais|^me tuer|^en finir|^me faire du mal/.test(t)) {
        // utilisateur confirme pensées suicidaires → on bascule vers la question suicide
        return { crisis: "ask", reason: "suicide" };
      }

      // si réponse ambigüe, répéter la clarification
      return { crisis: "ask", reason: "clarify" };
    }

    // pas encore clarifié -> demander clarification
    return { crisis: "ask", reason: "clarify" };
  }

  // 4) pas d'alerte
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
    // Fermeture empathique (comme avant)
    answer = reason === "medical" ? CLOSING_MEDICAL : CLOSING_SUICIDE;
  } else if (crisis === "ask") {
    // Si on demande un triage médical explicite
    if (reason === "medical") {
      answer = MEDICAL_TRIAGE_QUESTION;
    } else if (reason === "suicide") {
      answer = SUICIDE_QUESTION_TEXT;
    } else if (reason === "clarify") {
      // Cas où le message révèle à la fois des signaux médicaux et suicidaires :
      // on pose une question de disambiguation courte et neutre.
      answer = CLARIFY_PHYSICAL_OR_SUICIDE;
    } else {
      // fallback (sécurité) : demander la question suicide par défaut
      answer = SUICIDE_QUESTION_TEXT;
    }
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
