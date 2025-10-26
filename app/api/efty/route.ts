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
  /**
   * Par défaut true : on injecte le JSON de candidats dans la requête modèle.
   * Mets à false si tu veux désactiver ponctuellement.
   */
  injectRappels?: boolean;
  /**
   * Nombre de rappels souhaités (le modèle n'est pas obligé mais c'est indicatif).
   * Par défaut 6.
   */
  rappelsVoulus?: number;
}

type Payload = BodyWithMessages & BodyWithMessage & BodyWithMotsClient;

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

  // Autorisations strictes en production
  const ALLOWED_BASE = new Set<string>([
    "https://appli.ecole-eft-france.fr",
    "https://www.ecole-eft-france.fr",
  ]);

  // Environnements Vercel
  const vercelEnv = process.env.VERCEL_ENV;
  const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;

  if (vercelEnv === "production") {
    return ALLOWED_BASE.has(o);
  }

  // En preview/dev, autoriser aussi l’URL de build courante si présente
  if (vercelEnv === "preview" && vercelUrl) {
    return o === vercelUrl || ALLOWED_BASE.has(o);
  }

  // Facultatif : conserver localhost si tu testes depuis un navigateur local
  if (o.startsWith("http://localhost:") || o === "http://localhost") {
    return true;
  }

  return ALLOWED_BASE.has(o);
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

  // patrons courts (neutres, 3–8 mots conseillés par le prompt système)
  if (m.emotion) push(`cette ${m.emotion}`);
  if (m.sensation && m.localisation) {
    // accords basiques "dans la/le/l’ / à la/au/à l’"
    const loc = m.localisation.trim();
    const prep = /^[aeiouhâêîôûàéèêëïîöôù]/i.test(loc) ? "l’" : (loc.match(/^(épaule|hanche|jambe|cheville|main|gorge|poitrine|tête|machoire|mâchoire|nuque|fesse|cuisse|cervelle|bouche|oreille|épigastre|cervicale|dent|épaule)/i) ? "la " : (loc.match(/^(ventre|dos|bras|cou|pied|genou|mollet|front|thorax|crâne)/i) ? "le " : ""));
    const locFmt = prep ? `${prep}${loc.replace(/^l[’']\s*/i, "")}` : loc;
    push(`cette ${m.sensation} dans ${locFmt}`); // "dans l’/la/le"
  }
  if (m.sensation && !m.localisation) push(`cette ${m.sensation}`);
  if (m.pensee) push(`cette pensée : « ${m.pensee} »`);
  if (m.souvenir) push(`ce souvenir qui revient`);
  if (m.localisation && !m.sensation) {
    const loc = m.localisation.trim();
    const prep = /^[aeiouhâêîôûàéèêëïîöôù]/i.test(loc) ? "l’" : (loc.match(/^(épaule|hanche|jambe|cheville|main|gorge|poitrine|tête|machoire|mâchoire|nuque|fesse|cuisse|cervelle|bouche|oreille|épigastre|cervicale|dent|épaule)/i) ? "la " : (loc.match(/^(ventre|dos|bras|cou|pied|genou|mollet|front|thorax|crâne)/i) ? "le " : ""));
    const locFmt = prep ? `${prep}${loc.replace(/^l[’']\s*/i, "")}` : loc;
    push(`cette gêne dans ${locFmt}`);
  }

  // variantes très légères (toujours neutres, sans ajout d’intention)
  if (m.emotion) push(`ce ${m.emotion} présent`);
  if (m.sensation && m.localisation) {
    const loc = m.localisation.trim();
    const prep = /^[aeiouhâêîôûàéèêëïîöôù]/i.test(loc) ? "l’" : (loc.match(/^(épaule|hanche|jambe|cheville|main|gorge|poitrine|tête|machoire|mâchoire|nuque|fesse|cuisse|cervelle|bouche|oreille|épigastre|cervicale|dent|épaule)/i) ? "la " : (loc.match(/^(ventre|dos|bras|cou|pied|genou|mollet|front|thorax|crâne)/i) ? "le " : ""));
    const locFmt = prep ? `${prep}${loc.replace(/^l[’']\s*/i, "")}` : loc;
    push(`ce ${m.sensation} à ${locFmt}`); // "à l’/la/le"
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

  // --- Nouveau : injection optionnelle de candidats de rappels
  const injectRappels = body.injectRappels !== false; // par défaut true
  const rappelsVoulus = typeof body.rappelsVoulus === "number" ? body.rappelsVoulus : 6;
  const candidats = generateRappelsBruts(body.mots_client);

  if (injectRappels && candidats.length > 0) {
    // On fournit un petit JSON clair au modèle. Le prompt système sait rester sobre
    // et se contente d'utiliser ces candidats comme matière première (sans les dénaturer).
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

  try {
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.5,
      messages,
    });

    const text =
      completion.choices?.[0]?.message?.content?.trim() ??
      "Je n’ai pas compris. Peux-tu reformuler en une phrase courte ?";

    const headers = new Headers({
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": origin || "",
      "Vary": "Origin",
    });

    return new NextResponse(JSON.stringify({ answer: text }), { headers });
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
