// Fonctions utilitaires pour l'EFT

export type Row = { who: "bot" | "user"; text: string };

export function shortContext(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.split(" ").slice(0, 14).join(" ");
}

export function parseSUD(s: string): number | null {
  const m = s.match(/(^|[^0-9])(10|[0-9])([^0-9]|$)/);
  if (!m) return null;
  const v = Number(m[2]);
  return Number.isFinite(v) && v >= 0 && v <= 10 ? v : null;
}

export function normalizeIntake(input: string): string {
  const s = input.trim().replace(/\s+/g, " ");
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

export function isMasculine(intake: string): boolean {
  return /^mal\b/i.test(intake);
}

export function normalizeContextForAspect(ctx: string): string {
  return ctx
    .trim()
    .replace(/^[,;\s]+/, "")
    .replace(/\s+,/g, ", ")
    .replace(/,\s+/g, ", ")
    .replace(/\s{2,}/g, " ");
}

export function buildAspect(intakeTextRaw: string, ctxShort: string): string {
  const intake = normalizeIntake(intakeTextRaw);
  const masculine = isMasculine(intake);
  const liaison = masculine ? "lié à" : "liée à";
  const cleaned = normalizeContextForAspect(ctxShort);
  return ctxShort ? `${intake} ${liaison} ${cleaned}` : intake;
}

/** Rendu lisible : paragraphes, puces et listes numérotées */
export function renderPretty(s: string) {
  const cleanText = s.replace(/^Étape\s*\d+\s*[—-]\s*/i, "");
  const paragraphs = cleanText.split(/\n\s*\n/);

  const bulletRx = /^\s*(?:-|\*|•)\s+/;
  const orderedRx = /^\s*\d+[\.\)]\s+/;

  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => {
        const lines = p.split(/\n/).map(t => t.trim()).filter(Boolean);

        if (lines.length >= 2 && lines.every(l => bulletRx.test(l))) {
          const items = lines.map(l => l.replace(bulletRx, ""));
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {items.map((li, j) => <li key={j} className="whitespace-pre-wrap">{li}</li>)}
            </ul>
          );
        }

        if (lines.length >= 2 && lines.every(l => orderedRx.test(l))) {
          const items = lines.map(l => l.replace(orderedRx, ""));
          return (
            <ol key={i} className="list-decimal pl-5 space-y-1">
              {items.map((li, j) => <li key={j} className="whitespace-pre-wrap">{li}</li>)}
            </ol>
          );
        }

        return <p key={i} className="whitespace-pre-line leading-relaxed">{p}</p>;
      })}
    </div>
  );
}

/* ---------- Safety (client) ---------- */
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

export function isCrisis(text: string): boolean {
  const t = text.toLowerCase();
  return CRISIS_PATTERNS.some(rx => rx.test(t));
}

export function crisisMessage(): string {
  return (
`Message important
Il semble que vous traversiez un moment très difficile.
Je ne suis pas un service d'urgence, mais votre sécurité est prioritaire.

En France : appelez immédiatement le 15 (SAMU) ou le 3114 (prévention du suicide, 24/7).
En danger immédiat : appelez le 112.

Vous n'êtes pas seul·e — ces services peuvent vous aider dès maintenant.`
  );
}
