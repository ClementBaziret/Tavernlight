/**
 * Error codes are stable identifiers so user interfaces can translate the
 * message; `message` is an English explanation meant to be shown as-is.
 */
export type DiceErrorCode =
  | "empty"
  | "unexpected_character"
  | "unexpected_token"
  | "unexpected_end"
  | "missing_sides"
  | "invalid_sides"
  | "too_many_dice"
  | "unknown_modifier"
  | "keep_too_many"
  | "duplicate_keep"
  | "infinite_explode"
  | "infinite_reroll"
  | "advantage_needs_single_die"
  | "unknown_variable"
  | "division_by_zero"
  | "unclosed_parenthesis";

export class DiceError extends Error {
  readonly code: DiceErrorCode;
  /** Zero-based character offset in the expression, when known. */
  readonly position: number | null;
  /** Short example of the expected syntax. */
  readonly hint: string | null;

  constructor(code: DiceErrorCode, message: string, position: number | null = null, hint: string | null = null) {
    super(message);
    this.name = "DiceError";
    this.code = code;
    this.position = position;
    this.hint = hint;
  }

  toJSON() {
    return { code: this.code, message: this.message, position: this.position, hint: this.hint };
  }
}

export const LIMITS = {
  maxDice: 1000,
  maxSides: 10000,
  maxExplosionsPerDie: 100,
  maxRerollsPerDie: 100,
  maxExpressionLength: 500,
} as const;
