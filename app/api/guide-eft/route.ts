import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Types stricts pour la réponse OpenAI
interface OAChatMessage { content: string }
interface OAChatChoice { message: OAChatMessage }
interface OAResponse { choices: OAChatChoice[] }

// Vérifications de type
function isRecord(u: unknown): u is Record<string, unknown> {
  return typeof u === "object" && u !== null;
}
function isOAResponse(u: unknown): u is OAResponse {
  if (!isRecord(u)) return false;
  const choices = u["choices"];
  if (!Array.isArray(choices) || choices.length === 0) return false;
  const first = choices[0];
  if (!isRecord(first)) return false;
  const msg = (first as Record<string, unknown>)["message"];
  if (!isRecord(msg)) return false;
  const content = (msg as Record<string, unknown>)["content"];
  return typeof content === "string";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body?.history) ? body.history : [];

    // 🔹 Brief EFT rigoureux
    const system =
  typeof body?.system === "string"
    ? body.system
    : [
        "Tu es un guide EFT strictement aligné avec la méthode de Gary Craig (version de base).",
        "Interdits : AUCUNE induction positive, AUCUNE orientation ('je choisis', 'je suis ouvert', 'je libère...').",
        "Formulations autorisées : neutres et descriptives uniquement.",
        "Phrase de départ (revers psychologique) : formules classiques d’acceptation NON-directives, ex. :",
        " - « Même si j’ai [cette formulation spécifique], je m’accepte tel(le) que je suis. »",
        " - « Même si j’ai [ce problème], je m’accepte entièrement. »",
        " - « Même si j’ai [ce problème], je m’accepte et je me respecte. »",
       " - « Même si j’ai [ce problème], je m’accepte complètement et profondément. »",
       " - « Même si j’ai [ce problème], je m'aime et je m’accepte tel(le) que je suis. »",
        "Séquence : phrase-rappel courte et NEUTRE (répéter l’énoncé spécifique) sur chaque point.",
        "Mesure SUD 0–10 : toujours AVANT et APRÈS une ronde.",
        "Discipline des aspects : on ne change PAS d’aspect tant que le SUD de l’aspect en cours n’est pas à 0.",
        "Si SUD stagne : on RESTE sur le même aspect mais on le rend plus spécifique (qualité, localisation précise, mouvement déclencheur, circonstance, émotion associée, événement-cible).",
        "Format attendu :",
        "1) Clarification (spécificité + SUD).",
        "2) Phrase de départ (x3, classique d’acceptation, sans 'je choisis', sans 'je libère' ni aucune autre dérive).",
        "3) Séquence des points : phrase-rappel neutre (reformulation exacte et spécifique du problème).",
        "4) Réévaluation SUD.",

        "Toujours rappeler le cadre : l’EFT ne remplace pas un avis médical ; consulter si douleur persistante/alarmante.",
      ].join("\n");
    

    if (!message) {
      return NextResponse.json({ error: "Champ 'message' requis." }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Clé API manquante côté serveur." }, { status: 500 });
    }

    const messages = [
      { role: "system", content: system },
      ...history,
      { role: "user", content: message },
    ];

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.2, // 🔹 ton neutre, pas de dérive positive
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      return NextResponse.json(
        { error: "Service indisponible", code: upstream.status, details: text },
        { status: 502 }
      );
    }

    const raw: unknown = await upstream.json();
    if (!isOAResponse(raw)) {
      return NextResponse.json({ error: "Format de réponse inattendu." }, { status: 502 });
    }

    const answer = raw.choices[0].message.content.trim();
    if (!answer) {
      return NextResponse.json({ error: "Réponse vide du modèle." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, answer });
  } catch (error: unknown) {
    console.error("[guide-eft] route error:", error);
    return NextResponse.json({ error: "Erreur serveur." }, { status: 500 });
  }
}

