"use client";
import React, { useRef, useState, useEffect, FormEvent } from "react";
import NavTabs from "./components/NavTabs";
import {
  shortContext,
  parseSUD,
  normalizeIntake,
  isMasculine,
  getDemoWord,
  normalizeContextForAspect,
  buildAspect,
  isCrisis,
  crisisMessage,
} from "./utils/eftHelpers";
import { renderPretty } from "./utils/eftHelpers.client";

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

export default function Page() {
  // ... (tout ton code existant, inchangé, avec NavTabs au tout début du JSX)
  // Place le code complet de la page que tu avais, avec <NavTabs /> tout en haut, pas deux fois export default.
}
