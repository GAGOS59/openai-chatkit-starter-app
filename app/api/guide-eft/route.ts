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
/**
* NOTE: pour le cas « situation », context stocke le RESSENTI corporel.
* Pour le cas « émotion », le ressenti corporel est désormais dans `sensation`,
* et `context` sert aux éléments de contexte (quand, avec qui, déclencheurs, etc.).
*/
context?: string;
/** Nouveau : sensation corporelle pour le cas EMOTION */
sensation?: string;
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
