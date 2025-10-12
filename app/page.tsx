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

/* ---------- Helpers ---------- */
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
function normalizeIntake(input: string): string {
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
function isMasculine(intake: string): boolean {
  return /^mal\b/i.test(intake);
}
function normalizeContextForAspect(ctx: string): string {
  // Conserver le début "je / j’ai / je suis ..." pour que le serveur détecte le cas "parce que ..."
  return ctx
    .trim()
    .replace(/^[,;\s]+/, "")   // virgules/espaces au début
    .replace(/\s+,/g, ", ")    // espace avant virgule -> après virgule
    .replace(/,\s+/g, ", ")    // normalise " , " en ", "
    .replace(/\s{2,}/g, " ");  // espaces multiples
}

function buildAspect(intakeTextRaw: string, ctxShort: string): string {
  const intake = normalizeIntake(intakeTextRaw);
  if (!ctxShort) return intake;
  const masculine = isMasculine(intake);
  const liaison = masculine ? "lié à" : "liée à";
  const cleaned = normalizeContextForAspect(ctxShort);
  return `${intake} ${liaison} ${cleaned}`;
}
function renderPretty(s: string) {
  // Supprime le préfixe "Étape X — " au début du message
  const cleanText = s.replace(/^Étape\s*\d+\s*[—-]\s*/i, "");
  const paragraphs = cleanText.split(/\n\s*\n/);
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
  return CRISIS_PATTERNS.some(rx => rx.test(t));
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

/* ---------- Component ---------- */
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
  const chatRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [rows]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const userText = text.trim();
    if (!userText) return;

    // 🔒 crise → coupe et clôture
    if (isCrisis(userText)) {
      const now = new Date().toISOString();
      console.warn(`⚠️ [${now}] Détection de mot-clé sensible : protocole de sécurité appliqué.`);
      setRows(r => [
        ...r,
        { who: "user", text: userText },
        { who: "bot", text: crisisMessage() }
      ]);
      setText("");
      setStage("Clôture");
      setEtape(8);
      return;
    }

    // Nouveau sujet après clôture → reset
    if (stage === "Clôture") {
      setStage("Intake");
      setEtape(1);
      setSlots({ round: 1 });
    }

    setRows(r => [...r, { who: "user", text: userText }]);
    setText("");

    // MàJ slots
    const updated: Slots = { ...(stage === "Clôture" ? { round: 1 } : slots) };

    if (stage === "Intake" || (stage === "Clôture" && userText)) {
      updated.intake = normalizeIntake(userText);
   } else if (stage === "Durée") {
  const prevIntake = (slots.intake ?? "").trim().toLowerCase();

  // Heuristique : l’intake initial ressemble-t-il à une SITUATION (et pas douleur/émotion) ?
  const looksLikeSituation =
    !/^(mal|douleur|tension|gêne|gene|peur|col[èe]re|tristesse|honte|culpabilit[eé]|stress|anxi[ée]t[ée]|angoisse|inqui[èe]tude|boule|serrement|pression|chaleur|vide)\b/i
      .test(prevIntake);

  // La nouvelle réponse ressemble-t-elle à un RESSENTI (émotion/sensation) ?
  const looksLikeFeeling =
    /^(je\s+suis|je\s+me\s+sens|je\s+ressens)\b/i.test(userText) ||                      // "je suis…"
    /^j['’]\s*ai\s+de\s+la\s+\w+/i.test(userText) ||                                    // "j’ai de la tristesse…"
    /^de\s+la\s+(peur|col[èe]re|tristesse|honte|culpabilit[eé]|anxi[ée]t[ée]|angoisse|inqui[èe]tude|tristesse|joie)\b/i
      .test(userText) ||                                                                // "de la colère…"
    /\b(peur|col[èe]re|tristesse|honte|culpabilit[eé]|stress|anxi[ée]t[ée]|angoisse|inqui[èe]tude)\b/i
      .test(userText);                                                                  // contient une émotion claire

  if (looksLikeSituation && looksLikeFeeling) {
    // On promeut le ressenti en VRAI sujet EFT
    updated.intake = normalizeIntake(userText);
  } else {
    updated.duration = userText;
  }
}

 else if (stage === "Contexte") {
      updated.context = userText;
    } else if (stage === "Évaluation") {
      const sud0 = parseSUD(userText);
      if (sud0 !== null) updated.sud = sud0;
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

    // Étape suivante (nouvelle logique : on RENVOIE bien l'Étape 1 d'abord)
    let stageForAPI: Stage = stage;
    let etapeForAPI = etape;

    if (stage === "Intake") {
      // ➜ on pose d'abord les questions d'Étape 1 (localisation/qualité OU "où dans le corps" OU "que ressens-tu...")
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
              "Étape 8 — Bravo pour le travail fourni. Félicitations pour cette belle avancée. " +
              "Maintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment ! " +
              "Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical."
          }]);
          setStage("Clôture");
          setEtape(8);
          return;
        } else {
          const nextRound = (updated.round ?? 1) + 1;
          updated.round = nextRound;
          setSlots(s => ({ ...s, round: nextRound }));
          stageForAPI = "Tapping";    etapeForAPI = 6;
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
            "Étape 8 — Bravo pour le travail fourni. Félicitations pour cette belle avancée. " +
            "Maintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment ! " +
            "Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical."
        }]);
        setStage("Clôture");
        setEtape(8);
        return;
      } else if (updated.sud > 0) {
        const nextRound = (updated.round ?? 1) + 1;
        updated.round = nextRound;
        setSlots(s => ({ ...s, round: nextRound }));
        stageForAPI = "Tapping";      etapeForAPI = 6;
      }
    }

    // Appel API
    const transcriptShort = rows
      .map(r => (r.who === "user" ? `U: ${r.text}` : `A: ${r.text}`))
      .slice(-10)
      .join("\n");

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

    const raw = await res.json().catch(() => ({}));
    let answer = "";
    if (raw && typeof raw === "object" && "answer" in raw) {
      const maybe = (raw as Record<string, unknown>).answer;
      if (typeof maybe === "string") answer = maybe;
    }

    // 🔒 Garde sortie côté client
    if (isCrisis(answer)) {
      const now = new Date().toISOString();
      console.warn(`⚠️ [${now}] Mot sensible détecté dans la réponse (client). Clôture sécurisée.`);
      setRows(r => [...r, { who: "bot", text: crisisMessage() }]);
      setStage("Clôture");
      setEtape(8);
      setText("");
      return;
    }

    setRows(r => [...r, { who: "bot", text: answer }]);

    // 🔁 Avancer localement la machine d'état :
    // après avoir posé l'Étape 1, on passe à "Durée"
    if (stageForAPI === "Intake" && etapeForAPI === 1) {
      setStage("Durée");
      setEtape(2);
    } else {
      setStage(stageForAPI);
      setEtape(etapeForAPI);
    }
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
      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
          placeholder="Sur quoi souhaitez-vous essayer l&apos;EFT…"
          aria-label="Saisissez votre message pour l’assistante EFT"
        />
        <button type="submit" className="rounded-xl border px-4 py-2 shadow-sm active:scale-[0.99]">Envoyer</button>
      </form>

      {/* CTA + Note */}
      <div className="text-center mt-6">
        <a href="https://ecole-eft-france.fr/pages/formations-eft.html" target="_blank" rel="noopener noreferrer" className="inline-block rounded-xl border border-[#0f3d69] text-[#0f3d69] px-4 py-2 text-sm font-medium hover:bg-[#0f3d69] hover:text-[#F3EEE6] transition-colors duration-200">
          Découvrir nos formations
        </a>
        <p className="text-sm text-gray-600 mt-2">Pour aller plus loin dans la pratique et la transmission de l’EFT, découvrez les formations proposées par l’École EFT France.</p>
      </div>

      <div className="rounded-xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
        <strong className="block mb-1">⚖️ Note de prudence</strong>
        <p className="text-sm leading-relaxed">
          Ce guide est proposé à titre informatif et éducatif. Il ne remplace en aucun cas un avis médical,
          psychologique ou professionnel. L&apos;École EFT France et ses représentants déclinent toute
          responsabilité quant à l&apos;interprétation, l&apos;usage ou les conséquences liés à l&apos;application
          des informations ou protocoles présentés. Chaque utilisateur reste responsable de sa pratique et de ses choix.
          <br />
          L&apos;École EFT France ou Geneviève Gagos ne voit pas et n&apos;enregistre pas vos échanges réalisés dans ce chat.
          Comme pour tout ce qui transite par Internet, restez prudents et évitez de divulguer des éléments très personnels.
        </p>
        <p className="text-xs mt-3 opacity-80">— Édition spéciale 30 ans d&apos;EFT — © 2025 École EFT France — Direction Geneviève Gagos</p>
      </div>
    </main>
  );
}
