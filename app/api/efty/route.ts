import { NextRequest, NextResponse } from "next/server";

// ————————————————————————————————
// Types
type Role = "user" | "assistant" | "system";

interface ChatMessage {
  role: Role;
  content: string;
}

interface RequestBody {
  history?: ChatMessage[];
  single?: string;
}

// ————————————————————————————————
// Sécurité CORS (adapte si besoin)
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

// ————————————————————————————————
// Détection de crise (patterns simples)
const CRISIS_PATTERNS = [
  "suicide",
  "me suicider",
  "envie d'en finir",
  "mettre fin à mes jours",
  "plus envie de vivre",
  "détresse",
  "danger immédiat",
];

function isCrisis(text: string): boolean {
  const t = text.toLowerCase();
  return CRISIS_PATTERNS.some((k) => t.includes(k));
}

// ————————————————————————————————

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const body = (await req.json()) as RequestBody;
  const history: ChatMessage[] = Array.isArray(body.history) ? body.history : [];
  const single = body.single ?? "";

  // Dernier message utilisateur (tipé)
  const lastUser =
    [...history]
      .reverse()
      .find((m) => m.role === "user")
      ?.content?.trim() || String(single || "");

  // Appel LLM/pipeline ici (exemple statique pour la démo)
  const text =
    "Merci pour ton message. Peux-tu me préciser ton objectif EFT pour cette mini-séance ?";

  const crisis = isCrisis(lastUser) ? "lock" : "none";

  return new NextResponse(JSON.stringify({ answer: text, crisis }), {
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
