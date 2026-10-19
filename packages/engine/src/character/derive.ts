import type { RulesIndex } from "../rules";
import { ABILITIES, type Ability, type ActionDef, type ItemDef, type PassiveEffect, type Size } from "../rules/types";
import { ABILITY_MAX, finalScores, formatModifier, modifier, proficiencyBonusFor } from "./abilities";
import { activeFeatures, collectChoices, passiveEffects } from "./features";
import type { CharacterBuild, CharacterState, DerivedCharacter, DerivedResource, DerivedSkill, DerivedSpellcasting } from "./types";

export function emptyState(): CharacterState {
  return {
    hp: null,
    tempHp: 0,
    hitDiceSpent: 0,
    slotsUsed: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    resourcesUsed: {},
    deathSaves: { successes: 0, failures: 0 },
    conditions: [],
    exhaustion: 0,
    inventory: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    notes: "",
    inspiration: false,
  };
}

/** Ability scores including +1 increases granted by feat choices. */
export function abilityScores(build: CharacterBuild, rules: RulesIndex) {
  const scores = finalScores(build);
  for (const scoped of collectChoices(build, rules)) {
    if (scoped.choice.kind !== "ability") continue;
    for (const a of build.choices[scoped.id] ?? []) {
      if ((ABILITIES as readonly string[]).includes(a)) scores[a as Ability] = Math.min(ABILITY_MAX, scores[a as Ability] + 1);
    }
  }
  return scores;
}

/** All proficiency keys: "skill:athletics", "armor:light", "weapon:martial", "save:str"... */
export function proficiencySet(build: CharacterBuild, rules: RulesIndex): { profs: Set<string>; expertise: Set<string> } {
  const profs = new Set<string>();
  const expertise = new Set<string>();
  const cls = rules.class(build.class);
  if (cls) {
    for (const p of cls.proficiencies) profs.add(p);
    for (const a of cls.savingThrows) profs.add(`save:${a}`);
  }
  for (const s of build.classSkills) profs.add(`skill:${s}`);
  const background = rules.background(build.background);
  if (background) {
    for (const s of background.skills) profs.add(`skill:${s}`);
    for (const t of background.tools) profs.add(`tool:${t}`);
  }
  for (const { effect } of passiveEffects(build, rules)) {
    if (effect.type === "proficiency") profs.add(effect.proficiency);
  }
  for (const scoped of collectChoices(build, rules)) {
    const selected = build.choices[scoped.id] ?? [];
    if (scoped.choice.kind === "skill") for (const s of selected) profs.add(`skill:${s}`);
  }
  for (const scoped of collectChoices(build, rules)) {
    if (scoped.choice.kind !== "expertise") continue;
    for (const s of build.choices[scoped.id] ?? []) expertise.add(s);
  }
  return { profs, expertise };
}

export function isWeaponProficient(item: ItemDef, profs: Set<string>): boolean {
  if (!item.weapon) return false;
  if (profs.has(`weapon:${item.key}`)) return true;
  if (profs.has(`weapon:${item.weapon.category}`)) return true;
  if (
    item.weapon.category === "martial" &&
    profs.has("weapon:martial-finesse-light") &&
    (item.weapon.properties.includes("finesse") || item.weapon.properties.includes("light"))
  ) {
    return true;
  }
  return false;
}

function classLevelRow(build: CharacterBuild, rules: RulesIndex) {
  const cls = rules.class(build.class);
  return cls?.levels.find((l) => l.level === build.level);
}

export function classSpecific(build: CharacterBuild, rules: RulesIndex, key: string): number | string | undefined {
  return classLevelRow(build, rules)?.classSpecific?.[key];
}

export function maxHitPoints(build: CharacterBuild, rules: RulesIndex, conModifier: number, effects: PassiveEffect[]): number {
  const cls = rules.class(build.class);
  const hitDie = cls?.hitDie ?? 8;
  let hp = hitDie + conModifier;
  for (const record of build.levels) {
    if (record.level <= 1 || record.level > build.level) continue;
    hp += Math.max(1, record.hp.value + conModifier);
  }
  for (const e of effects) if (e.type === "hpPerLevel") hp += e.value * build.level;
  return Math.max(1, hp);
}

export function derive(build: CharacterBuild, state: CharacterState, rules: RulesIndex): DerivedCharacter {
  const level = Math.max(1, Math.min(20, build.level));
  const cls = rules.class(build.class);
  const species = rules.species(build.species);
  const row = classLevelRow(build, rules);
  const prof = row?.proficiencyBonus ?? proficiencyBonusFor(level);
  const scores = abilityScores(build, rules);
  const mods = Object.fromEntries(ABILITIES.map((a) => [a, modifier(scores[a])])) as Record<Ability, number>;
  const { profs, expertise } = proficiencySet(build, rules);
  const effectsWithSource = passiveEffects(build, rules);
  const effects = effectsWithSource.map((e) => e.effect);

  const abilities = Object.fromEntries(
    ABILITIES.map((a) => {
      const saveProficient = profs.has(`save:${a}`);
      return [a, { score: scores[a], modifier: mods[a], saveProficient, save: mods[a] + (saveProficient ? prof : 0) }];
    }),
  ) as DerivedCharacter["abilities"];

  const skills: DerivedSkill[] = rules.skills.map((s) => {
    const proficient = profs.has(`skill:${s.key}`);
    const hasExpertise = proficient && expertise.has(s.key);
    const bonus = mods[s.ability] + (hasExpertise ? 2 * prof : proficient ? prof : 0);
    return { key: s.key, name: s.name, ability: s.ability, bonus, proficient, expertise: hasExpertise };
  });
  const skillBonus = (key: string, ability: Ability) => skills.find((s) => s.key === key)?.bonus ?? mods[ability];

  // --- Equipment, armor class --------------------------------------------
  const equipped = state.inventory.filter((i) => i.equipped && i.item).map((i) => rules.item(i.item!)).filter((i): i is ItemDef => !!i);
  const armor = equipped.find((i) => i.armor && i.armor.category !== "shield");
  const shield = equipped.find((i) => i.armor?.category === "shield");
  let ac: number;
  let acBreakdown: string;
  if (armor?.armor) {
    const dex = armor.armor.dexBonus ? Math.min(mods.dex, armor.armor.maxDexBonus ?? 99) : 0;
    ac = armor.armor.base + dex;
    acBreakdown = `${armor.name} ${armor.armor.base}${armor.armor.dexBonus ? ` ${formatModifier(dex)} DEX` : ""}`;
  } else {
    ac = 10 + mods.dex;
    acBreakdown = `10 ${formatModifier(mods.dex)} DEX`;
    for (const e of effects) {
      if (e.type !== "acFormula") continue;
      if (shield && !e.allowShield) continue;
      const value = e.base + e.abilities.reduce((s, a) => s + mods[a], 0);
      if (value > ac) {
        ac = value;
        acBreakdown = `${e.base} ${e.abilities.map((a) => `${formatModifier(mods[a])} ${a.toUpperCase()}`).join(" ")}`;
      }
    }
  }
  if (shield?.armor) {
    ac += shield.armor.base;
    acBreakdown += ` +${shield.armor.base} shield`;
  }
  for (const e of effects) {
    if (e.type === "acBonus" && (!e.armoredOnly || armor)) {
      ac += e.value;
      acBreakdown += ` ${formatModifier(e.value)}`;
    }
  }

  // --- Hit points ---------------------------------------------------------
  const maxHp = maxHitPoints(build, rules, mods.con, effects);
  const currentHp = state.hp === null ? maxHp : Math.max(0, Math.min(maxHp, state.hp));

  // --- Speed, senses, resistances -----------------------------------------
  let speed = species?.speed ?? 30;
  for (const e of effects) {
    if (e.type === "speedBonus" && (!e.unarmoredOnly || (!armor && !shield))) speed += e.value;
  }
  if (armor?.armor?.strengthMinimum && scores.str < armor.armor.strengthMinimum) speed -= 10;
  const senses: Record<string, number> = {};
  const resistances = new Set<string>();
  for (const e of effects) {
    if (e.type === "sense") senses[e.sense] = Math.max(senses[e.sense] ?? 0, e.range);
    if (e.type === "resistance") resistances.add(e.damageType);
  }
  const size: Size = build.size ?? species?.sizes[0] ?? "medium";

  let initiative = mods.dex;
  for (const e of effects) if (e.type === "initiativeBonus") initiative += e.value === "prof" ? prof : e.value;

  // --- Spellcasting -------------------------------------------------------
  let spellcasting: DerivedSpellcasting | null = null;
  if (cls?.spellcasting && row) {
    const slots = row.slots ?? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    let maxSpellLevel = 0;
    for (let i = 1; i <= 9; i++) if ((slots[i] ?? 0) > 0) maxSpellLevel = i;
    const subclass = build.subclass ? rules.subclass(build.subclass) : undefined;
    const lineage = species?.lineages.find((l) => l.key === build.lineage);
    const alwaysPrepared = [
      ...(subclass?.spells ?? []).filter((s) => s.level <= level).map((s) => s.spell),
      ...(lineage?.spells ?? []).filter((s) => s.level <= level).map((s) => s.spell),
    ];
    const abilityMod = mods[cls.spellcasting.ability];
    spellcasting = {
      ability: cls.spellcasting.ability,
      modifier: abilityMod,
      saveDc: 8 + prof + abilityMod,
      attackBonus: prof + abilityMod,
      cantripsKnown: row.cantrips ?? 0,
      preparedMax: row.preparedSpells ?? 0,
      slots,
      maxSpellLevel,
      pactMagic: !!cls.spellcasting.pactMagic,
      alwaysPrepared,
    };
  }

  const variables: Record<string, number> = { prof, level, ...mods };
  if (spellcasting) {
    variables.spell_mod = spellcasting.modifier;
    variables.spell_dc = spellcasting.saveDc;
    variables.spell_attack = spellcasting.attackBonus;
  } else {
    // Spells from feats (Magic Initiate) use the highest mental ability.
    const best = Math.max(mods.int, mods.wis, mods.cha);
    variables.spell_mod = best;
    variables.spell_dc = 8 + prof + best;
    variables.spell_attack = prof + best;
  }

  // --- Features and resources ---------------------------------------------
  const features = activeFeatures(build, rules).map((a) => ({
    key: a.feature.key,
    name: a.feature.name,
    description: a.feature.description,
    source: a.source,
    level: a.feature.level,
  }));
  const resources: DerivedResource[] = [];
  for (const e of effects) {
    if (e.type !== "resource") continue;
    let max: number;
    if (typeof e.uses === "number") max = e.uses;
    else if (e.uses === "prof") max = prof;
    else if ("ability" in e.uses) max = Math.max(1, mods[e.uses.ability]);
    else max = Number(classSpecific(build, rules, e.uses.classSpecific) ?? 0);
    if (max <= 0) continue;
    resources.push({ key: e.key, name: e.name, max, used: Math.min(max, state.resourcesUsed[e.key] ?? 0), recharge: e.recharge });
  }

  // --- Actions: weapons, spells, features ---------------------------------
  const actions: ActionDef[] = [];
  const rangedBonus = effects.reduce((s, e) => (e.type === "rangedAttackBonus" ? s + e.value : s), 0);
  const martialArts = classSpecific(build, rules, "martial_arts");
  const weaponItems = state.inventory.filter((i) => i.item && i.equipped).map((i) => rules.item(i.item!)).filter((i): i is ItemDef => !!i?.weapon);
  for (const weapon of weaponItems) {
    const w = weapon.weapon!;
    const finesse = w.properties.includes("finesse");
    const ability: Ability = w.kind === "ranged" ? "dex" : finesse && mods.dex > mods.str ? "dex" : "str";
    const proficient = isWeaponProficient(weapon, profs);
    const attackBonus = mods[ability] + (proficient ? prof : 0) + (w.kind === "ranged" ? rangedBonus : 0);
    const thrown = w.properties.includes("thrown");
    actions.push({
      key: `weapon:${weapon.key}`,
      name: weapon.name,
      source: "weapon",
      activation: "action",
      range: w.kind === "ranged" || thrown ? { normal: w.range?.normal, long: w.range?.long, reach: w.kind === "melee" ? 5 : undefined } : { reach: w.properties.includes("reach") ? 10 : 5 },
      targeting: { type: "single" },
      resolution: { type: "attack", bonus: attackBonus, kind: w.kind },
      onHit: [{ type: "damage", dice: `${w.damage}${mods[ability] !== 0 ? formatModifier(mods[ability]) : ""}`, damageType: w.damageType }],
      description: [w.properties.join(", "), w.mastery ? `Mastery: ${w.mastery}` : ""].filter(Boolean).join(" · "),
    });
  }
  const unarmedAbility: Ability = martialArts && mods.dex > mods.str ? "dex" : "str";
  actions.push({
    key: "unarmed-strike",
    name: "Unarmed Strike",
    source: "weapon",
    activation: "action",
    range: { reach: 5 },
    targeting: { type: "single" },
    resolution: { type: "attack", bonus: mods[unarmedAbility] + prof, kind: "melee" },
    onHit: [
      {
        type: "damage",
        dice: martialArts ? `${martialArts}${formatModifier(mods[unarmedAbility])}` : String(Math.max(1, 1 + mods.str)),
        damageType: "bludgeoning",
      },
    ],
  });
  const lineageSpells = (species?.lineages.find((l) => l.key === build.lineage)?.spells ?? []).filter((s) => s.level <= level).map((s) => s.spell);
  const knownSpells = new Set([...build.cantrips, ...build.preparedSpells, ...(spellcasting?.alwaysPrepared ?? []), ...lineageSpells]);
  for (const scoped of collectChoices(build, rules)) {
    if (scoped.choice.kind === "spells") for (const s of build.choices[scoped.id] ?? []) knownSpells.add(s);
  }
  for (const key of knownSpells) {
    const spell = rules.spell(key);
    if (spell?.action) actions.push(spell.action);
  }
  for (const e of effects) if (e.type === "action") actions.push(e.action);

  // --- Encumbrance ---------------------------------------------------------
  const weight = state.inventory.reduce((s, i) => s + i.weight * i.quantity, 0) + (state.currency.cp + state.currency.sp + state.currency.ep + state.currency.gp + state.currency.pp) / 50;
  const sizeFactor = size === "tiny" ? 0.5 : size === "large" ? 2 : size === "huge" ? 4 : size === "gargantuan" ? 8 : 1;
  const capacity = scores.str * 15 * sizeFactor;

  const savingThrows = ABILITIES.filter((a) => profs.has(`save:${a}`));
  const armorProfs = [...profs].filter((p) => p.startsWith("armor:")).map((p) => p.slice(6));
  const weaponProfs = [...profs].filter((p) => p.startsWith("weapon:")).map((p) => p.slice(7));
  const toolProfs = [...profs].filter((p) => p.startsWith("tool:")).map((p) => p.slice(5));

  return {
    level,
    proficiencyBonus: prof,
    abilities,
    skills,
    passivePerception: 10 + skillBonus("perception", "wis"),
    passiveInsight: 10 + skillBonus("insight", "wis"),
    passiveInvestigation: 10 + skillBonus("investigation", "int"),
    initiative,
    speed,
    size,
    ac,
    acBreakdown,
    maxHp,
    currentHp,
    hitDie: cls?.hitDie ?? 8,
    hitDiceRemaining: Math.max(0, level - state.hitDiceSpent),
    proficiencies: { armor: armorProfs, weapons: weaponProfs, tools: toolProfs, savingThrows },
    senses,
    resistances: [...resistances],
    features,
    feats: activeFeatures(build, rules)
      .filter((a) => rules.feat(a.feature.key))
      .map((a) => a.feature.key),
    spellcasting,
    actions,
    resources,
    carried: { weight: Math.round(weight * 100) / 100, capacity, encumbered: weight > capacity },
    variables,
  };
}
