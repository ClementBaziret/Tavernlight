import { format, parse, rollAst, type DiceNode, type DieRoller } from "@tavernlight/dice";
import type { Formula } from "../rules/types";
import type { RollSummary } from "./types";

function mapDice(node: DiceNode, fn: (n: Extract<DiceNode, { type: "dice" }>) => DiceNode): DiceNode {
  switch (node.type) {
    case "dice":
      return fn(node);
    case "binary":
      return { ...node, left: mapDice(node.left, fn), right: mapDice(node.right, fn) };
    case "negate":
      return { ...node, operand: mapDice(node.operand, fn) };
    case "group":
      return { ...node, expression: mapDice(node.expression, fn) };
    default:
      return node;
  }
}

/** Multiplies the number of dice (critical hits double the dice, not the modifiers). */
export function multiplyDice(formula: string, factor: number): string {
  if (factor === 1) return formula;
  return format(mapDice(parse(formula), (n) => ({ ...n, count: n.count * factor })));
}

/** Adds `extra` (e.g. "1d6") `times` times: "8d6" + 2 x "1d6" = "8d6 + 2d6". */
export function addDice(formula: string, extra: string | undefined, times: number): string {
  if (!extra || times <= 0) return formula;
  const scaled = multiplyDice(extra, times);
  return `${formula} + ${scaled}`;
}

export function cantripTier(level: number): number {
  return level >= 17 ? 4 : level >= 11 ? 3 : level >= 5 ? 2 : 1;
}

export function rollFormula(formula: Formula, variables: Record<string, number>, roller: DieRoller, options: { advantage?: "advantage" | "disadvantage" | null } = {}): RollSummary {
  if (typeof formula === "number") return { total: formula, breakdown: String(formula) };
  let node = parse(formula);
  if (options.advantage) {
    node = mapDice(node, (n) => (n.sides === 20 && n.count === 1 ? { ...n, count: 2, modifiers: [{ kind: options.advantage === "advantage" ? "keepHighest" : "keepLowest", count: 1 }, ...n.modifiers] } : n));
  }
  const result = rollAst(node, formula, { variables, roller });
  const d20 = result.groups.find((g) => g.sides === 20);
  const natural = d20?.rolls.find((r) => r.kept)?.face;
  return { total: result.total, natural, breakdown: result.breakdown };
}

/** Evaluates a formula that has no dice (e.g. "@spell_dc"). */
export function evalConstant(formula: Formula, variables: Record<string, number>): number {
  if (typeof formula === "number") return formula;
  return rollAst(parse(formula), formula, { variables, roller: () => 1 }).total;
}
