export type CompareOp = "=" | ">" | "<" | ">=" | "<=";

export interface Comparison {
  op: CompareOp;
  value: number;
}

export type DiceModifier =
  | { kind: "keepHighest"; count: number }
  | { kind: "keepLowest"; count: number }
  | { kind: "dropHighest"; count: number }
  | { kind: "dropLowest"; count: number }
  /** Roll an extra die each time a die matches (default: maximum face). */
  | { kind: "explode"; when: Comparison }
  /** Reroll while the die matches (`once` rerolls a single time at most). */
  | { kind: "reroll"; when: Comparison; once: boolean }
  /** Any face below `value` counts as `value`. */
  | { kind: "min"; value: number }
  /** Any face above `value` counts as `value`. */
  | { kind: "max"; value: number };

export type DiceNode =
  | { type: "number"; value: number }
  | { type: "variable"; name: string }
  | { type: "dice"; count: number; sides: number; modifiers: DiceModifier[]; position: number }
  | { type: "binary"; op: "+" | "-" | "*" | "/"; left: DiceNode; right: DiceNode }
  | { type: "negate"; operand: DiceNode }
  | { type: "group"; expression: DiceNode };

export function matches(face: number, cmp: Comparison): boolean {
  switch (cmp.op) {
    case "=":
      return face === cmp.value;
    case ">":
      return face > cmp.value;
    case "<":
      return face < cmp.value;
    case ">=":
      return face >= cmp.value;
    case "<=":
      return face <= cmp.value;
  }
}

/** Formats an AST back to canonical notation (used for history and display). */
export function format(node: DiceNode): string {
  switch (node.type) {
    case "number":
      return String(node.value);
    case "variable":
      return `@${node.name}`;
    case "dice":
      return `${node.count}d${node.sides}${node.modifiers.map((m) => formatModifier(m, node.sides)).join("")}`;
    case "binary":
      return `${format(node.left)} ${node.op} ${format(node.right)}`;
    case "negate":
      return `-${format(node.operand)}`;
    case "group":
      return `(${format(node.expression)})`;
  }
}

function formatComparison(cmp: Comparison): string {
  return cmp.op === "=" ? String(cmp.value) : `${cmp.op}${cmp.value}`;
}

function formatModifier(mod: DiceModifier, sides: number): string {
  switch (mod.kind) {
    case "keepHighest":
      return `kh${mod.count}`;
    case "keepLowest":
      return `kl${mod.count}`;
    case "dropHighest":
      return `dh${mod.count}`;
    case "dropLowest":
      return `dl${mod.count}`;
    case "explode":
      return mod.when.op === "=" && mod.when.value === sides ? "!" : `!${formatComparison(mod.when)}`;
    case "reroll":
      return `${mod.once ? "ro" : "r"}${formatComparison(mod.when)}`;
    case "min":
      return `min${mod.value}`;
    case "max":
      return `max${mod.value}`;
  }
}
