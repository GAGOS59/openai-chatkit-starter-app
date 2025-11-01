import { NextRequest, NextResponse } from "next/server";

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
// Détection de crise (simples patterns clés)
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
  const t = (text || "").toLowerCase();
  return CRISIS_PATTERNS.some((k) => t.includes(k));
}

// ————————————————————————————————

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  const { history = [], single = "" } = await req.json();

  // >>> Détection de crise depuis le dernier message utilisateur
  const lastUser =
    [...history]
      .reverse()
      .find((m: any) => (m?.role ?? "") === "user")
      ?.content?.trim() || String(single || "");

  // Ici tu appelles ton LLM / pipeline. Pour l’exemple, on retourne une réponse fixe.
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
