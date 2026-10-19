import type { Ability, ActionDef, Effect, ModifierTarget, Size, Trigger } from "../rules/types";
import type { Side } from "../map/types";

export interface ActiveCondition {
  id: string;
  condition: string;
  /** Rounds left, counted down at the end of the affected creature's turn; null = until removed. */
  remainingRounds: number | null;
  sourceId?: string;
  /** Saving throw repeated at the end of each of the creature's turns. */
  repeatSave?: { ability: Ability; dc: number };
  /** Id of the combatant whose concentration sustains this condition. */
  concentrationOf?: string;
}

export interface ActiveEffect {
  id: string;
  name: string;
  description?: string;
  trigger: Trigger;
  /** Effects resolved when the trigger fires (damage, healing...). */
  effects: Effect[];
  /** Constant modifiers while the effect lasts (AC, attack rolls, saves). */
  modifiers: { target: ModifierTarget; value: string | number }[];
  remainingRounds: number | null;
  sourceId?: string;
  concentrationOf?: string;
  /** Added by the game master with the "Add an effect" tool. */
  manual?: boolean;
}

export interface Combatant {
  id: string;
  name: string;
  kind: "pc" | "npc" | "monster";
  side: Side;
  tokenId?: string;
  characterId?: string;
  monsterKey?: string;
  initiative: number | null;
  initiativeBonus: number;
  ac: number;
  hp: number;
  maxHp: number;
  tempHp: number;
  size: Size;
  speed: number;
  saves: Record<Ability, number>;
  resistances: string[];
  vulnerabilities: string[];
  immunities: string[];
  conditionImmunities: string[];
  conditions: ActiveCondition[];
  effects: ActiveEffect[];
  concentration: { name: string; actionKey: string } | null;
  deathSaves: { successes: number; failures: number };
  dead: boolean;
  stable: boolean;
  /** Spell slots, index 1..9. */
  slots: { max: number[]; used: number[] } | null;
  resources: Record<string, { name: string; max: number; used: number }>;
  actions: ActionDef[];
  /** Formula variables: @str, @prof, @spell_dc... */
  variables: Record<string, number>;
  /** Hidden from the players' view. */
  hidden: boolean;
}

export interface CombatState {
  status: "setup" | "active" | "ended";
  round: number;
  /** Index in `order` of the creature whose turn it is. */
  turnIndex: number;
  order: string[];
  combatants: Combatant[];
}

export interface RollSummary {
  total: number;
  /** Natural d20 face, for attack rolls and saves. */
  natural?: number;
  breakdown: string;
}

export interface DamageOutcome {
  label: string;
  damageType: string;
  /** Damage before resistances. */
  amount: number;
  /** 0 immune, 0.5 resistant, 1 normal, 2 vulnerable. */
  multiplier: number;
  /** Half damage on a successful save. */
  half: boolean;
  final: number;
}

export interface TargetOutcome {
  targetId: string;
  name: string;
  /** The game master can exclude a target (e.g. an ally they don't want hit). */
  included: boolean;
  attack?: RollSummary & { bonus: number; ac: number; hit: boolean; critical: boolean };
  save?: RollSummary & { ability: Ability; dc: number; success: boolean };
  damage: DamageOutcome[];
  /** Total damage applied (editable by the game master). */
  totalDamage: number;
  healing: number;
  tempHp: number;
  conditions: Omit<ActiveCondition, "id">[];
  effects: Omit<ActiveEffect, "id">[];
  concentrationCheck?: RollSummary & { dc: number; success: boolean };
  deathSave?: RollSummary & { result: "success" | "failure" | "critical-success" | "critical-failure" };
  notes: string[];
}

export type ProposalKind = "action" | "effect" | "trigger" | "deathSave" | "repeatSave";

/**
 * Result of an action computed by the engine but not applied yet: the game
 * master reviews it, edits it if needed, then applies or discards it.
 */
export interface Proposal {
  id: string;
  kind: ProposalKind;
  title: string;
  actorId?: string;
  actionKey?: string;
  slotLevel?: number;
  /** Rolls shared by all targets (area damage is rolled once). */
  sharedRolls: { label: string; total: number; breakdown: string }[];
  targets: TargetOutcome[];
  cost: { slotLevel?: number; resource?: string; amount?: number } | null;
  /** The actor starts concentrating on this when applied. */
  concentration: { name: string; actionKey: string } | null;
  /** Conditions to remove when applied (successful repeated saves). */
  removeConditions?: { targetId: string; conditionId: string }[];
}

/** Atomic change used to apply and undo results. */
export type Op =
  | { op: "hp"; id: string; before: number; after: number }
  | { op: "tempHp"; id: string; before: number; after: number }
  | { op: "set"; id: string; field: "dead" | "stable" | "deathSaves" | "concentration" | "initiative" | "hidden"; before: unknown; after: unknown }
  | { op: "addCondition"; id: string; value: ActiveCondition }
  | { op: "removeCondition"; id: string; value: ActiveCondition }
  | { op: "updateCondition"; id: string; before: ActiveCondition; after: ActiveCondition }
  | { op: "addEffect"; id: string; value: ActiveEffect }
  | { op: "removeEffect"; id: string; value: ActiveEffect }
  | { op: "updateEffect"; id: string; before: ActiveEffect; after: ActiveEffect }
  | { op: "slot"; id: string; level: number; delta: number }
  | { op: "resource"; id: string; key: string; delta: number }
  | { op: "turn"; before: { round: number; turnIndex: number; status: CombatState["status"] }; after: { round: number; turnIndex: number; status: CombatState["status"] } }
  | { op: "order"; before: string[]; after: string[] }
  | { op: "addCombatant"; value: Combatant }
  | { op: "removeCombatant"; value: Combatant; index: number };
