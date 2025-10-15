import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/* ---------- Types ---------- */
type Stage =
  | "Intake"
  | "Durée"
  | "Contexte"
  | "Évaluation"
  | "Setup"
  | "Tapping"
  | "Réévaluation"
  | "Clôture";

type Slots = {
  intake?: string;
  duration?: string;
  context?: string;
  sud?: number;
  round?: number;
  aspect?: string;
};

type GuideRequest = {
  prompt?: string;
  stage?: Stage;
  etape?: number;
  transcript?: string;
  slots?: Slots;
};

/* ---------- Utils génériques ---------- */
function clean(s: string): string {
  return (s || "").replace(/\s+/g, " ").replace(/\s+([,;:.!?])/g, "$1").trim();
}

function shortContext(s: string): string {
  const t = clean(s);
  if (!t) return "";
  return t.split(" ").slice(0, 14).join(" ");
}

/** Normalise l’intake ("j'ai mal aux épaules" -> "mal aux épaules", etc.) */
function normalizeIntake(input: string): string {
  const s = clean(input);
  const mMal = s.match(/^j['’]ai\s+mal\s+(?:à|a)\s+(?:(?:la|le|les)\s+|l['’]\s*|au\s+|aux\s+)?(.+)$/i);
  if (mMal) return `mal ${mMal[1].trim()}`;

  const mDouleur = s.match(/^j['’]ai\s+(?:une|la)\s+douleur\s+(.*)$/i);
  if (mDouleur) return `douleur ${mDouleur[1].trim()}`;

  const mPeur1 = s.match(/^j['’]ai\s+(?:une|la)\s+peur\s+(.*)$/i);
  if (mPeur1) return `peur ${mPeur1[1].trim()}`;
  const mPeur2 = s.match(/^j['’]ai\s+peur\s+(.*)$/i);
  if (mPeur2) return `peur ${mPeur2[1].trim()}`;

  const mAutres = s.match(/^j['’]ai\s+(?:une|la)\s+(tension|gêne|gene)\s+(.*)$/i);
  if (mAutres) return `${mAutres[1]} ${mAutres[2].trim()}`;

  return s;
}

function normalizeEmotionNoun(s: string): string {
  const raw = clean(s);
  const t = raw.toLowerCase();

  // Si déjà spécifique, on ne touche pas
  if (/\bpeur\s+(de|du|des|d’|d')\s+.+/i.test(t)) return raw;
  if (/\bcol[eè]re\s+(contre|envers|à\s+propos\s+de)\s+.+/i.test(t)) return raw;
  if (/\b(honte|culpabilit[eé])\s+(de|d’|d')\s+.+/i.test(t)) return raw;

  // Nettoyage des formes verbales courantes
  const x = t
    .replace(/^j['’]?\s*eprouve\s+/, "")
    .replace(/^je\s+me\s+sens\s+/, "")
    .replace(/^je\s+ressens\s+/, "")
    .replace(/^je\s+suis\s+en\s+/, "")
    .replace(/^je\s+suis\s+/, "");

  // Normalisation des noms d’émotion
  const map: Array<[RegExp, string]> = [
    [/col[eè]re/, "colère"],
    [/triste(sse)?/, "tristesse"],
    [/honte/, "honte"],
    [/culpabl(e|it[eé])/, "culpabilité"],
    [/stress[ée]?/, "stress"],
    [/anxieux|anxieuse|anxi[eé]t[eé]/, "anxiété"],
    [/angoiss[eé]/, "angoisse"],
    [/peur/, "peur"],
  ];
  for (const [rx, noun] of map) if (rx.test(x)) return noun;
  return raw;
}


type IntakeKind = "physique" | "emotion" | "situation";
function classifyIntake(intakeRaw: string): IntakeKind {
  const s = clean(normalizeIntake(intakeRaw)).toLowerCase();
  const phys = /\b(mal|douleur|tension|gêne|gene|crispation|br[ûu]lure|brulure|tiraillement|raideur|contracture|piq[uû]re|aiguille|spasme|serrement|inflammation)\b/;
  if (phys.test(s)) return "physique";
  const emo = /\b(peur|col[eè]re|tristesse|honte|culpabilit[eé]|stress|anxi[eé]t[eé]|angoisse|inqui[eè]tude|d[eé]g[oô]ut)\b/;
  if (emo.test(s)) return "emotion";
  return "situation";
}

function detectGender(intakeRaw: string): "m" | "f" {
  const s = clean(intakeRaw).toLowerCase();
  if (s.startsWith("mal") || s.startsWith("serrement") || s.startsWith("truc")) return "m";
  if (
    s.startsWith("douleur") || s.startsWith("peur") || s.startsWith("gêne") || s.startsWith("gene") ||
    s.startsWith("tension") || s.startsWith("colère") || s.startsWith("colere") ||
    s.startsWith("crispation") || s.startsWith("tristesse")
  ) return "f";
  return "f";
}

function emotionArticle(noun: string): "ce" | "cette" {
  const n = clean(noun).toLowerCase().replace(/\s+de.*$/, "");
  const fem = new Set([
    "peur","colère","tristesse","honte","culpabilité","anxiété","angoisse","inquiétude",
    "douleur","gêne","gene","tension"
  ]);
  return fem.has(n) ? "cette" : "ce";
}

function readableContext(ctx: string, kind?: IntakeKind): string {
  let c = clean(ctx);
  if (!c) return "";
  if (
    kind === "physique" &&
    !/^(parce que|car|puisque)\b/i.test(c) &&
    /^(?:j['’]ai|j['’]étais|j['’]etais|je\s+me|je\s+suis|je\s+)/i.test(c)
  ) {
    c = "parce que " + c.replace(/^parce que\s+/i, "");
  }
  if (!/^(parce que|car|puisque)\b/i.test(c)) {
    const needsQue = /^(il|elle|ils|elles|on|que|qu’|qu'|le|la|les|mon|ma|mes|son|sa|ses)\b/i.test(c);
    if (needsQue && !/^au\s+fait\s+que\b/i.test(c)) {
      c = "au fait que " + c;
    }
    c = c
      .replace(/\bau\s+fait\s+que\s+il\b/gi, "au fait qu'il")
      .replace(/\bau\s+fait\s+que\s+elle\b/gi, "au fait qu'elle")
      .replace(/\bau\s+fait\s+que\s+ils\b/gi, "au fait qu'ils")
      .replace(/\bau\s+fait\s+que\s+elles\b/gi, "au fait qu'elles");
  }
  return c;
}

function sudQualifierFromNumber(sud?: number, g: "m" | "f" = "f"): string {
  if (typeof sud !== "number" || sud === 0) return "";
  if (sud >= 9) return g === "m" ? " vraiment très présent" : " vraiment très présente";
  if (sud >= 7) return g === "m" ? " très présent" : " très présente";
  if (sud >= 4) return g === "m" ? " encore présent" : " encore présente";
  return " qui reste encore un peu";
}

function splitContext(ctx: string): string[] {
  return clean(ctx)
    .split(/[,.;]|(?:\s(?:et|quand|parce que|car|puisque|lorsque|depuis|depuis que)\s)/gi)
    .map((p) => clean(p))
    .filter((p) => p.length > 0)
    .slice(0, 6);
}

function baseFromIntake(_raw: string): { generic: string; short: string; g: "m" | "f" } {
  const intakePrim = clean(normalizeIntake(_raw));
  const intake = clean(intakePrim);
  const g = detectGender(intake);
  if (g === "m" && /^mal\b/i.test(intake)) return { generic: "Ce " + intake, short: "Ce " + intake, g };
  if (g === "f") return { generic: "Cette " + intake, short: "Cette " + intake, g };
  return { generic: "Ce problème", short: "Ce problème", g: "m" };
}

function buildRappelPhrases(slots: Slots): string[] {
  let intake = clean(normalizeIntake(slots.intake ?? ""));
  intake = intake.replace(/^(?:je\s+suis|je\s+me\s+sens|je\s+ressens|j['’]ai)\s+/i, "");
  const ctx = clean(slots.context ?? "");
  const { generic, short, g } = baseFromIntake(intake);
  const sudQ = sudQualifierFromNumber(slots.sud, g);
  const round = slots.round ?? 1;
  const contextParts = ctx ? splitContext(ctx) : [];
  const roundMod = typeof slots.sud === "number" && slots.sud > 0 && round > 1
    ? (slots.sud >= 7 ? " toujours" : " encore")
    : "";
  const qOrRound = sudQ || roundMod;

  const phrases: string[] = [];
  phrases.push(`${generic}${qOrRound}.`);
  phrases.push(`${short}.`);
  for (let i = 0; i < 4; i++) {
    if (contextParts[i]) {
      const s = contextParts[i];
      phrases.push(s[0].toUpperCase() + s.slice(1) + ".");
    } else {
      phrases.push(`${(i % 2 === 0) ? generic : short}${qOrRound}.`);
    }
  }
  if (contextParts[0]) phrases.push(`Tout ce contexte : ${contextParts[0]}.`);
  else phrases.push(`${short}.`);
  phrases.push(`${generic}.`);
  return phrases.slice(0, 8);
}

/* ---------- Sécurité (in/out) ---------- */
const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid(e|er|aire|al|ale|aux|erai|erais|erait|eront)?\b/iu,
  /\bsu[cs]sid[ea]\b/iu,
  /\bje\s+(veux|vais|voudrais)\s+mour(ir|ire)\b/iu,
  /\bje\s+ne\s+veux\s+plus\s+vivre\b/iu,
  /j['’]?\s*en\s+peux?\s+plus\s+de\s+vivre\b/iu,
  /\bje\s+(veux|vais|voudrais)\s+en\s+finir\b/iu,
  /\bmettre\s+fin\s+à\s+(ma|mes)\s+jours?\b/iu,
  /\bje\s+(veux|voudrais|vais)\s+dispara[iî]tre\b/iu,
  /\bid[ée]es?\s+noires?\b/iu,
  /\bme\s+tu(er|é|erai|erais|erait|eront)?\b/iu,
  /\bme\s+pendre\b/iu
];

function isCrisis(text: string): boolean {
  const t = (text || "").toLowerCase();
  return CRISIS_PATTERNS.some((rx) => rx.test(t));
}

function crisisMessage(): string {
  return (
`Message important
Il semble que vous traversiez un moment très difficile.
Ne restez pas seul.e. Rapprochez-vous d'une personne ressource.
Je ne peux pas vous accompagner sur des situations d'urgence et votre sécurité est prioritaire.

En France : vous pouvez appeler immédiatement le 15 (SAMU) ou le 3114 (prévention du suicide, 24/7).
En danger immédiat : appelez le 112.

Vous n'êtes pas seul·e — ces services peuvent vous aider dès maintenant.`
  );
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
  if (YES_PATTERNS.some(rx => rx.test(text))) return "yes";
  if (NO_PATTERNS.some(rx => rx.test(text))) return "no";
  return "unknown";
}

function lastBotAskedSuicideQuestion(transcript: string): boolean {
  const t = (transcript || "").toLowerCase();
  return /(^|\n)A:\s.*avez[-\s]?vous\s+des\s+id[ée]es?\s+suicidaires\b/.test(t);
}

/* ---------- Handler sans LLM / sans FAQ ---------- */
export async function POST(req: Request) {
  try {
    // CORS simple
    const origin = (req.headers.get("origin") || "").toLowerCase();
    const isAllowedOrigin =
      !origin ||
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https:\/\/(www\.)?ecole-eft-france\.fr$/.test(origin) ||
      /^https:\/\/appli\.ecole-eft-france\.fr$/.test(origin) ||
      /^https:\/\/.*\.vercel\.app$/.test(origin);

    if (!isAllowedOrigin) {
      return NextResponse.json({ answer: "Origine non autorisée (CORS)." }, { status: 403 });
    }

    const raw = (await req.json().catch(() => ({}))) as Partial<GuideRequest>;
    const prompt = typeof raw.prompt === "string" ? raw.prompt.slice(0, 2000) : "";
    const etapeClient = Number.isFinite(raw.etape) ? Number(raw.etape) : 1;
    const transcript = typeof raw.transcript === "string" ? raw.transcript.slice(0, 4000) : "";
    const slots: Slots = (raw.slots && typeof raw.slots === "object" ? (raw.slots as Slots) : {}) ?? {};
    const etape = Math.min(8, Math.max(1, etapeClient));

    // 🔒 Gate de sécurité (question préalable)
    if (prompt) {
      const ynIfAny = interpretYesNoServer(prompt);
      const askedBefore = lastBotAskedSuicideQuestion(transcript);

      if (askedBefore && ynIfAny === "yes") {
        return NextResponse.json({ answer: crisisMessage(), kind: "crisis" });
      }
      if (askedBefore && ynIfAny === "no") {
        // NON → on poursuit
      } else if (isCrisis(prompt)) {
        return NextResponse.json({ answer: "Avez-vous des idées suicidaires ? (oui / non)", kind: "gate" });
      }
    }

    // ---- Étapes déterministes (sans LLM) ----

    // Étape 1 — Intake (précisions)
    if (etape === 1) {
      const intakeRaw = slots.intake ?? prompt ?? "";
      const intakeNorm = clean(intakeRaw);
      const kind = classifyIntake(intakeNorm);

      if (kind === "physique") {
        const hints =
" (lombaires, milieu du dos, entre les omoplates…)";
        const txt =
`Tu dis « ${intakeNorm} ». Peux-tu préciser la localisation exacte${hints}
et le type de douleur (lancinante, sourde, aiguë, comme une aiguille, etc.) ?`;
        return NextResponse.json({ answer: txt });
      }

      if (kind === "emotion") {
        const txt =
`Tu dis « ${intakeNorm} ». Où ressens-tu cela dans ton corps (poitrine, gorge, ventre, tête…) ?
Décris brièvement la sensation (serrement, pression, chaleur, vide, etc.).`;
        return NextResponse.json({ answer: txt });
      }

      const txt =
`À propos de « ${intakeNorm} », quand tu y penses, qu’est-ce que tu ressens (émotion/sensation) et où dans le corps (poitrine, ventre, gorge…) ?`;
      return NextResponse.json({ answer: txt });
    }

    // Étape 3 — Contexte (circconstances)
    if (etape === 3) {
      const intake = clean(slots.intake ?? "");
      const txt =
`Merci. En quelques mots, à quoi c’est lié ou quand cela se manifeste pour « ${intake} » ?
(Ex. situation, événement, pensée, moment de la journée, posture, fatigue, stress, etc.)`;
      return NextResponse.json({ answer: txt });
    }

    // Étape 4 — Évaluation (SUD)
    if (etape === 4) {
      const intake = clean(slots.intake ?? "");
      const ctxShort = shortContext(slots.context ?? "");
      const txt = ctxShort
        ? `Pense à « ${intake} » en pensant à « ${ctxShort} ». Indique un SUD entre 0 et 10 (0 = aucune gêne, 10 = maximum).`
        : `Pense à « ${intake} ». Indique un SUD entre 0 et 10 (0 = aucune gêne, 10 = maximum).`;
      return NextResponse.json({ answer: txt });
    }

   if (etape === 5) {
  const intakeOrig = clean(slots.intake ?? "");
  const aspectRaw  = clean((slots.aspect ?? slots.intake ?? ""));

  // Extraire base / ctx depuis "… liée à …" s'il est déjà présent
  let base = aspectRaw;
  let ctx = "";
  const m = aspectRaw.match(/\s+liée?\s+à\s+/i);
  if (m) {
    const idx = aspectRaw.toLowerCase().indexOf(m[0].toLowerCase());
    base = aspectRaw.slice(0, idx).trim();
    ctx  = aspectRaw.slice(idx + m[0].length).trim();
  }

  // Nettoyage de base (retire "je...", "j'ai...", "ce/cette ...", normalise les noms d’émotions)
  base = normalizeEmotionNoun(base)
    .replace(/^j['’]?\s*ai\s+/, "")
    .replace(/^je\s+/, "")
    .replace(/^(ce|cette)\s+/i, "");

  const kind = classifyIntake(intakeOrig || base);

  // Si on a capté un ctx via "liée à", on le privilégie ; sinon on retombe sur slots.context
  const ctxPretty = (ctx ? readableContext(ctx, kind) : readableContext(slots.context ?? "", kind));

  const g = detectGender(base);
  const hasCauseWord = /^(parce que|car|puisque)\b/i.test(ctxPretty);
  const connector = ctxPretty ? (hasCauseWord ? " " : (g === "f" ? " liée à " : " lié à ")) : "";
  const aspectPretty = (base + connector + (ctxPretty || "")).replace(/\s{2,}/g, " ").trim();
  const article = emotionArticle(base);

  const txt =
`Étape 5 — Setup : « Même si j’ai ${article} ${aspectPretty}, je m’accepte profondément et complètement. »
Répétez cette phrase 3 fois en tapotant sur le Point Karaté (tranche de la main).
Quand c’est fait, envoyez un OK et nous passerons à la ronde.`;

  return NextResponse.json({ answer: txt });
}



    // Étape 6 — Ronde (rappels ST → SB)
    if (etape === 6) {
      const p = buildRappelPhrases(slots);
      const txt =
`- ST : ${p[0]}
- DS : ${p[1]}
- CO : ${p[2]}
- SO : ${p[3]}
- SN : ${p[4]}
- MT : ${p[5]}
- CL : ${p[6]}
- SB : ${p[7]}
Quand tu as terminé cette ronde, dis-moi ton SUD (0–10).`;
      return NextResponse.json({ answer: txt });
    }

    // Étape 8 — Clôture
    if (etape === 8) {
      const txt =
"Bravo pour le travail fourni. Félicitations pour cette belle avancée.\nMaintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment !\n\nSi tu souhaites travailler sur un nouveau sujet, rafraîchis d'abord la page.\n\nRappelle-toi que ce guide est éducatif et ne remplace pas un avis médical.";
      return NextResponse.json({ answer: txt });
    }

    // Par défaut, rien
    return NextResponse.json({ answer: "" });
  } catch {
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
