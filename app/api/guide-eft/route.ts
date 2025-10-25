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
  context?: string; // pour le flux physique : "type + localisation" de l’étape 1
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

/** --- Helpers douleur : localisation, articles, prépositions, rendu --- **/

/** Normalise certaines typos fréquentes de localisation (tempes, mâchoire, etc.) */
function normalizePainLocation(raw: string): string {
  let s = clean(raw).toLowerCase();

  // Variantes « tempes »
  s = s.replace(/\btemp[ée]rature(s)?\b/g, "tempes");
  s = s.replace(/\b(les|des|aux|au|du|à la|à l’|à l')?\s*temps\b/g, (m) =>
    m.includes("aux") || m.includes("les") || m.includes("des") ? "aux tempes" :
    m.includes("au") ? "aux tempes" :
    m.includes("du") ? "des tempes" : "tempes"
  );

  // Accents & formes fréquentes
  s = s.replace(/\bmachoire\b/g, "mâchoire");
  s = s.replace(/\bepaule\b/g, "épaule");

  // Nettoie doubles « dans/à »
  s = s.replace(/\b(serrement|pression|tension|douleur|chaleur|vide|poids|br[ûu]lure|brulure|picotement|fourmillement)\b.*?\b(dans|au|à|aux|à la|à l’|à l')\s*/g, "");
  s = s.replace(/^(dans|au|à|aux|à la|à l’|à l')\s*/g, "");
  return clean(s);
}

/** Retourne l’article + préposition correct(e) pour une localisation */
function pickArticleAndPrep(loc: string): { detPrep: string; locOut: string } {
  const L = clean(loc).toLowerCase();

  // Zones qui sonnent mieux avec "dans la/le"
  if (/\b(poitrine|gorge|ventre|mâchoire)\b/.test(L)) {
    // dans la/ le/ l’
    if (/\b(mâchoire)\b/.test(L)) return { detPrep: "dans la", locOut: loc };
    if (/\b(ventre)\b/.test(L))   return { detPrep: "dans le", locOut: loc };
    return { detPrep: "dans la", locOut: loc };
  }

  // Cas fréquents en "à/au/aux/à l’"
  // pluriel : tempes, lombaires, omoplates (entre les omoplates géré autrement)
  if (/\b(tempes|lombaires|omoplates)\b/.test(L)) return { detPrep: "aux", locOut: loc };

  // élision : à l’
  if (/^(épaule|epaule|aisselle|aine|arrière du cr[aâ]ne|arriere du cr[aâ]ne|oeil|œil|école)/.test(L)) {
    return { detPrep: "à l’", locOut: loc };
  }

  // "entre les omoplates" → pas d’article avant, on garde l’expression
  if (/^entre les omoplates\b/.test(L)) return { detPrep: "", locOut: loc };

  // singulier masculin/féminin simple
  if (/^(genou|cou|front|dos|cr[aâ]ne|trap[eè]zes?)\b/.test(L)) return { detPrep: "au", locOut: loc };
  if (/^(nuque|hanche|c[ôo]te|cote|tempe)\b/.test(L)) return { detPrep: "à la", locOut: loc };

  // fallback neutre
  return { detPrep: "à", locOut: loc };
}

/** Rend « douleur [type?] [prep] [loc] », en supprimant l’aire large redondante si la sous-zone la porte déjà */
function buildPainNucleus(typeMaybe: string | undefined, locRaw: string, intakeRaw?: string): string {
  const type = clean(typeMaybe || "");
  let loc = normalizePainLocation(locRaw);

  // Supprime l’aire large si la localisation est déjà spécifique (ex: "aux tempes" ⇒ inutile "à la tête")
  const largeHeads = ["tête", "crâne", "tete", "crane"];
  const impliesHead = /\b(tempes|front|arrière du cr[aâ]ne|arriere du cr[aâ]ne|tempe)\b/.test(loc.toLowerCase());
  if (impliesHead && intakeRaw && /\b(t[êe]te|cr[aâ]ne)\b/i.test(intakeRaw)) {
    // on ignore "à la tête" du texte final
  }

  const { detPrep, locOut } = pickArticleAndPrep(loc);
  const typePart = type ? ` ${type}` : "";
  const prepos = detPrep ? ` ${detPrep} ` : " ";
  return `douleur${typePart}${prepos}${locOut}`;
}

/** Rend la cible « cette douleur … » (féminin) */
function buildPainTarget(typeMaybe: string | undefined, locRaw: string, intakeRaw?: string): string {
  return `cette ${buildPainNucleus(typeMaybe, locRaw, intakeRaw)}`;
}


/** Unifie “mal …” -> “douleur …” pour garantir l’article “cette” */
function normalizePhysicalBase(s: string): string {
  const t = clean(s);
  if (/^mal\b/i.test(t)) {
    return t.replace(/^mal\b/i, "douleur").replace(/\s+de\s+/, " ").trim();
  }
  return t;
}

/** Concatène base + détail (type/localisation) en évitant les doublons */
function mergePhysicalPhrase(base: string, detail: string): string {
  let b = clean(base);
  let d = clean(detail);

  // Retire un “douleur …” redondant au début du détail
  d = d.replace(/^douleur\s+/i, "");

  // Si le détail répète exactement la base, on ne le rajoute pas
  if (d && (b.toLowerCase() === d.toLowerCase())) d = "";

  // Évite “au genou … du genou”
  const key = (b.match(/\b(dos|cou|nuque|épaule[s]?|lombaire[s]?|genou[x]?|cheville[s]?|hanche[s]?|ventre|abdomen|poignet|main[s]?|t[êe]te)\b/i) || [])[0];
  if (key && new RegExp(`\\b${key}\\b`, "i").test(d)) {
    b = b.replace(new RegExp(`\\s+(au|du|de la|de l’|de l'|aux)\\s+${key}\\b`, "i"), "");
  }

  return clean(`${b} ${d}`.trim());
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

      // SITUATION / FAIT — d’abord le ressenti corporel
      const txt =
`Étape 1 — Quand tu penses à « ${intakeNorm} », que ressens-tu dans ton corps ?
(Exemples : serrement dans la poitrine, gorge qui se serre, crispation dans le ventre…)`;
      return NextResponse.json({ answer: txt });
    }

    // Étape 3 — Pont vers l’évaluation
    if (etape === 3) {
      const intake = clean(slots.intake ?? "");
      const kind = classifyIntake(intake);

      if (kind === "physique") {
        // on ne touche pas à slots.context (détail type+localisation)
        return NextResponse.json({ answer: "Merci. Passons à l’évaluation de l’intensité maintenant." });
      }

      const txt =
`Étape 3 — Merci. Si tu identifies un déclencheur particulier, indique-le en quelques mots (facultatif).`;
      return NextResponse.json({ answer: txt });
    }

// Étape 4 — Évaluation (SUD) — inclut le cas "situation"
if (etape === 4) {
  const intake = clean(slots.intake ?? "");
  const ctx = clean(slots.context ?? "");

  // Cas SITUATION (inchangé)
  if (classifyIntake(intake) === "situation") {
    const sensation = ctx || "ce ressenti";
    const txt =
`Étape 4 — À combien évalues-tu « ${sensation} » (0–10), quand tu penses à « ${intake} » ?
(0 = aucune gêne, 10 = maximum).`;
    return NextResponse.json({ answer: txt });
  }

  // Cas ÉMOTION (inchangé)
  if (classifyIntake(intake) === "emotion") {
    const ctxPart = ctx ? ` en te connectant à « ${ctx} »` : "";
    const txt =
`Étape 4 — Pense à « ${intake} »${ctxPart}. Indique un SUD entre 0 et 10 (0 = aucune gêne, 10 = maximum).`;
    return NextResponse.json({ answer: txt });
  }

  // Cas PHYSIQUE — 👉 ancrage sur [type + localisation précise], sans redite "à la tête"
  // slots.intake = ex. "mal à la tête" / "douleur au dos"
  // slots.context = ex. "lancinante aux tempes" ou "sourde aux lombaires" (depuis Étape 1/2)
  const intakeRaw = intake; // utile pour détecter l'aire large
  const detail = ctx;       // "type + localisation" saisis à l'étape 1
  let typePart = "";
  let locPart = detail;

  // On tente d’extraire un [type] depuis le début : "lancinante aux tempes" → type="lancinante", loc="aux tempes"
  const m = detail.match(/^([a-zàâéèêëîïôùûç-]+)\s+(.*)$/i);
  if (m) {
    typePart = clean(m[1]);
    locPart  = clean(m[2]);
  }

  const target = buildPainTarget(typePart || undefined, locPart, intakeRaw);
  const txt =
`Étape 4 — Pense à « ${target} ». Indique un SUD entre 0 et 10 (0 = aucune gêne, 10 = maximum).`;
  return NextResponse.json({ answer: txt });
}


    // Étape 5 — Setup
if (etape === 5) {
  const intakeOrig = clean(slots.intake ?? "");
  const aspectRaw  = clean(slots.aspect ?? slots.intake ?? "");
  let base = aspectRaw;
  let ctx  = clean(slots.context ?? "");

  const m = aspectRaw.match(/\s+liée?\s+à\s+/i);
  if (m) {
    const idx = aspectRaw.toLowerCase().indexOf(m[0].toLowerCase());
    base = clean(aspectRaw.slice(0, idx));
    ctx  = clean(aspectRaw.slice(idx + m[0].length));
  }

  // ✅ CAS "situation" : setup = (ce/cette) [ressenti] quand je pense à [situation]
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

  // ✅ CAS "émotion" : inchangé (base + contexte lisible)
  if (classifyIntake(intakeOrig) === "emotion") {
    base = normalizeEmotionNoun(base)
      .replace(/^j['’]?\s*ai\s+/, "")
      .replace(/^je\s+/, "")
      .replace(/^(ce|cette)\s+/i, "");

    const kind = classifyIntake(intakeOrig || base);
    const ctxPretty = ctx ? readableContext(ctx, kind) : "";
    const g = detectGender(base);
    const hasCauseWord = /^(parce que|car|puisque)\b/i.test(ctxPretty);
    const connector = ctxPretty ? (hasCauseWord ? " " : (g === "f" ? " liée à " : " lié à ")) : "";
    const aspectPretty = (base + connector + (ctxPretty || "")).replace(/\s{2,}/g, " ").trim();
    const article = emotionArticle(base);

    const setupLine = `Même si j’ai ${article} ${aspectPretty}, je m’accepte profondément et complètement.`;
    const txt =
`Étape 5 — Setup : « ${setupLine} »
Répète cette phrase 3 fois en tapotant sur le Point Karaté (tranche de la main).
Quand c’est fait, envoie un OK et nous passerons à la ronde.`;
    return NextResponse.json({ answer: txt });
  }

  // ✅ CAS "physique" — ancrage sur [type + localisation précise], sans redite "à la tête"
  // slots.context contient "type + localisation" depuis l’étape 1
  const intakeRaw = intakeOrig;     // ex : "mal à la tête", "douleur au dos"
  const detail    = clean(slots.context ?? ""); // ex : "lancinante aux tempes"
  let typePart = "";
  let locPart  = detail;

  const m2 = detail.match(/^([a-zàâéèêëîïôùûç-]+)\s+(.*)$/i);
  if (m2) {
    typePart = clean(m2[1]);
    locPart  = clean(m2[2]);
  }

  const target = buildPainTarget(typePart || undefined, locPart, intakeRaw);
  const whenCtx = ""; // le contexte (facultatif) peut être réintroduit si tu le captes séparément pour le physique
  const setupLine = `Même si j’ai ${target}${whenCtx}, je m’accepte profondément et complètement.`;

  const txt =
`Étape 5 — Setup : « ${setupLine} »
Répète cette phrase 3 fois en tapotant sur le Point Karaté (tranche de la main).
Quand c’est fait, envoie un OK et nous passerons à la ronde.`;
  return NextResponse.json({ answer: txt });
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

    // Étape 7 — Réévaluation (+ rappel option 3.2 Physique)
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
