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

/* ---------- Utils ---------- */
function stepFromStage(stage?: Stage): number {
  switch (stage) {
    case "Intake": return 1;
    case "Durée": return 2;
    case "Contexte": return 3;
    case "Évaluation": return 4;
    case "Setup": return 5;
    case "Tapping": return 6;
    case "Réévaluation": return 7;
    case "Clôture": return 8;
    default: return 1;
  }
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\s+([,;:.!?])/g, "$1").trim();
}

/** Normalise l’intake ("j'ai mal aux épaules" -> "mal aux épaules", etc.) */
function normalizeIntake(input: string): string {
  const s = input.trim().replace(/\s+/g, " ");

  // j'ai mal à/au/aux/à la/à l'...
  const mMal =
    s.match(/^j['’]ai\s+mal\s+(?:à|a)\s+(?:(?:la|le|les)\s+|l['’]\s*|au\s+|aux\s+)?(.+)$/i);
  if (mMal) return `mal ${mMal[1].trim()}`;

  // j'ai une/la douleur ...
  const mDouleur = s.match(/^j['’]ai\s+(?:une|la)\s+douleur\s+(.*)$/i);
  if (mDouleur) return `douleur ${mDouleur[1].trim()}`;

  // j'ai (une/la) peur ..., j'ai peur ...
  const mPeur1 = s.match(/^j['’]ai\s+(?:une|la)\s+peur\s+(.*)$/i);
  if (mPeur1) return `peur ${mPeur1[1].trim()}`;
  const mPeur2 = s.match(/^j['’]ai\s+peur\s+(.*)$/i);
  if (mPeur2) return `peur ${mPeur2[1].trim()}`;

  // j'ai (une/la) tension|gêne|gene ...
  const mAutres = s.match(/^j['’]ai\s+(?:une|la)\s+(tension|gêne|gene)\s+(.*)$/i);
  if (mAutres) return `${mAutres[1]} ${mAutres[2].trim()}`;

  return s;
}

function splitContext(ctx: string): string[] {
  return ctx
    .split(/[,.;]|(?:\s(?:et|quand|parce que|lorsque|depuis|depuis que)\s)/gi)
    .map((p) => clean(p))
    .filter((p) => p.length > 0)
    .slice(0, 6);
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

/** Détecte si l’intake est une émotion (forme adjectivale « je suis … » ou nom : tristesse, colère…) */
function isEmotionIntake(raw: string): boolean {
  const t = clean(raw).toLowerCase();
  if (/^je\s+suis\b/i.test(t)) return true; // forme adjectivale "je suis ..."
  return /\b(peur|col[eè]re|tristesse|honte|culpabilit[eé]|stress|anxi[eé]t[eé]|angoisse|inqui[eè]tude|d[eé]g[oô]ut)\b/.test(t);
}

/** Choisit « ce » ou « cette » selon le nom d’émotion */
function emotionArticle(noun: string): "ce" | "cette" {
  const n = clean(noun).toLowerCase().replace(/\s+de.*$/, "");
  const fem = new Set([
    "peur","colère","tristesse","honte","culpabilité","anxiété","angoisse","inquiétude"
  ]);
  return fem.has(n) ? "cette" : "ce"; // « stress » / « dégoût » → masculin
}

/**
 * Extrait une forme exploitable pour le setup à partir d’un intake émotionnel.
 * - "je suis triste"        → {mode:"adj",  text:"triste"}
 * - "tristesse"/"de la ..." → {mode:"noun", text:"tristesse", article:"cette"}
 * - "peur de parler"        → {mode:"noun", text:"peur de parler", article:"cette"}
 */
function parseEmotionPhrase(raw: string): { mode: "adj"|"noun", text: string, article?: "ce"|"cette" } {
  const t = clean(raw);

  // Cas adjectival direct : "je suis ..."
  const mAdj = t.match(/^je\s+suis\s+(.+)$/i);
  if (mAdj) {
    return { mode: "adj", text: clean(mAdj[1]) };
  }

  // Cas "de la tristesse"
  const mDeLa = t.match(/^de\s+la\s+(.+)$/i);
  if (mDeLa) {
    const noun = clean(mDeLa[1]);
    return { mode: "noun", text: noun, article: emotionArticle(noun) };
  }

  // Cas nominal : « tristesse », « peur de … », etc. (on passe par ta normalisation)
  const noun = clean(normalizeEmotionNoun(t));
  return { mode: "noun", text: noun, article: emotionArticle(noun) };
}

/** Normalise une tournure émotionnelle vers un nom : "je suis en colère" → "colère", "je me sens coupable" → "culpabilité" */
function normalizeEmotionNoun(s: string): string {
  const t = clean(s).toLowerCase();

  const x = t
    .replace(/^j['’]?\s*eprouve\s+/i, "")
    .replace(/^je\s+me\s+sens\s+/i, "")
    .replace(/^je\s+ressens\s+/i, "")
    .replace(/^je\s+suis\s+en\s+/i, "")
    .replace(/^je\s+suis\s+/i, "");

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

  // Si on trouve "peur de/peur du", on garde "peur ..."
  const m = t.match(/peur\s+(de|du|des|d’|d')\s+.+/i);
  if (m) return clean(t);

  // Sinon on renvoie proprement la chaîne initiale nettoyée
  return clean(s);
}

/** Rend un contexte lisible après "lié(e) à" : ajoute "au fait que" si besoin et corrige "le/la/les/il/elle..." */
function readableContext(ctx: string): string {
  let c = clean(ctx);
  if (!c) return "";

  // Si le contexte commence par un pronom/article/que, on insère "au fait que "
  const needsQue = /^(il|elle|ils|elles|on|que|qu’|qu'|le|la|les|mon|ma|mes|son|sa|ses)\b/i.test(c);
  if (needsQue && !/^au\s+fait\s+que\b/i.test(c)) {
    c = "au fait que " + c;
  }

  // harmoniser "au fait que il" -> "au fait qu'il"
  c = c
    .replace(/\bau\s+fait\s+que\s+il\b/gi, "au fait qu'il")
    .replace(/\bau\s+fait\s+que\s+elle\b/gi, "au fait qu'elle")
    .replace(/\bau\s+fait\s+que\s+ils\b/gi, "au fait qu'ils")
    .replace(/\bau\s+fait\s+que\s+elles\b/gi, "au fait qu'elles");

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
  const intake = clean(normalizeIntake(_raw)); // normalisation sûre
  const g = detectGender(intake);
  if (g === "m" && /^mal\b/i.test(intake)) {
    return { generic: "Ce " + intake, short: "Ce " + intake, g };
  }
  if (g === "f") {
    return { generic: "Cette " + intake, short: "Cette " + intake, g };
  }
  return { generic: "Ce problème", short: "Ce problème", g: "m" };
}

function buildRappelPhrases(slots: Slots): string[] {
  const intake = clean(normalizeIntake(slots.intake ?? ""));
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
      const sentence = s[0].toUpperCase() + s.slice(1) + ".";
      phrases.push(sentence);
    } else {
      phrases.push(`${(i % 2 === 0) ? generic : short}${qOrRound}.`);
    }
  }
  if (contextParts[0]) phrases.push(`Tout ce contexte : ${contextParts[0]}.`);
  else phrases.push(`${short}.`);
  phrases.push(`${generic}.`);
  return phrases.slice(0, 8);
}

/* ---------- Classification Intake ---------- */
type IntakeKind = "physique" | "emotion" | "situation";

function classifyIntake(intakeRaw: string): IntakeKind {
  const s = clean(normalizeIntake(intakeRaw)).toLowerCase();

  // marqueurs physiques
  const phys = /\b(mal|douleur|tension|gêne|gene|crispation|br[ûu]lure|brulure|tiraillement|raid(e|eur)|contracture|piq[uû]re|aiguille|spasme|serrement|inflammation)\b/;
  if (phys.test(s)) return "physique";

  // marqueurs émotionnels
  const emo = /\b(peur|col[eè]re|tristesse|honte|culpabilit[eé]|stress|anxi[eé]t[eé]|angoisse|inqui[eè]tude|d[eé]g[oô]ut)\b/;
  if (emo.test(s)) return "emotion";

  // sinon : situation/événement
  return "situation";
}

/* ---------- Exemples contextuels par zone corporelle (physique) ---------- */
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

/* ---------- Safety patterns (in/out) ---------- */
const CRISIS_PATTERNS: RegExp[] = [
  /\bsuicid(e|er|aire|al|ale|aux|erai|erais|erait|eront)?\b/i,
  /\bsu[cs]sid[ea]\b/i,
  /\bje\s+(veux|vais|voudrais)\s+mour(ir|ire)\b/i,
  /\bje\s+ne\s+veux\s+plus\s+vivre\b/i,
  /j['’]?en\s+peux?\s+plus\s+de\s+vivre\b/i,
  /j['’]?en\s+ai\s+marre\s+de\s+(cette\s+)?vie\b/i,
  /\bje\s+(veux|vais|voudrais)\s+en\s+finir\b/i,
  /\bmettre\s+fin\s+à\s+(ma|mes)\s+jours?\b/i,
  /\b(foutre|jeter)\s+en\s+l[’']?air\b/i,
  /\bje\s+(veux|voudrais|vais)\s+dispara[iî]tre\b/i,
  /\bplus\s+(envie|go[uû]t)\s+de\s+vivre\b/i,
  /\b(kill\s+myself|i\s+want\s+to\s+die|suicide)\b/i,
  /\bje\s+suis\s+de\s+trop\b/i,
  /\bje\s+me\s+sens\s+de\s+trop\b/i,
  /\bid[ée]es?\s+noires?\b/i,
];

function isCrisis(text: string): boolean {
  const t = text.toLowerCase();
  return CRISIS_PATTERNS.some((rx) => rx.test(t));
}

function crisisMessage(): string {
  return (
`Message important
Il semble que vous traversiez un moment très difficile.
Je ne suis pas un service d'urgence, mais votre sécurité est prioritaire.

En France : appelez immédiatement le 15 (SAMU) ou le 3114 (prévention du suicide, 24/7).
En danger immédiat : appelez le 112.

Vous n'êtes pas seul·e — ces services peuvent vous aider dès maintenant.`
  );
}

/* ---------- SYSTEM (pour les étapes non déterministes) ---------- */
const SYSTEM = `
Tu es l'assistante EFT officielle de l'École EFT France (Gary Craig).
Style: clair, bienveillant, concis. Aucune recherche Internet. Pas de diagnostic.

FLUX
1) Intake — qualité/localisation (si douleur) OU "où dans le corps ?" (si émotion) OU "que ressens-tu quand tu penses à … ?" (si situation).
2) Durée — depuis quand.
3) Contexte — circonstances/événements (pas "émotions" si l'intake est déjà une émotion).
4) Évaluation — SUD (0–10) pour la première fois.
5) Setup — Phrase de préparation (PK ×3) puis attendre un message de l'utilisateur.
7) Réévaluation — SUD ; si >0 → nouvelle ronde ; si =0 → Clôture.
8) Clôture — remercier, féliciter, pause/hydratation, note de prudence.

LANGAGE
- Pas de fillers. Utiliser uniquement les mots fournis (slots).
- Une seule consigne par message (sauf Setup: 2 lignes max).
- Commencer par "Étape {N} — ".
`;

/* ---------- Handler ---------- */
export async function POST(req: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }
    const base = (process.env.LLM_BASE_URL || "").trim() || "https://api.openai.com";
    const endpoint = `${base.replace(/\/+$/, "")}/v1/responses`;

    const raw = (await req.json().catch(() => ({}))) as Partial<GuideRequest>;
    const prompt = typeof raw.prompt === "string" ? raw.prompt.slice(0, 2000) : "";

    // 🔒 Garde ENTRANT (avant tout)
    if (prompt && isCrisis(prompt)) {
      return NextResponse.json({ answer: crisisMessage() });
    }

    const stage = (raw.stage as Stage) ?? "Intake";
    const etapeClient = Number.isFinite(raw.etape) ? Number(raw.etape) : stepFromStage(stage);
    const transcript = typeof raw.transcript === "string" ? raw.transcript.slice(0, 4000) : "";
    const slots = (raw.slots && typeof raw.slots === "object" ? (raw.slots as Slots) : {}) ?? {};
    const etape = Math.min(8, Math.max(1, etapeClient));

    /* ---------- Étape 1 : déterministe + écho + exemples adaptés ---------- */
    if (etape === 1) {
      const intakeRaw = slots.intake ?? prompt ?? "";
      const intakeNorm = clean(intakeRaw);
      const kind = classifyIntake(intakeNorm);

      if (kind === "physique") {
        const hints = hintsForLocation(intakeNorm);
        const txt =
`Étape 1 — Tu dis « ${intakeNorm} ». Peux-tu préciser la localisation exacte${hints}
et le type de douleur (lancinante, sourde, aiguë, comme une aiguille, etc.) ?`;
        return NextResponse.json({ answer: txt });
      }

      if (kind === "emotion") {
        const txt =
`Étape 1 — Tu dis « ${intakeNorm} ». Où ressens-tu cela dans ton corps (poitrine, gorge, ventre, tête…) ?
Décris brièvement la sensation (serrement, pression, chaleur, vide, etc.).`;
        return NextResponse.json({ answer: txt });
      }

      const txt =
`Étape 1 — À propos de « ${intakeNorm} », quand tu y penses, qu’est-ce que tu ressens (émotion/sensation) et où dans le corps (poitrine, ventre, gorge…) ?`;
      return NextResponse.json({ answer: txt });
    }

    /* ---------- Étape 5 : Setup (accord "lié/liée", émotions, contexte lisible) ---------- */
    if (etape === 5) {
      // On repart de l’intake/aspect tels que fournis par le client
      const intakeOrig = clean(slots.intake ?? "");
      const aspectRaw  = clean(slots.aspect ?? slots.intake ?? "");

      // ——— Branche spéciale ÉMOTION (génère « je suis … » ou « j’ai cette … ») ———
      if (isEmotionIntake(intakeOrig)) {
        const emo = parseEmotionPhrase(intakeOrig);

        let setupLine = "";
        if (emo.mode === "adj") {
          // ex. « Même si je suis triste … »
          setupLine = `Même si je suis ${emo.text}, je m’accepte profondément et complètement.`;
        } else {
          // ex. « Même si j’ai cette tristesse … » | « cette peur de parler … »
          const art = emo.article ?? emotionArticle(emo.text);
          setupLine = `Même si j’ai ${art} ${emo.text}, je m’accepte profondément et complètement.`;
        }

        const txt =
`Étape 5 — Setup : « ${setupLine} »
Répétez cette phrase 3 fois en tapotant sur le Point Karaté (tranche de la main).
Quand c’est fait, envoyez un OK et nous passerons à la ronde.`;
        return NextResponse.json({ answer: txt });
      }

      // ——— Sinon : PHYSIQUE/SITUATION ———
      // Séparer base & contexte si un "lié(e) à" est déjà présent
      let base = aspectRaw;
      let ctx = "";
      const m = aspectRaw.match(/\s+liée?\s+à\s+/i);
      if (m) {
        const idx = aspectRaw.toLowerCase().indexOf(m[0].toLowerCase());
        base = aspectRaw.slice(0, idx).trim();
        ctx  = aspectRaw.slice(idx + m[0].length).trim();
      }

      // 1) Normaliser et nettoyer les débuts indésirables
      base = normalizeEmotionNoun(base)
        .replace(/^j['’]?\s*ai\s+/, "")
        .replace(/^je\s+/, "")
        .replace(/^(ce|cette)\s+/i, "");

      // 2) Genre pour "lié/liée"
      const g = detectGender(base);
      const liaison = ctx ? (g === "f" ? "liée à " : "lié à ") : "";

      // 3) Contexte lisible
      const ctxPretty = ctx ? readableContext(ctx) : "";

      const aspectPretty = ctxPretty ? `${base} ${liaison}${ctxPretty}` : base;

      const article = /^(peur|honte|culpabilité|anxiété|angoisse|tristesse|colère)\b/i.test(base)
        ? "cette" : "ce";

      const txt =
`Étape 5 — Setup : « Même si j’ai ${article} ${aspectPretty}, je m’accepte profondément et complètement. »
Répétez cette phrase 3 fois en tapotant sur le Point Karaté (tranche de la main).
Quand c’est fait, envoyez un OK et nous passerons à la ronde.`;
      return NextResponse.json({ answer: txt });
    }

    // Étape 6 — ronde déterministe (personnalisée)
    if (etape === 6) {
      const p = buildRappelPhrases(slots);
      const txt =
`Étape 6 —

- ST : ${p[0]}
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

    // Étape 8 — clôture stable
    if (etape === 8) {
      const txt =
"Étape 8 — Bravo pour le travail fourni. Félicitations pour cette belle avancée. Prends un moment pour t'hydrater et te reposer. Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical.";
      return NextResponse.json({ answer: txt });
    }

    /* ---------- Autres étapes : modèle (SYSTEM) ---------- */
    const USER_BLOCK =
`[CONTEXTE]
Étape demandée: ${etape}
Slots:
- intake="${slots.intake ?? ""}"
- duration="${slots.duration ?? ""}"
- context="${slots.context ?? ""}"
- sud=${Number.isFinite(slots.sud) ? slots.sud : "NA"}
- round=${Number.isFinite(slots.round) ? slots.round : "NA"}
- aspect="${slots.aspect ?? ""}"

[DERNIER MESSAGE UTILISATEUR]
${prompt}

[HISTORIQUE (court)]
${transcript}

[INSTRUCTION]
Produis UNIQUEMENT le texte de l'étape ${etape}, concis, au bon format.`;

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
        input: `${SYSTEM}\n\n${USER_BLOCK}`,
        temperature: 0.2,
        max_output_tokens: 260,
      }),
      signal: controller.signal,
    }).catch(() => {
      throw new Error("Upstream error");
    });
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

    // 🔒 Garde SORTANT
    const FORBIDDEN_OUTPUT: RegExp[] = [
      ...CRISIS_PATTERNS,
      /\bsuicid\w*/i,
      /\b(euthanasie|me\s+tuer|me\s+supprimer)\b/i,
    ];
    const unsafeOut = answer && FORBIDDEN_OUTPUT.some((rx) => rx.test(answer));
    if (unsafeOut) {
      return NextResponse.json({ answer: crisisMessage() });
    }

    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ error: "Unexpected server error" }, { status: 500 });
  }
}
