import { randomInt } from "node:crypto";
import type { DieRoller } from "@tavernlight/dice";

/** Cryptographically secure die roller: every roll of the product goes through it. */
export const secureRoller: DieRoller = (sides) => randomInt(1, sides + 1);
