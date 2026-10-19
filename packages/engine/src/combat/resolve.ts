import type { DieRoller } from "@tavernlight/dice";
import { newId } from "../character/play";
import type { Ability, ActionDef, Duration, Effect } from "../rules/types";
import { addDice, cantripTier, evalConstant, multiplyDice, rollFormula } from "./formula";
import type { ActiveCondition, ActiveEffect, Combatant, CombatState, DamageOutcome, Proposal, TargetOutcome } from "./types";

export const ROUNDS_PER_MINUTE = 10;

export function durationRounds(duration: Duration | undefined): number | null {
  if (!duration) return null;
  switch (duration.type) {
    case "instant":
      return 0;
    case "rounds":
      return duration.value;
    default:
      return null;
  }
}

export function getCombatant(state: CombatState, id: string): Combatant {
  const c = state.combatants.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown combatant ${id}`);
  return c;
}

export function hasCondition(c: Combatant, condition: string): boolean {
  return c.conditions.some((x) => x.condition === condition);
}

const INCAPACITATING = ["paralyzed", "stunned", "unconscious", "petrified"];

/** Advantage from conditions on an attack roll (attacker vs target). */
export function attackAdvantage(actor: Combatant, target: Combatant, kind: "melee" | "ranged" | undefined): { mode: "advantage" | "disadvantage" | null; reasons: string[] } {
  let adv = 0;
  let dis = 0;
  const reasons: string[] = [];
  for (const c of ["blinded", "poisoned", "frightened", "prone", "restrained"]) {
    if (hasCondition(actor, c)) {
      dis++;
      reasons.push(`attacker ${c}`);
    }
  }
  if (hasCondition(actor, "invisible")) {
    adv++;
    reasons.push("attacker invisible");
  }
  for (const c of ["blinded", "restrained", "stunned", "paralyzed", "unconscious", "petrified"]) {
    if (hasCondition(target, c)) {
      adv++;
      reasons.push(`target ${c}`);
    }
  }
  if (hasCondition(target, "prone")) {
    if (kind === "ranged") dis++;
    else adv++;
    reasons.push("target prone");
  }
  if (hasCondition(target, "invisible")) {
    dis++;
    reasons.push("target invisible");
  }
  return { mode: adv > 0 && dis === 0 ? "advantage" : dis > 0 && adv === 0 ? "disadvantage" : null, reasons };
}

function combineAdvantage(a: "advantage" | "disadvantage" | null, b: "advantage" | "disadvantage" | null | undefined) {
  if (!b) return a;
  if (!a) return b;
  return a === b ? a : null;
}

function modifierFormula(c: Combatant, target: "ac" | "attack" | "save" | "damage"): string {
  return c.effects
    .flatMap((e) => e.modifiers.filter((m) => m.target === target).map((m) => String(m.value)))
    .map((v) => (v.startsWith("-") ? v : `+${v}`))
    .join(" ");
}

function effectiveAc(c: Combatant): number {
  let ac = c.ac;
  for (const e of c.effects) for (const m of e.modifiers) if (m.target === "ac") ac += Number(m.value) || 0;
  return ac;
}

function damageMultiplier(target: Combatant, damageType: string): number {
  if (target.immunities.includes(damageType)) return 0;
  let m = 1;
  if (target.resistances.includes(damageType)) m *= 0.5;
  if (target.vulnerabilities.includes(damageType)) m *= 2;
  return m;
}

function finalDamage(amount: number, multiplier: number, half: boolean): number {
  let v = half ? Math.floor(amount / 2) : amount;
  v = Math.floor(v * multiplier);
  return Math.max(0, v);
}

export function rollSave(target: Combatant, ability: Ability, dc: number, roller: DieRoller, advantage?: "advantage" | "disadvantage" | null) {
  const autoFail = (ability === "str" || ability === "dex") && target.conditions.some((c) => INCAPACITATING.includes(c.condition));
  let mode = advantage ?? null;
  if (ability === "dex" && hasCondition(target, "restrained")) mode = combineAdvantage(mode, "disadvantage");
  const bonus = modifierFormula(target, "save");
  const roll = rollFormula(`1d20 + ${target.saves[ability] ?? 0}${bonus ? ` ${bonus}` : ""}`, {}, roller, { advantage: mode });
  const success = !autoFail && roll.total >= dc;
  return { ...roll, ability, dc, success, autoFail };
}

function emptyOutcome(target: Combatant): TargetOutcome {
  return { targetId: target.id, name: target.name, included: true, damage: [], totalDamage: 0, healing: 0, tempHp: 0, conditions: [], effects: [], notes: [] };
}

interface EffectContext {
  actor: Combatant | null;
  variables: Record<string, number>;
  roller: DieRoller;
  critical: boolean;
  /** Shared damage rolls by effect index (area spells roll once for every target). */
  sharedDamage: Map<string, { total: number; breakdown: string }> | null;
  /** Damage of the failure branch, halved on a success. */
  failureDamage: { effect: Extract<Effect, { type: "damage" }>; index: number }[];
  half: boolean;
  defaultDuration: number | null;
  concentrationOf?: string;
  upcastLevels: number;
  action?: ActionDef;
}

function damageDice(effect: Extract<Effect, { type: "damage" }>, ctx: EffectContext, isFirst: boolean): string {
  let dice = String(effect.dice);
  if (ctx.action?.cantripScaling && isFirst) dice = multiplyDice(dice, cantripTier(ctx.variables.level ?? 1));
  if (isFirst && ctx.action?.upcast?.damage) dice = addDice(dice, ctx.action.upcast.damage, ctx.upcastLevels);
  if (ctx.critical) dice = multiplyDice(dice, 2);
  return dice;
}

function applyEffects(effects: Effect[], target: Combatant, outcome: TargetOutcome, ctx: EffectContext) {
  let damageIndex = 0;
  for (const effect of effects) {
    switch (effect.type) {
      case "damage": {
        const first = damageIndex++ === 0;
        let total: number;
        let breakdown: string;
        const sharedKey = `${effect.dice}|${effect.damageType}`;
        const shared = ctx.sharedDamage?.get(sharedKey);
        if (shared) {
          total = shared.total;
          breakdown = shared.breakdown;
        } else {
          const r = rollFormula(damageDice(effect, ctx, first), ctx.variables, ctx.roller);
          total = r.total;
          breakdown = r.breakdown;
          ctx.sharedDamage?.set(sharedKey, { total, breakdown });
        }
        const multiplier = damageMultiplier(target, effect.damageType);
        const d: DamageOutcome = { label: breakdown, damageType: effect.damageType, amount: Math.max(0, total), multiplier, half: false, final: finalDamage(total, multiplier, false) };
        outcome.damage.push(d);
        break;
      }
      case "halfDamage":
        for (const d of outcome.damage) {
          d.half = true;
          d.final = finalDamage(d.amount, d.multiplier, true);
        }
        break;
      case "heal": {
        let dice = String(effect.dice);
        if (ctx.action?.upcast?.heal) dice = addDice(dice, ctx.action.upcast.heal, ctx.upcastLevels);
        const r = rollFormula(dice, ctx.variables, ctx.roller);
        outcome.healing += Math.max(0, r.total);
        outcome.notes.push(`Healing ${r.breakdown}`);
        break;
      }
      case "tempHp": {
        const r = rollFormula(effect.dice, ctx.variables, ctx.roller);
        outcome.tempHp = Math.max(outcome.tempHp, r.total);
        outcome.notes.push(`Temporary HP ${r.breakdown}`);
        break;
      }
      case "condition": {
        if (target.conditionImmunities.includes(effect.condition)) {
          outcome.notes.push(`Immune to ${effect.condition}`);
          break;
        }
        const rounds = effect.duration ? durationRounds(effect.duration) : ctx.defaultDuration;
        const condition: Omit<ActiveCondition, "id"> = {
          condition: effect.condition,
          remainingRounds: rounds === 0 ? null : rounds,
          sourceId: ctx.actor?.id,
          concentrationOf: ctx.concentrationOf,
        };
        if (effect.repeatSave && ctx.action?.resolution.type === "save") {
          condition.repeatSave = { ability: ctx.action.resolution.ability, dc: evalConstant(ctx.action.resolution.dc, ctx.variables) };
        }
        outcome.conditions.push(condition);
        break;
      }
      case "modifier": {
        const rounds = effect.duration ? durationRounds(effect.duration) : ctx.defaultDuration;
        outcome.effects.push({
          name: effect.name ?? ctx.action?.name ?? "Modifier",
          trigger: "none",
          effects: [],
          modifiers: [{ target: effect.target, value: effect.value }],
          remainingRounds: rounds === 0 ? null : rounds,
          sourceId: ctx.actor?.id,
          concentrationOf: ctx.concentrationOf,
        });
        break;
      }
      case "custom": {
        const rounds = effect.duration ? durationRounds(effect.duration) : ctx.defaultDuration;
        outcome.effects.push({
          name: effect.name,
          description: effect.description,
          trigger: effect.trigger ?? "none",
          effects: effect.effects ?? [],
          modifiers: [],
          remainingRounds: rounds === 0 ? null : rounds,
          sourceId: ctx.actor?.id,
          concentrationOf: ctx.concentrationOf,
        });
        break;
      }
    }
  }
  outcome.totalDamage = outcome.damage.reduce((s, d) => s + d.final, 0);
}

function concentrationCheck(target: Combatant, damage: number, roller: DieRoller): TargetOutcome["concentrationCheck"] {
  if (!target.concentration || damage <= 0) return undefined;
  const dc = Math.min(30, Math.max(10, Math.floor(damage / 2)));
  const save = rollSave(target, "con", dc, roller);
  return { total: save.total, natural: save.natural, breakdown: save.breakdown, dc, success: save.success };
}

export interface ActionRequest {
  actorId: string | null;
  action: ActionDef;
  targetIds: string[];
  /** Slot level used to cast a spell (upcasting). */
  slotLevel?: number;
  advantage?: "advantage" | "disadvantage" | null;
}

/** Computes the result of an action without applying it. */
export function resolveAction(state: CombatState, request: ActionRequest, roller: DieRoller): Proposal {
  const { action } = request;
  const actor = request.actorId ? getCombatant(state, request.actorId) : null;
  const baseLevel = action.level ?? 0;
  const slotLevel = action.source === "spell" && baseLevel > 0 ? Math.max(baseLevel, request.slotLevel ?? baseLevel) : undefined;
  const upcastLevels = slotLevel ? slotLevel - baseLevel : 0;
  const variables: Record<string, number> = { ...(actor?.variables ?? {}), slot: slotLevel ?? 0 };
  if (variables.mod === undefined) variables.mod = variables.spell_mod ?? 0;
  const concentration = action.concentration ? { name: action.name, actionKey: action.key } : null;
  const defaultDuration = action.duration ? durationRounds(action.duration) : null;

  const targetIds = action.targeting.type === "self" && actor ? [actor.id] : request.targetIds;
  const targets = targetIds.map((id) => getCombatant(state, id));
  const shared = action.resolution.type === "save" || action.targeting.type === "area" ? new Map<string, { total: number; breakdown: string }>() : null;
  const proposal: Proposal = {
    id: newId("prop"),
    kind: "action",
    title: actor ? `${actor.name}: ${action.name}${slotLevel && slotLevel > baseLevel ? ` (level ${slotLevel})` : ""}` : action.name,
    actorId: actor?.id,
    actionKey: action.key,
    slotLevel,
    sharedRolls: [],
    targets: [],
    cost: slotLevel ? { slotLevel } : action.cost?.resource ? { resource: action.cost.resource, amount: action.cost.amount ?? 1 } : null,
    concentration,
  };

  for (const target of targets) {
    const outcome = emptyOutcome(target);
    const ctx: EffectContext = {
      actor,
      variables,
      roller,
      critical: false,
      sharedDamage: shared,
      failureDamage: [],
      half: false,
      defaultDuration,
      concentrationOf: concentration && actor ? actor.id : undefined,
      upcastLevels,
      action,
    };
    const resolution = action.resolution;
    if (resolution.type === "attack") {
      const auto = actor ? attackAdvantage(actor, target, resolution.kind) : { mode: null, reasons: [] };
      const mode = combineAdvantage(auto.mode, request.advantage);
      const bonus = evalConstant(resolution.bonus, variables);
      const extra = actor ? modifierFormula(actor, "attack") : "";
      const roll = rollFormula(`1d20 + ${bonus}${extra ? ` ${extra}` : ""}`, variables, roller, { advantage: mode });
      const ac = effectiveAc(target);
      const critical = roll.natural === 20;
      const hit = critical || (roll.natural !== 1 && roll.total >= ac);
      outcome.attack = { ...roll, bonus, ac, hit, critical };
      if (auto.reasons.length) outcome.notes.push(`${mode ?? "normal"} (${auto.reasons.join(", ")})`);
      ctx.critical = critical;
      ctx.sharedDamage = null;
      applyEffects(hit ? action.onHit ?? [] : action.onMiss ?? [], target, outcome, ctx);
    } else if (resolution.type === "save") {
      const dc = evalConstant(resolution.dc, variables);
      const save = rollSave(target, resolution.ability, dc, roller);
      outcome.save = { total: save.total, natural: save.natural, breakdown: save.breakdown, ability: resolution.ability, dc, success: save.success };
      if (save.autoFail) outcome.notes.push("Automatically fails (incapacitated)");
      if (save.success) {
        // Half damage needs the failure damage: compute it, then halve.
        const onSuccess = action.onSuccess ?? [];
        if (onSuccess.some((e) => e.type === "halfDamage")) {
          applyEffects((action.onFail ?? []).filter((e) => e.type === "damage"), target, outcome, ctx);
        }
        applyEffects(onSuccess, target, outcome, ctx);
      } else {
        applyEffects(action.onFail ?? [], target, outcome, ctx);
      }
    } else {
      applyEffects(action.effects ?? [], target, outcome, ctx);
    }
    outcome.concentrationCheck = concentrationCheck(target, outcome.totalDamage, roller);
    proposal.targets.push(outcome);
  }
  if (shared) {
    for (const [, r] of shared) proposal.sharedRolls.push({ label: "Damage", total: r.total, breakdown: r.breakdown });
  }
  return proposal;
}

export interface ManualEffectRequest {
  targetIds: string[];
  effect: Effect;
  title?: string;
  sourceId?: string;
}

/** The game master's "Add an effect" tool, resolved like an automatic action. */
export function manualEffectProposal(state: CombatState, request: ManualEffectRequest, roller: DieRoller): Proposal {
  const actor = request.sourceId ? state.combatants.find((c) => c.id === request.sourceId) ?? null : null;
  const action: ActionDef = {
    key: "manual-effect",
    name: request.title ?? (request.effect.type === "custom" ? request.effect.name : request.effect.type),
    source: "custom",
    targeting: { type: "multiple", count: request.targetIds.length },
    resolution: { type: "auto" },
    effects: [request.effect],
  };
  const proposal = resolveAction(state, { actorId: actor?.id ?? null, action, targetIds: request.targetIds }, roller);
  proposal.kind = "effect";
  proposal.title = `GM effect: ${action.name}`;
  proposal.cost = null;
  for (const t of proposal.targets) for (const e of t.effects) e.manual = true;
  return proposal;
}

/** Recomputes totals after the game master edited a proposal. */
export function normalizeProposal(proposal: Proposal): Proposal {
  for (const t of proposal.targets) {
    for (const d of t.damage) {
      if (!Number.isFinite(d.final)) d.final = finalDamage(d.amount, d.multiplier, d.half);
    }
  }
  return proposal;
}
