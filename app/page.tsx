/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useRef, useState, useEffect, FormEvent } from "react";

/* ---------- Types UI ---------- */
type Row = { who: "bot" | "user"; text: string };
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

/* ---------- Helpers (client) ---------- */
function clean(s: string): string {
  return s.replace(/\s+/g, " ").replace(/\s+([,;:.!?])/g, "$1").trim();
}

function shortContext(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.split(" ").slice(0, 14).join(" ");
}

function parseSUD(s: string): number | null {
  const m = s.match(/(^|[^0-9])(10|[0-9])([^0-9]|$)/);
  if (!m) return null;
  const v = Number(m[2]);
  return Number.isFinite(v) && v >= 0 && v <= 10 ? v : null;
}

/** Normalise une entrée du type « j’ai mal au/à la… » → « mal … », « j’ai une douleur … » → « douleur … » */
function normalizeIntake(input: string): string {
  const s = input.trim().replace(/\s+/g, " ");

  // "j’ai mal à/au/aux/à la/à l’..."
  const mMal = s.match(/^j['’]ai\s+mal\s+(?:à|a)\s+(?:(?:la|le|les)\s+|l['’]\s*|au\s+|aux\s+)?(.+)$/i);
  if (mMal) return `mal ${mMal[1].trim()}`;

  // "j’ai une/la douleur ..."
  const mDouleur = s.match(/^j['’]ai\s+(?:une|la)\s+douleur\s+(.*)$/i);
  if (mDouleur) return `douleur ${mDouleur[1].trim()}`;

  // "j’ai peur ..." / "j’ai une peur ..."
  const mPeur1 = s.match(/^j['’]ai\s+(?:une|la)\s+peur\s+(.*)$/i);
  if (mPeur1) return `peur ${mPeur1[1].trim()}`;
  const mPeur2 = s.match(/^j['’]ai\s+peur\s+(.*)$/i);
  if (mPeur2) return `peur ${mPeur2[1].trim()}`;

  // "j’ai une/la tension|gêne ..."
  const mAutres = s.match(/^j['’]ai\s+(?:une|la)\s+(tension|gêne|gene)\s+(.*)$/i);
  if (mAutres) return `${mAutres[1]} ${mAutres[2].trim()}`;

  return s;
}

/** Masculin/féminin minimal pour la petite liaison quand on construit l’aspect */
function isMasculine(intake: string): boolean {
  const t = intake.toLowerCase().trim();
  if (t.startsWith("mal ")) return true;
  if (/^(douleur|peur|gêne|gene|tension)\b/i.test(t)) return false;
  return true;
}

/** Nettoyage léger du contexte pour l’aspect (supprime les « je/j’ai » en tête) */
function normalizeContextForAspect(ctx: string): string {
  let c = ctx.trim();
  c = c.replace(/^je\s+/i, "");
  c = c.replace(/^j['’]ai\s+/i, "");
  c = c.replace(/^j['’](?:étais|etais)\s+/i, "être ");
  c = c.replace(/^suis\b/i, "être ");
  c = c.replace(/^ai\b/i, "avoir ");
  c = c.replace(/^étais\b/i, "être ");
  c = c.replace(/,\s+/g, " ");
  return c;
}

/** Construit l’aspect court « intake + (lié(e) à + contexte court) » pour le serveur */
function buildAspect(intakeTextRaw: string, ctxShort: string): string {
  const intake = normalizeIntake(intakeTextRaw);
  if (!ctxShort) return intake;
  const masculine = isMasculine(intake);
  const liaison = masculine ? "lié à" : "liée à";
  const cleaned = normalizeContextForAspect(ctxShort);
  return `${intake} ${liaison} ${cleaned}`;
}

/** Rendu de texte avec listes et paragraphes simples */
function renderPretty(s: string) {
  const paragraphs = s.split(/\n\s*\n/);
  return (
    <div className="space-y-3">
      {paragraphs.map((p, i) => {
        if (/^(?:- |\u2022 |\* )/m.test(p)) {
          const items = p.split(/\n/).filter(Boolean).map(t => t.replace(/^(- |\u2022 |\* )/, ""));
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {items.map((li, j) => <li key={j} className="whitespace-pre-wrap">{li}</li>)}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-line leading-relaxed">{p}</p>;
      })}
    </div>
  );
}

/** Supprime "Étape X —" et "Setup :" de l'affichage, et habille le Setup */
function cleanAnswerForDisplay(ans: string, stage: Stage): string {
  let t = (ans || "").trim();

  // Retirer tous les "Étape N —" en début de ligne (partout)
  t = t.replace(/^\s*Étape\s*\d+\s*—\s*/gmi, "");

  // Enlever "Setup :" en début de ligne si présent
  t = t.replace(/^\s*Setup\s*:?\s*/gmi, "");

  // Habillage du Setup
  if (stage === "Setup") {
    const core = t.replace(/^«\s*|\s*»$/g, "").trim();
    t =
      "Reste bien connecté·e à ton ressenti et dis à voix haute :\n" +
      `« ${core} »\n` +
      "En tapotant le Point Karaté (tranche de la main), répète cette phrase 3 fois.";
  }

  return t;
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

function isCrisis(text: string): boolean {
  const t = text.toLowerCase();
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

export default function Page() {
  // Session
  const [stage, setStage] = useState<Stage>("Intake");
  const [etape, setEtape] = useState<number>(1);
  const [slots, setSlots] = useState<Slots>({ round: 1 });

  // UI
  const [rows, setRows] = useState<Row[]>([
    { who: "bot", text: "Bonjour et bienvenue. En quoi puis-je vous aider ?" },
  ]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [rows]);

  // --- Crisis gate (client) ---
  const [askedSuicideCheck, setAskedSuicideCheck] = useState<boolean>(false);
  const [answeredNoAt, setAnsweredNoAt] = useState<number | null>(null);
  const [closureKind, setClosureKind] = useState<'none'|'normal'|'crisis'>('none');
  const CRISIS_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2h

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

  function interpretYesNoClient(text: string): 'yes' | 'no' | 'unknown' {
    if (YES_PATTERNS.some(rx => rx.test(text))) return 'yes';
    if (NO_PATTERNS.some(rx => rx.test(text))) return 'no';
    return 'unknown';
  }

  function gentleCrisisFollowupMessage(): string {
    return (
`Merci pour votre message. 💛

Dans la situation que vous traversez, il n’est pas prudent de tenter l’EFT seul·e.
Votre sécurité et votre soutien sont prioritaires : rapprochez-vous d’un·e professionnel·le habilité·e
ou d’un service d’aide immédiatement.

En France :
• 15 (SAMU) — urgence vitale
• 3114 — ligne nationale de prévention du suicide, 24/7
• 112 — urgence (UE)

Je vous souhaite d’être accompagné·e au plus vite.`
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    const userText = text.trim();
    if (!userText) {
      setLoading(false);
      return;
    }

    const nowMs = Date.now();

    // Après clôture
    if (stage === "Clôture") {
      if (closureKind === 'crisis') {
        setRows(r => [
          ...r,
          { who: "user", text: userText },
          { who: "bot", text: gentleCrisisFollowupMessage() }
        ]);
        setText("");
        setLoading(false);
        return;
      } else {
        // Clôture normale : nouveau sujet possible → reset EFT
        setStage("Intake");
        setEtape(1);
        setSlots({ round: 1 });
        setClosureKind('none');
      }
    }

    // --- Porte de sécurité côté client ---
    if (askedSuicideCheck) {
      const yn = interpretYesNoClient(userText);
      setRows(r => [...r, { who: "user", text: userText }]);
      setText("");

      if (yn === 'yes') {
        // Alerte + clôture immédiate (type "crisis")
        setRows(r => [...r, { who: "bot", text: crisisMessage() }]);
        setStage("Clôture");
        setEtape(8);
        setClosureKind('crisis');
        setAskedSuicideCheck(false);
        setLoading(false);
        return;
      }
      if (yn === 'no') {
        // Mémoriser NON (cooldown) et revenir à l'Intake sans reposer la question
        setAnsweredNoAt(nowMs);
        setAskedSuicideCheck(false);
        setStage("Intake");
        setEtape(1);
        setRows(r => [...r, { who: "bot", text:
          "Merci pour votre réponse. Reprenons.\n\n" +
          "Étape 1 — Sur quoi souhaitez-vous travailler ?\n" +
          "• Si c’est une douleur : précisez la localisation (droite/gauche, zone exacte) et le type (lancinante, aiguë…).\n" +
          "• Si c’est une émotion : où la sentez-vous dans le corps (poitrine, gorge, ventre…) et comment (serrement, pression…)?"
        }]);
        setLoading(false);
        return; // on ne contacte pas l'API sur ce tour
      }

      // Réponse floue → clarifier
      setRows(r => [...r, { who: "bot", text: "Je n’ai pas bien compris. Avez-vous des idées suicidaires en ce moment ? (oui / non)" }]);
      setLoading(false);
      return;
    }

    // Déclenchement initial : poser la question (si pas de cooldown)
    const underCooldown = answeredNoAt !== null && (nowMs - answeredNoAt) < CRISIS_COOLDOWN_MS;
    if (isCrisis(userText) && !underCooldown) {
      setRows(r => [
        ...r,
        { who: "user", text: userText },
        { who: "bot", text: "Avez-vous des idées suicidaires ? (oui / non)" }
      ]);
      setText("");
      setAskedSuicideCheck(true);
      setLoading(false);
      return;
    }

    setRows(r => [...r, { who: "user", text: userText }]);
    setText("");

    // MÀJ slots
    const updated: Slots = { ...(stage === "Clôture" ? { round: 1 } : slots) };

    if (stage === "Intake" || (stage === "Clôture" && userText)) {
      updated.intake = normalizeIntake(userText);
    } else if (stage === "Durée") {
      const prevIntake = (slots.intake ?? "").trim().toLowerCase();
      const looksLikeSituation =
        !/^(mal|douleur|tension|gêne|gene|peur|col[èe]re|tristesse|honte|culpabilit[eé]|stress|anxi[ée]t[ée]|angoisse|inqui[èe]tude|boule|serrement|pression|chaleur|vide)\b/i
          .test(prevIntake);

      const looksLikeFeeling =
        /^(je\s+suis|je\s+me\s+sens|je\s+ressens)\b/i.test(userText) ||
        /^j['’]\s*ai\s+de\s+la\s+\w+/i.test(userText) ||
        /^de\s+la\s+(peur|col[èe]re|tristesse|honte|culpabilit[eé]|anxi[ée]t[ée]|angoisse|inqui[èe]tude)\b/i
          .test(userText) ||
        /\b(peur|col[èe]re|tristesse|honte|culpabilit[eé]|stress|anxi[ée]t[ée]|angoisse|inqui[èe]tude)\b/i
          .test(userText);

      if (looksLikeSituation && looksLikeFeeling) {
        updated.intake = normalizeIntake(userText);
      } else {
        updated.duration = userText;
      }
    } else if (stage === "Contexte") {
      updated.context = userText;
    } else if (stage === "Évaluation") {
      const sud0 = parseSUD(userText);
      if (sud0 !== null) updated.sud = sud0;
      else {
        setError("👉 Merci d’indiquer un score SUD valide entre 0 et 10.");
        setLoading(false);
        return;
      }
    } else if (stage === "Réévaluation") {
      const sud2 = parseSUD(userText);
      if (sud2 !== null) updated.sud = sud2;
    }

    if (stage === "Tapping") {
      const sudInline = parseSUD(userText);
      if (sudInline !== null) updated.sud = sudInline;
    }

    const intakeText = (updated.intake ?? slots.intake ?? "").trim();
    const ctxRaw = (updated.context ?? slots.context ?? "").trim();
    const ctxShort = ctxRaw ? shortContext(ctxRaw) : "";
    const aspect = buildAspect(intakeText, ctxShort);
    updated.aspect = aspect;
    setSlots(updated);

    // Étape suivante
    let stageForAPI: Stage = stage;
    let etapeForAPI = etape;

    if (stage === "Intake") {
      stageForAPI = "Intake";
      etapeForAPI = 1;
    }
    else if (stage === "Durée")       { stageForAPI = "Contexte";     etapeForAPI = 3; }
    else if (stage === "Contexte")    { stageForAPI = "Évaluation";   etapeForAPI = 4; }
    else if (stage === "Évaluation" && typeof updated.sud === "number") {
      stageForAPI = "Setup";          etapeForAPI = 5;
    }
    else if (stage === "Setup") {
      stageForAPI = "Tapping";        etapeForAPI = 6;
    }
    else if (stage === "Tapping") {
      if (typeof updated.sud === "number") {
        if (updated.sud === 0) {
          setRows(r => [...r, {
            who: "bot",
            text:
              "Bravo pour le travail fourni. Félicitations pour cette belle avancée.\n" +
              "Maintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment !\n\n" +
              "Si tu souhaites travailler sur un nouveau sujet, rafraîchis d'abord la page.\n\n" +
              "Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical."
          }]);
          setClosureKind('normal');
          setStage("Clôture");
          setEtape(8);
          setLoading(false);
          return;
        } else {
          const nextRound = (updated.round ?? 1) + 1;
          updated.round = nextRound;
          setSlots(s => ({ ...s, round: nextRound }));
          stageForAPI = "Setup";      etapeForAPI = 5;   // repasser par Setup ajusté
        }
      } else {
        stageForAPI = "Réévaluation"; etapeForAPI = 7;
      }
    }
    else if (stage === "Réévaluation" && typeof updated.sud === "number") {
      if (updated.sud === 0) {
        setRows(r => [...r, {
          who: "bot",
          text:
            "Bravo pour le travail fourni. Félicitations pour cette belle avancée.\n" +
            "Maintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment !\n\n" +
            "Si tu souhaites travailler sur un nouveau sujet, rafraîchis d'abord la page.\n\n" +
            "Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical."
        }]);
        setClosureKind('normal');
        setStage("Clôture");
        setEtape(8);
        setLoading(false);
        return;
      } else if (updated.sud > 0) {
        const nextRound = (updated.round ?? 1) + 1;
        updated.round = nextRound;
        setSlots(s => ({ ...s, round: nextRound }));
        stageForAPI = "Setup";        etapeForAPI = 5; // repasser par Setup ajusté
      }
    }

    const transcriptShort = rows
      .map(r => (r.who === "user" ? `U: ${r.text}` : `A: ${r.text}`))
      .slice(-10)
      .join("\n");

    let raw: unknown;
    try {
      const res = await fetch("/api/guide-eft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: userText,
          stage: stageForAPI,
          etape: etapeForAPI,
          transcript: transcriptShort,
          slots: updated,
        }),
      });
      raw = await res.json();
    } catch {
      setRows(r => [...r, { who: "bot", text: "Erreur de connexion au service. Veuillez réessayer." }]);
      setLoading(false);
      return;
    }

    let answer = "";
    if (
      raw && typeof raw === "object" && raw !== null &&
      "answer" in raw && typeof (raw as { answer: unknown }).answer === "string"
    ) {
      answer = (raw as { answer: string }).answer;
    }

    if (isCrisis(answer)) {
      const now = new Date().toISOString();
      console.warn(`⚠️ [${now}] Mot sensible détecté dans la réponse (client). Clôture sécurisée.`);
      setRows(r => [...r, { who: "bot", text: crisisMessage() }]);
      setStage("Clôture");
      setEtape(8);
      setClosureKind('crisis');
      setText("");
      setLoading(false);
      return;
    }

    const cleaned = cleanAnswerForDisplay(answer, stageForAPI);
    setRows(r => [...r, { who: "bot", text: cleaned }]);

    // Avancer localement
    if (stageForAPI === "Intake" && etapeForAPI === 1) {
      setStage("Durée");
      setEtape(2);
    } else {
      setStage(stageForAPI);
      setEtape(etapeForAPI);
    }
    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      {/* Bandeau */}
      <div className="rounded-2xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs tracking-wide uppercase opacity-80">Édition spéciale</p>
            <h1 className="text-xl sm:text-2xl font-semibold">30 ans d&apos;EFT — 1995 → 2025</h1>
            <p className="text-sm mt-1 opacity-90">
              Une pratique de libération émotionnelle transmise avec rigueur et bienveillance.
            </p>
          </div>
          <img
            src="https://ecole-eft-france.fr/assets/front/logo-a8701fa15e57e02bbd8f53cf7a5de54b.png"
            alt="Logo École EFT France"
            className="h-10 w-auto"
          />
        </div>
      </div>

      {/* Chat */}
      <div ref={chatRef} className="h-96 overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm">
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className={r.who === "bot" ? "flex" : "flex justify-end"}>
              <div className={(r.who === "bot" ? "bg-gray-50 text-gray-900 border-gray-200" : "bg-blue-50 text-blue-900 border-blue-200") + " max-w-[80%] rounded-2xl border px-4 py-3 shadow-sm"}>
                {renderPretty(r.text)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Formulaire */}
      <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-xl border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm active:scale-[0.99]"
            placeholder="Sur quoi souhaitez-vous essayer l’EFT…"
            aria-label="Saisissez votre message pour l’assistante EFT"
            disabled={loading}
          />
          {(stage === "Évaluation" || stage === "Réévaluation") && (
            <p className="text-sm text-gray-500 mt-1">
              👉 Indiquez un nombre entre <strong>0</strong> et <strong>10</strong> pour évaluer l’intensité de votre ressenti.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="rounded-xl border px-4 py-2 shadow-sm active:scale-[1.00]"
        >
          {loading ? "Envoi..." : "Envoyer"}
        </button>
      </form>

      {error && <div className="text-red-600 mt-2">{error}</div>}

      {/* CTA + Note */}
      <div className="mt-6">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <div className="flex-1 flex flex-col items-center">
            <a
              href="https://ecole-eft-france.fr/pages/formations-eft.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-xl border border-[#0f3d69] bg-[#0f3d69] text-white px-4 py-2 font-semibold hover:bg-white hover:text-[#0f3d69] focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
            >
              Découvrir nos formations
            </a>
            <p className="text-sm text-gray-600 mt-2 text-center">
              Pour aller plus loin dans la pratique et la transmission de l’EFT,<br />
              découvrez les formations proposées par <strong>l’École EFT France</strong>.
            </p>
          </div>

          <div className="hidden sm:flex h-16 border-l mx-4 border-gray-300" aria-hidden="true"></div>

          <div className="flex-1 flex flex-col items-center">
            <span className="block text-gray-700 text-center mb-2">
              Pour en apprendre plus sur l’EFT,<br />
              retrouvez-moi sur le site <strong>Technique-EFT.com</strong>
            </span>
            <a
              href="https://technique-eft.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-xl border border-[#0f3d69] text-[#0f3d69] px-4 py-2 font-semibold hover:bg-[#0f3d69] hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
            >
              En savoir plus sur l’EFT
            </a>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <strong className="block mb-1">Note de prudence</strong>
        <p className="text-sm leading-relaxed">
          Ce guide est proposé à titre informatif et éducatif. Il ne remplace en aucun cas un avis médical,
          psychologique ou professionnel.<br />
          L&apos;École EFT France et ses représentants déclinent toute responsabilité quant à l&apos;interprétation, l&apos;usage ou les conséquences liés à l&apos;application
          des informations ou protocoles présentés.<br />
          Chaque utilisateur reste responsable de sa pratique et de ses choix.
          <br /><br />
          <strong>Important :</strong> L&apos;École EFT France ou Geneviève Gagos ne voit pas et n&apos;enregistre pas vos échanges réalisés dans ce chat.
          Mais comme pour tout ce qui transite par Internet, nous vous invitons à rester prudents et à ne pas divulguer des éléments très personnels.
        </p>
        <p className="text-xs mt-3 opacity-80">— Édition spéciale 30 ans d&apos;EFT — © 2025 École EFT France — Direction Geneviève Gagos</p>
      </div>
    </main>
  );
}
