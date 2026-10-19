/**
 * Tavernlight rules format.
 *
 * Every piece of game content (species, classes, spells, monsters...) is
 * described with these structures. The SRD importer produces them from the
 * public 5e dataset plus hand-written overrides, and the engine only ever
 * interprets these structures: it never reads rules text.
 *
 * Distances are in feet; durations of effects are in combat rounds.
 */

export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type Ability = (typeof ABILITIES)[number];

export type Size = "tiny" | "small" | "medium" | "large" | "huge" | "gargantuan";

export type RestKind = "short" | "long";

// ---------------------------------------------------------------------------
// Effects and actions (combat)
// ---------------------------------------------------------------------------

/**
 * A formula is either a constant or a dice expression that may use
 * variables: @str..@cha (ability modifiers), @prof, @level, @mod (the
 * ability used by the action), @spell_mod, @spell_dc, @spell_attack, @slot.
 */
export type Formula = number | string;

export type Duration =
  | { type: "instant" }
  | { type: "rounds"; value: number }
  | { type: "untilRest"; rest: RestKind }
  | { type: "permanent" };

export type Trigger = "startOfTurn" | "endOfTurn" | "none";

export type ModifierTarget = "ac" | "attack" | "save" | "damage" | "speed" | "check";

export type Effect =
  | { type: "damage"; dice: Formula; damageType: string }
  /** On a successful save: the target takes half of the failure damage. */
  | { type: "halfDamage" }
  | { type: "heal"; dice: Formula }
  | { type: "tempHp"; dice: Formula }
  | {
      type: "condition";
      condition: string;
      duration?: Duration;
      /** The target repeats the save at the end of each of its turns. */
      repeatSave?: boolean;
    }
  | { type: "modifier"; target: ModifierTarget; value: Formula; name?: string; duration?: Duration }
  /**
   * Free-form effect (mostly added by the game master): a name, a
   * description, and optionally mechanical effects resolved on a trigger.
   */
  | {
      type: "custom";
      name: string;
      description?: string;
      trigger?: Trigger;
      effects?: Effect[];
      duration?: Duration;
    };

export type AreaShape = "sphere" | "cone" | "line" | "cube" | "cylinder" | "emanation";

export interface AreaDef {
  shape: AreaShape;
  /** Radius (sphere, cylinder, emanation), length (cone, line) or side (cube), in feet. */
  size: number;
  /** Width of a line, in feet. */
  width?: number;
}

export type Targeting =
  | { type: "single" }
  | { type: "multiple"; count: number }
  | { type: "area"; area: AreaDef }
  | { type: "self" };

export type Resolution =
  | { type: "attack"; bonus: Formula; kind?: "melee" | "ranged" }
  | { type: "save"; ability: Ability; dc: Formula }
  | { type: "auto" };

export interface ActionDef {
  key: string;
  name: string;
  source: "spell" | "weapon" | "monster" | "feature" | "item" | "custom";
  activation?: "action" | "bonus" | "reaction" | "other";
  /** Spell level for spells (0 = cantrip). */
  level?: number;
  cost?: { slotLevel?: number; resource?: string; amount?: number };
  range?: { normal?: number; long?: number; reach?: number; self?: boolean; touch?: boolean };
  targeting: Targeting;
  resolution: Resolution;
  /** Attack roll results. */
  onHit?: Effect[];
  onMiss?: Effect[];
  /** Saving throw results (from the target's point of view). */
  onFail?: Effect[];
  onSuccess?: Effect[];
  /** Automatic resolution. */
  effects?: Effect[];
  /** Extra damage / healing / targets for each slot level above the base level. */
  upcast?: { damage?: string; heal?: string; targets?: number };
  /** Damage dice multiplied by the cantrip tier (1 / 2 / 3 / 4 at levels 1 / 5 / 11 / 17). */
  cantripScaling?: boolean;
  concentration?: boolean;
  duration?: Duration;
  description?: string;
}

// ---------------------------------------------------------------------------
// Passive effects (character building)
// ---------------------------------------------------------------------------

export type PassiveEffect =
  | { type: "hpPerLevel"; value: number }
  | {
      type: "acFormula";
      base: number;
      abilities: Ability[];
      allowShield: boolean;
    }
  | { type: "speedBonus"; value: number; unarmoredOnly?: boolean }
  | { type: "resistance"; damageType: string }
  | { type: "proficiency"; proficiency: string }
  | { type: "sense"; sense: "darkvision" | "blindsight" | "tremorsense" | "truesight"; range: number }
  | { type: "initiativeBonus"; value: "prof" | number }
  | { type: "acBonus"; value: number; armoredOnly?: boolean }
  | { type: "rangedAttackBonus"; value: number }
  | {
      type: "resource";
      key: string;
      name: string;
      /** Number of uses: fixed, proficiency bonus, ability modifier (min 1) or class-level table. */
      uses: number | "prof" | { ability: Ability } | { classSpecific: string };
      recharge: RestKind;
    }
  | { type: "action"; action: ActionDef };

export interface OptionDef {
  key: string;
  name: string;
  description?: string;
  /** Passive effects granted when this option is selected. */
  effects?: PassiveEffect[];
}

/** A decision the player must make while building or leveling a character. */
export type ChoiceDef =
  | { id: string; kind: "skill"; count: number; from: string[] | "any"; label: string }
  | { id: string; kind: "expertise"; count: number; label: string }
  | { id: string; kind: "feat"; count: number; from: string[]; label: string }
  | { id: string; kind: "spells"; count: number; spellList: string; level: number; label: string }
  | { id: string; kind: "option"; count: number; from: OptionDef[]; label: string }
  | { id: string; kind: "ability"; count: number; from: Ability[]; label: string };

export interface FeatureDef {
  key: string;
  name: string;
  level: number;
  description: string;
  effects?: PassiveEffect[];
  choices?: ChoiceDef[];
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export interface SkillDef {
  key: string;
  name: string;
  ability: Ability;
  description: string;
}

export interface ConditionDef {
  key: string;
  name: string;
  description: string;
}

export interface DamageTypeDef {
  key: string;
  name: string;
}

export interface LineageDef {
  key: string;
  name: string;
  description: string;
  features: FeatureDef[];
  effects?: PassiveEffect[];
  /** Spells granted at given character levels (e.g. Drow, High Elf). */
  spells?: { level: number; spell: string }[];
}

export interface SpeciesDef {
  key: string;
  name: string;
  creatureType: string;
  sizes: Size[];
  speed: number;
  features: FeatureDef[];
  lineages: LineageDef[];
  lineageLabel?: string;
}

export interface BackgroundDef {
  key: string;
  name: string;
  /** The three abilities that can be increased (+2/+1 or +1/+1/+1). */
  abilities: Ability[];
  feat: string;
  /** Extra data for the origin feat, e.g. the spell list of Magic Initiate. */
  featOption?: string;
  skills: string[];
  tools: string[];
  equipment: EquipmentOption[];
  description?: string;
}

export interface EquipmentGrant {
  item: string;
  quantity: number;
}

export interface EquipmentOption {
  key: string;
  label: string;
  items: EquipmentGrant[];
  gold: number;
}

export interface SpellcastingDef {
  ability: Ability;
  /** Warlock pact magic slots recharge on a short rest. */
  pactMagic?: boolean;
  /** The class spell list (spell keys are looked up via SpellDef.classes). */
  list: string;
}

export interface ClassLevelDef {
  level: number;
  proficiencyBonus: number;
  features: string[];
  cantrips?: number;
  preparedSpells?: number;
  /** Index 1..9; index 0 unused. */
  slots?: number[];
  classSpecific?: Record<string, number | string>;
}

export interface ClassDef {
  key: string;
  name: string;
  hitDie: number;
  primaryAbilities: Ability[];
  savingThrows: Ability[];
  proficiencies: string[];
  skillChoices: { count: number; from: string[] };
  equipment: EquipmentOption[];
  spellcasting?: SpellcastingDef;
  subclassLevel: number;
  levels: ClassLevelDef[];
  features: FeatureDef[];
  description?: string;
}

export interface SubclassDef {
  key: string;
  name: string;
  class: string;
  summary: string;
  features: FeatureDef[];
  /** Always-prepared spells by class level. */
  spells?: { level: number; spell: string }[];
}

export interface FeatDef {
  key: string;
  name: string;
  category: "origin" | "general" | "fighting-style" | "epic-boon";
  description: string;
  effects?: PassiveEffect[];
  choices?: ChoiceDef[];
  repeatable?: boolean;
  prerequisite?: { level?: number; abilities?: Partial<Record<Ability, number>> };
}

export interface SpellDef {
  key: string;
  name: string;
  level: number;
  school: string;
  classes: string[];
  castingTime: string;
  range: string;
  components: string[];
  material?: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  description: string;
  higherLevel?: string;
  /** Structured description interpreted by the combat engine. */
  action?: ActionDef;
}

export type ItemCategory = "weapon" | "armor" | "shield" | "gear" | "tool" | "pack" | "ammunition" | "focus" | "other";

export interface WeaponDef {
  category: "simple" | "martial";
  kind: "melee" | "ranged";
  damage: string;
  damageType: string;
  versatile?: string;
  properties: string[];
  range?: { normal: number; long?: number };
  mastery?: string;
}

export interface ArmorDef {
  category: "light" | "medium" | "heavy" | "shield";
  base: number;
  dexBonus: boolean;
  maxDexBonus?: number;
  strengthMinimum?: number;
  stealthDisadvantage: boolean;
}

export interface ItemDef {
  key: string;
  name: string;
  category: ItemCategory;
  /** Cost in copper pieces. */
  cost: number;
  weight: number;
  description?: string;
  weapon?: WeaponDef;
  armor?: ArmorDef;
  contents?: EquipmentGrant[];
}

export interface MagicItemDef {
  key: string;
  name: string;
  category: string;
  rarity: string;
  attunement: boolean;
  description: string;
}

export interface MonsterDef {
  key: string;
  name: string;
  size: Size;
  type: string;
  alignment: string;
  ac: number;
  acNote?: string;
  hp: number;
  hitDice: string;
  speed: Record<string, number>;
  abilities: Record<Ability, number>;
  saves: Partial<Record<Ability, number>>;
  skills: Record<string, number>;
  resistances: string[];
  vulnerabilities: string[];
  immunities: string[];
  conditionImmunities: string[];
  senses: Record<string, number>;
  passivePerception: number;
  languages: string;
  cr: number;
  xp: number;
  proficiencyBonus: number;
  traits: { name: string; description: string }[];
  actions: ActionDef[];
  /** Original action texts, including multiattack and actions without a structure. */
  actionTexts: { name: string; description: string; kind: "action" | "bonus" | "reaction" | "legendary" }[];
}

export interface EncounterThresholds {
  /** XP thresholds per character level: [easy, medium, hard, deadly]. */
  thresholds: Record<number, [number, number, number, number]>;
  /** Multipliers by number of monsters: [minCount, multiplier], ascending. */
  multipliers: [number, number][];
  xpByCr: Record<string, number>;
}

export interface RulesVersion {
  source: string;
  sourceVersion: string;
  formatVersion: number;
  importedAt: string;
  attribution: string;
}

/** Everything the engine needs, indexed by key. */
export interface RulesData {
  version: RulesVersion;
  skills: SkillDef[];
  conditions: ConditionDef[];
  damageTypes: DamageTypeDef[];
  species: SpeciesDef[];
  backgrounds: BackgroundDef[];
  classes: ClassDef[];
  subclasses: SubclassDef[];
  feats: FeatDef[];
  spells: SpellDef[];
  items: ItemDef[];
  magicItems: MagicItemDef[];
  monsters: MonsterDef[];
  encounters: EncounterThresholds;
}

export type RulesKind = Exclude<keyof RulesData, "version" | "encounters">;
