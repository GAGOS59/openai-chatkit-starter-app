// app/api/efty/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { EFT_SYSTEM_PROMPT } from "./eft-prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/* ---------- Types ---------- */
type Role = "user" | "assistant";

interface ChatMessage {
  role: Role;
  content: string;
}

interface MotsClient {
  emotion?: string;
  sensation?: string;
  localisation?: string;
  pensee?: string;   // ex: "je n’y arriverai pas"
  souvenir?: string; // ex: "regard dur de mon chef"
}

interface BodyWithMessages {
  messages?: ChatMessage[];
}

interface BodyWithMessage {
  message?: string;
}

/**
 * Optionnel — si présent, on génère des candidats de rappels côté app
 * et on les fournit au modèle dans un court JSON.
 */
interface BodyWithMotsClient {
  mots_client?: MotsClient;
  injectRappels?: boolean; // défaut: true
  rappelsVoulus?: number; // défaut: 6
}

type Payload = BodyWithMessages & BodyWithMessage & BodyWithMotsClient;

/* ---------- Utils ---------- */
function isChatMessageArray(x: unknown): x is ChatMessage[] {
  if (!Array.isArray(x)) return false;
  return x.every(
    (m) =>
      typeof m === "object" &&
      m !== null &&
      "role" in m &&
      "content" in m &&
      (m as { role: string }).role.match(/^(user|assistant)$/) &&
      typeof (m as { content: unknown }).content === "string"
  );
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const o = origin.toLowerCase();

  const ALLOWED_BASE = new Set<string>([
    "https://appli.ecole-eft-france.fr",
    "https://www.ecole-eft-france.fr",
  ]);

  const vercelEnv = process.env.VERCEL_ENV;
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;

  if (vercelEnv === "production") {
    return ALLOWED_BASE.has(o);
  }
  if (vercelEnv === "preview" && vercelUrl) {
    return o === vercelUrl || ALLOWED_BASE.has(o);
  }
  if (o.startsWith("http://localhost:") || o === "http://localhost") {
    return true;
  }
  return ALLOWED_BASE.has(o);
}

/* ---------- 🔐 Sécurité suicidaire : détection & réponses (serveur) ---------- */
/** Étage 1 : signaux forts (idéation explicite) */
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

/** Étage 2 : signaux “souples” (détresse lourde) → question de sécurité posée */
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

/* ——— Versions tutoyées ——— */
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

/** A-t-on posé la question "avez-vous/as-tu des idées suicidaires" au tour assistant précédent ? */
function lastAssistantAskedSuicideQuestion(history: ChatMessage[]): boolean {
  for (let i = history.length - 1; i >= 0; i--) {
    const m = history[i];
    if (m.role === "assistant") {
      const t = (m.content || "").toLowerCase();
      return /avez[-\s]?vous\s+des\s+id[ée]es?\s+suicidaires/.test(t) ||
             /as[-\s]?tu\s+des\s+id[ée]es?\s+suicidaires/.test(t);
    }
    if (m.role === "user") break; // on s'arrête au dernier échange
  }
  return false;
}

/* ---------- Micro-grammaire rappels (local, sûr, fidèle Gary Craig) ---------- */
function generateRappelsBruts(m?: MotsClient): string[] {
  if (!m) return [];
  const out = new Set<string>();
  const push = (s?: string) => {
    if (!s) return;
    const t = s.trim().replace(/\s+/g, " ");
    if (t && t.length <= 40) out.add(t);
  };

  // patrons courts (neutres)
  if (m.emotion) push(`cette ${m.emotion}`);
  if (m.sensation && m.localisation) {
    const loc = m.localisation.trim();
    const prep = /^[aeiouhâêîôûàéèêëïîöôù]/i.test(loc)
      ? "l’"
      : (loc.match(/^(épaule|hanche|jambe|cheville|main|gorge|poitrine|tête|machoire|mâchoire|nuque|fesse|cuisse|cervelle|bouche|oreille|épigastre|cervicale|dent|épaule)/i)
          ? "la "
          : (loc.match(/^(ventre|dos|bras|cou|pied|genou|mollet|front|thorax|crâne)/i) ? "le " : ""));
    const locFmt = prep ? `${prep}${loc.replace(/^l[’']\s*/i, "")}` : loc;
    push(`cette ${m.sensation} dans ${locFmt}`);
  }
  if (m.sensation && !m.localisation) push(`cette ${m.sensation}`);
  if (m.pensee) push(`cette pensée : « ${m.pensee} »`);
  if (m.souvenir) push(`ce souvenir qui revient`);
  if (m.localisation && !m.sensation) {
    const loc = m.localisation.trim();
    const prep = /^[aeiouhâêîôûàéèêëïîöôù]/i.test(loc)
      ? "l’"
      : (loc.match(/^(épaule|hanche|jambe|cheville|main|gorge|poitrine|tête|machoire|mâchoire|nuque|fesse|cuisse|cervelle|bouche|oreille|épigastre|cervicale|dent|épaule)/i)
          ? "la "
          : (loc.match(/^(ventre|dos|bras|cou|pied|genou|mollet|front|thorax|crâne)/i) ? "le " : ""));
    const locFmt = prep ? `${prep}${loc.replace(/^l[’']\s*/i, "")}` : loc;
    push(`cette gêne dans ${locFmt}`);
  }

  // variantes très légères
  if (m.emotion) push(`ce ${m.emotion} présent`);
  if (m.sensation && m.localisation) {
    const loc = m.localisation.trim();
    const prep = /^[aeiouhâêîôûàéèêëïîöôù]/i.test(loc)
      ? "l’"
      : (loc.match(/^(épaule|hanche|jambe|cheville|main|gorge|poitrine|tête|machoire|mâchoire|nuque|fesse|cuisse|cervelle|bouche|oreille|épigastre|cervicale|dent|épaule)/i)
          ? "la "
          : (loc.match(/^(ventre|dos|bras|cou|pied|genou|mollet|front|thorax|crâne)/i) ? "le " : ""));
    const locFmt = prep ? `${prep}${loc.replace(/^l[’']\s*/i, "")}` : loc;
    push(`ce ${m.sensation} à ${locFmt}`);
  }
  if (m.pensee) push(`cette pensée qui insiste`);

  return Array.from(out).slice(0, 10);
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
    if (raw && typeof raw === "object") {
      body = raw as Payload;
    }
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
    "Vary": "Origin",
  });

  /* ---------- 🔐 Interception sécurité AVANT modèle ---------- */
  const lastUserText =
    [...messages].reverse().find((m) => m.role === "user")?.content?.toLowerCase() ?? "";
  const askedSuicide = lastAssistantAskedSuicideQuestion(history);

  if (askedSuicide) {
    const yn = interpretYesNoServer(lastUserText);

    if (yn === "yes") {
      const answer =
        crisisOrientationMessage_TU() +
        "\n\nJe reste avec toi ici, mais je n’irai pas plus loin en EFT. " +
        "Appelle le 3114 ou le 112 si tu es en danger immédiat.";
      return new NextResponse(JSON.stringify({ answer, crisis: "lock" as const }), { headers });
    }

    if (yn === "no") {
      const answer =
        "Merci pour ta réponse. Si à un moment tu te sens en danger, stoppons l’EFT et contacte le 3114 (24/7). " +
        "Quand tu es prêt·e, dis en une phrase ce qui te dérange le plus maintenant.";
      return new NextResponse(JSON.stringify({ answer, crisis: "none" as const }), { headers });
    }

    const answer = "Je n’ai pas bien compris. Peux-tu répondre par « oui » ou « non », s’il te plaît ?";
    return new NextResponse(JSON.stringify({ answer, crisis: "ask" as const }), { headers });
  }

  if (anyMatch(CRISIS_HARD, lastUserText)) {
    const answer = crisisOrientationMessage_TU() + "\n\n" + ASK_SUICIDE_Q_TU;
    return new NextResponse(JSON.stringify({ answer, crisis: "ask" as const }), { headers });
  }

  if (anyMatch(CRISIS_SOFT, lastUserText)) {
    const answer =
      "J’entends que c’est très difficile en ce moment. J’ai une question importante de sécurité avant de poursuivre.\n\n" +
      ASK_SUICIDE_Q_TU;
    return new NextResponse(JSON.stringify({ answer, crisis: "ask" as const }), { headers });
  }
  /* ---------- 🔐 Fin interception ---------- */

  // --- Injection optionnelle de candidats de rappels
  const injectRappels = body.injectRappels !== false; // par défaut true
  const rappelsVoulus = typeof body.rappelsVoulus === "number" ? body.rappelsVoulus : 6;
  const candidats = generateRappelsBruts(body.mots_client);

  if (injectRappels && candidats.length > 0) {
    messages.push({
      role: "user",
      content: JSON.stringify(
        {
          meta: "CANDIDATS_RAPPELS",
          candidats_app: candidats,
          voulu: rappelsVoulus,
        },
        null,
        2
      ),
    });
  }

/* ---------- 🎯 Bloc A : détection du type de départ (physique / émotion / situation) ---------- */
const isPhysicalIntake = (s: string) =>
  /\b(mal|douleur|tension|crispation|gêne|brûlure|piqûre|raideur|contracture|migraine|maux?)\b/i.test(s);
const isEmotionIntake = (s: string) =>
  /\b(peur|col[eè]re|tristesse|culpabilit[ée]|angoisse|stress|honte|dégoût|inqui[ée]tude|anxi[ée]t[ée]|énervement|désespoir|impuissance|solitude|frustration|fatigue|lassitude)\b/i.test(s);
const isSituationIntake = (s: string) =>
  /\b(quand|lorsque|pendant|chaque\s+fois|à\s+l’idée|au\s+moment|face\s+à|devant|en\s+parlant|en\s+pensant)\b/i.test(s);

/* 🩹 Physique — douleur, tension, gêne */
if (isPhysicalIntake(lastUserText)) {
  return new NextResponse(
    JSON.stringify({
      answer: `Tu dis que tu as ${clean(lastUserMsg)}.  
Précise la localisation exacte et le type de douleur (lancinante, sourde, aiguë…).  
Par exemple :  
– pour un genou : la rotule, la face interne ou externe, l’arrière du genou ;  
– pour la tête : les tempes, le front, l’arrière du crâne ;  
– pour le dos : les lombaires, entre les omoplates, la nuque.  
Où ressens-tu exactement cette douleur ?`,
      crisis: "none" as const,
    }),
    { headers }
  );
}

/* 💓 Émotion — peur, colère, tristesse, honte, etc. */
if (isEmotionIntake(lastUserText)) {
  return new NextResponse(
    JSON.stringify({
      answer: `Tu dis « ${clean(lastUserMsg)} ».  
Dans quelle situation ressens-tu « ${clean(lastUserMsg)} » ?  
Comment se manifeste « ${clean(lastUserMsg)} » dans ton corps quand tu penses à cette situation ? (serrement, pression, chaleur, vide, etc.)  
Et où précisément ressens-tu cette sensation ?`,
      crisis: "none" as const,
    }),
    { headers }
  );
}

/* 🌿 Situation — contexte directement exprimé */
if (isSituationIntake(lastUserText)) {
  return new NextResponse(
    JSON.stringify({
      answer: `Tu évoques « ${clean(lastUserMsg)} ».  
Qu’est-ce qui te gêne le plus à ce moment-là ?  
Quand tu y penses maintenant, que ressens-tu dans ton corps et où ?`,
      crisis: "none" as const,
    }),
    { headers }
  );
}

  
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
  } catch {
    return NextResponse.json(
      { error: "Service temporairement indisponible." },
      { status: 503 }
    );
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
