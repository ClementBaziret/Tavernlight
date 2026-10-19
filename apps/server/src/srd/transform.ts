/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  Ability,
  ActionDef,
  AreaDef,
  BackgroundDef,
  ChoiceDef,
  ClassDef,
  ClassLevelDef,
  ConditionDef,
  DamageTypeDef,
  Duration,
  Effect,
  EncounterThresholds,
  EquipmentGrant,
  EquipmentOption,
  FeatDef,
  FeatureDef,
  ItemCategory,
  ItemDef,
  LineageDef,
  MagicItemDef,
  MonsterDef,
  OptionDef,
  PassiveEffect,
  RulesData,
  Size,
  SkillDef,
  SpeciesDef,
  SpellDef,
  SubclassDef,
} from "@tavernlight/engine";

/**
 * Converts the 5e-bits SRD 5.2 dataset (raw JSON files) plus the
 * hand-written overrides in data/rules into the Tavernlight rules format.
 * The function is pure: same inputs, same output (except `importedAt`).
 */

export const FORMAT_VERSION = 1;

export const SRD_ATTRIBUTION =
  'This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.';

export interface RawSrd {
  [file: string]: any[];
}

export interface Overrides {
  classFeatures: any;
  species: any;
  feats: any;
  spells: Record<string, Partial<ActionDef>>;
  backgrounds: Record<string, { featOption?: string }>;
  encounters: EncounterThresholds & { $comment?: string };
}

const ABILITY_BY_NAME: Record<string, Ability> = {
  strength: "str",
  dexterity: "dex",
  constitution: "con",
  intelligence: "int",
  wisdom: "wis",
  charisma: "cha",
};

const CONDITIONS = ["blinded", "charmed", "deafened", "frightened", "grappled", "incapacitated", "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"];
const DAMAGE_TYPES = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];

function feet(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const m = /(\d+)\s*(?:ft|feet|foot)/i.exec(text);
  return m ? Number(m[1]) : undefined;
}

function size(text: string | undefined): Size {
  const s = (text ?? "medium").toLowerCase().split(" ")[0];
  return (["tiny", "small", "medium", "large", "huge", "gargantuan"].includes(s) ? s : "medium") as Size;
}

function stripPrefix(index: string, prefix: string): string {
  return index.startsWith(prefix) ? index.slice(prefix.length) : index;
}

const SINGULAR: Record<string, string> = {
  longswords: "longsword",
  rapiers: "rapier",
  scimitars: "scimitar",
  shortswords: "shortsword",
  whips: "whip",
  "hand-crossbows": "hand-crossbow",
};

/** SRD proficiency index -> Tavernlight proficiency key. */
function proficiencyKey(index: string): string[] {
  if (index.startsWith("saving-throw-")) return [`save:${stripPrefix(index, "saving-throw-")}`];
  if (index.startsWith("skill-")) return [`skill:${stripPrefix(index, "skill-")}`];
  if (index.startsWith("tool-")) return [`tool:${stripPrefix(index, "tool-")}`];
  switch (index) {
    case "all-armor":
      return ["armor:light", "armor:medium", "armor:heavy"];
    case "light-armor":
      return ["armor:light"];
    case "medium-armor":
      return ["armor:medium"];
    case "heavy-armor":
      return ["armor:heavy"];
    case "shields":
      return ["armor:shield"];
    case "simple-weapons":
      return ["weapon:simple"];
    case "martial-weapons":
      return ["weapon:martial"];
  }
  if (SINGULAR[index]) return [`weapon:${SINGULAR[index]}`];
  return [`tool:${index}`];
}

function money(count: number, unit: string): number {
  const factor: Record<string, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };
  return count * (factor[unit] ?? 1);
}

function costInCopper(cost: any): number {
  if (!cost) return 0;
  const factor: Record<string, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };
  return Math.round(cost.quantity * (factor[cost.unit] ?? 100));
}

function durationOf(text: string | undefined): Duration | undefined {
  if (!text) return undefined;
  const t = text.toLowerCase();
  if (t.includes("instantaneous")) return { type: "instant" };
  const m = /(\d+)\s*(round|minute|hour|day)/.exec(t);
  if (!m) return undefined;
  const n = Number(m[1]);
  const rounds = m[2] === "round" ? n : m[2] === "minute" ? n * 10 : m[2] === "hour" ? n * 600 : n * 14400;
  return { type: "rounds", value: rounds };
}

function activationOf(castingTime: string | undefined): ActionDef["activation"] {
  const t = (castingTime ?? "").toLowerCase();
  if (t.startsWith("bonus")) return "bonus";
  if (t.startsWith("reaction")) return "reaction";
  if (t.startsWith("action")) return "action";
  return "other";
}

function areaOf(text: string): AreaDef | undefined {
  const line = /(\d+)[- ]foot[- ]long,?\s*(\d+)[- ]foot[- ]?wide Line/i.exec(text) ?? /Line (?:that is )?(\d+) feet long and (\d+) feet wide/i.exec(text);
  if (line) return { shape: "line", size: Number(line[1]), width: Number(line[2]) };
  const m = /(\d+)-foot(?:-radius|-tall|-high)?,?\s*(?:[\w-]+\s+)?(Sphere|Cone|Cube|Cylinder|Emanation)/i.exec(text);
  if (m) return { shape: m[2].toLowerCase() as AreaDef["shape"], size: Number(m[1]) };
  return undefined;
}

function conditionsIn(text: string): string[] {
  const found = new Set<string>();
  const re = /(?:has|have|gains?|is) the (\w+) condition/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const c = m[1].toLowerCase();
    if (CONDITIONS.includes(c)) found.add(c);
  }
  return [...found];
}

function countWord(word: string): number {
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, ten: 10, twelve: 12 };
  return words[word.toLowerCase()] ?? (Number(word) || 1);
}

function normalizeDice(dice: string): string {
  return dice.replace(/\s+/g, "").replace(/\+/g, " + ").replace(/(?<=\d)-(?=\d)/g, " - ");
}

// ---------------------------------------------------------------------------

function spellAction(s: any, override: Partial<ActionDef> | undefined): ActionDef | undefined {
  const base: Pick<ActionDef, "key" | "name" | "source" | "level" | "concentration" | "activation" | "description"> = {
    key: `spell:${s.index}`,
    name: s.name,
    source: "spell",
    level: s.level,
    concentration: s.concentration,
    activation: activationOf(s.casting_time),
    description: s.description,
  };
  const range = /touch/i.test(s.range) ? { touch: true } : /^self/i.test(s.range) ? { self: true } : { normal: feet(s.range) };
  const duration = durationOf(s.duration);
  if (override) {
    return { range, duration, ...base, cost: s.level > 0 ? { slotLevel: s.level } : undefined, ...override } as ActionDef;
  }

  const text: string = s.description ?? "";
  const area = areaOf(text);
  const saveMatch = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(text);
  const dmg = s.damage?.damage_at_slot_level?.[String(s.level)] ?? s.damage?.damage_at_character_level?.["1"] ?? null;
  const damageType = s.damage?.damage_type?.index;
  const healMatch = /regains? (?:a number of )?Hit Points equal to (\d+d\d+)( plus your spellcasting ability modifier)?/i.exec(text);
  const conditions = conditionsIn(text);
  const upcastDamage = /(?:damage|healing) increases by (\d+d\d+) for each (?:spell )?slot level above/i.exec(`${s.higher_level ?? ""} ${text}`);

  if (!s.attack_type && !saveMatch && !dmg && !healMatch && conditions.length === 0) return undefined;

  const damageEffects: Effect[] = dmg && damageType ? [{ type: "damage", dice: normalizeDice(dmg), damageType }] : [];
  const conditionEffects: Effect[] = conditions.map((c) => ({ type: "condition", condition: c, repeatSave: /repeats? the save/i.test(text) || undefined }));
  const multi = /up to (two|three|four|five|six|\d+) (?:creatures|targets)/i.exec(text);
  const targeting: ActionDef["targeting"] = area
    ? { type: "area", area }
    : range.self && !s.attack_type && !saveMatch
      ? { type: "self" }
      : multi
        ? { type: "multiple", count: countWord(multi[1]) }
        : { type: "single" };

  const action: ActionDef = {
    ...base,
    cost: s.level > 0 ? { slotLevel: s.level } : undefined,
    range,
    targeting,
    resolution: { type: "auto" },
    duration,
    cantripScaling: s.level === 0 && damageEffects.length > 0 ? true : undefined,
  };
  if (upcastDamage) {
    if (healMatch) action.upcast = { heal: upcastDamage[1] };
    else if (damageEffects.length) action.upcast = { damage: upcastDamage[1] };
  }
  if (s.attack_type) {
    action.resolution = { type: "attack", bonus: "@spell_attack", kind: s.attack_type === "melee" ? "melee" : "ranged" };
    action.onHit = [...damageEffects, ...conditionEffects];
  } else if (saveMatch) {
    action.resolution = { type: "save", ability: ABILITY_BY_NAME[saveMatch[1].toLowerCase()], dc: "@spell_dc" };
    action.onFail = damageEffects.length || conditionEffects.length ? [...damageEffects, ...conditionEffects] : [{ type: "custom", name: s.name, description: "Failed the saving throw: see the spell description." }];
    action.onSuccess = /half as much damage|half damage/i.test(text) ? [{ type: "halfDamage" }] : [];
  } else if (healMatch) {
    action.effects = [{ type: "heal", dice: `${healMatch[1]}${healMatch[2] ? " + @spell_mod" : ""}` }];
  } else {
    action.effects = [...damageEffects, ...conditionEffects];
  }
  return action;
}

function monsterActions(m: any): ActionDef[] {
  const actions: ActionDef[] = [];
  for (const a of m.actions ?? []) {
    if (a.attack_bonus === undefined && !a.dc) continue;
    const text: string = a.desc ?? "";
    const damages: any[] = a.damage ?? [];
    const flat = damages.flatMap((d: any) => (d.damage_dice ? [d] : d.from?.options ?? []));
    const hitEffects: Effect[] = [];
    flat.forEach((d: any, i: number) => {
      if (!d.damage_dice || !d.damage_type) return;
      if (i > 0) {
        // Skip conditional extra damage ("plus 2 (1d4) ... if the attack roll had Advantage").
        const idx = text.indexOf(`(${d.damage_dice.replace("+", " + ")})`);
        const sentence = idx >= 0 ? text.slice(idx, text.indexOf(".", idx) === -1 ? undefined : text.indexOf(".", idx)) : "";
        if (/\bif\b|\bwhile\b|\bagainst\b/i.test(sentence)) return;
      }
      hitEffects.push({ type: "damage", dice: normalizeDice(d.damage_dice), damageType: d.damage_type.index });
    });
    const conditions: Effect[] = conditionsIn(text).map((c) => ({ type: "condition", condition: c }));
    const key = `monster:${m.index}:${a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const recharge = a.usage?.type === "recharge on roll" ? ` (Recharge ${a.usage.min_value}-6)` : a.usage?.times ? ` (${a.usage.times}/${a.usage.type})` : "";
    if (a.attack_bonus !== undefined) {
      const ranged = /^Ranged/i.test(text);
      const reach = /reach (\d+) ft/i.exec(text);
      const rangeMatch = /range (\d+)(?:\/(\d+))? ft/i.exec(text);
      actions.push({
        key,
        name: a.name + recharge,
        source: "monster",
        activation: "action",
        range: { reach: reach ? Number(reach[1]) : undefined, normal: rangeMatch ? Number(rangeMatch[1]) : undefined, long: rangeMatch?.[2] ? Number(rangeMatch[2]) : undefined },
        targeting: { type: "single" },
        resolution: { type: "attack", bonus: a.attack_bonus, kind: ranged ? "ranged" : "melee" },
        onHit: [...hitEffects, ...conditions],
        description: text,
      });
    } else if (a.dc) {
      const area = areaOf(text);
      actions.push({
        key,
        name: a.name + recharge,
        source: "monster",
        activation: "action",
        targeting: area ? { type: "area", area } : /each creature/i.test(text) ? { type: "multiple", count: 10 } : { type: "single" },
        resolution: { type: "save", ability: a.dc.dc_type.index as Ability, dc: a.dc.dc_value },
        onFail: [...hitEffects, ...conditions],
        onSuccess: a.dc.success_type === "half" ? [{ type: "halfDamage" }] : [],
        description: text,
      });
    }
  }
  return actions;
}

function damageList(values: string[]): string[] {
  const out = new Set<string>();
  for (const v of values) for (const t of DAMAGE_TYPES) if (v.toLowerCase().includes(t)) out.add(t);
  return [...out];
}

// ---------------------------------------------------------------------------

export function transform(raw: RawSrd, overrides: Overrides, sourceVersion: string): RulesData {
  const file = (name: string) => raw[`5e-SRD-${name}.json`] ?? [];
  const equipmentCategories = new Map<string, any>(file("Equipment-Categories").map((c: any) => [c.index, c]));
  const equipmentIndex = new Map<string, any>(file("Equipment").map((e: any) => [e.index, e]));
  const traitIndex = new Map<string, any>(file("Traits").map((t: any) => [t.index, t]));
  const featureIndex = new Map<string, any>(file("Features").map((f: any) => [f.index, f]));

  // --- Simple lists ---------------------------------------------------------
  const skills: SkillDef[] = file("Skills").map((s: any) => ({ key: s.index, name: s.name, ability: s.ability_score.index, description: s.description ?? "" }));
  const conditions: ConditionDef[] = file("Conditions").map((c: any) => ({ key: c.index, name: c.name, description: c.description ?? "" }));
  const damageTypes: DamageTypeDef[] = file("Damage-Types").map((d: any) => ({ key: d.index, name: d.name }));

  // --- Items ------------------------------------------------------------------
  const items: ItemDef[] = file("Equipment").map((e: any) => {
    const cats: string[] = e.equipment_categories.map((c: any) => c.index);
    let category: ItemCategory = "gear";
    if (cats.includes("weapons")) category = "weapon";
    else if (cats.includes("shields")) category = "shield";
    else if (cats.includes("armor")) category = "armor";
    else if (cats.includes("ammunition")) category = "ammunition";
    else if (e.contents?.length) category = "pack";
    else if (cats.some((c) => c.endsWith("tools") || c === "musical-instruments" || c === "gaming-sets")) category = "tool";
    else if (cats.some((c) => c.endsWith("foci") || c === "holy-symbols")) category = "focus";
    const item: ItemDef = { key: e.index, name: e.name, category, cost: costInCopper(e.cost), weight: e.weight ?? 0, description: e.description };
    if (category === "weapon" && e.damage) {
      item.weapon = {
        category: cats.includes("martial-weapons") ? "martial" : "simple",
        kind: cats.includes("ranged-weapons") ? "ranged" : "melee",
        damage: e.damage.damage_dice,
        damageType: e.damage.damage_type.index,
        versatile: e.two_handed_damage?.damage_dice,
        properties: (e.properties ?? []).map((p: any) => p.index),
        range: e.range?.normal && cats.includes("ranged-weapons") ? { normal: e.range.normal, long: e.range.long } : e.throw_range ? { normal: e.throw_range.normal, long: e.throw_range.long } : undefined,
        mastery: e.mastery?.name,
      };
    }
    if ((category === "armor" || category === "shield") && e.armor_class) {
      item.armor = {
        category: category === "shield" ? "shield" : cats.includes("heavy-armor") ? "heavy" : cats.includes("medium-armor") ? "medium" : "light",
        base: e.armor_class.base,
        dexBonus: !!e.armor_class.dex_bonus,
        maxDexBonus: e.armor_class.max_bonus ?? undefined,
        strengthMinimum: e.str_minimum || undefined,
        stealthDisadvantage: !!e.stealth_disadvantage,
      };
    }
    if (e.contents?.length) item.contents = e.contents.map((c: any) => ({ item: c.item.index, quantity: c.quantity }));
    return item;
  });

  const firstOfCategory = (index: string): string | undefined => equipmentCategories.get(index)?.equipment?.find((e: any) => equipmentIndex.has(e.index))?.index;

  function equipmentOptions(optionSets: any[] | undefined): EquipmentOption[] {
    const set = optionSets?.[0]?.from?.options ?? [];
    return set.map((option: any, i: number): EquipmentOption => {
      const grants: EquipmentGrant[] = [];
      let gold = 0;
      const visit = (o: any) => {
        switch (o.option_type) {
          case "multiple":
            o.items.forEach(visit);
            break;
          case "money":
            gold += money(o.count, o.unit);
            break;
          case "counted_reference": {
            const isCategory = String(o.of.url ?? "").includes("equipment-categories");
            const key = isCategory ? firstOfCategory(o.of.index) : o.of.index;
            if (key) grants.push({ item: key, quantity: o.count ?? 1 });
            break;
          }
          case "choice": {
            const key = firstOfCategory(o.choice?.from?.equipment_category?.index);
            if (key) grants.push({ item: key, quantity: 1 });
            break;
          }
        }
      };
      visit(option);
      const names = grants.map((g) => `${g.quantity > 1 ? `${g.quantity} × ` : ""}${equipmentIndex.get(g.item)?.name ?? g.item}`);
      if (gold) names.push(`${gold} GP`);
      return { key: String.fromCharCode(97 + i), label: names.join(", "), items: grants, gold };
    });
  }

  // --- Feats ------------------------------------------------------------------
  const feats: FeatDef[] = file("Feats").map((f: any) => ({
    key: f.index,
    name: f.name,
    category: f.type,
    description: f.description ?? "",
    ...(overrides.feats[f.index] ?? {}),
  }));

  // --- Spells -----------------------------------------------------------------
  const spells: SpellDef[] = file("Spells").map((s: any) => ({
    key: s.index,
    name: s.name,
    level: s.level,
    school: s.school?.name ?? "",
    classes: (s.classes ?? []).map((c: any) => c.index),
    castingTime: s.casting_time,
    range: s.range,
    components: s.components ?? [],
    material: s.material,
    duration: s.duration,
    concentration: !!s.concentration,
    ritual: !!s.ritual,
    description: s.description ?? "",
    higherLevel: s.higher_level,
    action: spellAction(s, overrides.spells[s.index]),
  }));
  const spellKeys = new Set(spells.map((s) => s.key));

  // --- Species ----------------------------------------------------------------
  const traitFeature = (index: string, extra: any = {}): FeatureDef => {
    const t = traitIndex.get(index);
    return { key: index, name: t?.name ?? index, level: 1, description: t?.description ?? "", ...(overrides.species.traits?.[index] ?? {}), ...extra };
  };
  const lineagePlaceholders = new Set(["elven-lineage", "gnomish-lineage", "giant-ancestry", "fiendish-legacy"]);
  const species: SpeciesDef[] = file("Species").map((s: any) => {
    const o = overrides.species.species?.[s.index] ?? {};
    const lineages: LineageDef[] = file("Subspecies")
      .filter((sub: any) => sub.species.index === s.index)
      .map((sub: any) => {
        const lo = overrides.species.lineages?.[sub.index] ?? {};
        const features: FeatureDef[] = (sub.traits ?? []).map((t: any) => traitFeature(t.index));
        const effects: PassiveEffect[] = [...(lo.effects ?? [])];
        if (s.index === "dragonborn" && sub.damage_type) {
          const type = sub.damage_type.index;
          effects.push({ type: "resistance", damageType: type });
          effects.push({ type: "resource", key: "breath-weapon", name: "Breath Weapon", uses: "prof", recharge: "long" });
          for (const area of overrides.species.breathWeapon.areas as AreaDef[]) {
            effects.push({
              type: "action",
              action: {
                key: `breath-weapon-${area.shape}`,
                name: `Breath Weapon (${area.shape === "cone" ? "15-ft Cone" : "30-ft Line"})`,
                source: "feature",
                activation: "action",
                cost: { resource: "breath-weapon", amount: 1 },
                targeting: { type: "area", area },
                resolution: { type: "save", ability: "dex", dc: "8 + @con + @prof" },
                onFail: [{ type: "damage", dice: "1d10", damageType: type }],
                onSuccess: [{ type: "halfDamage" }],
                cantripScaling: true,
              },
            });
          }
        }
        return {
          key: sub.index,
          name: sub.name,
          description: features.map((f) => `${f.name}: ${f.description}`).join("\n\n"),
          features,
          effects,
          spells: (lo.spells ?? []).filter((x: any) => spellKeys.has(x.spell)),
        };
      });
    const sizes: Size[] = o.sizes ?? (s.size ? String(s.size).split(/ or /i).map((x: string) => size(x)) : ["medium"]);
    return {
      key: s.index,
      name: s.name,
      creatureType: (s.type ?? "Humanoid").toLowerCase(),
      sizes,
      speed: o.speed ?? s.speed ?? 30,
      features: (s.traits ?? []).filter((t: any) => !lineagePlaceholders.has(t.index)).map((t: any) => traitFeature(t.index)),
      lineages,
      lineageLabel: o.lineageLabel,
    };
  });

  // --- Backgrounds --------------------------------------------------------------
  const backgrounds: BackgroundDef[] = file("Backgrounds").map((b: any) => {
    const profs: string[] = (b.proficiencies ?? []).map((p: any) => p.index);
    return {
      key: b.index,
      name: b.name,
      abilities: b.ability_scores.map((a: any) => a.index),
      feat: b.feat.index,
      featOption: overrides.backgrounds[b.index]?.featOption ?? (b.feat.note ? String(b.feat.note).toLowerCase() : undefined),
      skills: profs.filter((p) => p.startsWith("skill-")).map((p) => stripPrefix(p, "skill-")),
      tools: profs.filter((p) => !p.startsWith("skill-")).map((p) => stripPrefix(p, "tool-")),
      equipment: equipmentOptions(b.equipment_options),
    };
  });

  // --- Classes --------------------------------------------------------------------
  const cf = overrides.classFeatures;
  const invocations: OptionDef[] = cf.invocations ?? [];
  const resolveChoices = (choices: ChoiceDef[] | undefined): ChoiceDef[] | undefined =>
    choices?.map((c: any) => (c.kind === "option" && c.from === "$invocations" ? { ...c, from: invocations } : c));
  const featureDef = (index: string, level: number): FeatureDef => {
    const f = featureIndex.get(index);
    const o = cf.features[index] ?? {};
    return { key: index, name: f?.name ?? index, level, description: f?.description ?? "", effects: o.effects, choices: resolveChoices(o.choices) };
  };

  const levelRows = file("Levels");
  const classes: ClassDef[] = file("Classes").map((c: any) => {
    const rows = levelRows.filter((r: any) => r.class.index === c.index && !r.subclass).sort((a: any, b: any) => a.level - b.level);
    const firstLevel = new Map<string, number>();
    const levels: ClassLevelDef[] = rows.map((r: any) => {
      const features: string[] = (r.features ?? []).map((f: any) => f.index);
      for (const f of features) if (!firstLevel.has(f)) firstLevel.set(f, r.level);
      const classSpecific: Record<string, number | string> = {};
      for (const [k, v] of Object.entries(r.class_specific ?? {})) {
        if (v && typeof v === "object" && "dice_count" in (v as any)) classSpecific[k] = `${(v as any).dice_count}d${(v as any).dice_value}`;
        else if (typeof v === "number" || typeof v === "string") classSpecific[k] = v;
      }
      if (typeof classSpecific.martial_arts_die === "number") classSpecific.martial_arts = `1d${classSpecific.martial_arts_die}`;
      for (const [k, rule] of Object.entries<any>(cf.classSpecific?.[c.index] ?? {})) {
        if (rule?.perLevel) classSpecific[k] = rule.perLevel * r.level;
      }
      const sc = r.spellcasting;
      return {
        level: r.level,
        proficiencyBonus: r.prof_bonus,
        features,
        cantrips: sc?.cantrips_known,
        preparedSpells: sc?.prepared_spells ?? sc?.spells_known,
        slots: sc ? [0, ...Array.from({ length: 9 }, (_, i) => sc[`spell_slots_level_${i + 1}`] ?? 0)] : undefined,
        classSpecific,
      };
    });
    const features: FeatureDef[] = [...firstLevel.entries()].map(([index, level]) => featureDef(index, level));
    for (const extra of cf.extraFeatures?.[c.index] ?? []) features.push({ ...extra, choices: resolveChoices(extra.choices) });
    const skillChoice = (c.proficiency_choices ?? []).find((pc: any) => pc.from?.options?.some((o: any) => o.item?.index?.startsWith("skill-")));
    const subclassRow = rows.find((r: any) => (r.features ?? []).some((f: any) => f.index === `${c.index}-subclass`));
    return {
      key: c.index,
      name: c.name,
      hitDie: c.hit_die,
      primaryAbilities: (c.primary_ability?.ability_scores ?? []).map((a: any) => a.index),
      savingThrows: c.saving_throws.map((s: any) => s.index),
      proficiencies: [...new Set(c.proficiencies.filter((p: any) => !p.index.startsWith("saving-throw-")).flatMap((p: any) => proficiencyKey(p.index)))] as string[],
      skillChoices: {
        count: skillChoice?.choose ?? 2,
        from: (skillChoice?.from?.options ?? []).map((o: any) => stripPrefix(o.item.index, "skill-")),
      },
      equipment: equipmentOptions(c.starting_equipment_options),
      spellcasting: c.spellcasting ? { ability: c.spellcasting.spellcasting_ability.index, list: c.index, pactMagic: c.index === "warlock" || undefined } : undefined,
      subclassLevel: subclassRow?.level ?? 3,
      levels,
      features,
    };
  });

  const subclasses: SubclassDef[] = file("Subclasses").map((s: any) => {
    const features: FeatureDef[] = [...featureIndex.values()]
      .filter((f: any) => f.subclass?.index === s.index)
      .map((f: any) => featureDef(f.index, Number(String(f.level?.index ?? "").split("-").pop()) || 3))
      .sort((a, b) => a.level - b.level);
    return {
      key: s.index,
      name: s.name,
      class: s.class.index,
      summary: s.summary ?? "",
      features,
      spells: (cf.subclassSpells?.[s.index] ?? []).filter((x: any) => spellKeys.has(x.spell)),
    };
  });

  // --- Monsters -----------------------------------------------------------------
  const monsters: MonsterDef[] = file("Monsters").map((m: any) => {
    const saves: Partial<Record<Ability, number>> = {};
    const skillsOf: Record<string, number> = {};
    for (const p of m.proficiencies ?? []) {
      const idx: string = p.proficiency.index;
      if (idx.startsWith("saving-throw-")) saves[stripPrefix(idx, "saving-throw-") as Ability] = p.value;
      else if (idx.startsWith("skill-")) skillsOf[stripPrefix(idx, "skill-")] = p.value;
    }
    const speed: Record<string, number> = {};
    for (const [k, v] of Object.entries(m.speed ?? {})) {
      const f = feet(String(v));
      if (f !== undefined) speed[k] = f;
    }
    const senses: Record<string, number> = {};
    for (const [k, v] of Object.entries(m.senses ?? {})) {
      if (k === "passive_perception") continue;
      const f = feet(String(v));
      if (f !== undefined) senses[k] = f;
    }
    const texts: MonsterDef["actionTexts"] = [
      ...(m.actions ?? []).map((a: any) => ({ name: a.name, description: a.desc, kind: "action" as const })),
      ...(m.bonus_actions ?? []).map((a: any) => ({ name: a.name, description: a.desc, kind: "bonus" as const })),
      ...(m.reactions ?? []).map((a: any) => ({ name: a.name, description: a.desc, kind: "reaction" as const })),
      ...(m.legendary_actions ?? []).map((a: any) => ({ name: a.name, description: a.desc, kind: "legendary" as const })),
    ];
    return {
      key: m.index,
      name: m.name,
      size: size(m.size),
      type: String(m.type ?? "").toLowerCase(),
      alignment: m.alignment ?? "",
      ac: m.armor_class?.[0]?.value ?? 10,
      acNote: (m.armor_class?.[0]?.armor ?? []).map((a: any) => a.name).join(", ") || undefined,
      hp: m.hit_points,
      hitDice: m.hit_points_roll ?? m.hit_dice,
      speed,
      abilities: { str: m.strength, dex: m.dexterity, con: m.constitution, int: m.intelligence, wis: m.wisdom, cha: m.charisma },
      saves,
      skills: skillsOf,
      resistances: damageList(m.damage_resistances ?? []),
      vulnerabilities: damageList(m.damage_vulnerabilities ?? []),
      immunities: damageList(m.damage_immunities ?? []),
      conditionImmunities: (m.condition_immunities ?? []).map((c: any) => c.index),
      senses,
      passivePerception: m.senses?.passive_perception ?? 10,
      languages: m.languages ?? "",
      cr: m.challenge_rating,
      xp: m.xp,
      proficiencyBonus: m.proficiency_bonus ?? 2,
      traits: (m.special_abilities ?? []).map((t: any) => ({ name: t.name, description: t.desc })),
      actions: monsterActions(m),
      actionTexts: texts,
    };
  });

  const magicItems: MagicItemDef[] = file("Magic-Items").map((mi: any) => ({
    key: mi.index,
    name: mi.name,
    category: mi.equipment_category?.name ?? "",
    rarity: mi.rarity?.name ?? "",
    attunement: !!mi.attunement,
    description: Array.isArray(mi.desc) ? mi.desc.join("\n") : mi.desc ?? "",
  }));

  const { $comment: _ignored, ...encounters } = overrides.encounters;

  return {
    version: {
      source: "5e-bits/5e-database (SRD 5.2)",
      sourceVersion,
      formatVersion: FORMAT_VERSION,
      importedAt: new Date().toISOString(),
      attribution: SRD_ATTRIBUTION,
    },
    skills,
    conditions,
    damageTypes,
    species,
    backgrounds,
    classes,
    subclasses,
    feats,
    spells,
    items,
    magicItems,
    monsters,
    encounters,
  };
}
