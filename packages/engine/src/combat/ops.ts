import type { Combatant, CombatState, Op } from "./types";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function update(state: CombatState, id: string, fn: (c: Combatant) => void) {
  const c = state.combatants.find((x) => x.id === id);
  if (c) fn(c);
}

/** Applies operations to a copy of the state. */
export function applyOps(state: CombatState, ops: Op[]): CombatState {
  const next = clone(state);
  for (const op of ops) {
    switch (op.op) {
      case "hp":
        // Applied as a delta so that undoing an old entry keeps later changes.
        update(next, op.id, (c) => {
          c.hp = Math.max(0, Math.min(c.maxHp, c.hp + (op.after - op.before)));
        });
        break;
      case "tempHp":
        update(next, op.id, (c) => {
          c.tempHp = Math.max(0, c.tempHp + (op.after - op.before));
        });
        break;
      case "set":
        update(next, op.id, (c) => {
          (c as unknown as Record<string, unknown>)[op.field] = clone(op.after);
        });
        break;
      case "addCondition":
        update(next, op.id, (c) => {
          if (!c.conditions.some((x) => x.id === op.value.id)) c.conditions.push(clone(op.value));
        });
        break;
      case "removeCondition":
        update(next, op.id, (c) => {
          c.conditions = c.conditions.filter((x) => x.id !== op.value.id);
        });
        break;
      case "updateCondition":
        update(next, op.id, (c) => {
          c.conditions = c.conditions.map((x) => (x.id === op.after.id ? clone(op.after) : x));
        });
        break;
      case "addEffect":
        update(next, op.id, (c) => {
          if (!c.effects.some((x) => x.id === op.value.id)) c.effects.push(clone(op.value));
        });
        break;
      case "removeEffect":
        update(next, op.id, (c) => {
          c.effects = c.effects.filter((x) => x.id !== op.value.id);
        });
        break;
      case "updateEffect":
        update(next, op.id, (c) => {
          c.effects = c.effects.map((x) => (x.id === op.after.id ? clone(op.after) : x));
        });
        break;
      case "slot":
        update(next, op.id, (c) => {
          if (!c.slots) return;
          c.slots.used[op.level] = Math.max(0, Math.min(c.slots.max[op.level] ?? 0, (c.slots.used[op.level] ?? 0) + op.delta));
        });
        break;
      case "resource":
        update(next, op.id, (c) => {
          const r = c.resources[op.key];
          if (r) r.used = Math.max(0, Math.min(r.max, r.used + op.delta));
        });
        break;
      case "turn":
        next.round = op.after.round;
        next.turnIndex = op.after.turnIndex;
        next.status = op.after.status;
        break;
      case "order":
        next.order = [...op.after];
        break;
      case "addCombatant":
        if (!next.combatants.some((c) => c.id === op.value.id)) next.combatants.push(clone(op.value));
        break;
      case "removeCombatant":
        next.combatants = next.combatants.filter((c) => c.id !== op.value.id);
        next.order = next.order.filter((id) => id !== op.value.id);
        break;
    }
  }
  return next;
}

/** Operations that undo `ops` (in reverse order). */
export function invertOps(ops: Op[]): Op[] {
  return [...ops].reverse().map((op): Op => {
    switch (op.op) {
      case "hp":
      case "tempHp":
        return { ...op, before: op.after, after: op.before };
      case "set":
        return { ...op, before: op.after, after: op.before };
      case "addCondition":
        return { op: "removeCondition", id: op.id, value: op.value };
      case "removeCondition":
        return { op: "addCondition", id: op.id, value: op.value };
      case "updateCondition":
        return { ...op, before: op.after, after: op.before };
      case "addEffect":
        return { op: "removeEffect", id: op.id, value: op.value };
      case "removeEffect":
        return { op: "addEffect", id: op.id, value: op.value };
      case "updateEffect":
        return { ...op, before: op.after, after: op.before };
      case "slot":
      case "resource":
        return { ...op, delta: -op.delta };
      case "turn":
        return { op: "turn", before: op.after, after: op.before };
      case "order":
        return { op: "order", before: op.after, after: op.before };
      case "addCombatant":
        return { op: "removeCombatant", value: op.value, index: -1 };
      case "removeCombatant":
        return { op: "addCombatant", value: op.value };
    }
  });
}
