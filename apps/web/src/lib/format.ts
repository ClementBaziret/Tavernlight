import { crLabel } from "@tavernlight/engine";
import type { Units } from "./settings";

export { crLabel };

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** 5 ft = 1.5 m, the usual conversion at the table. */
export function distance(feet: number, units: Units): string {
  if (units === "meters") return `${Number(((feet / 5) * 1.5).toFixed(1))} m`;
  return `${feet} ft`;
}

export function titleCase(s: string): string {
  return s.replace(/(^|[\s-])([a-z])/g, (_m, p, c) => `${p}${c.toUpperCase()}`);
}

export function money(copper: number): string {
  if (copper % 100 === 0) return `${copper / 100} gp`;
  if (copper % 10 === 0) return `${copper / 10} sp`;
  return `${copper} cp`;
}
