import type { DiceModifier, DiceNode } from "./ast";
import { matches } from "./ast";
import { DiceError } from "./errors";
import { applyAdvantage, parse } from "./parser";
import { mathRandomRoller, rollAst } from "./roller";

/** Discrete distribution: value -> probability. */
type Dist = Map<number, number>;

export interface ProbabilityPoint {
  value: number;
  probability: number;
}

export interface Probabilities {
  min: number;
  max: number;
  mean: number;
  stdDev: number;
  /** False when the distribution was estimated by simulation. */
  exact: boolean;
  distribution: ProbabilityPoint[];
}

export interface ProbabilityOptions {
  variables?: Record<string, number>;
  advantage?: "advantage" | "disadvantage" | null;
  /** Number of simulated rolls when an exact computation is too large. */
  samples?: number;
}

/** Beyond these sizes we switch to a Monte Carlo estimate. */
const MAX_SUPPORT = 20000;
const MAX_MULTISETS = 200000;
const EXPLODE_DEPTH = 12;
const EPSILON = 1e-13;

class TooLarge extends Error {}

export function probabilities(expression: string, options: ProbabilityOptions = {}): Probabilities {
  let node = parse(expression);
  if (options.advantage) node = applyAdvantage(node, options.advantage);
  return probabilitiesOf(node, options);
}

export function probabilitiesOf(node: DiceNode, options: ProbabilityOptions = {}): Probabilities {
  const variables = options.variables ?? {};
  try {
    const dist = distOf(node, variables);
    return summarize(dist, true);
  } catch (error) {
    if (!(error instanceof TooLarge)) throw error;
  }
  const samples = options.samples ?? 50000;
  const dist: Dist = new Map();
  for (let i = 0; i < samples; i++) {
    const { total } = rollAst(node, "", { variables, roller: mathRandomRoller });
    dist.set(total, (dist.get(total) ?? 0) + 1 / samples);
  }
  return summarize(dist, false);
}

function summarize(dist: Dist, exact: boolean): Probabilities {
  const distribution = [...dist.entries()]
    .filter(([, p]) => p > EPSILON)
    .sort((a, b) => a[0] - b[0])
    .map(([value, probability]) => ({ value, probability }));
  const mean = distribution.reduce((s, d) => s + d.value * d.probability, 0);
  const variance = distribution.reduce((s, d) => s + (d.value - mean) ** 2 * d.probability, 0);
  return {
    min: distribution[0]?.value ?? 0,
    max: distribution[distribution.length - 1]?.value ?? 0,
    mean,
    stdDev: Math.sqrt(variance),
    exact,
    distribution,
  };
}

function constant(value: number): Dist {
  return new Map([[value, 1]]);
}

function distOf(node: DiceNode, variables: Record<string, number>): Dist {
  switch (node.type) {
    case "number":
      return constant(node.value);
    case "variable": {
      const value = variables[node.name];
      if (value === undefined) throw new DiceError("unknown_variable", `The variable @${node.name} has no value here.`);
      return constant(value);
    }
    case "dice":
      return diceDist(node.count, node.sides, node.modifiers);
    case "group":
      return distOf(node.expression, variables);
    case "negate":
      return mapValues(distOf(node.operand, variables), (v) => -v);
    case "binary": {
      const left = distOf(node.left, variables);
      const right = distOf(node.right, variables);
      switch (node.op) {
        case "+":
          return combine(left, right, (a, b) => a + b);
        case "-":
          return combine(left, right, (a, b) => a - b);
        case "*":
          return combine(left, right, (a, b) => a * b);
        case "/":
          if (right.has(0)) throw new DiceError("division_by_zero", "The expression can divide by zero.");
          return combine(left, right, (a, b) => Math.floor(a / b));
      }
    }
  }
}

function mapValues(dist: Dist, fn: (v: number) => number): Dist {
  const out: Dist = new Map();
  for (const [v, p] of dist) out.set(fn(v), (out.get(fn(v)) ?? 0) + p);
  return out;
}

function combine(a: Dist, b: Dist, fn: (x: number, y: number) => number): Dist {
  if (a.size * b.size > MAX_SUPPORT * 50) throw new TooLarge();
  const out: Dist = new Map();
  for (const [x, px] of a) {
    for (const [y, py] of b) {
      const v = fn(x, y);
      out.set(v, (out.get(v) ?? 0) + px * py);
    }
  }
  if (out.size > MAX_SUPPORT) throw new TooLarge();
  return out;
}

/** Probability of each natural face after rerolls. */
function faceDist(sides: number, modifiers: DiceModifier[]): Dist {
  const reroll = modifiers.find((m) => m.kind === "reroll") as Extract<DiceModifier, { kind: "reroll" }> | undefined;
  const dist: Dist = new Map();
  const base = 1 / sides;
  if (!reroll) {
    for (let f = 1; f <= sides; f++) dist.set(f, base);
    return dist;
  }
  const rerolledFaces = [];
  for (let f = 1; f <= sides; f++) if (matches(f, reroll.when)) rerolledFaces.push(f);
  const pReroll = rerolledFaces.length / sides;
  for (let f = 1; f <= sides; f++) {
    const hit = matches(f, reroll.when);
    if (reroll.once) {
      // First roll kept if not matching, otherwise one reroll whatever it shows.
      dist.set(f, (hit ? 0 : base) + pReroll * base);
    } else {
      // Reroll until a non-matching face: uniform over the remaining faces.
      dist.set(f, hit ? 0 : 1 / (sides - rerolledFaces.length));
    }
  }
  return dist;
}

function clampFn(modifiers: DiceModifier[]): (face: number) => number {
  const min = modifiers.find((m) => m.kind === "min") as Extract<DiceModifier, { kind: "min" }> | undefined;
  const max = modifiers.find((m) => m.kind === "max") as Extract<DiceModifier, { kind: "max" }> | undefined;
  return (face) => {
    let v = face;
    if (min && v < min.value) v = min.value;
    if (max && v > max.value) v = max.value;
    return v;
  };
}

/** Distribution of a single die, including its explosion chain. */
function singleDieDist(sides: number, modifiers: DiceModifier[]): Dist {
  const faces = faceDist(sides, modifiers);
  const clamp = clampFn(modifiers);
  const explode = modifiers.find((m) => m.kind === "explode") as Extract<DiceModifier, { kind: "explode" }> | undefined;
  if (!explode) return mapValues(faces, clamp);

  // T = clamp(f) + (explodes(f) ? T : 0), truncated after EXPLODE_DEPTH levels.
  let tail: Dist = constant(0);
  for (let depth = 0; depth < EXPLODE_DEPTH; depth++) {
    const next: Dist = new Map();
    for (const [f, pf] of faces) {
      const v = clamp(f);
      if (matches(f, explode.when)) {
        for (const [t, pt] of tail) next.set(v + t, (next.get(v + t) ?? 0) + pf * pt);
      } else {
        next.set(v, (next.get(v) ?? 0) + pf);
      }
    }
    tail = next;
  }
  return tail;
}

function diceDist(count: number, sides: number, modifiers: DiceModifier[]): Dist {
  const keep = modifiers.find((m) => m.kind.startsWith("keep") || m.kind.startsWith("drop")) as
    | Extract<DiceModifier, { kind: "keepHighest" | "keepLowest" | "dropHighest" | "dropLowest" }>
    | undefined;
  if (!keep) {
    const one = singleDieDist(sides, modifiers);
    let total: Dist = constant(0);
    for (let i = 0; i < count; i++) {
      total = combine(total, one, (a, b) => a + b);
    }
    return total;
  }
  // Keeping/dropping with explosions changes the number of dice: simulate.
  if (modifiers.some((m) => m.kind === "explode")) throw new TooLarge();
  if (binomial(sides + count - 1, count) > MAX_MULTISETS) throw new TooLarge();

  const faces = faceDist(sides, modifiers);
  const clamp = clampFn(modifiers);
  const keptCount =
    keep.kind === "keepHighest" || keep.kind === "keepLowest" ? keep.count : count - keep.count;
  const keepHigh = keep.kind === "keepHighest" || keep.kind === "dropLowest";

  const out: Dist = new Map();
  const logFact = logFactorials(count);
  const chosen: number[] = [];
  // Enumerate non-decreasing face sequences (multisets) with multinomial weights.
  const recurse = (minFace: number, remaining: number) => {
    if (remaining === 0) {
      let logP = logFact[count];
      let run = 1;
      for (let i = 0; i < chosen.length; i++) {
        logP += Math.log(faces.get(chosen[i])!);
        if (i > 0 && chosen[i] === chosen[i - 1]) run++;
        else run = 1;
        logP -= Math.log(run);
      }
      const values = chosen.map(clamp).sort((a, b) => a - b);
      const kept = keepHigh ? values.slice(values.length - keptCount) : values.slice(0, keptCount);
      const sum = kept.reduce((s, v) => s + v, 0);
      out.set(sum, (out.get(sum) ?? 0) + Math.exp(logP));
      return;
    }
    for (let f = minFace; f <= sides; f++) {
      if ((faces.get(f) ?? 0) === 0) continue;
      chosen.push(f);
      recurse(f, remaining - 1);
      chosen.pop();
    }
  };
  recurse(1, count);
  return out;
}

function logFactorials(n: number): number[] {
  const out = [0];
  for (let i = 1; i <= n; i++) out.push(out[i - 1] + Math.log(i));
  return out;
}

function binomial(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) {
    result = (result * (n - k + i)) / i;
    if (result > 1e12) return result;
  }
  return result;
}

/** Probability that a roll of the expression is at least `target`. */
export function chanceAtLeast(p: Probabilities, target: number): number {
  return p.distribution.filter((d) => d.value >= target).reduce((s, d) => s + d.probability, 0);
}
