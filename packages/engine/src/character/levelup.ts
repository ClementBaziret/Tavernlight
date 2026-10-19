import type { RulesIndex } from "../rules";
import type { ClassDef, FeatureDef } from "../rules/types";
import { derive, emptyState } from "./derive";
import { collectChoices, type ScopedChoice } from "./features";
import type { AsiChoice, CharacterBuild } from "./types";

/** Class levels that grant an Ability Score Improvement (or a feat). */
export function asiLevels(cls: ClassDef): number[] {
  return cls.levels.filter((l) => l.features.some((f) => f.endsWith("ability-score-improvement"))).map((l) => l.level);
}

export interface LevelUpPreview {
  newLevel: number;
  hitDie: number;
  averageHp: number;
  conModifier: number;
  features: FeatureDef[];
  /** True when the new level grants an Ability Score Improvement or a feat. */
  asi: boolean;
  /** True when a subclass must be chosen at this level. */
  needsSubclass: boolean;
  subclassOptions: { key: string; name: string; summary: string }[];
  /** Choices that appear at the new level (given the selected subclass). */
  newChoices: ScopedChoice[];
  cantrips: { before: number; after: number };
  prepared: { before: number; after: number };
  slots: { before: number[]; after: number[] };
  maxSpellLevel: number;
}

export function levelUpPreview(build: CharacterBuild, rules: RulesIndex, subclass?: string): LevelUpPreview | null {
  const cls = rules.class(build.class);
  if (!cls || build.level >= 20) return null;
  const newLevel = build.level + 1;
  const before = derive(build, emptyState(), rules);
  const nextBuild: CharacterBuild = { ...build, level: newLevel, subclass: build.subclass ?? subclass };
  const after = derive(nextBuild, emptyState(), rules);
  const subclassDef = nextBuild.subclass ? rules.subclass(nextBuild.subclass) : undefined;
  const features = [
    ...cls.features.filter((f) => f.level === newLevel),
    ...(subclassDef?.features.filter((f) => f.level === newLevel) ?? []),
  ];
  const oldChoiceIds = new Set(collectChoices(build, rules).map((c) => c.id));
  const newChoices = collectChoices(nextBuild, rules).filter((c) => !oldChoiceIds.has(c.id));
  return {
    newLevel,
    hitDie: cls.hitDie,
    averageHp: Math.floor(cls.hitDie / 2) + 1,
    conModifier: after.abilities.con.modifier,
    features,
    asi: asiLevels(cls).includes(newLevel),
    needsSubclass: newLevel === cls.subclassLevel && !build.subclass,
    subclassOptions: rules.subclassesOf(cls.key).map((s) => ({ key: s.key, name: s.name, summary: s.summary })),
    newChoices,
    cantrips: { before: before.spellcasting?.cantripsKnown ?? 0, after: after.spellcasting?.cantripsKnown ?? 0 },
    prepared: { before: before.spellcasting?.preparedMax ?? 0, after: after.spellcasting?.preparedMax ?? 0 },
    slots: { before: before.spellcasting?.slots ?? [], after: after.spellcasting?.slots ?? [] },
    maxSpellLevel: after.spellcasting?.maxSpellLevel ?? 0,
  };
}

export interface LevelUpInput {
  hp: { method: "average" | "roll"; value: number };
  subclass?: string;
  asi?: AsiChoice;
  choices?: Record<string, string[]>;
  /** Full replacement lists (new cantrips / prepared spells may be added). */
  cantrips?: string[];
  preparedSpells?: string[];
}

/** Returns the build at the next level. Validate the result with validateBuild. */
export function applyLevelUp(build: CharacterBuild, input: LevelUpInput): CharacterBuild {
  const level = build.level + 1;
  return {
    ...build,
    level,
    subclass: build.subclass ?? input.subclass,
    levels: [...build.levels.filter((l) => l.level !== level), { level, hp: input.hp, asi: input.asi }].sort((a, b) => a.level - b.level),
    choices: { ...build.choices, ...(input.choices ?? {}) },
    cantrips: input.cantrips ?? build.cantrips,
    preparedSpells: input.preparedSpells ?? build.preparedSpells,
  };
}
