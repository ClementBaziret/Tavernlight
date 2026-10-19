import type { EncounterThresholds } from "../rules/types";

export type Difficulty = "trivial" | "easy" | "medium" | "hard" | "deadly";

export const DIFFICULTIES: Difficulty[] = ["trivial", "easy", "medium", "hard", "deadly"];

export interface EncounterMonster {
  key: string;
  name?: string;
  cr: number;
  xp: number;
  count: number;
}

export interface EncounterEvaluation {
  difficulty: Difficulty;
  /** Sum of the monsters' XP (what the party earns). */
  baseXp: number;
  multiplier: number;
  /** XP compared with the thresholds. */
  adjustedXp: number;
  partyThresholds: { easy: number; medium: number; hard: number; deadly: number };
  monsterCount: number;
  xpPerCharacter: number;
}

export function crLabel(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

/**
 * Encounter difficulty from the party levels and the monsters, using the
 * XP threshold and group-size multiplier tables of the rules data.
 */
export function evaluateEncounter(partyLevels: number[], monsters: EncounterMonster[], table: EncounterThresholds): EncounterEvaluation {
  const party = { easy: 0, medium: 0, hard: 0, deadly: 0 };
  for (const level of partyLevels) {
    const row = table.thresholds[Math.max(1, Math.min(20, level))];
    if (!row) continue;
    party.easy += row[0];
    party.medium += row[1];
    party.hard += row[2];
    party.deadly += row[3];
  }
  const monsterCount = monsters.reduce((s, m) => s + m.count, 0);
  const baseXp = monsters.reduce((s, m) => s + m.xp * m.count, 0);

  // Find the multiplier row, then shift it for small or large parties.
  const rows = table.multipliers;
  let index = 0;
  for (let i = 0; i < rows.length; i++) if (monsterCount >= rows[i][0]) index = i;
  if (monsterCount === 0) index = 0;
  if (partyLevels.length > 0 && partyLevels.length < 3) index = Math.min(rows.length - 1, index + 1);
  else if (partyLevels.length >= 6) index = Math.max(0, index - 1);
  const multiplier = monsterCount === 0 ? 1 : (partyLevels.length >= 6 && index === 0 && monsterCount === 1 ? 0.5 : rows[index][1]);
  const adjustedXp = Math.round(baseXp * multiplier);

  let difficulty: Difficulty = "trivial";
  if (adjustedXp >= party.deadly && party.deadly > 0) difficulty = "deadly";
  else if (adjustedXp >= party.hard && party.hard > 0) difficulty = "hard";
  else if (adjustedXp >= party.medium && party.medium > 0) difficulty = "medium";
  else if (adjustedXp >= party.easy && party.easy > 0) difficulty = "easy";

  return {
    difficulty,
    baseXp,
    multiplier,
    adjustedXp,
    partyThresholds: party,
    monsterCount,
    xpPerCharacter: partyLevels.length ? Math.floor(baseXp / partyLevels.length) : 0,
  };
}
