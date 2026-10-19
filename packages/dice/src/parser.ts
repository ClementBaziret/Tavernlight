import type { Comparison, CompareOp, DiceModifier, DiceNode } from "./ast";
import { matches } from "./ast";
import { DiceError, LIMITS } from "./errors";

/*
 * Grammar (whitespace is ignored, letters are case-insensitive):
 *
 *   expression     := additive [ "adv" | "dis" ]
 *   additive       := multiplicative ( ("+" | "-") multiplicative )*
 *   multiplicative := unary ( ("*" | "/") unary )*
 *   unary          := "-" unary | primary
 *   primary        := dice | NUMBER | VARIABLE | "(" additive ")"
 *   dice           := [NUMBER] "d" (NUMBER | "%") modifier*
 *   modifier       := ("kh" | "k" | "kl" | "dh" | "dl") [NUMBER]
 *                   | "!" [comparison]          explode
 *                   | ("r" | "ro") comparison   reroll (repeatedly / once)
 *                   | ("min" | "max") NUMBER
 *                   | "adv" | "dis"            only on a single die
 *   comparison     := [ "=" | ">" | "<" | ">=" | "<=" ] NUMBER
 *   VARIABLE       := "@" letters/digits/underscores  (e.g. @str, @prof)
 */

type TokenKind = "number" | "word" | "variable" | "op" | "lparen" | "rparen" | "cmp" | "bang" | "percent" | "end";

interface Token {
  kind: TokenKind;
  text: string;
  value?: number;
  position: number;
}

const WORDS = new Set(["d", "k", "kh", "kl", "dh", "dl", "r", "ro", "min", "max", "adv", "dis"]);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      const start = i;
      while (i < input.length && /[0-9]/.test(input[i])) i++;
      tokens.push({ kind: "number", text: input.slice(start, i), value: Number(input.slice(start, i)), position: start });
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      const start = i;
      while (i < input.length && /[a-z]/i.test(input[i])) i++;
      const word = input.slice(start, i).toLowerCase();
      splitWord(word, start, tokens);
      continue;
    }
    if (ch === "@") {
      const start = i;
      i++;
      while (i < input.length && /[a-z0-9_]/i.test(input[i])) i++;
      const name = input.slice(start + 1, i).toLowerCase();
      if (!name) throw new DiceError("unexpected_character", `A variable name is expected after "@" at position ${start + 1}.`, start, "@str");
      tokens.push({ kind: "variable", text: name, position: start });
      continue;
    }
    if (ch === ">" || ch === "<") {
      const start = i;
      i++;
      if (input[i] === "=") i++;
      tokens.push({ kind: "cmp", text: input.slice(start, i), position: start });
      continue;
    }
    if (ch === "=") {
      tokens.push({ kind: "cmp", text: "=", position: i++ });
      continue;
    }
    if ("+-*/".includes(ch)) {
      tokens.push({ kind: "op", text: ch, position: i++ });
      continue;
    }
    if (ch === "×") {
      tokens.push({ kind: "op", text: "*", position: i++ });
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen", text: ch, position: i++ });
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", text: ch, position: i++ });
      continue;
    }
    if (ch === "!") {
      tokens.push({ kind: "bang", text: ch, position: i++ });
      continue;
    }
    if (ch === "%") {
      tokens.push({ kind: "percent", text: ch, position: i++ });
      continue;
    }
    throw new DiceError(
      "unexpected_character",
      `The character "${ch}" at position ${i + 1} is not allowed in a dice expression.`,
      i,
      "2d6+3",
    );
  }
  tokens.push({ kind: "end", text: "", position: input.length });
  return tokens;
}

/**
 * Letters are glued together in notation such as "d20adv" or "4d6kh3" never
 * appears glued to another word, but "dl" vs "d" + "l" must be resolved: we
 * greedily take the longest known keyword.
 */
function splitWord(word: string, start: number, out: Token[]) {
  let offset = 0;
  while (offset < word.length) {
    let matched = "";
    for (let len = Math.min(3, word.length - offset); len > 0; len--) {
      const candidate = word.slice(offset, offset + len);
      if (WORDS.has(candidate)) {
        matched = candidate;
        break;
      }
    }
    if (!matched) {
      throw new DiceError(
        "unknown_modifier",
        `"${word}" at position ${start + 1} is not a known dice keyword. Known keywords: d, kh, kl, dh, dl, r, ro, min, max, adv, dis.`,
        start,
        "4d6kh3",
      );
    }
    out.push({ kind: "word", text: matched, position: start + offset });
    offset += matched.length;
  }
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  parse(): DiceNode {
    if (this.peek().kind === "end") {
      throw new DiceError("empty", "The expression is empty. Type something like 1d20+5.", 0, "1d20+5");
    }
    let node = this.parseAdditive();
    const tail = this.peek();
    if (tail.kind === "word" && (tail.text === "adv" || tail.text === "dis")) {
      this.next();
      node = applyAdvantage(node, tail.text === "adv" ? "advantage" : "disadvantage", tail.position);
    }
    const end = this.peek();
    if (end.kind !== "end") {
      if (end.kind === "rparen") {
        throw new DiceError("unexpected_token", `There is a ")" at position ${end.position + 1} without a matching "(".`, end.position);
      }
      throw new DiceError(
        "unexpected_token",
        `Unexpected "${end.text}" at position ${end.position + 1}. Did you forget a "+" or "-" between two terms?`,
        end.position,
        "1d8+1d6",
      );
    }
    return node;
  }

  private parseAdditive(): DiceNode {
    let left = this.parseMultiplicative();
    while (this.peek().kind === "op" && (this.peek().text === "+" || this.peek().text === "-")) {
      const op = this.next().text as "+" | "-";
      const right = this.parseMultiplicative();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): DiceNode {
    let left = this.parseUnary();
    while (this.peek().kind === "op" && (this.peek().text === "*" || this.peek().text === "/")) {
      const op = this.next().text as "*" | "/";
      const right = this.parseUnary();
      left = { type: "binary", op, left, right };
    }
    return left;
  }

  private parseUnary(): DiceNode {
    const token = this.peek();
    if (token.kind === "op" && token.text === "-") {
      this.next();
      return { type: "negate", operand: this.parseUnary() };
    }
    if (token.kind === "op" && token.text === "+") {
      this.next();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): DiceNode {
    const token = this.peek();
    switch (token.kind) {
      case "number": {
        this.next();
        const after = this.peek();
        if (after.kind === "word" && after.text === "d") {
          return this.parseDice(token.value!, token.position);
        }
        return { type: "number", value: token.value! };
      }
      case "word":
        if (token.text === "d") return this.parseDice(1, token.position);
        throw new DiceError(
          "unexpected_token",
          `"${token.text}" at position ${token.position + 1} must follow a dice term such as 4d6.`,
          token.position,
          "4d6kh3",
        );
      case "variable":
        this.next();
        return { type: "variable", name: token.text };
      case "lparen": {
        this.next();
        const expression = this.parseAdditive();
        const close = this.peek();
        if (close.kind !== "rparen") {
          throw new DiceError("unclosed_parenthesis", `The "(" at position ${token.position + 1} is never closed.`, token.position, "(1d6+2)*2");
        }
        this.next();
        return { type: "group", expression };
      }
      case "end":
        throw new DiceError("unexpected_end", "The expression ends too early: a number or a die is expected after the last operator.", token.position, "1d20+5");
      default:
        throw new DiceError(
          "unexpected_token",
          `Unexpected "${token.text}" at position ${token.position + 1}: a number or a die is expected here.`,
          token.position,
          "2d6+3",
        );
    }
  }

  private parseDice(count: number, position: number): DiceNode {
    this.next(); // "d"
    const sidesToken = this.peek();
    let sides: number;
    if (sidesToken.kind === "number") {
      sides = sidesToken.value!;
      this.next();
    } else if (sidesToken.kind === "percent") {
      sides = 100;
      this.next();
    } else {
      throw new DiceError(
        "missing_sides",
        `The die at position ${position + 1} has no number of sides. Write it as "d" followed by a number, for example 2d6 or d20.`,
        sidesToken.position,
        "2d6",
      );
    }
    if (count < 1 || count > LIMITS.maxDice) {
      throw new DiceError("too_many_dice", `You can roll between 1 and ${LIMITS.maxDice} dice at once (got ${count}).`, position, "10d6");
    }
    if (sides < 1 || sides > LIMITS.maxSides) {
      throw new DiceError("invalid_sides", `A die must have between 1 and ${LIMITS.maxSides} sides (got ${sides}).`, sidesToken.position, "1d20");
    }

    let node: DiceNode = { type: "dice", count, sides, modifiers: [], position };
    const modifiers: DiceModifier[] = [];
    let hasKeep = false;

    for (;;) {
      const token = this.peek();
      if (token.kind === "bang") {
        this.next();
        const when = this.parseOptionalComparison() ?? { op: "=", value: sides };
        checkNotAllFaces(when, sides, "infinite_explode", `"!${when.op}${when.value}" would explode on every face of a d${sides} forever.`, token.position);
        modifiers.push({ kind: "explode", when });
        continue;
      }
      if (token.kind !== "word") break;
      const word = token.text;
      if (word === "adv" || word === "dis") {
        // "1d20+5 adv" is handled at the expression level; "d20adv" here.
        if (count !== 1 || hasKeep) {
          throw new DiceError(
            "advantage_needs_single_die",
            `Advantage and disadvantage apply to a single die (like d20adv), not to ${count}d${sides}.`,
            token.position,
            "1d20adv+5",
          );
        }
        this.next();
        node = { type: "dice", count: 2, sides, modifiers: [], position };
        modifiers.push({ kind: word === "adv" ? "keepHighest" : "keepLowest", count: 1 });
        count = 2;
        hasKeep = true;
        continue;
      }
      if (word === "kh" || word === "k" || word === "kl" || word === "dh" || word === "dl") {
        this.next();
        if (hasKeep) {
          throw new DiceError("duplicate_keep", `A die term can only have one keep or drop modifier (position ${token.position + 1}).`, token.position, "4d6kh3");
        }
        const amount = this.parseOptionalNumber() ?? 1;
        const max = word.startsWith("k") ? count : count - 1;
        if (amount < (word.startsWith("k") ? 1 : 0) || amount > max) {
          throw new DiceError(
            "keep_too_many",
            word.startsWith("k")
              ? `You roll ${count} dice, so you can keep between 1 and ${count} of them (got ${amount}).`
              : `You roll ${count} dice, so you can drop at most ${count - 1} of them (got ${amount}).`,
            token.position,
            "4d6kh3",
          );
        }
        hasKeep = true;
        const kind = word === "kh" || word === "k" ? "keepHighest" : word === "kl" ? "keepLowest" : word === "dh" ? "dropHighest" : "dropLowest";
        modifiers.push({ kind, count: amount });
        continue;
      }
      if (word === "r" || word === "ro") {
        this.next();
        const when = this.parseOptionalComparison();
        if (!when) {
          throw new DiceError("unexpected_token", `"${word}" must be followed by the faces to reroll, for example r1 or r<3.`, token.position, "1d8r1");
        }
        checkNotAllFaces(when, sides, "infinite_reroll", `Rerolling "${word}${when.op === "=" ? "" : when.op}${when.value}" would reroll every face of a d${sides}.`, token.position);
        modifiers.push({ kind: "reroll", when, once: word === "ro" });
        continue;
      }
      if (word === "min" || word === "max") {
        this.next();
        const value = this.parseOptionalNumber();
        if (value === null) {
          throw new DiceError("unexpected_token", `"${word}" must be followed by a number, for example ${word}2.`, token.position, `2d6${word}2`);
        }
        modifiers.push({ kind: word, value });
        continue;
      }
      if (word === "d") {
        throw new DiceError("unexpected_token", `A second "d" at position ${token.position + 1}: separate dice terms with "+" (like 1d6+1d4).`, token.position, "1d6+1d4");
      }
      break;
    }
    if (node.type === "dice") node.modifiers = modifiers;
    return node;
  }

  private parseOptionalNumber(): number | null {
    const token = this.peek();
    if (token.kind === "number") {
      this.next();
      return token.value!;
    }
    return null;
  }

  private parseOptionalComparison(): Comparison | null {
    const token = this.peek();
    let op: CompareOp = "=";
    if (token.kind === "cmp") {
      op = token.text as CompareOp;
      this.next();
      const value = this.parseOptionalNumber();
      if (value === null) {
        throw new DiceError("unexpected_token", `A number is expected after "${token.text}" at position ${token.position + 1}.`, token.position, "1d10!>=9");
      }
      return { op, value };
    }
    const value = this.parseOptionalNumber();
    return value === null ? null : { op, value };
  }
}

function checkNotAllFaces(when: Comparison, sides: number, code: "infinite_explode" | "infinite_reroll", message: string, position: number) {
  for (let face = 1; face <= sides; face++) {
    if (!matches(face, when)) return;
  }
  throw new DiceError(code, message, position);
}

/**
 * Turns the first single d20 (or, failing that, the first single die) into
 * 2dXkh1 / 2dXkl1.
 */
export function applyAdvantage(node: DiceNode, mode: "advantage" | "disadvantage", position = 0): DiceNode {
  let applied = false;
  const visit = (n: DiceNode, onlyD20: boolean): DiceNode => {
    if (applied) return n;
    switch (n.type) {
      case "dice":
        if (n.count === 1 && (!onlyD20 || n.sides === 20) && !n.modifiers.some((m) => m.kind.startsWith("keep") || m.kind.startsWith("drop"))) {
          applied = true;
          return { ...n, count: 2, modifiers: [{ kind: mode === "advantage" ? "keepHighest" : "keepLowest", count: 1 }, ...n.modifiers] };
        }
        return n;
      case "binary":
        return { ...n, left: visit(n.left, onlyD20), right: visit(n.right, onlyD20) };
      case "negate":
        return { ...n, operand: visit(n.operand, onlyD20) };
      case "group":
        return { ...n, expression: visit(n.expression, onlyD20) };
      default:
        return n;
    }
  };
  let result = visit(node, true);
  if (!applied) result = visit(node, false);
  if (!applied) {
    throw new DiceError(
      "advantage_needs_single_die",
      "Advantage and disadvantage need a single die to roll twice, such as 1d20+5.",
      position,
      "1d20+5 adv",
    );
  }
  return result;
}

export function parse(expression: string): DiceNode {
  if (expression.length > LIMITS.maxExpressionLength) {
    throw new DiceError("unexpected_token", `The expression is too long (maximum ${LIMITS.maxExpressionLength} characters).`, LIMITS.maxExpressionLength);
  }
  const tokens = tokenize(expression);
  const node = new Parser(tokens).parse();
  let total = 0;
  const countDice = (n: DiceNode) => {
    if (n.type === "dice") total += n.count;
    else if (n.type === "binary") {
      countDice(n.left);
      countDice(n.right);
    } else if (n.type === "negate") countDice(n.operand);
    else if (n.type === "group") countDice(n.expression);
  };
  countDice(node);
  if (total > LIMITS.maxDice) {
    throw new DiceError("too_many_dice", `This expression rolls ${total} dice; the limit is ${LIMITS.maxDice}.`, 0);
  }
  return node;
}

/** Returns `null` when the expression is valid, otherwise the error. */
export function validate(expression: string): DiceError | null {
  try {
    parse(expression);
    return null;
  } catch (error) {
    if (error instanceof DiceError) return error;
    throw error;
  }
}

/** Lists the variables (`@name`) used by an expression. */
export function variablesOf(node: DiceNode): string[] {
  const names = new Set<string>();
  const visit = (n: DiceNode) => {
    if (n.type === "variable") names.add(n.name);
    else if (n.type === "binary") {
      visit(n.left);
      visit(n.right);
    } else if (n.type === "negate") visit(n.operand);
    else if (n.type === "group") visit(n.expression);
  };
  visit(node);
  return [...names];
}
