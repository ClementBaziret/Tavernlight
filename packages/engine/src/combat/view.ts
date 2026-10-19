import type { Combatant, CombatState } from "./types";

/** Approximate state shown to players for creatures that aren't in the party. */
export type HealthStatus = "unhurt" | "injured" | "down";

export function healthStatus(c: Combatant): HealthStatus {
  if (c.dead || c.hp <= 0) return "down";
  return c.hp >= c.maxHp ? "unhurt" : "injured";
}

export interface PlayerCombatant {
  id: string;
  name: string;
  kind: Combatant["kind"];
  side: Combatant["side"];
  tokenId?: string;
  initiative: number | null;
  /** Exact hit points are only shown for the party. */
  hp?: number;
  maxHp?: number;
  tempHp?: number;
  status: HealthStatus;
  conditions: string[];
  effects: string[];
  deathSaves?: { successes: number; failures: number };
  concentration?: string;
}

export interface PlayerCombatView {
  status: CombatState["status"];
  round: number;
  /** Id of the creature whose turn it is, or null if the players can't see it. */
  currentId: string | null;
  combatants: PlayerCombatant[];
}

/**
 * Combat data for the players' view: hidden creatures and creatures whose
 * token the players can't see are removed; enemies only show an
 * approximate health status.
 */
export function playerCombatView(state: CombatState, visibleTokenIds: Set<string>): PlayerCombatView {
  const isVisible = (c: Combatant) => !c.hidden && (c.kind === "pc" || !c.tokenId || visibleTokenIds.has(c.tokenId));
  const visible = state.order.map((id) => state.combatants.find((c) => c.id === id)).filter((c): c is Combatant => !!c && isVisible(c));
  const current = state.combatants.find((c) => c.id === state.order[state.turnIndex]);
  return {
    status: state.status,
    round: state.round,
    currentId: current && isVisible(current) ? current.id : null,
    combatants: visible.map((c) => {
      const party = c.side === "party";
      return {
        id: c.id,
        name: c.name,
        kind: c.kind,
        side: c.side,
        tokenId: c.tokenId,
        initiative: c.initiative,
        hp: party ? c.hp : undefined,
        maxHp: party ? c.maxHp : undefined,
        tempHp: party ? c.tempHp : undefined,
        status: healthStatus(c),
        conditions: [...new Set(c.conditions.map((x) => x.condition))],
        effects: c.effects.map((e) => e.name),
        deathSaves: party && c.hp === 0 ? c.deathSaves : undefined,
        concentration: party ? c.concentration?.name : undefined,
      };
    }),
  };
}
