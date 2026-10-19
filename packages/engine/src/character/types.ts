import type { Ability, ActionDef, RestKind, Size } from "../rules/types";

export type AbilityScores = Record<Ability, number>;

export type AbilityMethod = "pointBuy" | "standardArray" | "rolled";

export type AsiChoice =
  | { type: "asi"; increases: Partial<Record<Ability, number>> }
  | { type: "feat"; feat: string };

export interface LevelUpRecord {
  level: number;
  hp: { method: "average" | "roll"; value: number };
  asi?: AsiChoice;
}

/**
 * Every choice made while building / leveling the character. Derived values
 * (AC, HP, saves...) are never stored: they are recomputed by `derive`.
 */
export interface CharacterBuild {
  name: string;
  species: string;
  lineage?: string;
  size?: Size;
  background: string;
  class: string;
  subclass?: string;
  level: number;
  abilityMethod: AbilityMethod;
  baseAbilities: AbilityScores;
  /** Results of the 4d6 rolls made by the server, when abilityMethod is "rolled". */
  rolledScores?: number[];
  /** Background increase: +2/+1 to two abilities or +1 to three. */
  backgroundBoost: Partial<Record<Ability, number>>;
  classSkills: string[];
  /** Selected options keyed by the choice id (see collectChoices). */
  choices: Record<string, string[]>;
  equipment: { class?: string; background?: string };
  cantrips: string[];
  preparedSpells: string[];
  levels: LevelUpRecord[];
}

export interface InventoryItem {
  id: string;
  /** Rules item key, or null for a custom item. */
  item: string | null;
  name: string;
  quantity: number;
  /** Weight per unit in pounds (copied from the rules for custom items). */
  weight: number;
  equipped: boolean;
  notes?: string;
}

export interface Currency {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
}

/** Everything that changes during play. */
export interface CharacterState {
  /** Current hit points; null means "at maximum". */
  hp: number | null;
  tempHp: number;
  hitDiceSpent: number;
  /** Used spell slots, index 1..9 (index 0 unused). */
  slotsUsed: number[];
  resourcesUsed: Record<string, number>;
  deathSaves: { successes: number; failures: number };
  conditions: string[];
  exhaustion: number;
  inventory: InventoryItem[];
  currency: Currency;
  notes: string;
  inspiration: boolean;
}

export interface CharacterDetails {
  alignment?: string;
  appearance?: string;
  personality?: string;
  backstory?: string;
  portraitAssetId?: string;
}

export interface DerivedAbility {
  score: number;
  modifier: number;
  save: number;
  saveProficient: boolean;
}

export interface DerivedSkill {
  key: string;
  name: string;
  ability: Ability;
  bonus: number;
  proficient: boolean;
  expertise: boolean;
}

export interface DerivedFeature {
  key: string;
  name: string;
  description: string;
  source: string;
  level: number;
}

export interface DerivedResource {
  key: string;
  name: string;
  max: number;
  used: number;
  recharge: RestKind;
}

export interface DerivedSpellcasting {
  ability: Ability;
  modifier: number;
  saveDc: number;
  attackBonus: number;
  cantripsKnown: number;
  preparedMax: number;
  /** Spell slots by level, index 1..9. */
  slots: number[];
  maxSpellLevel: number;
  pactMagic: boolean;
  /** Spells always prepared (subclass, lineage, feats). */
  alwaysPrepared: string[];
}

export interface DerivedCharacter {
  level: number;
  proficiencyBonus: number;
  abilities: Record<Ability, DerivedAbility>;
  skills: DerivedSkill[];
  passivePerception: number;
  passiveInsight: number;
  passiveInvestigation: number;
  initiative: number;
  speed: number;
  size: Size;
  ac: number;
  acBreakdown: string;
  maxHp: number;
  currentHp: number;
  hitDie: number;
  hitDiceRemaining: number;
  proficiencies: { armor: string[]; weapons: string[]; tools: string[]; savingThrows: Ability[] };
  senses: Record<string, number>;
  resistances: string[];
  features: DerivedFeature[];
  feats: string[];
  spellcasting: DerivedSpellcasting | null;
  actions: ActionDef[];
  resources: DerivedResource[];
  carried: { weight: number; capacity: number; encumbered: boolean };
  /** Values available to formulas (@str, @prof, @spell_dc...). */
  variables: Record<string, number>;
}

export interface ValidationIssue {
  /** Where the problem is, e.g. "classSkills" or "choices.class:fighter:fighting-style". */
  path: string;
  code: string;
  message: string;
  severity: "error" | "warning";
}
