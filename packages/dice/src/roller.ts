import type { DiceModifier, DiceNode } from "./ast";
import { format, matches } from "./ast";
import { DiceError, LIMITS } from "./errors";
import { applyAdvantage, parse } from "./parser";

/** Returns an integer in [1, sides]. The server injects a CSPRNG. */
export type DieRoller = (sides: number) => number;

export const mathRandomRoller: DieRoller = (sides) => 1 + Math.floor(Math.random() * sides);

export interface DieRoll {
  /** Natural face shown by the die. */
  face: number;
  /** Face value after min/max adjustments. */
  value: number;
  /** False when dropped by a keep/drop modifier. */
  kept: boolean;
  /** True for the extra dice produced by an explosion. */
  exploded: boolean;
  /** Earlier faces discarded by rerolls, oldest first. */
  rerolled: number[];
  /** "max" / "min" when the natural face is the highest / lowest. */
  natural: "max" | "min" | null;
}

export interface DiceGroupResult {
  notation: string;
  sides: number;
  rolls: DieRoll[];
  total: number;
}

export interface RollResult {
  expression: string;
  /** Canonical notation actually rolled (advantage expanded, variables kept). */
  notation: string;
  total: number;
  groups: DiceGroupResult[];
  /** Human readable breakdown, e.g. "2d20kh1 [17, ~~4~~] + 5 = 22". */
  breakdown: string;
  /** Natural 20 / natural 1 on the first d20 group, useful for attacks. */
  critical: "success" | "failure" | null;
}

export interface RollOptions {
  variables?: Record<string, number>;
  advantage?: "advantage" | "disadvantage" | null;
  roller?: DieRoller;
}

export function roll(expression: string, options: RollOptions = {}): RollResult {
  let node = parse(expression);
  if (options.advantage) node = applyAdvantage(node, options.advantage);
  return rollAst(node, expression, options);
}

export function rollAst(node: DiceNode, expression: string, options: RollOptions = {}): RollResult {
  const roller = options.roller ?? mathRandomRoller;
  const variables = options.variables ?? {};
  const groups: DiceGroupResult[] = [];

  const evaluate = (n: DiceNode): { value: number; text: string } => {
    switch (n.type) {
      case "number":
        return { value: n.value, text: String(n.value) };
      case "variable": {
        const value = variables[n.name];
        if (value === undefined) {
          throw new DiceError("unknown_variable", `The variable @${n.name} has no value here.`, null);
        }
        return { value, text: String(value) };
      }
      case "dice": {
        const group = rollDiceTerm(n.count, n.sides, n.modifiers, roller);
        group.notation = format(n);
        groups.push(group);
        const faces = group.rolls.map((r) => (r.kept ? String(r.value) : `~~${r.value}~~`)).join(", ");
        return { value: group.total, text: `${group.notation} [${faces}]` };
      }
      case "binary": {
        const left = evaluate(n.left);
        const right = evaluate(n.right);
        let value: number;
        switch (n.op) {
          case "+":
            value = left.value + right.value;
            break;
          case "-":
            value = left.value - right.value;
            break;
          case "*":
            value = left.value * right.value;
            break;
          case "/":
            if (right.value === 0) throw new DiceError("division_by_zero", "The expression divides by zero.", null);
            // 5e rounds down.
            value = Math.floor(left.value / right.value);
            break;
        }
        return { value, text: `${left.text} ${n.op} ${right.text}` };
      }
      case "negate": {
        const inner = evaluate(n.operand);
        return { value: -inner.value, text: `-${inner.text}` };
      }
      case "group": {
        const inner = evaluate(n.expression);
        return { value: inner.value, text: `(${inner.text})` };
      }
    }
  };

  const { value, text } = evaluate(node);
  const d20 = groups.find((g) => g.sides === 20);
  let critical: RollResult["critical"] = null;
  if (d20) {
    const kept = d20.rolls.find((r) => r.kept && !r.exploded);
    if (kept?.natural === "max") critical = "success";
    else if (kept?.natural === "min") critical = "failure";
  }
  return {
    expression,
    notation: format(node),
    total: value,
    groups,
    breakdown: `${text} = ${value}`,
    critical,
  };
}

export function rollDiceTerm(count: number, sides: number, modifiers: DiceModifier[], roller: DieRoller): DiceGroupResult {
  const reroll = modifiers.find((m) => m.kind === "reroll") as Extract<DiceModifier, { kind: "reroll" }> | undefined;
  const explode = modifiers.find((m) => m.kind === "explode") as Extract<DiceModifier, { kind: "explode" }> | undefined;
  const min = modifiers.find((m) => m.kind === "min") as Extract<DiceModifier, { kind: "min" }> | undefined;
  const max = modifiers.find((m) => m.kind === "max") as Extract<DiceModifier, { kind: "max" }> | undefined;

  const rollOne = (exploded: boolean): DieRoll => {
    let face = roller(sides);
    const rerolled: number[] = [];
    if (reroll) {
      let attempts = 0;
      while (matches(face, reroll.when) && attempts < LIMITS.maxRerollsPerDie) {
        rerolled.push(face);
        face = roller(sides);
        attempts++;
        if (reroll.once) break;
      }
    }
    const natural = face === sides ? "max" : face === 1 ? "min" : null;
    let value = face;
    if (min && value < min.value) value = min.value;
    if (max && value > max.value) value = max.value;
    return { face, value, kept: true, exploded, rerolled, natural };
  };

  const rolls: DieRoll[] = [];
  for (let i = 0; i < count; i++) {
    let current = rollOne(false);
    rolls.push(current);
    let explosions = 0;
    while (explode && matches(current.face, explode.when) && explosions < LIMITS.maxExplosionsPerDie) {
      current = rollOne(true);
      rolls.push(current);
      explosions++;
    }
  }

  const keep = modifiers.find((m) => m.kind.startsWith("keep") || m.kind.startsWith("drop")) as
    | Extract<DiceModifier, { kind: "keepHighest" | "keepLowest" | "dropHighest" | "dropLowest" }>
    | undefined;
  if (keep) {
    const order = rolls.map((r, index) => ({ r, index })).sort((a, b) => a.r.value - b.r.value || a.index - b.index);
    const n = order.length;
    let dropped: typeof order;
    switch (keep.kind) {
      case "keepHighest":
        dropped = order.slice(0, Math.max(0, n - keep.count));
        break;
      case "keepLowest":
        dropped = order.slice(Math.min(n, keep.count));
        break;
      case "dropHighest":
        dropped = order.slice(Math.max(0, n - keep.count));
        break;
      case "dropLowest":
        dropped = order.slice(0, keep.count);
        break;
    }
    for (const d of dropped) d.r.kept = false;
  }

  const total = rolls.reduce((sum, r) => sum + (r.kept ? r.value : 0), 0);
  return { notation: `${count}d${sides}`, sides, rolls, total };
}
