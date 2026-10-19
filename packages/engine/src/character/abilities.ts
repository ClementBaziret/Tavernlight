import { rollDiceTerm, type DieRoller } from "@tavernlight/dice";
import { ABILITIES, type Ability } from "../rules/types";
import type { AbilityScores, CharacterBuild, LevelUpRecord } from "./types";

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_COSTS: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
export const ABILITY_MAX = 20;

export const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export function modifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function proficiencyBonusFor(level: number): number {
  return 2 + Math.floor((Math.max(1, level) - 1) / 4);
}

export function pointBuyCost(scores: AbilityScores): number | null {
  let total = 0;
  for (const a of ABILITIES) {
    const cost = POINT_BUY_COSTS[scores[a]];
    if (cost === undefined) return null;
    total += cost;
  }
  return total;
}

/** Rolls six ability scores with 4d6, dropping the lowest die. */
export function rollAbilityScores(roller: DieRoller): { scores: number[]; details: number[][] } {
  const scores: number[] = [];
  const details: number[][] = [];
  for (let i = 0; i < 6; i++) {
    const group = rollDiceTerm(4, 6, [{ kind: "keepHighest", count: 3 }], roller);
    scores.push(group.total);
    details.push(group.rolls.map((r) => r.value));
  }
  return { scores, details };
}

export function emptyScores(value = 10): AbilityScores {
  return { str: value, dex: value, con: value, int: value, wis: value, cha: value };
}

/** Ability scores after background, ASIs and feats (capped at 20). */
export function finalScores(build: CharacterBuild, upToLevel = build.level): AbilityScores {
  const scores = { ...build.baseAbilities };
  for (const a of ABILITIES) scores[a] += build.backgroundBoost[a] ?? 0;
  for (const record of build.levels) {
    if (record.level > upToLevel) continue;
    applyAsi(scores, record);
  }
  for (const a of ABILITIES) scores[a] = Math.min(ABILITY_MAX, scores[a]);
  return scores;
}

function applyAsi(scores: AbilityScores, record: LevelUpRecord) {
  if (!record.asi) return;
  if (record.asi.type === "asi") {
    for (const a of ABILITIES) scores[a] += record.asi.increases[a] ?? 0;
  }
}
