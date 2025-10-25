/* eslint-disable @next/next/no-img-element */
"use client";
import React, { useRef, useState, useEffect, FormEvent } from "react";

/* ---------- DEMO (facultatif) ---------- */
const SHOW_DEMO = false;

const DEMO_PRESETS: Array<{ label: string; steps: string[] }> = [
  {
    label: "Douleur au dos → lombaires",
    steps: ["douleur au dos", "douleur sourde aux lombaires", "fatiguée en fin de journée", "5", "OK", "3", "OK", "0"],
  },
  {
    label: "Peur des hauteurs",
    steps: ["peur des hauteurs", "serrement dans la poitrine", "quand je regarde par-dessus une rambarde", "7", "OK", "4", "OK", "1", "OK", "0"],
  },
];

function useDemoHelpers(setText: React.Dispatch<React.SetStateAction<string>>) {
  return { fill: (value: string) => setText(value) };
}

/* ---------- Types ---------- */
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
  prevSud?: number; // SUD précédent pour tester delta < 2
  round?: number;
  aspect?: string;
};

/* Réponse typée de l’API (sans FAQ) */
type ApiResponse =
  | { answer: string; kind?: "gate" | "crisis" | "resume" }
  | { error: string };

/* ---------- Helpers (texte) ---------- */
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

/** Normalise « j’ai mal… / j’ai une douleur… / j’ai peur… » → forme courte */
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
  const t = intake.toLowerCase().trim();
  if (t.startsWith("mal ")) return true;
  if (/^(douleur|peur|gêne|gene|tension)\b/i.test(t)) return false;
  return true;
}

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

function buildAspect(intakeTextRaw: string, ctxShort: string): string {
  const intake = normalizeIntake(intakeTextRaw);
  if (!ctxShort) return intake;
  const masculine = isMasculine(intake);
  const liaison = masculine ? "lié à" : "liée à";
  const cleaned = normalizeContextForAspect(ctxShort);
  return `${intake} ${liaison} ${cleaned}`;
}

/* Détection flux physique pour activer la règle "delta >= 2" */
function isPhysicalIntake(intakeText?: string): boolean {
  const t = (intakeText || "").toLowerCase();
  return /\b(mal|douleur|tension|gêne|gene|crispation|serrement|br[ûu]lure|brulure|tiraillement|spasme|inflammation)\b/.test(t);
}

/* Nominalisation générique et sûre (contexte émotionnel) */
function nominalizeSituation(s: string): string {
  const t = (s || "").trim();
  if (!t) return t;

  // Si déjà nominalisé, on ne touche pas
  if (/^(?:ce|cet|cette|ces)\s+/i.test(t)) return t;

  // Événements déjà nominaux → on laisse
  if (/\b(rupture|séparation|separation|déménagement|deménagement|accident|licenciement|examen|concours|audition|entretien|procès|proces)\b/i.test(t)) {
    return t;
  }

  // Ignore les physiques
  if (/\b(mal|douleur|tension|gêne|gene|crispation|serrement|br[ûu]lure|brulure|tiraillement|spasme|inflammation)\b/i.test(t)) {
    return t;
  }

  function detFor(noun: string): "ce" | "cette" {
    const n = noun.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    const fem = new Set(["dispute","culpabilite","honte","colere","anxiete","angoisse","tristesse","inquietude","peur","gêne","gene","tension"]);
    return fem.has(n) ? "cette" : "ce";
  }

  const rules: Array<{ rx: RegExp; to: (m: RegExpExecArray) => string }> = [
    { rx: /^je\s+me\s+(?:suis\s+)?disput(?:e|é|ée)\s+avec\s+(.+)$/i,
      to: m => `cette dispute avec ${m[1].trim()}` },
    { rx: /^je\s+suis\s+en\s+col[eè]re\s+(?:contre|envers|a(?:\s+propos\s+de)?)\s+(.+)$/i,
      to: m => `cette colère contre ${m[1].trim()}` },
    { rx: /^j['’]?\s*ai\s+honte\s+(?:de|d['’])\s+(.+)$/i,
      to: m => `cette honte à propos de ${m[1].trim()}` },
    { rx: /^je\s+me\s+sens\s+coupabl(?:e|es?)\s+(?:de|d['’])\s+(.+)$/i,
      to: m => `cette culpabilité à propos de ${m[1].trim()}` },
    { rx: /^je\s+suis\s+anxieu(?:x|se)\s+(?:a\s+propos\s+de|pour|par)\s+(.+)$/i,
      to: m => `cette anxiété à propos de ${m[1].trim()}` },
    { rx: /^je\s+stresse\s+(?:a\s+propos\s+de|pour|par)\s+(.+)$/i,
      to: m => `ce stress à propos de ${m[1].trim()}` },
    { rx: /^je\s+suis\s+inqui[eè]t(?:e)?\s+(?:pour|a\s+propos\s+de)\s+(.+)$/i,
      to: m => `cette inquiétude pour ${m[1].trim()}` },
    { rx: /^j['’]?\s*ai\s+peur\s+(?:de|du|des|d['’])\s+(.+)$/i,
      to: m => `cette peur de ${m[1].trim()}` },
    { rx: /^je\s+crains?\s+(.+)$/i,
      to: m => `cette crainte de ${m[1].trim()}` },
    { rx: /^je\s+me\s+sens\s+triste\s+(?:a\s+propos\s+de|pour|par)\s+(.+)$/i,
      to: m => `cette tristesse à propos de ${m[1].trim()}` },
    { rx: /^je\s+me\s+sens\s+d[ée]go[uû]t[ée]?\s+(?:par|de)\s+(.+)$/i,
      to: m => `ce dégoût pour ${m[1].trim()}` },
    { rx: /^je\s+me\s+sens\s+([a-zàâéèêëîïôùûç-]+)\s+(?:de|d['’]|a\s+propos\s+de|pour)\s+(.+)$/i,
      to: m => {
        const adj = m[1].trim().toLowerCase();
        const map: Record<string,string> = {
          "coupable":"culpabilité", "honteux":"honte", "honteuse":"honte",
          "anxieux":"anxiété", "anxieuse":"anxiété",
          "inquiet":"inquiétude", "inquiète":"inquiétude",
          "triste":"tristesse", "stressé":"stress", "stressée":"stress",
          "angoissé":"angoisse", "angoissée":"angoisse",
          "dégoûté":"dégoût", "dégoûtée":"dégoût",
          "degoute":"dégoût", "degoutee":"dégoût"
        };
        const noun = map[adj] || adj;
        const det = detFor(noun);
        const prep = /stress|dégo[uû]t|degout/.test(noun) ? "pour" : "à propos de";
        return `${det} ${noun} ${prep} ${m[2].trim()}`;
      } },
  ];

  for (const { rx, to } of rules) {
    const m = rx.exec(t);
    if (m) return to(m);
  }
  return t;
}

/* Nettoie la localisation si l’utilisateur répète la sensation */
function sanitizeLocation(sensation: string, location: string): string {
  let loc = (location || "").trim();
  if (!loc) return "";
  const sens = (sensation || "").trim();

  if (sens && loc.toLowerCase() === sens.toLowerCase()) return "";

  loc = loc
    .replace(/^(serrement|pression|tension|douleur|chaleur|vide|poids|br[ûu]lure|brulure|picotement|fourmillement)\b.*?\b(dans|au|à|a|aux|à la|à l’|à l')?\s*/i, "")
    .replace(/^(dans|au|à|a|aux|à la|à l’|à l')\s*/i, "");

  loc = loc.replace(/\s+/g, " ").trim();
  return loc;
}

/* Fusion sensation + localisation sans doublon */
function mergeSensationAndLocation(sensation: string, location: string): string {
  const sens = (sensation || "").trim();
  const loc = sanitizeLocation(sensation, location);
  if (!sens) return loc;
  if (!loc) return sens;
  if (sens.toLowerCase().includes(loc.toLowerCase())) return sens;
  return `${sens} ${loc}`;
}

/* Post-nettoyage côté client (rappels, doublons, “Cette une …”) */
function fixServerText(t: string): string {
  let s = t;
  s = s.replace(/\b(Cette|Ce)\s+une\b/g, (_m, det) => det);
  s = s.replace(/\b(serrement dans la poitrine)\b\s+\1/gi, "$1");
  s = s.replace(/\b(douleur [a-zàâéèêëîïôùûç\s]+)\b\s+\1/gi, "$1");
  s = s.replace(/connecte e/gi, "connecté·e");
  s = s.replace(/\bcoeur\b/gi, "cœur");
  return s;
}

/* ---------- Rendu / liens ---------- */
function linkify(text: string): React.ReactNode[] {
  const URL_RX =
    /(https?:\/\/[^\s<>"'()]+|(?:www\.)?[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"']*)?)/gi;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = URL_RX.exec(text)) !== null) {
    const url = match[0];
    const start = match.index;

    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    const href = url.startsWith("http") ? url : `https://${url.replace(/^www\./i, "www.")}`;

    nodes.push(
      <a
        key={`${start}-${href}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:no-underline"
      >
        {url}
      </a>
    );

    lastIndex = start + url.length;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderPretty(s: string) {
  const paragraphs: string[] = s.split(/\n\s*\n/);
  return (
    <div className="space-y-3">
      {paragraphs.map((p: string, i: number) => {
        if (/^(?:- |\u2022 |\* )/m.test(p)) {
          const items: string[] = p
            .split(/\n/)
            .filter(Boolean)
            .map((t: string) => t.replace(/^(- |\u2022 |\* )/, ""));
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {items.map((li: string, j: number) => (
                <li key={j} className="whitespace-pre-wrap">
                  {linkify(li)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line leading-relaxed">
            {linkify(p)}
          </p>
        );
      })}
    </div>
  );
}

/** Nettoyage d’affichage : retire "Étape X —" et "Setup :", habille le Setup en conservant les lignes suivantes (OK, etc.) */
function cleanAnswerForDisplay(ans: string, stage: Stage): string {
  let t = (ans || "").trim();

  // Retire étiquettes internes
  t = t.replace(/^\s*Étape\s*\d+\s*—\s*/gmi, "");
  t = t.replace(/^\s*Setup\s*:?\s*/gmi, "");

  // Extraire le « … »
  let quoted = "";
  let remainder = "";
  const m = t.match(/«([^»]+)»/);
  if (m) {
    quoted = m[1].trim();
    remainder = (t.slice(0, m.index || 0) + t.slice((m.index || 0) + m[0].length)).trim();
  } else {
    remainder = t;
  }

  if (stage === "Setup" && quoted) {
    const wrapped =
      `Reste bien connecté·e à ton ressenti\n` +
      `et, en tapotant le Point Karaté (tranche de la main), répète cette phrase 3 fois à voix haute :\n` +
      `« ${quoted} »`;
    const tail = remainder ? `\n${remainder}` : "";
    return fixServerText(`${wrapped}${tail}`);
  }

  return fixServerText(t);
}

/* ---------- Colonne promo ---------- */
function PromoAside() {
  return (
    <aside className="rounded-2xl border bg-white p-5 shadow-sm xl:sticky xl:top-6">
      <div className="text-center mb-4">
        <p className="text-sm text-gray-700 leading-snug">Pour aller plus loin avec</p>
        <h3 className="text-xl font-bold leading-tight break-words">Geneviève Gagos</h3>
      </div>
      <div className="flex justify-center mb-4">
        <a
          href="https://technique-eft.com/livres-eft.html"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50 transition"
        >
          Livres EFT
        </a>
      </div>
      <ul className="text-sm text-gray-700 space-y-1 mb-5">
        <li className="text-center">
          Site de référence :{" "}
          <a
            href="https://technique-eft.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            Technique-EFT.com
          </a>
        </li>
      </ul>
      <div className="h-px bg-gray-200 my-4" />
      <div className="space-y-3">
        <div className="text-center">
          <a
            href="https://ecole-eft-france.fr/pages/formations-eft.html"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-full rounded-xl border bg-[#0f3d69] text-white px-4 py-2 font-semibold hover:bg-white hover:text-[#0f3d69] transition"
          >
            Découvrir nos formations
          </a>
          <p className="text-xs text-gray-600 mt-1">
            Formations adaptées à vos besoins, proposées par l’École EFT France.
          </p>
        </div>
        
        <div className="text-center">
          <a
            href="https://technique-eft.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block w-full rounded-xl border px-4 py-2 font-semibold hover:bg-gray-50 transition"
          >
            En savoir plus sur l’EFT
          </a>
          <p className="text-xs text-gray-600 mt-1">
            Articles, ressources et actualités sur Technique-EFT.com.
          </p>
        </div>
      </div>
    </aside>
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
  const [text, setText] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const demo = useDemoHelpers(setText);
  const chatRef = useRef<HTMLDivElement>(null);

  // Gate oui/non
  const [awaitingGate, setAwaitingGate] = useState<boolean>(false);

  // Mini-flux 3.2 Physique (delta SUD < 2) — compacté : 4 étapes (durée → situation → sensation+localisation → SUD)
  const [phys32, setPhys32] = useState<{
    active: boolean;
    step: 1 | 2 | 3 | 4;
    data: {
      duration?: string;
      situation?: string;
      sensLoc?: string; // ex: "serrement dans la poitrine"
      sud?: number;
    };
  }>({ active: false, step: 1, data: {} });

  // Sauvegarde de la douleur initiale pour la réévaluation finale après 3.2
  const [physBackup, setPhysBackup] = useState<{ intake?: string; detail?: string } | null>(null);
  const [post32CheckPending, setPost32CheckPending] = useState<boolean>(false);

  // Évite le doublon de setup (si l’utilisateur tape "OK"/"d'accord" sans SUD)
  const [justShowedSetup, setJustShowedSetup] = useState<boolean>(false);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [rows]);

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

    // Affiche la saisie utilisateur
    setRows((r) => [...r, { who: "user", text: userText }]);
    setText("");

    // -------- Branche 0 : mini-flux spécial 3.2 Physique (compact) --------
    if (phys32.active) {
      const answer = userText.trim();

      if (phys32.step === 1) {
        setPhys32(p => ({ ...p, step: 2, data: { ...p.data, duration: answer } }));
        setRows(r => [...r, { who: "bot", text:
          "Merci. Que se passait-il dans ta vie à ce moment-là ? (décris en une phrase)\n\n⚠️ Si c’est difficile à évoquer, rapproche-toi d’un·e praticien·ne EFT de confiance. L’EFT ne remplace pas l’avis de ton médecin." }]);
        setLoading(false);
        return;
      }

      if (phys32.step === 2) {
        const sitNoun = nominalizeSituation(answer);
        setPhys32(p => ({ ...p, step: 3, data: { ...p.data, situation: sitNoun } }));
        const promptSituation = nominalizeSituation(sitNoun); // fallback de sécurité
        setRows(r => [...r, { who: "bot", text:
          `Quand tu penses à « ${promptSituation} », que se passe-t-il dans ton corps **et où précisément** ?\nExemples : serrement dans la poitrine, pression dans la tête, chaleur sur mes épaules, vide dans mon cœur…` }]);
        setLoading(false);
        return;
      }

      if (phys32.step === 3) {
        // On enregistre directement sensation+localisation
        setPhys32(p => ({ ...p, step: 4, data: { ...p.data, sensLoc: answer } }));
        const sitRaw = phys32.data.situation || "cette situation";
        const sit = nominalizeSituation(sitRaw); // fallback de sécurité
        setRows(r => [...r, { who: "bot", text:
          `Connecte-toi à ${answer} quand tu penses à « ${sit} ».\nIndique un SUD (0–10).` }]);
        setLoading(false);
        return;
      }

      if (phys32.step === 4) {
        const sud3 = parseSUD(answer);
        if (sud3 === null) {
          setError("👉 Merci d’indiquer un SUD valide entre 0 et 10.");
          setLoading(false);
          return;
        }
        const data = { ...phys32.data, sud: sud3 };
        const situationRaw = data.situation || "";
        const situation = nominalizeSituation(situationRaw); // 👉 IMPORTANT : nominalisation avant envoi serveur
        const sensLoc = data.sensLoc || "";

        // Appel serveur direct pour Étape 5 (Setup) en mode 'situation'
        const newSlots: Slots = {
          ...slots,
          intake: situation,          // ← garanti nominal
          context: sensLoc,           // sensation + localisation
          sud: sud3,
          round: 1,
          prevSud: undefined,
          aspect: undefined,
        };
        setSlots(newSlots);

        let raw: ApiResponse | undefined;
        try {
          const res = await fetch("/api/guide-eft", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: answer,
              stage: "Setup",
              etape: 5,
              transcript: rows.map(r => (r.who === "user" ? `U: ${r.text}` : `A: ${r.text}`)).slice(-10).join("\n"),
              slots: newSlots,
            }),
          });
          raw = (await res.json()) as ApiResponse;
        } catch {
          setRows((r) => [...r, { who: "bot", text: "Erreur de connexion au service. Veuillez réessayer." }]);
          setLoading(false);
          return;
        }

        if (raw && "error" in raw) {
          setRows((r) => [...r, { who: "bot", text: "Le service est temporairement indisponible. Réessaie dans un instant." }]);
          setLoading(false);
          return;
        }

        const answerTxt: string = raw && "answer" in raw ? raw.answer : "";
        const cleaned = cleanAnswerForDisplay(answerTxt, "Setup");
        setRows(r => [...r, { who: "bot", text: cleaned }]);
        setJustShowedSetup(true); // évite le doublon de setup

        // On sort du mode 3.2, on passe à la ronde habituelle
        setPhys32({ active: false, step: 1, data: {} });
        setPost32CheckPending(true); // à SUD=0 après cette cible, on reviendra sur la douleur initiale
        setStage("Tapping");
        setEtape(6);
        setLoading(false);
        return;
      }

      setLoading(false);
      return;
    }

    // -------- Branche 1 : si une GATE est ouverte --------
    if (awaitingGate) {
      const transcriptShort = rows
        .map((r) => (r.who === "user" ? `U: ${r.text}` : `A: ${r.text}`))
        .slice(-10)
        .join("\n");

      let raw: ApiResponse | undefined;
      try {
        const res = await fetch("/api/guide-eft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: userText, stage, etape, transcript: transcriptShort, slots }),
        });
        raw = (await res.json()) as ApiResponse;
      } catch {
        setRows((r) => [...r, { who: "bot", text: "Erreur de connexion au service. Veuillez réessayer." }]);
        setLoading(false);
        return;
      }

      if (raw && "error" in raw) {
        setRows((r) => [...r, { who: "bot", text: "Le service est temporairement indisponible. Réessaie dans un instant." }]);
        setLoading(false);
        return;
      }

      const answer: string = raw && "answer" in raw ? raw.answer : "";
      const kind: "gate" | "crisis" | "resume" | undefined =
        raw && "answer" in raw ? (raw as { answer: string; kind?: "gate" | "crisis" | "resume" }).kind : undefined;

      setRows((r) => [...r, { who: "bot", text: answer }]);

      if (kind === "crisis") {
        setAwaitingGate(false);
        setStage("Clôture");
        setEtape(8);
        setText("");
        setLoading(false);
        return;
      }
      if (kind === "resume") {
        setAwaitingGate(false);
        setStage("Intake");
        setEtape(1);
        setSlots({ round: 1 });
        setLoading(false);
        return;
      }
      setAwaitingGate(true);
      setLoading(false);
      return;
    }

    // -------- Branche 2 : flux EFT normal --------
    const updated: Slots = { ...(stage === "Clôture" ? { round: 1 } : slots) };

    if (stage === "Intake" || (stage === "Clôture" && userText)) {
      updated.intake = normalizeIntake(userText);
    } else if (stage === "Durée") {
      updated.duration = userText;
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

    // Gestion spéciale : si on est juste après un setup et que l’utilisateur tape "OK"/"d'accord" sans SUD → demander SUD sans relancer setup
    if (stage === "Tapping") {
      const sudInline = parseSUD(userText);

      if (sudInline === null && justShowedSetup) {
        setRows(r => [...r, { who: "bot", text: "Indique ton SUD (0–10)." }]);
        setStage("Réévaluation");
        setEtape(7);
        setJustShowedSetup(false);
        setLoading(false);
        return;
      }

      if (sudInline !== null) {
        updated.sud = sudInline;
        setJustShowedSetup(false);
      }
    }

    // Aspect
    const intakeText = (updated.intake ?? slots.intake ?? "").trim();
    const ctxRaw = (updated.context ?? slots.context ?? "").trim();
    const ctxShort = ctxRaw ? shortContext(ctxRaw) : "";
    const aspect = buildAspect(intakeText, ctxShort);
    updated.aspect = aspect;
    setSlots(updated);

    // Étape suivante (client → API)
    let stageForAPI: Stage = stage;
    let etapeForAPI = etape;

    if (stage === "Intake") {
      stageForAPI = "Intake";         etapeForAPI = 1;
    }
    else if (stage === "Contexte")    { stageForAPI = "Évaluation";   etapeForAPI = 4; }
    else if (stage === "Évaluation" && typeof updated.sud === "number") {
      if (isPhysicalIntake(updated.intake)) {
        setPhysBackup({ intake: updated.intake, detail: updated.context });
      }
      updated.prevSud = updated.sud;
      setSlots((s) => ({ ...s, prevSud: updated.sud }));
      stageForAPI = "Setup";          etapeForAPI = 5;
    }
    else if (stage === "Setup")       { stageForAPI = "Tapping";      etapeForAPI = 6; }
    else if (stage === "Tapping") {
      if (typeof updated.sud === "number") {
        const prev = typeof slots.sud === "number" ? slots.sud : (typeof slots.prevSud === "number" ? slots.prevSud : undefined);
        const delta = (typeof prev === "number") ? (prev - updated.sud) : 999;

        if (isPhysicalIntake(slots.intake) && (slots.round ?? 1) >= 1 && delta < 2 && updated.sud > 0) {
          if (!physBackup && isPhysicalIntake(slots.intake)) {
            setPhysBackup({ intake: slots.intake, detail: slots.context });
          }
          setPhys32({ active: true, step: 1, data: {} });
          setRows(r => [...r, { who: "bot", text:
            "Comme l’intensité bouge pas ou peu, revenons au moment de l’apparition de cette douleur pour être plus précis.\nDepuis quand as-tu cette douleur ?" }]);
          setLoading(false);
          return;
        }

        if (updated.sud === 0) {
          if (post32CheckPending && physBackup?.intake) {
            setSlots((s) => ({
              ...s,
              intake: physBackup.intake,
              context: physBackup.detail || s.context,
              sud: undefined,
              prevSud: undefined,
              round: 1,
            }));
            setPost32CheckPending(false);
            setRows(r => [...r, { who: "bot", text:
              "Bien. Maintenant que la réaction liée au contexte est apaisée, revenons sur la douleur initiale.\nPeux-tu évaluer de nouveau la douleur en précisant sa localisation ? (0–10)" }]);
            setStage("Évaluation");
            setEtape(4);
            setLoading(false);
            return;
          }

          setRows((r) => [...r, {
            who: "bot",
            text:
              "Bravo pour le travail fourni. Félicitations pour cette belle avancée.\n" +
              "Maintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment !\n\n" +
              "Si tu souhaites travailler sur un nouveau sujet, rafraîchis d'abord la page.\n\n" +
              "Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical."
          }]);
          setStage("Clôture");
          setEtape(8);
          setLoading(false);
          return;
        } else {
          const nextRound = (updated.round ?? 1) + 1;
          updated.round = nextRound;
          updated.prevSud = updated.sud;
          setSlots((s) => ({ ...s, round: nextRound, prevSud: updated.sud }));
          stageForAPI = "Setup";      etapeForAPI = 5;
        }
      } else {
        stageForAPI = "Réévaluation"; etapeForAPI = 7;
      }
    }
    else if (stage === "Réévaluation" && typeof updated.sud === "number") {
      const prev = typeof slots.sud === "number" ? slots.sud : (typeof slots.prevSud === "number" ? slots.prevSud : undefined);
      const delta = (typeof prev === "number") ? (prev - updated.sud) : 999;

      if (isPhysicalIntake(slots.intake) && (slots.round ?? 1) >= 1 && delta < 2 && updated.sud > 0) {
        if (!physBackup && isPhysicalIntake(slots.intake)) {
          setPhysBackup({ intake: slots.intake, detail: slots.context });
        }
        setPhys32({ active: true, step: 1, data: {} });
        setRows(r => [...r, { who: "bot", text:
          "Comme l’intensité bouge pas ou peu, revenons au moment de l’apparition de cette douleur pour être plus précis.\nDepuis quand as-tu cette douleur ?" }]);
        setLoading(false);
        return;
      }

      if (updated.sud === 0) {
        if (post32CheckPending && physBackup?.intake) {
          setSlots((s) => ({
            ...s,
            intake: physBackup.intake,
            context: physBackup.detail || s.context,
            sud: undefined,
            prevSud: undefined,
            round: 1,
          }));
          setPost32CheckPending(false);
          setRows(r => [...r, { who: "bot", text:
            "Bien. Maintenant que la réaction liée au contexte est apaisée, revenons sur la douleur initiale.\nPeux-tu évaluer de nouveau la douleur en précisant sa localisation ? (0–10)" }]);
          setStage("Évaluation");
          setEtape(4);
          setLoading(false);
          return;
        }

        setRows((r) => [...r, {
          who: "bot",
          text:
            "Bravo pour le travail fourni. Félicitations pour cette belle avancée.\n" +
            "Maintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment !\n\n" +
            "Si tu souhaites travailler sur un nouveau sujet, rafraîchis d'abord la page.\n\n" +
            "Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical."
        }]);
        setStage("Clôture");
        setEtape(8);
        setLoading(false);
        return;
      } else if (updated.sud > 0) {
        const nextRound = (updated.round ?? 1) + 1;
        updated.round = nextRound;
        updated.prevSud = updated.sud;
        setSlots((s) => ({ ...s, round: nextRound, prevSud: updated.sud }));
        stageForAPI = "Setup";        etapeForAPI = 5;
      }
    }

    const transcriptShort = rows
      .map((r) => (r.who === "user" ? `U: ${r.text}` : `A: ${r.text}`))
      .slice(-10)
      .join("\n");

    // Appel API
    let raw: ApiResponse | undefined;
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
      raw = (await res.json()) as ApiResponse;
    } catch {
      setRows((r) => [...r, { who: "bot", text: "Erreur de connexion au service. Veuillez réessayer." }]);
      setLoading(false);
      return;
    }

    if (raw && "error" in raw) {
      setRows((r) => [...r, { who: "bot", text: "Le service est temporairement indisponible. Réessaie dans un instant." }]);
      setLoading(false);
      return;
    }

    // Gate/crise/reprise
    const kindInNormalFlow: "gate" | "crisis" | "resume" | undefined =
      raw && "answer" in raw ? (raw as { answer: string; kind?: "gate" | "crisis" | "resume" }).kind : undefined;

    if (kindInNormalFlow === "gate") {
      setAwaitingGate(true);
      setRows((r) => [...r, { who: "bot", text: (raw as { answer: string }).answer }]);
      setLoading(false);
      return;
    }
    if (kindInNormalFlow === "crisis") {
      setAwaitingGate(false);
      setRows((r) => [...r, { who: "bot", text: (raw as { answer: string }).answer }]);
      setStage("Clôture");
      setEtape(8);
      setText("");
      setLoading(false);
      return;
    }
    if (kindInNormalFlow === "resume") {
      setAwaitingGate(false);
      setStage("Intake");
      setEtape(1);
      setSlots({ round: 1 });
      setRows((r) => [
        ...r,
        { who: "bot", text: (raw as { answer: string }).answer },
        { who: "bot", text: "En quoi puis-je vous aider ?" },
      ]);
      setLoading(false);
      return;
    }

    // Affichage normal (avec nettoyage)
    const answer: string = raw && "answer" in raw ? raw.answer : "";
    const cleaned = cleanAnswerForDisplay(answer, stageForAPI);
    setRows((r) => [...r, { who: "bot", text: cleaned }]);

    // Avancer localement
    if (stageForAPI === "Intake" && etapeForAPI === 1) {
      setStage("Contexte");
      setEtape(3);
    } else {
      setStage(stageForAPI);
      setEtape(etapeForAPI);
    }

    setLoading(false);
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-6">
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

      {/* Grille : chat + promo */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Colonne principale */}
        <div className="xl:col-span-2 space-y-4">
          {SHOW_DEMO && (
            <div className="rounded-xl border bg-white p-3 shadow-sm">
              <div className="text-sm font-semibold mb-2">Mode démo (facultatif)</div>
              <div className="flex flex-wrap gap-2">
                {DEMO_PRESETS.map((preset, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">{preset.label}</span>
                    <div className="flex gap-1">
                      {preset.steps.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => demo.fill(s)}
                          className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-50"
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Clique sur un numéro pour pré-remplir le champ, puis appuie sur <strong>Envoyer</strong>.
              </p>
            </div>
          )}

          {/* Chat */}
          <div
            ref={chatRef}
            className="h-[70vh] sm:h-[60vh] xl:h-[72vh] overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm"
          >
            <div className="space-y-3">
              {rows.map((r: Row, i: number) => (
                <div key={i} className={r.who === "bot" ? "flex" : "flex justify-end"}>
                  <div
                    className={
                      (r.who === "bot"
                        ? "bg-gray-50 text-gray-900 border-gray-200"
                        : "bg-blue-50 text-blue-900 border-blue-200") +
                      " max-w-[80%] rounded-2xl border px-4 py-3 shadow-sm"
                    }
                  >
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
        </div>

        {/* Promo */}
        <div className="xl:col-span-1 xl:max-h-[72vh] xl:overflow-auto">
          <PromoAside />
        </div>
      </div>

      {/* Note de prudence */}
      <div className="rounded-2xl border bg-[#F3EEE6] text-[#0f3d69] p-4 shadow-sm">
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
