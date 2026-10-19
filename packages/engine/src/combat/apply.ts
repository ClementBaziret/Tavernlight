import { rollDiceTerm, type DieRoller } from "@tavernlight/dice";
import { newId } from "../character/play";
import { applyOps } from "./ops";
import { getCombatant, hasCondition, resolveAction, rollSave } from "./resolve";
import type { ActiveCondition, ActiveEffect, Combatant, CombatState, Op, Proposal, TargetOutcome } from "./types";

export interface ApplyResult {
  state: CombatState;
  ops: Op[];
  /** One line per target for the game log. */
  summary: string[];
}

/** Ends a creature's concentration: removes what it sustained on everyone. */
export function endConcentrationOps(state: CombatState, casterId: string): Op[] {
  const ops: Op[] = [];
  const caster = state.combatants.find((c) => c.id === casterId);
  if (!caster?.concentration) return ops;
  ops.push({ op: "set", id: casterId, field: "concentration", before: caster.concentration, after: null });
  for (const c of state.combatants) {
    for (const cond of c.conditions) if (cond.concentrationOf === casterId) ops.push({ op: "removeCondition", id: c.id, value: cond });
    for (const eff of c.effects) if (eff.concentrationOf === casterId) ops.push({ op: "removeEffect", id: c.id, value: eff });
  }
  return ops;
}

function damageOps(target: Combatant, outcome: TargetOutcome, ops: Op[], summary: string[]) {
  let remaining = Math.max(0, Math.round(outcome.totalDamage));
  if (remaining <= 0) return;
  const critical = !!outcome.attack?.critical;
  const absorbed = Math.min(target.tempHp, remaining);
  if (absorbed > 0) {
    ops.push({ op: "tempHp", id: target.id, before: target.tempHp, after: target.tempHp - absorbed });
    remaining -= absorbed;
  }
  const hpBefore = target.hp;
  const hpAfter = Math.max(0, hpBefore - remaining);
  if (hpAfter !== hpBefore) ops.push({ op: "hp", id: target.id, before: hpBefore, after: hpAfter });
  summary.push(`${target.name} takes ${outcome.totalDamage} damage (${hpBefore} → ${hpAfter} HP)`);

  if (hpAfter > 0) return;
  const overflow = remaining - hpBefore;
  if (target.kind === "pc") {
    if (overflow >= target.maxHp) {
      ops.push({ op: "set", id: target.id, field: "dead", before: target.dead, after: true });
      summary.push(`${target.name} dies from massive damage`);
      return;
    }
    if (hpBefore === 0) {
      // Damage at 0 HP: one failed death save, two on a critical hit.
      const failures = Math.min(3, target.deathSaves.failures + (critical ? 2 : 1));
      ops.push({ op: "set", id: target.id, field: "deathSaves", before: target.deathSaves, after: { ...target.deathSaves, failures } });
      if (failures >= 3) ops.push({ op: "set", id: target.id, field: "dead", before: target.dead, after: true });
    }
    if (!hasCondition(target, "unconscious")) {
      ops.push({ op: "addCondition", id: target.id, value: { id: newId("cond"), condition: "unconscious", remainingRounds: null } });
    }
    if (target.stable) ops.push({ op: "set", id: target.id, field: "stable", before: true, after: false });
    summary.push(`${target.name} falls unconscious`);
  } else {
    ops.push({ op: "set", id: target.id, field: "dead", before: target.dead, after: true });
    summary.push(`${target.name} is down`);
  }
}

/**
 * Applies a reviewed proposal and returns the operations, which are stored
 * in the game log so the action can be undone.
 */
export function applyProposal(state: CombatState, proposal: Proposal): ApplyResult {
  const ops: Op[] = [];
  const summary: string[] = [];
  const actor = proposal.actorId ? state.combatants.find((c) => c.id === proposal.actorId) : undefined;

  if (actor && proposal.cost?.slotLevel && actor.slots) {
    ops.push({ op: "slot", id: actor.id, level: proposal.cost.slotLevel, delta: 1 });
  }
  if (actor && proposal.cost?.resource && actor.resources[proposal.cost.resource]) {
    ops.push({ op: "resource", id: actor.id, key: proposal.cost.resource, delta: proposal.cost.amount ?? 1 });
  }
  if (actor && proposal.concentration) {
    ops.push(...endConcentrationOps(state, actor.id));
    ops.push({ op: "set", id: actor.id, field: "concentration", before: null, after: proposal.concentration });
    summary.push(`${actor.name} concentrates on ${proposal.concentration.name}`);
  }

  for (const outcome of proposal.targets) {
    if (!outcome.included) continue;
    const target = state.combatants.find((c) => c.id === outcome.targetId);
    if (!target) continue;
    // Work on the state updated by previous operations (same target twice).
    const current = applyOps(state, ops).combatants.find((c) => c.id === target.id)!;
    if (outcome.attack) summary.push(`${outcome.attack.hit ? (outcome.attack.critical ? "Critical hit" : "Hit") : "Miss"} on ${target.name} (${outcome.attack.total} vs AC ${outcome.attack.ac})`);
    if (outcome.save) summary.push(`${target.name} ${outcome.save.success ? "succeeds" : "fails"} a ${outcome.save.ability.toUpperCase()} save (${outcome.save.total} vs DC ${outcome.save.dc})`);

    damageOps(current, outcome, ops, summary);

    if (outcome.healing > 0) {
      const after = applyOps(state, ops).combatants.find((c) => c.id === target.id)!;
      if (!after.dead) {
        const hp = Math.min(after.maxHp, after.hp + Math.round(outcome.healing));
        ops.push({ op: "hp", id: target.id, before: after.hp, after: hp });
        if (after.hp === 0 && hp > 0) {
          for (const cond of after.conditions.filter((c) => c.condition === "unconscious")) ops.push({ op: "removeCondition", id: target.id, value: cond });
          ops.push({ op: "set", id: target.id, field: "deathSaves", before: after.deathSaves, after: { successes: 0, failures: 0 } });
          if (after.stable) ops.push({ op: "set", id: target.id, field: "stable", before: true, after: false });
        }
        summary.push(`${target.name} regains ${hp - after.hp} HP (${after.hp} → ${hp})`);
      }
    }
    if (outcome.tempHp > 0) {
      const after = applyOps(state, ops).combatants.find((c) => c.id === target.id)!;
      // Temporary hit points don't stack: keep the higher value.
      if (outcome.tempHp > after.tempHp) {
        ops.push({ op: "tempHp", id: target.id, before: after.tempHp, after: outcome.tempHp });
        summary.push(`${target.name} gains ${outcome.tempHp} temporary HP`);
      }
    }
    for (const c of outcome.conditions) {
      const value: ActiveCondition = { ...c, id: newId("cond") };
      ops.push({ op: "addCondition", id: target.id, value });
      summary.push(`${target.name} is ${c.condition}${c.remainingRounds ? ` for ${c.remainingRounds} rounds` : ""}`);
    }
    for (const e of outcome.effects) {
      const value: ActiveEffect = { ...e, id: newId("eff") };
      ops.push({ op: "addEffect", id: target.id, value });
      summary.push(`${target.name}: ${e.name}${e.remainingRounds ? ` (${e.remainingRounds} rounds)` : ""}`);
    }
    if (outcome.concentrationCheck && !outcome.concentrationCheck.success) {
      const latest = applyOps(state, ops);
      ops.push(...endConcentrationOps(latest, target.id));
      summary.push(`${target.name} loses concentration`);
    }
    if (outcome.deathSave) {
      const after = applyOps(state, ops).combatants.find((c) => c.id === target.id)!;
      const saves = { ...after.deathSaves };
      switch (outcome.deathSave.result) {
        case "critical-success": {
          ops.push({ op: "hp", id: target.id, before: after.hp, after: 1 });
          ops.push({ op: "set", id: target.id, field: "deathSaves", before: after.deathSaves, after: { successes: 0, failures: 0 } });
          for (const cond of after.conditions.filter((c) => c.condition === "unconscious")) ops.push({ op: "removeCondition", id: target.id, value: cond });
          summary.push(`${target.name} rolls a natural 20 and regains 1 HP`);
          break;
        }
        case "success":
          saves.successes = Math.min(3, saves.successes + 1);
          break;
        case "failure":
          saves.failures = Math.min(3, saves.failures + 1);
          break;
        case "critical-failure":
          saves.failures = Math.min(3, saves.failures + 2);
          break;
      }
      if (outcome.deathSave.result !== "critical-success") {
        ops.push({ op: "set", id: target.id, field: "deathSaves", before: after.deathSaves, after: saves });
        summary.push(`${target.name} death saves: ${saves.successes} successes, ${saves.failures} failures`);
        if (saves.successes >= 3) {
          ops.push({ op: "set", id: target.id, field: "stable", before: after.stable, after: true });
          summary.push(`${target.name} is stable`);
        }
        if (saves.failures >= 3) {
          ops.push({ op: "set", id: target.id, field: "dead", before: after.dead, after: true });
          summary.push(`${target.name} dies`);
        }
      }
    }
  }
  for (const r of proposal.removeConditions ?? []) {
    const target = applyOps(state, ops).combatants.find((c) => c.id === r.targetId);
    const cond = target?.conditions.find((c) => c.id === r.conditionId);
    if (target && cond) {
      ops.push({ op: "removeCondition", id: target.id, value: cond });
      summary.push(`${target.name} is no longer ${cond.condition}`);
    }
  }
  return { state: applyOps(state, ops), ops, summary };
}

// ---------------------------------------------------------------------------
// Initiative and turns
// ---------------------------------------------------------------------------

export function sortOrder(state: CombatState): string[] {
  return [...state.combatants]
    .sort((a, b) => (b.initiative ?? -99) - (a.initiative ?? -99) || b.initiativeBonus - a.initiativeBonus || a.name.localeCompare(b.name))
    .map((c) => c.id);
}

/** Rolls initiative for the given combatants (default: those without one). */
export function rollInitiative(state: CombatState, roller: DieRoller, ids?: string[]): { state: CombatState; ops: Op[]; rolls: { id: string; name: string; roll: number; total: number }[] } {
  const ops: Op[] = [];
  const rolls: { id: string; name: string; roll: number; total: number }[] = [];
  for (const c of state.combatants) {
    if (ids ? !ids.includes(c.id) : c.initiative !== null) continue;
    const roll = rollDiceTerm(1, 20, [], roller).total;
    const total = roll + c.initiativeBonus;
    rolls.push({ id: c.id, name: c.name, roll, total });
    ops.push({ op: "set", id: c.id, field: "initiative", before: c.initiative, after: total });
  }
  const withInit = applyOps(state, ops);
  const order = sortOrder(withInit);
  ops.push({ op: "order", before: state.order, after: order });
  return { state: applyOps(state, ops), ops, rolls };
}

export function setInitiative(state: CombatState, id: string, value: number): { state: CombatState; ops: Op[] } {
  const c = getCombatant(state, id);
  const ops: Op[] = [{ op: "set", id, field: "initiative", before: c.initiative, after: value }];
  const order = sortOrder(applyOps(state, ops));
  ops.push({ op: "order", before: state.order, after: order });
  return { state: applyOps(state, ops), ops };
}

export function startCombat(state: CombatState): { state: CombatState; ops: Op[] } {
  const order = sortOrder(state);
  const ops: Op[] = [
    { op: "order", before: state.order, after: order },
    { op: "turn", before: { round: state.round, turnIndex: state.turnIndex, status: state.status }, after: { round: 1, turnIndex: 0, status: "active" } },
  ];
  return { state: applyOps(state, ops), ops };
}

export function endCombat(state: CombatState): { state: CombatState; ops: Op[] } {
  const ops: Op[] = [{ op: "turn", before: { round: state.round, turnIndex: state.turnIndex, status: state.status }, after: { round: state.round, turnIndex: state.turnIndex, status: "ended" } }];
  return { state: applyOps(state, ops), ops };
}

export function currentCombatant(state: CombatState): Combatant | null {
  const id = state.order[state.turnIndex];
  return state.combatants.find((c) => c.id === id) ?? null;
}

function isSkipped(c: Combatant): boolean {
  return c.dead && c.kind !== "pc";
}

export interface TurnResult {
  state: CombatState;
  ops: Op[];
  /** Triggered results waiting for the game master (ongoing damage, saves, death saves). */
  pending: Proposal[];
  summary: string[];
}

function triggerProposals(state: CombatState, c: Combatant, trigger: "startOfTurn" | "endOfTurn", roller: DieRoller): Proposal[] {
  const proposals: Proposal[] = [];
  for (const effect of c.effects) {
    if (effect.trigger !== trigger || effect.effects.length === 0) continue;
    const source = effect.sourceId ? state.combatants.find((x) => x.id === effect.sourceId) : undefined;
    const proposal = resolveAction(
      state,
      {
        actorId: null,
        action: { key: `effect:${effect.id}`, name: effect.name, source: "custom", targeting: { type: "single" }, resolution: { type: "auto" }, effects: effect.effects },
        targetIds: [c.id],
      },
      roller,
    );
    proposal.kind = "trigger";
    proposal.title = `${effect.name} (${trigger === "startOfTurn" ? "start" : "end"} of ${c.name}'s turn)${source ? ` — from ${source.name}` : ""}`;
    proposals.push(proposal);
  }
  return proposals;
}

function repeatSaveProposals(c: Combatant, roller: DieRoller): Proposal[] {
  const proposals: Proposal[] = [];
  for (const cond of c.conditions) {
    if (!cond.repeatSave) continue;
    const save = rollSave(c, cond.repeatSave.ability, cond.repeatSave.dc, roller);
    proposals.push({
      id: newId("prop"),
      kind: "repeatSave",
      title: `${c.name} repeats the save against ${cond.condition}`,
      sharedRolls: [],
      cost: null,
      concentration: null,
      targets: [
        {
          targetId: c.id,
          name: c.name,
          included: true,
          save: { total: save.total, natural: save.natural, breakdown: save.breakdown, ability: cond.repeatSave.ability, dc: cond.repeatSave.dc, success: save.success },
          damage: [],
          totalDamage: 0,
          healing: 0,
          tempHp: 0,
          conditions: [],
          effects: [],
          notes: [save.success ? `The ${cond.condition} condition ends` : `Still ${cond.condition}`],
        },
      ],
      removeConditions: save.success ? [{ targetId: c.id, conditionId: cond.id }] : [],
    });
  }
  return proposals;
}

export function deathSaveProposal(c: Combatant, roller: DieRoller): Proposal {
  const roll = rollDiceTerm(1, 20, [], roller).total;
  const result = roll === 20 ? "critical-success" : roll === 1 ? "critical-failure" : roll >= 10 ? "success" : "failure";
  return {
    id: newId("prop"),
    kind: "deathSave",
    title: `${c.name} makes a death saving throw`,
    sharedRolls: [],
    cost: null,
    concentration: null,
    targets: [
      {
        targetId: c.id,
        name: c.name,
        included: true,
        damage: [],
        totalDamage: 0,
        healing: 0,
        tempHp: 0,
        conditions: [],
        effects: [],
        deathSave: { total: roll, natural: roll, breakdown: `1d20 [${roll}]`, result },
        notes: [],
      },
    ],
  };
}

/**
 * Ends the current turn and starts the next one: end-of-turn effects and
 * repeated saves of the current creature, then start-of-turn effects of the
 * next one, whose durations then tick down.
 */
export function nextTurn(state: CombatState, roller: DieRoller): TurnResult {
  const ops: Op[] = [];
  const pending: Proposal[] = [];
  const summary: string[] = [];
  const current = currentCombatant(state);
  if (current) {
    pending.push(...triggerProposals(state, current, "endOfTurn", roller));
    pending.push(...repeatSaveProposals(current, roller));
  }
  const n = state.order.length;
  let index = state.turnIndex;
  let round = state.round;
  for (let i = 0; i < n; i++) {
    index++;
    if (index >= n) {
      index = 0;
      round++;
    }
    const c = state.combatants.find((x) => x.id === state.order[index]);
    if (c && !isSkipped(c)) break;
  }
  ops.push({ op: "turn", before: { round: state.round, turnIndex: state.turnIndex, status: state.status }, after: { round, turnIndex: index, status: "active" } });
  let next = applyOps(state, ops);
  const upcoming = currentCombatant(next);
  if (upcoming) {
    summary.push(`Round ${round}: ${upcoming.name}'s turn`);
    pending.push(...triggerProposals(next, upcoming, "startOfTurn", roller));
    if (upcoming.kind === "pc" && upcoming.hp === 0 && !upcoming.dead && !upcoming.stable) pending.push(deathSaveProposal(upcoming, roller));
    // Durations count down at the start of the affected creature's turn,
    // after its start-of-turn effects: "2 rounds" triggers twice.
    const tick: Op[] = [];
    for (const cond of upcoming.conditions) {
      if (cond.remainingRounds === null) continue;
      if (cond.remainingRounds <= 1) {
        tick.push({ op: "removeCondition", id: upcoming.id, value: cond });
        summary.push(`${upcoming.name} is no longer ${cond.condition}`);
      } else tick.push({ op: "updateCondition", id: upcoming.id, before: cond, after: { ...cond, remainingRounds: cond.remainingRounds - 1 } });
    }
    for (const eff of upcoming.effects) {
      if (eff.remainingRounds === null) continue;
      if (eff.remainingRounds <= 1) {
        tick.push({ op: "removeEffect", id: upcoming.id, value: eff });
        summary.push(`${eff.name} ends on ${upcoming.name}`);
      } else tick.push({ op: "updateEffect", id: upcoming.id, before: eff, after: { ...eff, remainingRounds: eff.remainingRounds - 1 } });
    }
    ops.push(...tick);
    next = applyOps(next, tick);
  }
  return { state: next, ops, pending, summary };
}

/** Removes a condition or effect by hand. */
export function removeStatusOps(state: CombatState, combatantId: string, statusId: string): Op[] {
  const c = getCombatant(state, combatantId);
  const cond = c.conditions.find((x) => x.id === statusId);
  if (cond) return [{ op: "removeCondition", id: c.id, value: cond }];
  const eff = c.effects.find((x) => x.id === statusId);
  if (eff) return [{ op: "removeEffect", id: c.id, value: eff }];
  return [];
}
