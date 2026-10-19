import type { RulesIndex } from "../rules";
import { ABILITIES, type Ability } from "../rules/types";
import { ABILITY_MAX, ABILITY_NAMES, POINT_BUY_BUDGET, STANDARD_ARRAY, finalScores, pointBuyCost } from "./abilities";
import { abilityScores, derive, emptyState, proficiencySet } from "./derive";
import { collectChoices } from "./features";
import { asiLevels } from "./levelup";
import type { CharacterBuild, ValidationIssue } from "./types";

function sameMultiset(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.every((v, i) => v === y[i]);
}

function hasDuplicates(list: string[]): boolean {
  return new Set(list).size !== list.length;
}

export type BuildStep = "species" | "class" | "background" | "abilities" | "skills" | "equipment" | "spells" | "levels";

/** Maps an issue path to the wizard step that can fix it. */
export function stepOf(issue: ValidationIssue): BuildStep {
  const p = issue.path;
  if (p.startsWith("species") || p.startsWith("lineage") || p.startsWith("size") || p.startsWith("choices.species") || p.startsWith("choices.lineage")) return "species";
  if (p.startsWith("background") || p.startsWith("choices.background")) return "background";
  if (p.startsWith("abilit") || p.startsWith("baseAbilities")) return "abilities";
  if (p.startsWith("classSkills") || p.startsWith("choices.class") || p.startsWith("choices.subclass")) return "skills";
  if (p.startsWith("equipment")) return "equipment";
  if (p.startsWith("cantrips") || p.startsWith("preparedSpells")) return "spells";
  if (p.startsWith("levels") || p.startsWith("choices.level") || p.startsWith("subclass")) return "levels";
  return "class";
}

/**
 * Checks every choice of a build against the rules. Returns an empty list
 * when the character is valid.
 */
export function validateBuild(build: CharacterBuild, rules: RulesIndex): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (path: string, code: string, message: string) => issues.push({ path, code, message, severity: "error" });
  const warning = (path: string, code: string, message: string) => issues.push({ path, code, message, severity: "warning" });

  if (!build.name?.trim()) error("name", "required", "Give your character a name.");
  if (!Number.isInteger(build.level) || build.level < 1 || build.level > 20) error("level", "range", "The level must be between 1 and 20.");

  // --- Species --------------------------------------------------------------
  const species = rules.species(build.species);
  if (!species) error("species", "unknown", "Choose a species.");
  else {
    if (species.lineages.length > 0 && !species.lineages.some((l) => l.key === build.lineage)) {
      error("lineage", "required", `Choose a ${species.lineageLabel ?? "lineage"} for your ${species.name}.`);
    }
    if (build.size && !species.sizes.includes(build.size)) error("size", "invalid", `A ${species.name} can't be ${build.size}.`);
  }

  // --- Class ----------------------------------------------------------------
  const cls = rules.class(build.class);
  if (!cls) error("class", "unknown", "Choose a class.");

  // --- Background -----------------------------------------------------------
  const background = rules.background(build.background);
  if (!background) error("background", "unknown", "Choose a background.");

  // --- Ability scores -------------------------------------------------------
  const base = build.baseAbilities;
  const values = ABILITIES.map((a) => base?.[a]);
  if (values.some((v) => !Number.isInteger(v))) {
    error("baseAbilities", "missing", "Assign a score to each of the six abilities.");
  } else {
    switch (build.abilityMethod) {
      case "pointBuy": {
        const cost = pointBuyCost(base);
        if (cost === null) error("baseAbilities", "pointBuyRange", "With point buy, each score must be between 8 and 15.");
        else if (cost > POINT_BUY_BUDGET) error("baseAbilities", "pointBuyBudget", `You spent ${cost} points; the budget is ${POINT_BUY_BUDGET}.`);
        else if (cost < POINT_BUY_BUDGET) warning("baseAbilities", "pointBuyUnspent", `You still have ${POINT_BUY_BUDGET - cost} points to spend.`);
        break;
      }
      case "standardArray":
        if (!sameMultiset(values as number[], STANDARD_ARRAY)) {
          error("baseAbilities", "standardArray", `Use each value of the standard array once: ${STANDARD_ARRAY.join(", ")}.`);
        }
        break;
      case "rolled":
        if (!build.rolledScores || build.rolledScores.length !== 6) error("baseAbilities", "notRolled", "Roll your ability scores first.");
        else if (!sameMultiset(values as number[], build.rolledScores)) {
          error("baseAbilities", "rolledMismatch", `Assign each rolled value once: ${build.rolledScores.join(", ")}.`);
        }
        break;
      default:
        error("abilityMethod", "unknown", "Choose how to determine ability scores.");
    }
  }

  if (background) {
    const boost = build.backgroundBoost ?? {};
    const entries = Object.entries(boost).filter(([, v]) => v);
    const amounts = entries.map(([, v]) => v as number).sort();
    const valid = (amounts.length === 2 && amounts[0] === 1 && amounts[1] === 2) || (amounts.length === 3 && amounts.every((v) => v === 1));
    if (!valid) error("backgroundBoost", "pattern", "Increase one ability by 2 and another by 1, or three abilities by 1.");
    for (const [a] of entries) {
      if (!background.abilities.includes(a as Ability)) {
        error("backgroundBoost", "ability", `The ${background.name} background can only increase ${background.abilities.map((x) => ABILITY_NAMES[x]).join(", ")}.`);
      }
    }
  }

  // --- Skills ---------------------------------------------------------------
  if (cls) {
    const { count, from } = cls.skillChoices;
    if (build.classSkills.length !== count) error("classSkills", "count", `Choose ${count} skills from the ${cls.name} list (${build.classSkills.length} chosen).`);
    if (hasDuplicates(build.classSkills)) error("classSkills", "duplicate", "You chose the same skill twice.");
    for (const s of build.classSkills) {
      if (!from.includes(s)) error("classSkills", "notAllowed", `${rules.skill(s)?.name ?? s} is not on the ${cls.name} skill list.`);
      if (background?.skills.includes(s)) error("classSkills", "overlap", `${rules.skill(s)?.name ?? s} is already granted by your background; choose another skill.`);
    }
  }

  // --- Subclass -------------------------------------------------------------
  if (cls) {
    if (build.level >= cls.subclassLevel) {
      const subclass = build.subclass ? rules.subclass(build.subclass) : undefined;
      if (!subclass) error("subclass", "required", `Choose a ${cls.name} subclass (available at level ${cls.subclassLevel}).`);
      else if (subclass.class !== cls.key) error("subclass", "wrongClass", `${subclass.name} is not a ${cls.name} subclass.`);
    } else if (build.subclass) {
      error("subclass", "tooEarly", `A ${cls.name} chooses a subclass at level ${cls.subclassLevel}.`);
    }
  }

  // --- Level history ----------------------------------------------------------
  if (cls) {
    const asi = new Set(asiLevels(cls));
    for (let level = 2; level <= build.level; level++) {
      const record = build.levels.find((r) => r.level === level);
      const path = `levels.${level}`;
      if (!record) {
        error(path, "missing", `Level ${level} has not been chosen yet.`);
        continue;
      }
      const { method, value } = record.hp;
      if (method === "average" && value !== Math.floor(cls.hitDie / 2) + 1) error(`${path}.hp`, "average", `The average for a d${cls.hitDie} is ${Math.floor(cls.hitDie / 2) + 1}.`);
      if (method === "roll" && (!Number.isInteger(value) || value < 1 || value > cls.hitDie)) error(`${path}.hp`, "roll", `A hit die roll must be between 1 and ${cls.hitDie}.`);
      if (asi.has(level)) {
        if (!record.asi) error(`${path}.asi`, "required", `Choose an Ability Score Improvement or a feat at level ${level}.`);
        else if (record.asi.type === "asi") {
          const inc = Object.entries(record.asi.increases).filter(([, v]) => v);
          const total = inc.reduce((s, [, v]) => s + (v as number), 0);
          if (total !== 2 || inc.some(([, v]) => (v as number) > 2 || (v as number) < 0)) {
            error(`${path}.asi`, "pattern", "An Ability Score Improvement gives +2 to one ability or +1 to two abilities.");
          }
          const before = finalScores(build, level - 1);
          for (const [a, v] of inc) {
            if (before[a as Ability] + (v as number) > ABILITY_MAX) error(`${path}.asi`, "max", `${ABILITY_NAMES[a as Ability]} can't go above ${ABILITY_MAX}.`);
          }
        } else {
          const feat = rules.feat(record.asi.feat);
          if (!feat) error(`${path}.asi`, "unknownFeat", "Choose a valid feat.");
          else {
            if (feat.category !== "general") error(`${path}.asi`, "featCategory", `${feat.name} can't be taken with an Ability Score Improvement.`);
            if (feat.prerequisite?.level && level < feat.prerequisite.level) error(`${path}.asi`, "featLevel", `${feat.name} requires level ${feat.prerequisite.level}.`);
            const scores = finalScores(build, level - 1);
            for (const [a, min] of Object.entries(feat.prerequisite?.abilities ?? {})) {
              if (scores[a as Ability] < (min as number)) error(`${path}.asi`, "featPrerequisite", `${feat.name} requires ${ABILITY_NAMES[a as Ability]} ${min}.`);
            }
          }
        }
      } else if (record.asi) {
        error(`${path}.asi`, "notAllowed", `There is no Ability Score Improvement at level ${level}.`);
      }
    }
  }

  // --- Feature choices --------------------------------------------------------
  const { profs } = proficiencySet({ ...build, choices: {} }, rules);
  const chosenSkills = new Set<string>();
  for (const scoped of collectChoices(build, rules)) {
    const { choice, id } = scoped;
    const selected = build.choices[id] ?? [];
    const path = `choices.${id}`;
    if (selected.length !== choice.count) {
      error(path, "count", `${choice.label}: choose ${choice.count} (${selected.length} chosen).`);
    }
    if (hasDuplicates(selected)) error(path, "duplicate", `${choice.label}: the same option was chosen twice.`);
    for (const value of selected) {
      switch (choice.kind) {
        case "skill":
          if (!rules.skill(value)) error(path, "unknown", `${choice.label}: unknown skill "${value}".`);
          else if (choice.from !== "any" && !choice.from.includes(value)) error(path, "notAllowed", `${choice.label}: ${rules.skill(value)!.name} is not an option.`);
          else if (profs.has(`skill:${value}`) || chosenSkills.has(value)) error(path, "alreadyProficient", `${choice.label}: you are already proficient in ${rules.skill(value)!.name}.`);
          chosenSkills.add(value);
          break;
        case "expertise":
          if (!profs.has(`skill:${value}`) && !chosenSkills.has(value)) error(path, "notProficient", `${choice.label}: expertise requires proficiency in ${rules.skill(value)?.name ?? value}.`);
          break;
        case "feat":
          if (!choice.from.includes(value) || !rules.feat(value)) error(path, "notAllowed", `${choice.label}: "${value}" is not an option.`);
          break;
        case "spells": {
          const spell = rules.spell(value);
          if (!spell || spell.level !== choice.level || !spell.classes.includes(choice.spellList)) {
            error(path, "notAllowed", `${choice.label}: ${spell?.name ?? value} is not a level ${choice.level} ${choice.spellList} spell.`);
          }
          break;
        }
        case "option":
          if (!choice.from.some((o) => o.key === value)) error(path, "notAllowed", `${choice.label}: "${value}" is not an option.`);
          break;
        case "ability":
          if (!choice.from.includes(value as Ability)) error(path, "notAllowed", `${choice.label}: ${value} can't be increased.`);
          break;
      }
    }
  }

  // --- Final scores ----------------------------------------------------------
  if (cls && species && background) {
    const scores = abilityScores(build, rules);
    for (const a of ABILITIES) {
      if (scores[a] < 1) error("abilities", "min", `${ABILITY_NAMES[a]} can't be below 1.`);
    }
  }

  // --- Equipment -------------------------------------------------------------
  if (cls && !cls.equipment.some((o) => o.key === build.equipment?.class)) error("equipment.class", "required", `Choose your ${cls.name} starting equipment.`);
  if (background && !background.equipment.some((o) => o.key === build.equipment?.background)) error("equipment.background", "required", `Choose your ${background.name} starting equipment.`);

  // --- Spells ----------------------------------------------------------------
  if (cls && species && background) {
    const derived = derive(build, emptyState(), rules);
    const sc = derived.spellcasting;
    if (!sc) {
      if (build.cantrips.length || build.preparedSpells.length) error("cantrips", "notCaster", `A level ${build.level} ${cls.name} can't cast spells from its class.`);
    } else {
      const list = cls.spellcasting!.list;
      if (build.cantrips.length !== sc.cantripsKnown) error("cantrips", "count", `Choose ${sc.cantripsKnown} cantrips (${build.cantrips.length} chosen).`);
      if (build.preparedSpells.length > sc.preparedMax) error("preparedSpells", "tooMany", `You can prepare ${sc.preparedMax} spells (${build.preparedSpells.length} chosen).`);
      else if (build.preparedSpells.length < sc.preparedMax) warning("preparedSpells", "notFull", `You can still prepare ${sc.preparedMax - build.preparedSpells.length} more spells.`);
      if (hasDuplicates(build.cantrips)) error("cantrips", "duplicate", "The same cantrip was chosen twice.");
      if (hasDuplicates(build.preparedSpells)) error("preparedSpells", "duplicate", "The same spell was chosen twice.");
      for (const key of build.cantrips) {
        const spell = rules.spell(key);
        if (!spell || spell.level !== 0 || !spell.classes.includes(list)) error("cantrips", "notAllowed", `${spell?.name ?? key} is not a ${cls.name} cantrip.`);
      }
      for (const key of build.preparedSpells) {
        const spell = rules.spell(key);
        if (!spell || !spell.classes.includes(list) || spell.level === 0) error("preparedSpells", "notAllowed", `${spell?.name ?? key} is not on the ${cls.name} spell list.`);
        else if (spell.level > sc.maxSpellLevel) error("preparedSpells", "tooHigh", `${spell.name} is a level ${spell.level} spell; you only have slots up to level ${sc.maxSpellLevel}.`);
      }
    }
  }

  return issues;
}

export function isValid(issues: ValidationIssue[]): boolean {
  return !issues.some((i) => i.severity === "error");
}
