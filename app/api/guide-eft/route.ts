import { NextResponse } from "next/server";
import { isCrisis, crisisMessage } from "../../utils/eftHelpers";

const SYSTEM_PROMPT = `
Tu es une assistante EFT officielle.
Tu réponds uniquement en t'appuyant sur l'EFT de Gary Craig.
- Pas d'EFT positive, pas d'inductions positives, pas de reformulation en positif.
- Pas de conseils médicaux.
- Pas de promesses de résultat.
- Style bienveillant, concis, informatif.
- Tu peux expliquer l'EFT, ses étapes, ses principes, ses limites, son histoire, etc.
`;

export async function POST(req: Request) {
  const { prompt } = await req.json();
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "Aucune question reçue" }, { status: 400 });
  }
  if (isCrisis(prompt)) {
    return NextResponse.json({ answer: crisisMessage() });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const base = (process.env.LLM_BASE_URL || "").trim() || "https://api.openai.com";
  const endpoint = `${base.replace(/\/+$/, "")}/v1/responses`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: `${SYSTEM_PROMPT}\nQuestion: ${prompt}\nRéponse:`,
      temperature: 0.2,
      max_output_tokens: 300,
    }),
    signal: controller.signal,
  }).catch(() => null);
  clearTimeout(timer);

  if (!res || !res.ok) {
    return NextResponse.json({ error: "Upstream failure" }, { status: 502 });
  }

  const json = await res.json();
  const answer =
    (json?.output?.[0]?.content?.[0]?.text) ??
    (json?.choices?.[0]?.message?.content) ??
    (json?.content?.[0]?.text) ??
    "";

  if (answer && isCrisis(answer)) {
    return NextResponse.json({ answer: crisisMessage() });
  }

  return NextResponse.json({ answer });
}
