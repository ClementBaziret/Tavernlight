import type { RulesIndex } from "../rules";
import type { ChoiceDef, FeatDef, FeatureDef, PassiveEffect } from "../rules/types";
import type { CharacterBuild } from "./types";

export interface ActiveFeature {
  feature: FeatureDef;
  /** Human readable origin, e.g. "Fighter 1", "Elf", "Alert (feat)". */
  source: string;
  /** Prefix used to namespace the ids of this feature's choices. */
  scope: string;
}

export interface ScopedChoice {
  choice: ChoiceDef;
  /** Unique id: `${scope}:${choice.id}`. */
  id: string;
  source: string;
}

function featAsFeature(feat: FeatDef, level: number): FeatureDef {
  return {
    key: feat.key,
    name: feat.name,
    level,
    description: feat.description,
    effects: feat.effects,
    choices: feat.choices,
  };
}

/** Feats owned by the character: origin feat, chosen feats, fighting styles... */
export function ownedFeats(build: CharacterBuild, rules: RulesIndex, upToLevel = build.level): { feat: FeatDef; scope: string; source: string; level: number }[] {
  const result: { feat: FeatDef; scope: string; source: string; level: number }[] = [];
  const background = rules.background(build.background);
  if (background) {
    const feat = rules.feat(background.feat);
    if (feat) result.push({ feat, scope: `background:${background.key}:feat`, source: `${background.name} (background)`, level: 1 });
  }
  for (const record of build.levels) {
    if (record.level > upToLevel) continue;
    if (record.asi?.type === "feat") {
      const feat = rules.feat(record.asi.feat);
      if (feat) result.push({ feat, scope: `level:${record.level}:feat`, source: `Level ${record.level} feat`, level: record.level });
    }
  }
  return result;
}

/**
 * Lists every feature the character has at its level. Features may grant
 * feats through "feat" choices (fighting styles, Versatile), which are
 * followed recursively.
 */
export function activeFeatures(build: CharacterBuild, rules: RulesIndex, upToLevel = build.level): ActiveFeature[] {
  const features: ActiveFeature[] = [];
  const species = rules.species(build.species);
  if (species) {
    for (const f of species.features) features.push({ feature: f, source: species.name, scope: `species:${species.key}:${f.key}` });
    const lineage = species.lineages.find((l) => l.key === build.lineage);
    if (lineage) {
      for (const f of lineage.features) features.push({ feature: f, source: lineage.name, scope: `lineage:${lineage.key}:${f.key}` });
    }
  }
  const cls = rules.class(build.class);
  if (cls) {
    for (const f of cls.features) {
      if (f.level <= upToLevel) features.push({ feature: f, source: `${cls.name} ${f.level}`, scope: `class:${cls.key}:${f.key}` });
    }
  }
  const subclass = build.subclass ? rules.subclass(build.subclass) : undefined;
  if (subclass && subclass.class === build.class) {
    for (const f of subclass.features) {
      if (f.level <= upToLevel) features.push({ feature: f, source: `${subclass.name} ${f.level}`, scope: `subclass:${subclass.key}:${f.key}` });
    }
  }
  for (const owned of ownedFeats(build, rules, upToLevel)) {
    features.push({ feature: featAsFeature(owned.feat, owned.level), source: owned.source, scope: owned.scope });
  }

  // Feats granted by "feat" choices (fighting style, Versatile...).
  const seen = new Set<string>();
  for (let i = 0; i < features.length; i++) {
    const active = features[i];
    for (const choice of active.feature.choices ?? []) {
      if (choice.kind !== "feat") continue;
      const id = `${active.scope}:${choice.id}`;
      for (const key of build.choices[id] ?? []) {
        const feat = rules.feat(key);
        if (!feat || seen.has(`${id}:${key}`)) continue;
        seen.add(`${id}:${key}`);
        features.push({ feature: featAsFeature(feat, active.feature.level), source: `${feat.name} (feat)`, scope: `${id}:${key}` });
      }
    }
  }
  return features;
}

export function collectChoices(build: CharacterBuild, rules: RulesIndex, upToLevel = build.level): ScopedChoice[] {
  const result: ScopedChoice[] = [];
  const background = rules.background(build.background);
  for (const active of activeFeatures(build, rules, upToLevel)) {
    for (const choice of active.feature.choices ?? []) {
      if (choice.id === "list" && active.scope.startsWith("background:") && background?.featOption) continue;
      let resolved = choice;
      // Magic Initiate takes its spell list from the background ("$option").
      if (choice.kind === "spells" && choice.spellList === "$option") {
        const list = active.scope.startsWith("background:") ? background?.featOption : build.choices[`${active.scope}:list`]?.[0];
        resolved = { ...choice, spellList: list ?? "wizard" };
      }
      result.push({ choice: resolved, id: `${active.scope}:${choice.id}`, source: active.source });
    }
  }
  return result;
}

export function passiveEffects(build: CharacterBuild, rules: RulesIndex): { effect: PassiveEffect; source: string }[] {
  const result: { effect: PassiveEffect; source: string }[] = [];
  for (const active of activeFeatures(build, rules)) {
    for (const effect of active.feature.effects ?? []) result.push({ effect, source: active.feature.name });
    // Selected options may carry effects (Divine Order: Protector...).
    for (const choice of active.feature.choices ?? []) {
      if (choice.kind !== "option") continue;
      const selected = build.choices[`${active.scope}:${choice.id}`] ?? [];
      for (const option of choice.from) {
        if (!selected.includes(option.key)) continue;
        for (const effect of option.effects ?? []) result.push({ effect, source: option.name });
      }
    }
  }
  const species = rules.species(build.species);
  const lineage = species?.lineages.find((l) => l.key === build.lineage);
  for (const effect of lineage?.effects ?? []) result.push({ effect, source: lineage!.name });
  return result;
}
