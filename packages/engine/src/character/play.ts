import { rollDiceTerm, type DieRoller } from "@tavernlight/dice";
import type { RulesIndex } from "../rules";
import type { EquipmentGrant } from "../rules/types";
import type { CharacterBuild, CharacterState, DerivedCharacter, InventoryItem } from "./types";

let idCounter = 0;
export function newId(prefix = "id"): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${idCounter.toString(36)}`;
}

/** Items and gold granted by the chosen class and background equipment options. */
export function startingEquipment(build: CharacterBuild, rules: RulesIndex): { inventory: InventoryItem[]; gold: number } {
  const grants: EquipmentGrant[] = [];
  let gold = 0;
  const cls = rules.class(build.class);
  const background = rules.background(build.background);
  const classOption = cls?.equipment.find((o) => o.key === build.equipment.class);
  const backgroundOption = background?.equipment.find((o) => o.key === build.equipment.background);
  for (const option of [classOption, backgroundOption]) {
    if (!option) continue;
    grants.push(...option.items);
    gold += option.gold;
  }
  const inventory: InventoryItem[] = [];
  const add = (key: string, quantity: number) => {
    const item = rules.item(key);
    if (item?.contents?.length) {
      // Packs are unpacked so each item can be tracked.
      for (const c of item.contents) add(c.item, c.quantity * quantity);
      return;
    }
    const existing = inventory.find((i) => i.item === key);
    if (existing) existing.quantity += quantity;
    else inventory.push({ id: newId("item"), item: key, name: item?.name ?? key, quantity, weight: item?.weight ?? 0, equipped: false });
  };
  for (const g of grants) add(g.item, g.quantity);

  // Equip the best armor, a shield and weapons by default.
  const armors = inventory.filter((i) => rules.item(i.item!)?.armor && rules.item(i.item!)!.armor!.category !== "shield");
  const best = armors.sort((a, b) => rules.item(b.item!)!.armor!.base - rules.item(a.item!)!.armor!.base)[0];
  if (best) best.equipped = true;
  for (const i of inventory) {
    const def = rules.item(i.item!);
    if (def?.armor?.category === "shield" || def?.weapon) i.equipped = true;
  }
  return { inventory, gold };
}

export function initialState(build: CharacterBuild, rules: RulesIndex, base: CharacterState): CharacterState {
  const { inventory, gold } = startingEquipment(build, rules);
  return { ...base, inventory, currency: { ...base.currency, gp: base.currency.gp + gold } };
}

export interface HitDieSpend {
  roll: number;
  healed: number;
}

/** Short rest: optionally spends hit dice, then recovers short-rest resources. */
export function shortRest(
  state: CharacterState,
  derived: DerivedCharacter,
  hitDice: number,
  roller: DieRoller,
): { state: CharacterState; spent: HitDieSpend[] } {
  const spent: HitDieSpend[] = [];
  let hp = derived.currentHp;
  const available = Math.min(hitDice, derived.hitDiceRemaining);
  for (let i = 0; i < available; i++) {
    const roll = rollDiceTerm(1, derived.hitDie, [], roller).total;
    const healed = Math.max(0, Math.min(derived.maxHp - hp, roll + derived.abilities.con.modifier));
    hp += healed;
    spent.push({ roll, healed });
  }
  const resourcesUsed = { ...state.resourcesUsed };
  for (const r of derived.resources) if (r.recharge === "short") resourcesUsed[r.key] = 0;
  let slotsUsed = state.slotsUsed;
  if (derived.spellcasting?.pactMagic) slotsUsed = slotsUsed.map(() => 0);
  return {
    state: {
      ...state,
      hp: hp >= derived.maxHp ? null : hp,
      hitDiceSpent: state.hitDiceSpent + available,
      resourcesUsed,
      slotsUsed,
    },
    spent,
  };
}

/** Long rest: full hit points, all hit dice, spell slots and resources. */
export function longRest(state: CharacterState): CharacterState {
  return {
    ...state,
    hp: null,
    tempHp: 0,
    hitDiceSpent: 0,
    slotsUsed: state.slotsUsed.map(() => 0),
    resourcesUsed: {},
    deathSaves: { successes: 0, failures: 0 },
    exhaustion: Math.max(0, state.exhaustion - 1),
    conditions: state.conditions.filter((c) => c !== "unconscious"),
  };
}

/** Applies damage outside of combat (temporary hit points absorb it first). */
export function takeDamage(state: CharacterState, derived: DerivedCharacter, amount: number): CharacterState {
  let remaining = Math.max(0, Math.floor(amount));
  const absorbed = Math.min(state.tempHp, remaining);
  remaining -= absorbed;
  const hp = Math.max(0, derived.currentHp - remaining);
  return {
    ...state,
    tempHp: state.tempHp - absorbed,
    hp,
    conditions: hp === 0 && !state.conditions.includes("unconscious") ? [...state.conditions, "unconscious"] : state.conditions,
  };
}

export function heal(state: CharacterState, derived: DerivedCharacter, amount: number): CharacterState {
  const hp = Math.min(derived.maxHp, derived.currentHp + Math.max(0, Math.floor(amount)));
  return {
    ...state,
    hp: hp >= derived.maxHp ? null : hp,
    deathSaves: hp > 0 ? { successes: 0, failures: 0 } : state.deathSaves,
    conditions: hp > 0 ? state.conditions.filter((c) => c !== "unconscious") : state.conditions,
  };
}

/** Temporary hit points don't stack: keep the higher value. */
export function setTempHp(state: CharacterState, amount: number): CharacterState {
  return { ...state, tempHp: Math.max(state.tempHp, Math.max(0, Math.floor(amount))) };
}

export function useSlot(state: CharacterState, derived: DerivedCharacter, level: number, delta = 1): CharacterState {
  const max = derived.spellcasting?.slots[level] ?? 0;
  const slotsUsed = [...state.slotsUsed];
  while (slotsUsed.length < 10) slotsUsed.push(0);
  slotsUsed[level] = Math.max(0, Math.min(max, (slotsUsed[level] ?? 0) + delta));
  return { ...state, slotsUsed };
}

export function useResource(state: CharacterState, derived: DerivedCharacter, key: string, delta = 1): CharacterState {
  const resource = derived.resources.find((r) => r.key === key);
  if (!resource) return state;
  const used = Math.max(0, Math.min(resource.max, (state.resourcesUsed[key] ?? 0) + delta));
  return { ...state, resourcesUsed: { ...state.resourcesUsed, [key]: used } };
}
