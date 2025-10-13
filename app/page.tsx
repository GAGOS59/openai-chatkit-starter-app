"use client";
import React, { useState, useRef, useEffect } from "react";
import NavTabs from "./components/NavTabs";
import { renderPretty } from "../utils/eftHelpers.client";
import { isCrisis, crisisMessage } from "../utils/eftHelpers";
// ...le reste de ton code...

/* eslint-disable @next/next/no-img-element */


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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);

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
      setLoading(false);
      return;
    }

    if (stage === "Clôture") {
      setStage("Intake");
      setEtape(1);
      setSlots({ round: 1 });
    }

    setRows(r => [...r, { who: "user", text: userText }]);
    setText("");

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
        /^de\s+la\s+(peur|col[èe]re|tristesse|honte|culpabilit[eé]|anxi[ée]t[ée]|angoisse|inqui[èe]tude|tristesse|joie)\b/i
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
        setError("Merci d’indiquer un score SUD valide entre 0 et 10.");
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
               "Étape 8 — Bravo pour le travail fourni. Félicitations pour cette belle avancée.\n" +
    "Maintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment !\n\n" +
    "Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical."
          }]);
          setStage("Clôture");
          setEtape(8);
          setLoading(false);
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
            "Étape 8 — Bravo pour le travail fourni. Félicitations pour cette belle avancée.\n" +
            "Maintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment !\n\n" +
            "Rappelle-toi que ce guide est éducatif et ne remplace pas un avis médical."
        }]);
        setStage("Clôture");
        setEtape(8);
        setLoading(false);
        return;
      } else if (updated.sud > 0) {
        const nextRound = (updated.round ?? 1) + 1;
        updated.round = nextRound;
        setSlots(s => ({ ...s, round: nextRound }));
        stageForAPI = "Tapping";      etapeForAPI = 6;
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
      raw &&
      typeof raw === "object" &&
      raw !== null &&
      "answer" in raw &&
      typeof (raw as { answer: unknown }).answer === "string"
    ) {
      answer = (raw as { answer: string }).answer;
    }

    if (isCrisis(answer)) {
      const now = new Date().toISOString();
      console.warn(`⚠️ [${now}] Mot sensible détecté dans la réponse (client). Clôture sécurisée.`);
      setRows(r => [...r, { who: "bot", text: crisisMessage() }]);
      setStage("Clôture");
      setEtape(8);
      setText("");
      setLoading(false);
      return;
    }

    setRows(r => [...r, { who: "bot", text: answer }]);

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
    <>
      <NavTabs />
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
            className="flex-1 rounded-xl border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm active:scale-[0.99]"
            placeholder="Sur quoi souhaitez-vous essayer l&apos;EFT…"
            aria-label="Saisissez votre message pour l’assistante EFT"
            disabled={loading}
          />
          <button type="submit" disabled={loading || !text.trim()} className="rounded-xl border px-4 py-2 shadow-sm active:scale-[1.00]">
            {loading ? "Envoi..." : "Envoyer"}
          </button>
        </form>
        {error && <div className="text-red-600 mt-2">{error}</div>}

        {/* CTA + Note */}
        <div className="mt-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            {/* Colonne gauche */}
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

            {/* Trait vertical */}
            <div className="hidden sm:flex h-16 border-l mx-4 border-gray-300" aria-hidden="true"></div>
            {/* Sur mobile, pas de trait vertical */}

            {/* Colonne droite */}
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
    </>
  );
}
