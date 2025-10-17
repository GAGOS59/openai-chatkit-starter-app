/* eslint-disable @next/next/no-img-element */
stageForAPI = "Setup"; etapeForAPI = 5;
}
} else { stageForAPI = "Réévaluation"; etapeForAPI = 7; }
}
else if (stage === "Réévaluation" && typeof updated.sud === "number") {
if (updated.sud === 0) {
setRows((r) => [...r, { who: "bot", text: "Bravo pour le travail fourni. Félicitations pour cette belle avancée.\nMaintenant, accorde-toi un moment pour t'hydrater et te reposer un instant. Offre-toi ce moment !\n\nSi tu souhaites travailler sur un nouveau sujet, rafraîchis d'abord la page.\n\nRappelle-toi que ce guide est éducatif et ne remplace pas un avis médical." }]);
setStage("Clôture"); setEtape(8); setLoading(false); return;
} else if (updated.sud > 0) {
const nextRound = (updated.round ?? 1) + 1; updated.round = nextRound; setSlots((s) => ({ ...s, round: nextRound }));
stageForAPI = "Setup"; etapeForAPI = 5;
}
}


const transcriptShort = rows.map((r) => (r.who === "user" ? `U: ${r.text}` : `A: ${r.text}`)).slice(-10).join("\n");


let raw: ApiResponse | undefined;
try {
const res = await fetch("/api/guide-eft", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ prompt: userText, stage: stageForAPI, etape: etapeForAPI, transcript: transcriptShort, slots: updated }),
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


const kindInNormalFlow: "gate" | "crisis" | "resume" | undefined = raw && "answer" in raw ? (raw as { answer: string; kind?: "gate" | "crisis" | "resume" }).kind : undefined;


if (kindInNormalFlow === "gate") { setAwaitingGate(true); setRows((r) => [...r, { who: "bot", text: (raw as { answer: string }).answer }]); setLoading(false); return; }
if (kindInNormalFlow === "crisis") { setAwaitingGate(false); setRows((r) => [...r, { who: "bot", text: (raw as { answer: string }).answer }]); setStage("Clôture"); setEtape(8); setText(""); setLoading(false); return; }
if (kindInNormalFlow === "resume") { setAwaitingGate(false); setStage("Intake"); setEtape(1); setSlots({ round: 1 }); setRows((r) => [...r, { who: "bot", text: (raw as { answer: string }).answer }, { who: "bot", text: "En quoi puis-je vous aider ?" }]); setLoading(false); return; }


const answer: string = raw && "answer" in raw ? raw.answer : "";
const cleaned = cleanAnswerForDisplay(answer, stageForAPI);
setRows((r) => [...r, { who: "bot", text: cleaned }]);


// Avancement local
if (stageForAPI === "Intake" && etapeForAPI === 1) {
setStage("Contexte"); setEtape(3);
} else {
setStage(stageForAPI); setEtape(etapeForAPI);
}


setLoading(false);
}


return (
<main className="mx-auto max-w-5xl p-6 space-y-6">
{/* Chat uniquement (le reste de ta mise en page reste inchangé dans ton projet) */}
<div ref={chatRef} className="h-[70vh] overflow-y-auto rounded-2xl border bg-white p-4 shadow-sm">
<div className="space-y-3">
{rows.map((r: Row, i: number) => (
<div key={i} className={r.who === "bot" ? "flex" : "flex justify-end"}>
<div className={(r.who === "bot" ? "bg-gray-50 text-gray-900 border-gray-200" : "bg-blue-50 text-blue-900 border-blue-200") + " max-w-[80%] rounded-2xl border px-4 py-3 shadow-sm"}>
{renderPretty(r.text)}
</div>
</div>
))}
</div>
</div>


<form onSubmit={onSubmit} className="flex gap-2">
<input value={text} onChange={(e) => setText(e.target.value)} className="w-full rounded-xl border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 shadow-sm" placeholder="Sur quoi souhaitez-vous essayer l’EFT…" aria-label="Saisissez votre message pour l’assistante EFT" disabled={loading} />
<button type="submit" disabled={loading || !text.trim()} className="rounded-xl border px-4 py-2 shadow-sm">{loading ? "Envoi..." : "Envoyer"}</button>
</form>


{error && <div className="text-red-600">{error}</div>}
</main>
);
}
