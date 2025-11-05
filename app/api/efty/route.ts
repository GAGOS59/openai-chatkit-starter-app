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
  "suicide","me suicider","idées suicidaires","envie d'en finir",
  "mettre fin à mes jours","je veux mourir","je vais me tuer","je veux me tuer",
  "plus envie de vivre","je veux tout arrêter","je veux que tout s'arrête",
  "je veux disparaître","je ne vois plus de sens à la vie","tout le monde serait mieux sans moi",
  "je veux m'endormir pour toujours","je veux me faire du mal","je veux dormir pour toujours",
  "plus la force","plus d'espoir","je n'en peux plus de vivre","je veux m'endormir et ne plus me réveiller",
];

const MEDICAL_TRIGGERS = [
  "douleur violente à la poitrine","douleur forte à la poitrine","oppression thoracique",
  "douleur poitrine","douleur à la poitrine","douleur thoracique",
  "difficulté à respirer","je n'arrive plus à respirer","essoufflement important",
  "faiblesse d'un côté","paralysie d'un côté","bouche de travers",
  "troubles de la parole soudains","parler devient difficile",
  "saignement abondant","hémorragie","traumatisme crânien",
  "perte de connaissance","je me suis évanoui","perdu connaissance",
  "douleur intense soudaine","douleur insupportable",
];

function containsAny(hay: string, list: string[]) {
  const t = (hay || "").toLowerCase();
  return list.some(k => t.includes(k));
}

// ——— Suicide helpers
function isCrisisQuestion(s: string) {
  const t = (s || "").toLowerCase();
  return t.includes("as-tu des idées suicidaires") || t.includes("as tu des idees suicidaires");
}
function isExplicitYes(s: string)  { return /^(oui|yes)\b/i.test((s || "").trim()); }
function isExplicitNo(s: string)   { return /^(non|no)\b/i.test((s || "").trim()); }



// ---------- Normalisation & classification médicales (tolérantes) ----------
function normalizeText(s: string | null): string {
  if (!s) return "";
  try {
    const noAccents = s.normalize("NFD").replace(/\p{M}/gu, "");
    return noAccents.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
}

// question de triage : plus tolérante sur la forme
function isMedicalClarifierQuestion(s: string) {
  const t = normalizeText(s);
  const mentionDouleur = t.includes("douleur") || t.includes("douleurs") || t.includes("douleur poitrine") || t.includes("douleur thoracique");
  const mentionsSpontane = t.includes("spontan") || t.includes("au repos") || t.includes("apres effort") || t.includes("effort") || t.includes("en courant") || t.includes("en march");
  const mentionsChoc = t.includes("choc") || t.includes("coup") || t.includes("trauma") || t.includes("chute") || t.includes("heurter") || t.includes("collision");
  return mentionDouleur && (mentionsSpontane || mentionsChoc);
}

// detecteur d'une question oui/non formatée par notre template
function isMedicalYesNoQuestion(s: string) {
  if (!s) return false;
  const t = s.toLowerCase();
  return t.includes("est-elle apparue spontan") || (t.includes('réponds par "oui"') && t.includes("spontan"));
}

// classifie une réponse utilisateur courte en "spontane" | "choc" | "unknown"
function classifyMedicalReply(s: string | null): "spontane" | "choc" | "unknown" {
  const t = normalizeText(s);
  if (!t) return "unknown";

  const chocTokens = ["choc","coup","traum","chute","heurter","collision","tomber","frapper","fracture"];
  const effortTokens = [
    "spontan","spontane","spontanement","au repos",
    "apres effort","apres un effort","apres une effort","apres avoir","à l'effort","effort",
    "en courant","courir","courais","couru","course","jogging",
    "marche","sport","exercice","entrainement","soulever","porter"
  ];

  if (chocTokens.some(tok => t.includes(tok))) return "choc";
  if (effortTokens.some(tok => t.includes(tok))) return "spontane";
  if (/\bspontan(?:e|ement)?\b/.test(t)) return "spontane";
  if (t === "effort" || t === "en courant" || t === "courir") return "spontane";

  return "unknown";
}

// ---------- OpenAI ----------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// petit wrapper LLM detector (LAISSÉ pour usage médical uniquement)
async function llmFlag(
  kind: "suicide" | "medical",
  userText: string
): Promise<"hit" | "safe"> {
  const detectorPrompt =
    kind === "suicide"
      ? `Tu es un détecteur de crise suicidaire. Analyse objectivement le message.
Réponds UNIQUEMENT par "hit" si tu suspectes un risque suicidaire ou "safe" sinon. Aucune explication.`
      : `Tu es un détecteur d'urgence médicale. Analyse objectivement le message.
Réponds UNIQUEMENT par "hit" si tu suspectes une urgence médicale (douleur thoracique sévère, détresse respiratoire, signes d'AVC, hémorragie, perte de connaissance, etc.) ou "safe" sinon.`;

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

// Template : construit une question oui/non qui reprend le symptôme de l'utilisateur
function MEDICAL_TRIAGE_QUESTION_FOR(symptomRaw: string) {
  const s = (symptomRaw || "").trim();
  const excerpt = s.length > 120 ? s.slice(0, 117).trim() + "…" : s;
  // heuristique simple pour choisir Ce / Cette (prédicat minimal basé sur mots fréquents)
  const lower = excerpt.toLowerCase();
  const feminineIndicators = [
    "douleur", "douleurs", "naus", "oppression", "fatigue", "nausée", "nausées", "gêne", "gène",
    "oppression thoracique", "douleur thoracique", "douleur poitrine"
  ];
  const article = feminineIndicators.some(tok => lower.startsWith(tok) || lower.includes(tok)) ? "Cette" : "Ce";
  // accord du verbe selon le genre
  const verb = article === "Cette" ? "est-elle apparue" : "est-il apparu";
  // phrase finale (plus naturelle, poli et claire)
  return `${article} "${excerpt}" ${verb} spontanément, sans choc (tu ne t'es pas cogné·e ni reçu un coup) ? Réponds par "oui" ou "non".`;
}

// Fermetures empathiques
const CLOSING_SUICIDE = `Je te prends profondément au sérieux. 
Il semble que tu traverses un moment très difficile — tu n'as pas à le vivre seul·e.

Je ne peux pas poursuivre la séance d'EFT dans cette situation : il est important de contacter immédiatement une aide humaine.
Appelle s'il te plaît **en priorité** :
• **3114** — Prévention du suicide (gratuit, 24h/24 et 7j/7) — France (service spécialisé)
Ensuite si besoin :
• **112** — Urgences (numéro européen)  
• **15** — SAMU (France)

Si quelqu’un est près de toi, demande-lui de t’aider à appeler maintenant.
Reste avec la personne qui écoute et, si possible, mets-toi en lieu sûr.

Tu comptes, ta présence est importante. Je suis de tout cœur avec toi. ❤️
(Je suspends la séance pour prioriser ta sécurité.)`;

const CLOSING_MEDICAL = `Je comprends que tu vis une situation préoccupante pour ta santé. 
Si tu présentes un symptôme grave (douleur thoracique importante, difficulté à respirer, perte de connaissance, faiblesse soudaine d'un côté, trouble brutal de la parole, saignement abondant, traumatisme grave, etc.), appelle immédiatement les secours.

• **112** — Urgences (numéro européen)  
• **15** — SAMU (France)

Si quelqu’un est près de toi, demande-lui de t’aider à appeler.  
Si tu es seul·e, mets-toi en sécurité (allongé·e si besoin), évite tout effort et attends les secours.  
Ta sécurité passe avant tout — je suspends la séance pour prioriser ton accompagnement médical.`;

// ---------- computeCrisis (gestion clarify / medical / suicide / none) ----------
function computeCrisis(
  history: ChatMessage[],
  modelAnswer: string,
  suicideLLM: "hit" | "safe",
  medicalLLM: "hit" | "safe"
): { crisis: Crisis; reason: "none" | "suicide" | "medical" | "clarify" } {

  const lastUser = [...history].reverse().find(m => m.role === "user")?.content ?? "";

  // détection simple par liste
  const hasSuicideKeyword = containsAny(lastUser, SUICIDE_TRIGGERS);
  const hasMedicalKeyword = containsAny(lastUser, MEDICAL_TRIGGERS);

  // --- MUTUELLEMENT EXCLUSIF (priorité médicale)
  // medicalSignal = mot médical OU LLM médical == "hit"
  const medicalSignal = hasMedicalKeyword || medicalLLM === "hit";

  // suicideSignal = uniquement si pas de medicalSignal ET mot suicide détecté
  const suicideSignal = !medicalSignal && hasSuicideKeyword;

  // 1) suicide only (2 questions max => lock)
  if (suicideSignal && !medicalSignal) {
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

  // 2) medical only (strict OU/NO + re-ask / lock après 2 essais)
  if (medicalSignal && !suicideSignal) {
    const askIdxs: number[] = [];
    // Accept both our clarifier and our yes/no template as "assistant asked triage"
    history.forEach((m, i) => {
      if (
        m.role === "assistant" &&
        (isMedicalClarifierQuestion(m.content) || isMedicalYesNoQuestion(m.content))
      ) askIdxs.push(i);
    });
    const lastMedAskIdx = askIdxs.length ? askIdxs[askIdxs.length - 1] : -1;

    // reply immediately following the assistant's triage question, if any
    const userAfter = lastMedAskIdx >= 0
      ? history.slice(lastMedAskIdx + 1).find(m => m.role === "user")?.content ?? null
      : null;

    // 1) If user replied directly after the triage question and used explicit yes/no -> act immediately
    if (userAfter) {
      if (isExplicitYes(userAfter)) return { crisis: "lock", reason: "medical" };
      if (isExplicitNo(userAfter))  return { crisis: "none", reason: "none" };
      // if reply is present but NOT an explicit yes/no -> we must re-ask (unless we've already asked twice)
      if (askIdxs.length >= 2) {
        // Deux demandes d'éclaircissement sans réponse explicite -> on verrouille pour prioriser la sécurité
        return { crisis: "lock", reason: "medical" };
      }
      // otherwise: re-ask (ask again)
      return { crisis: "ask", reason: "medical" };
    }

    // 2) If the assistant already asked the triage twice and we still have no clear answer -> lock
    if (askIdxs.length >= 2) return { crisis: "lock", reason: "medical" };

    // otherwise ask triage (first or second attempt)
    return { crisis: "ask", reason: "medical" };
  }

  // 3) both -> clarification
  // (avec la règle mutual-exclusive ci-dessus, on n'arrive normalement jamais ici,
  //  mais on garde la logique pour sécurité si jamais les signaux changent)
  if (medicalSignal && suicideSignal) {
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
        return { crisis: "ask", reason: "medical" };
      }
      if (/^pensées\b|^pensée\b|^pensées|^je veux|^je vais|^me tuer|^en finir|^me faire du mal/.test(t)) {
        return { crisis: "ask", reason: "suicide" };
      }
      return { crisis: "ask", reason: "clarify" };
    }

    return { crisis: "ask", reason: "clarify" };
  }

  // 4) none
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

  // **MODIF** : ne plus appeler le détecteur LLM pour le SUICIDE - on l'utilise uniquement pour le médical.
  const suicideLLM: "hit" | "safe" = "safe";
  const medicalLLM: "hit" | "safe" = lastUserMsg ? await llmFlag("medical", lastUserMsg) : "safe";

  // --- Overwrites immédiats : si l'assistant a posé une question de clarification
  // et que l'utilisateur répond explicitement "oui", on force le lock immédiat.
  // (Reproduit le même comportement robuste que pour l'alerte suicide.)

  // a) si l'assistant a demandé la question suicide standard et que l'utilisateur a dit "oui"
  const lastAssistantAskForSuicideOverride = [...history].reverse().find(
    (m) => m.role === "assistant" && isCrisisQuestion(m.content)
  );
  if (lastAssistantAskForSuicideOverride && isExplicitYes(lastUserMsg)) {
    return new NextResponse(
      JSON.stringify({ answer: CLOSING_SUICIDE, crisis: "lock", reason: "suicide" }),
      { headers, status: 200 }
    );
  }

  // b) si l'assistant a posé la question de triage médical (notre template) et que l'utilisateur a dit "oui"
  const lastAssistantAskForMedicalOverride = [...history].reverse().find(
    (m) => m.role === "assistant" && (isMedicalClarifierQuestion(m.content) || isMedicalYesNoQuestion(m.content))
  );
  if (lastAssistantAskForMedicalOverride && isExplicitYes(lastUserMsg)) {
    return new NextResponse(
      JSON.stringify({ answer: CLOSING_MEDICAL, crisis: "lock", reason: "medical" }),
      { headers, status: 200 }
    );
  }
  // Si l'utilisateur répond explicitement NON à la question de triage médical,
// on renvoie une réponse courte, empathique et sans diagnostic.
// Si l'utilisateur répond explicitement NON à la question de triage médical,
// on renvoie un commentaire empathique (sans diagnostic) ET on pose directement
// la question de localisation pour poursuivre le processus.
if (lastAssistantAskForMedicalOverride && isExplicitNo(lastUserMsg)) {
  const reply = `D'accord, tu me dis "non", mais si tu as le moindre doute, consulte immédiatement. Ta santé est prioritaire. Continuons ! Peux-tu préciser ce qui se passe pour toi ?`;
  return new NextResponse(
    JSON.stringify({ answer: reply, crisis: "none", reason: "none" }),
    { headers, status: 200 }
  );
}



  // ——— compute crisis
  const { crisis, reason } = computeCrisis(history, answer, suicideLLM, medicalLLM);

  // ——— Forcer le message renvoyé selon l’état d’urgence
  if (crisis === "lock") {
    answer = reason === "medical" ? CLOSING_MEDICAL : CLOSING_SUICIDE;
  } else if (crisis === "ask") {
    if (reason === "medical") {
      answer = MEDICAL_TRIAGE_QUESTION_FOR(lastUserMsg);
    } else if (reason === "suicide") {
      answer = SUICIDE_QUESTION_TEXT;
  
    } 
  }

  return new NextResponse(JSON.stringify({ answer, crisis, reason }), {
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
