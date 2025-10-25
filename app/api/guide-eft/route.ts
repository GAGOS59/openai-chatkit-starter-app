// app/api/guide-eft/route.ts
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
function splitContext(ctx: string): string[] {
  return clean(ctx)
    .split(/[,.;]|(?:\s(?:et|quand|parce que|car|puisque|lorsque|depuis|depuis que)\s)/gi)
    .map((p) => clean(p))
    .filter((p) => p.length > 0)
    .slice(0, 6);
}

/** Normalise l’intake ("j'ai mal aux épaules" -> "mal aux épaules", etc.) */
function normalizeIntake(input: string): string {
  const s = clean(input);

  const mMal = s.match(/^j['’]ai\s+mal\s+(?:à|a)\s+(?:(?:la|le|les)\s+|l['’]\s*|au\s+|aux\s+)?(.+)$/i);
  if (mMal) return `mal ${clean(mMal[1])}`;

  const mDouleur = s.match(/^j['’]ai\s+(?:une|la)\s+douleur\s+(.*)$/i);
  if (mDouleur) return `douleur ${clean(mDouleur[1])}`;

  const mPeur1 = s.match(/^j['’]ai\s+(?:une|la)\s+peur\s+(.*)$/i);
  if (mPeur1) return `peur ${clean(mPeur1[1])}`;
  const mPeur2 = s.match(/^j['’]ai\s+peur\s+(.*)$/i);
  if (mPeur2) return `peur ${clean(mPeur2[1])}`;

  const mAutres = s.match(/^j['’]ai\s+(?:une|la)\s+(tension|gêne|gene)\s+(.*)$/i);
  if (mAutres) return `${clean(mAutres[1])} ${clean(mAutres[2])}`;

  return s;
}

/** Détection masculine/féminine minimaliste pour les liaisons */
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

/** Normalisation des noms d’émotions pour rester concis (peur, colère, etc.) */
function normalizeEmotionNoun(s: string): string {
  const raw = clean(s);
  const t = raw.toLowerCase();

  if (/\bpeur\s+(de|du|des|d’|d')\s+.+/i.test(t)) return raw;
  if (/\bcol[eè]re\s+(contre|envers|à\s+propos\s+de)\s+.+/i.test(t)) return raw;
  if (/\b(honte|culpabilit[eé])\s+(de|d’|d')\s+.+/i.test(t)) return raw;

  const x = t
    .replace(/^j['’]?\s*eprouve\s+/, "")
    .replace(/^je\s+me\s+sens\s+/, "")
    .replace(/^je\s+ressens\s+/, "")
    .replace(/^je\s+suis\s+en\s+/, "")
    .replace(/^je\s+suis\s+/, "");

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
  const phys = /\b(mal|douleur|tension|gêne|gene|crispation|br[ûu]lure|brulure|tiraillement|raid(e|eur)|contracture|piq[uû]re|aiguille|spasme|serrement|inflammation)\b/;
  if (phys.test(s)) return "physique";
  const emo = /\b(peur|col[eè]re|tristesse|honte|culpabilit[eé]|stress|anxi[eé]t[eé]|angoisse|inqui[eè]tude|d[eé]g[oô]ut)\b/;
  if (emo.test(s)) return "emotion";
  return "situation";
}

function hintsForLocation(intakeRaw: string): string {
  const s = clean(intakeRaw).toLowerCase();
  const table: Array<[RegExp, string]> = [
    [/\bdos\b/, " (lombaires, milieu du dos, entre les omoplates…)"],
    [/\b(cou|nuque)\b/, " (nuque, trapèzes, base du crâne…)"],
    [/\bépaule(s)?\b/, " (avant de l’épaule, deltoïde, omoplate…)"],
    [/\blombaire(s)?\b/, " (L4-L5, sacrum, bas du dos…)"],
    [/\b(coude)\b/, " (épicondyle, face interne/externe…)"],
    [/\bpoignet\b/, " (dessus, côté pouce, côté auriculaire…)"],
    [/\bmain(s)?\b/, " (paume, dos de la main, base des doigts…)"],
    [/\bgenou(x)?\b/, " (rotule, pli du genou, côté interne/externe…)"],
    [/\bcheville(s)?\b/, " (malléole interne/externe, tendon d’Achille…)"],
    [/\bhanche(s)?\b/, " (crête iliaque, pli de l’aine, fessier…)"],
    [/\b(m[aâ]choire|machoire)\b/, " (ATM, devant l’oreille, côté droit/gauche…)"],
    [/\b(t[eê]te|migraine|tempe|front)\b/, " (tempe, front, arrière du crâne…)"],
    [/\b[oe]il|yeux?\b/, " (dessus, dessous, coin interne/externe – attention douceur)"],
    [/\b(ventre|abdomen)\b/, " (haut/bas du ventre, autour du nombril…)"]
  ];
  for (const [rx, hint] of table) if (rx.test(s)) return hint;
  return " (précise côté droit/gauche, zone exacte et si c’est localisé ou étendu…)";
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

function baseFromIntake(_raw: string): { generic: string; short: string; g: "m" | "f" } {
  const intakePrim = clean(normalizeIntake(_raw));
  const intake = clean(normalizeEmotionNoun(intakePrim));
  const g = detectGender(intake);
  if (g === "m" && /^mal\b/i.test(intake)) return { generic: "Ce " + intake, short: "Ce " + intake, g };
  if (g === "f") return { generic: "Cette " + intake, short: "Cette " + intake, g };
  return { generic: "Ce problème", short: "Ce problème", g: "m" };
}

function buildRappelPhrases(slots: Slots): string[] {
  let intake = clean(normalizeIntake(slots.intake ?? ""));
  intake = intake.replace(/^(?:je\s+suis|je\s+me\s+sens|je\s+ressens|j['’]ai)\s+/i, "");
  intake = clean(normalizeEmotionNoun(intake));
  const ctx = clean(slots.context ?? "");
  const { generic, short, g } = baseFromIntake(intake);
  const sudQ = sudQualifierFromNumber(slots.sud, g);
  const round = slots.round ?? 1;
  const contextParts = ctx ? splitContext(ctx) : [];
  const roundMod =
    typeof slots.sud === "number" && slots.sud > 0 && round > 1
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

/* ---------- Helpers spécifiques “physique” ---------- */

/** Unifie “mal …” -> “douleur …” pour garantir l’article “cette” */
function normalizePhysicalBase(s: string): string {
  const t = clean(s);
  if (/^mal\b/i.test(t)) {
    return t.replace(/^mal\b/i, "douleur").replace(/\s+de\s+/, " ").trim();
  }
  return t;
}

/** Concatène base + détail en évitant les doublons grossiers (ex. “douleur …” déjà dans le détail) */
function mergePhysicalPhrase(base: string, detail: string): string {
  let b = clean(base);
  let d = clean(detail);

  // Retire un “douleur …” redondant au début du détail
  d = d.replace(/^douleur\s+/i, "");

  // Si le détail répète exactement la base, on ne le rajoute pas
  if (d && (b.toLowerCase() === d.toLowerCase())) d = "";

  // Petite heuristique : si le détail contient déjà la localisation du mot clé de la base (ex. “genou”)
  const key = (b.match(/\b(dos|cou|nuque|épaule[s]?|lombaire[s]?|genou[x]?|cheville[s]?|hanche[s]?|ventre|abdomen|poignet|main[s]?|t[êe]te)\b/i) || [])[0];
  if (key && new RegExp(`\\b${key}\\b`, "i").test(d)) {
    // Evite “au genou … du genou”
    b = b.replace(new RegExp(`\\s+(au|du|de la|de l’|de l'|aux)\\s+${key}\\b`, "i"), "");
  }

  const merged = clean(`${b} ${d}`.trim());
  // Parenthésage léger pour une fin “côté …” si elle n’est pas déjà incluse proprement
  const mCote = merged.match(/\b(c[ôo]t[eé]\s+(interne|externe|gauche|droit))\b/i);
  if (mCote) {
    // si “côté …” est déjà présent sans parenthèses, on laisse tel quel
    return merged;
  }
  return merged;
}

/* ---------- Sécurité : crise suicidaire ---------- */
const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid(e|er|aire|al|ale|aux|erai|erais|erait|eront)?\b/iu,
  /\bsu[cs]sid[ea]\b/iu,
  /\bje\s+(veux|vais|voudrais)\s+mour(ir|ire)\b/iu,
  /\bje\s+ne\s+veux\s+plus\s+vivre\b/iu,
  /j['’]?\s*en\s+peux?\s+plus\s+de\s+vivre\b/iu,
  /j['’]?\s*en\s+ai\s+marre\s+de\s+(cette\s+)?vie\b/iu,
  /\bje\s+(veux|vais|voudrais)\s+en\s+finir\b/iu,
  /\bmettre\s+fin\s+à\s+(ma|mes)\s+jours?\b/iu,
  /\b(foutre|jeter)\s+en\s+l[’']?air\b/iu,
  /\bje\s+(veux|voudrais|vais)\s+dispara[iî]tre\b/iu,
  /\bplus\s+(envie|go[uû]t)\s+de\s+vivre\b/iu,
  /\b(kill\s+myself|i\s+want\s+to\s+die|suicide)\b/i,
  /\bje\s+suis\s+de\s+trop\b/iu,
  /\bje\s+me\s+sens\s+de\s+trop\b/iu,
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
function interpretYesNoServer(text: string): 'yes' | 'no' | 'unknown' {
  if (YES_PATTERNS.some(rx => rx.test(text))) return 'yes';
  if (NO_PATTERNS.some(rx => rx.test(text))) return 'no';
  return 'unknown';
}
function lastBotAskedSuicideQuestion(transcript: string): boolean {
  const t = (transcript || "").toLowerCase();
  return /(^|\n)A:\s.*avez[-\s]?vous\s+des\s+id[ée]es?\s+suicidaires\b/.test(t);
}

/* ---------- Handler (déterministe, sans LLM/FAQ) ---------- */
export async function POST(req: Request) {
  try {
    // CORS simple
    const origin = (req.headers.get("origin") || "").toLowerCase();
    const isAllowedOrigin =
      !origin ||
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https:\/\/(www\.)?ecole-eft-france\.fr$/.test(origin) ||
      /^https:\/\/appli.ecole-eft-france\.fr$/.test(origin) ||
      /^https:\/\/.*\.vercel\.app$/.test(origin);

    if (!isAllowedOrigin) {
      return NextResponse.json({ answer: "Origine non autorisée (CORS)." }, { status: 403 });
    }

    const raw = (await req.json().catch(() => ({}))) as Partial<GuideRequest>;
    const prompt = typeof raw.prompt === "string" ? raw.prompt.slice(0, 2000) : "";
    const transcript = typeof raw.transcript === "string" ? raw.transcript.slice(0, 4000) : "";
    const slots = (raw.slots && typeof raw.slots === "object" ? (raw.slots as Slots) : {}) ?? {};
    const etape = Number.isFinite(raw.etape) ? Math.min(8, Math.max(1, Number(raw.etape))) : 1;

    /* ---- Barrière de sécurité oui/non (ordre strict) ---- */
    if (prompt) {
      const ynIfAny: 'yes' | 'no' | 'unknown' = interpretYesNoServer(prompt);
      const askedBefore: boolean = lastBotAskedSuicideQuestion(transcript);

      if (askedBefore && ynIfAny === "yes") {
        return NextResponse.json({ answer: crisisMessage(), kind: "crisis" as const });
      }
      if (askedBefore && ynIfAny === "no") {
        return NextResponse.json({
          answer:
            "Merci pour votre réponse. Je note que ça n'est pas le cas. Reprenons.\n\n" +
            "En quoi puis-je vous aider ?",
          kind: "resume" as const,
        });
      }
      if (!askedBefore && ynIfAny === "yes") {
        return NextResponse.json({ answer: crisisMessage(), kind: "crisis" as const });
      }
      if (!askedBefore && ynIfAny === "no") {
        return NextResponse.json({
          answer:
            "Merci pour votre réponse. Je note que ça n'est pas le cas. Reprenons.\n\n" +
            "En quoi puis-je vous aider ?",
          kind: "resume" as const,
        });
      }
      if (isCrisis(prompt)) {
        return NextResponse.json({
          answer: "Avez-vous des idées suicidaires ? (oui / non)",
          kind: "gate" as const,
        });
      }
    }

    /* ---- Étapes EFT (déterministes) ---- */

    // Étape 1 — Intake (3 flux)
    if (etape === 1) {
      const intakeRaw = slots.intake ?? prompt ?? "";
      const intakeNorm = clean(intakeRaw);
      const kind = classifyIntake(intakeNorm);

      if (kind === "physique") {
        const hints = hintsForLocation(intakeNorm);
        const txt =
`Étape 1 — Tu dis « ${intakeNorm} ». 
Précise la localisation exacte${hints}
et le type de douleur (lancinante, sourde, aiguë, comme une aiguille, etc.).`;
        return NextResponse.json({ answer: txt });
      }

      if (kind === "emotion") {
        const txt =
`Étape 1 — Tu dis « ${intakeNorm} ». 
Si tu te places juste avant de pouvoir nommer cette émotion : que se passe-t-il dans ton corps ?
Décris brièvement la sensation (serrement, pression, chaleur, vide…) 
et où tu la ressens (poitrine, gorge, ventre, tête…).`;
        return NextResponse.json({ answer: txt });
      }

      // ✅ SITUATION / FAIT — d’abord le ressenti corporel
      const txt =
`Étape 1 — Quand tu penses à « ${intakeNorm} », que ressens-tu dans ton corps ?
(Exemples : serrement dans la poitrine, gorge qui se serre, crispation dans le ventre…)`;
      return NextResponse.json({ answer: txt });
    }

    // Étape 3 — Contexte (facultatif pour le physique ; neutre sinon)
    if (etape === 3) {
      const intake = clean(slots.intake ?? "");
      const kind = classifyIntake(intake);

      if (kind === "physique") {
        const txt =
`Étape 3 — Y a-t-il un contexte où c’est plus présent ?
(Ex. fin de journée, posture, stress, situation particulière…)`;
        return NextResponse.json({ answer: txt });
      }

      const txt =
`Étape 3 — Merci. Si tu identifies un déclencheur particulier, indique-le en quelques mots (facultatif).`;
      return NextResponse.json({ answer: txt });
    }

    // Étape 4 — Évaluation (SUD) — formulation par flux
    if (etape === 4) {
      const intake = clean(slots.intake ?? "");
      const ctx = clean(slots.context ?? "");
      const kind = classifyIntake(intake);

      if (kind === "situation") {
        const sensation = ctx || "ce ressenti";
        const txt =
`Étape 4 — À combien évalues-tu « ${sensation} » (0–10), quand tu penses à « ${intake} » ?
(0 = aucune gêne, 10 = maximum).`;
        return NextResponse.json({ answer: txt });
      }

      if (kind === "emotion") {
        const cible = ctx || "cette sensation";
        const txt =
`Étape 4 — Pense à ${cible}${ctx ? "" : " dans ton corps"} en te connectant au contexte qui la déclenche si tu en vois un.
Indique un SUD entre 0 et 10 (0 = aucune gêne, 10 = maximum).`;
        return NextResponse.json({ answer: txt });
      }

      // Physique (douleur/tension…)
      const ctxPart = ctx ? ` en te connectant à « ${ctx} »` : "";
      const txt =
`Étape 4 — Pense à « ${intake} »${ctxPart}. Indique un SUD entre 0 et 10 (0 = aucune gêne, 10 = maximum).`;
      return NextResponse.json({ answer: txt });
    }

    // Étape 5 — Setup — formulation par flux
    if (etape === 5) {
      const intakeOrig = clean(slots.intake ?? "");
      const aspectRaw  = clean(slots.aspect ?? slots.intake ?? "");
      let base = aspectRaw;
      let ctx  = clean(slots.context ?? "");

      // Sépare "… liée à …" si présent
      const m = aspectRaw.match(/\s+liée?\s+à\s+/i);
      if (m) {
        const idx = aspectRaw.toLowerCase().indexOf(m[0].toLowerCase());
        base = clean(aspectRaw.slice(0, idx));
        ctx  = clean(aspectRaw.slice(idx + m[0].length));
      }

      // ✅ SITUATION — setup = (ce/cette) [ressenti] quand je pense à [situation]
      if (classifyIntake(intakeOrig) === "situation") {
        const sensation = ctx || base || "ce ressenti";
        const article = emotionArticle(sensation);
        const setupLine = `Même si j’ai ${article} ${sensation} quand je pense à ${intakeOrig}, je m’accepte profondément et complètement.`;
        const txt =
`Étape 5 — Setup : « ${setupLine} »
Répète cette phrase 3 fois en tapotant sur le Point Karaté (tranche de la main).
Quand c’est fait, envoie un OK et nous passerons à la ronde.`;
        return NextResponse.json({ answer: txt });
      }

      // Normalisations communes
      base = normalizeEmotionNoun(base)
        .replace(/^j['’]?\s*ai\s+/, "")
        .replace(/^je\s+/, "")
        .replace(/^(ce|cette)\s+/i, "");

      const kind = classifyIntake(intakeOrig || base);

      // ✅ ÉMOTION — préférer “dès que je pense à [contexte]” si présent
      if (kind === "emotion") {
        const article = emotionArticle(base);
        const setupLine = ctx
          ? `Même si j’ai ${article} ${base} dès que je pense à ${clean(ctx)}, je m’accepte profondément et complètement.`
          : `Même si j’ai ${article} ${base}, je m’accepte profondément et complètement.`;

        const txt =
`Étape 5 — Setup : « ${setupLine} »
Répète cette phrase 3 fois en tapotant sur le Point Karaté (tranche de la main).
Quand c’est fait, envoie un OK et nous passerons à la ronde.`;
        return NextResponse.json({ answer: txt });
      }

      // ✅ PHYSIQUE — unifie et fusionne (pas de "liée à …")
      if (kind === "physique") {
        // 1) Unifie “mal …” -> “douleur …”
        let physBase = normalizePhysicalBase(intakeOrig);
        // 2) Concatène avec le détail (type/localisation fine) sans “douleur …” en double
        const merged = mergePhysicalPhrase(physBase, ctx);
        // 3) Article toujours au féminin pour “douleur …”
        const article = "cette";
        const setupLine = `Même si j’ai ${article} ${merged}, je m’accepte profondément et complètement.`;
        const txt =
`Étape 5 — Setup : « ${setupLine} »
Reste bien connecté·e à ton ressenti et, en tapotant le Point Karaté (tranche de la main), répète cette phrase 3 fois à voix haute.
Quand c’est fait, envoie un OK et nous passerons à la ronde.`;
        return NextResponse.json({ answer: txt });
      }

      // Fallback (ne devrait pas arriver)
      const article = emotionArticle(base);
      const setupLine = `Même si j’ai ${article} ${base}, je m’accepte profondément et complètement.`;
      return NextResponse.json({ answer: `Étape 5 — Setup : « ${setupLine} »` });
    }

    // Étape 6 — Ronde (points)
    if (etape === 6) {
      const p = buildRappelPhrases(slots);
      const txt =
`Étape 6 —

- ST : ${p[0]}
- DS : ${p[1]}
- CO : ${p[2]}
- SO : ${p[3]}
- SN : ${p[4]}
- CM : ${p[5]}
- CL : ${p[6]}
- SB : ${p[7]}
Quand tu as terminé cette ronde, dis-moi ton SUD (0–10).`;
      return NextResponse.json({ answer: txt });
    }

    // Étape 7 — Réévaluation (+ conseil 3.2 Physique)
    if (etape === 7) {
      const txt =
"Étape 7 — Indique ton SUD (0–10) maintenant.\n\n" +
"Si le SUD n’a pas baissé d’au moins 2 points entre deux rondes **ou** si la douleur ne descend pas à 0 avec ce processus, reviens à l’instant d’apparition (option 3.2) :\n" +
"1) Depuis quand est-ce là ?  2) Que se passait-il alors ?  3) Que se passe-t-il dans ton corps en y pensant ?  4) Où ça ?  5) SUD → Setup → rondes → retourne évaluer la douleur.";
      return NextResponse.json({ answer: txt });
    }

    // Étape 8 — Clôture
    if (etape === 8) {
      const txt =
"Étape 8 — Bravo pour le travail fourni. Félicitations pour cette belle avancée. Prends un moment pour t'hydrater et te reposer. Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical.";
      return NextResponse.json({ answer: txt });
    }

    return NextResponse.json({ answer: "Étape non reconnue." });
  } catch {
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
