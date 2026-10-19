import { newId } from "../character/play";
import type { CharacterState, DerivedCharacter } from "../character/types";
import type { Side } from "../map/types";
import { ABILITIES, type MonsterDef } from "../rules/types";
import { modifier } from "../character/abilities";
import type { Combatant, CombatState } from "./types";

export function emptyCombat(): CombatState {
  return { status: "setup", round: 0, turnIndex: 0, order: [], combatants: [] };
}

export function combatantFromMonster(monster: MonsterDef, options: { id?: string; name?: string; tokenId?: string; hp?: number; hidden?: boolean; side?: Side } = {}): Combatant {
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, modifier(monster.abilities[a])])) as Record<(typeof ABILITIES)[number], number>;
  const saves = Object.fromEntries(ABILITIES.map((a) => [a, monster.saves[a] ?? mods[a]])) as Combatant["saves"];
  const hp = options.hp ?? monster.hp;
  return {
    id: options.id ?? newId("cbt"),
    name: options.name ?? monster.name,
    kind: "monster",
    side: options.side ?? "enemy",
    tokenId: options.tokenId,
    monsterKey: monster.key,
    initiative: null,
    initiativeBonus: mods.dex,
    ac: monster.ac,
    hp,
    maxHp: hp,
    tempHp: 0,
    size: monster.size,
    speed: monster.speed.walk ?? 30,
    saves,
    resistances: monster.resistances,
    vulnerabilities: monster.vulnerabilities,
    immunities: monster.immunities,
    conditionImmunities: monster.conditionImmunities,
    conditions: [],
    effects: [],
    concentration: null,
    deathSaves: { successes: 0, failures: 0 },
    dead: false,
    stable: false,
    slots: null,
    resources: {},
    actions: monster.actions,
    variables: { ...mods, prof: monster.proficiencyBonus, level: Math.max(1, Math.floor(monster.cr)) },
    hidden: options.hidden ?? false,
  };
}

export function combatantFromCharacter(
  character: { id: string; name: string },
  derived: DerivedCharacter,
  state: CharacterState,
  options: { id?: string; tokenId?: string } = {},
): Combatant {
  const saves = Object.fromEntries(ABILITIES.map((a) => [a, derived.abilities[a].save])) as Combatant["saves"];
  const resources: Combatant["resources"] = {};
  for (const r of derived.resources) resources[r.key] = { name: r.name, max: r.max, used: r.used };
  return {
    id: options.id ?? newId("cbt"),
    name: character.name,
    kind: "pc",
    side: "party",
    tokenId: options.tokenId,
    characterId: character.id,
    initiative: null,
    initiativeBonus: derived.initiative,
    ac: derived.ac,
    hp: derived.currentHp,
    maxHp: derived.maxHp,
    tempHp: state.tempHp,
    size: derived.size,
    speed: derived.speed,
    saves,
    resistances: derived.resistances,
    vulnerabilities: [],
    immunities: [],
    conditionImmunities: [],
    conditions: state.conditions.map((c) => ({ id: newId("cond"), condition: c, remainingRounds: null })),
    effects: [],
    concentration: null,
    deathSaves: { ...state.deathSaves },
    dead: false,
    stable: false,
    slots: derived.spellcasting ? { max: [...derived.spellcasting.slots], used: [...state.slotsUsed] } : null,
    resources,
    actions: derived.actions,
    variables: derived.variables,
    hidden: false,
  };
}

/** Writes combat results back into the character's play state. */
export function characterStateFromCombatant(state: CharacterState, c: Combatant, maxHp: number): CharacterState {
  return {
    ...state,
    hp: c.hp >= maxHp ? null : c.hp,
    tempHp: c.tempHp,
    slotsUsed: c.slots ? [...c.slots.used] : state.slotsUsed,
    resourcesUsed: Object.fromEntries(Object.entries(c.resources).map(([k, r]) => [k, r.used])),
    deathSaves: { ...c.deathSaves },
    conditions: [...new Set(c.conditions.map((x) => x.condition))],
  };
}
