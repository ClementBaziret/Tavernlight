import type {
  BackgroundDef,
  ClassDef,
  ConditionDef,
  FeatDef,
  ItemDef,
  MonsterDef,
  RulesData,
  SkillDef,
  SpeciesDef,
  SpellDef,
  SubclassDef,
} from "./types";

export * from "./types";

/**
 * Read-only lookup over a (possibly partial) rules dataset. Clients only
 * load what they need, e.g. the character builder never loads monsters.
 */
export class RulesIndex {
  readonly data: Partial<RulesData>;
  private readonly maps = new Map<string, Map<string, unknown>>();

  constructor(data: Partial<RulesData>) {
    this.data = data;
  }

  private map<T extends { key: string }>(kind: string, list: T[] | undefined): Map<string, T> {
    let m = this.maps.get(kind) as Map<string, T> | undefined;
    if (!m) {
      m = new Map((list ?? []).map((x) => [x.key, x]));
      this.maps.set(kind, m);
    }
    return m;
  }

  skill(key: string): SkillDef | undefined {
    return this.map("skills", this.data.skills).get(key);
  }
  condition(key: string): ConditionDef | undefined {
    return this.map("conditions", this.data.conditions).get(key);
  }
  species(key: string): SpeciesDef | undefined {
    return this.map("species", this.data.species).get(key);
  }
  background(key: string): BackgroundDef | undefined {
    return this.map("backgrounds", this.data.backgrounds).get(key);
  }
  class(key: string): ClassDef | undefined {
    return this.map("classes", this.data.classes).get(key);
  }
  subclass(key: string): SubclassDef | undefined {
    return this.map("subclasses", this.data.subclasses).get(key);
  }
  feat(key: string): FeatDef | undefined {
    return this.map("feats", this.data.feats).get(key);
  }
  spell(key: string): SpellDef | undefined {
    return this.map("spells", this.data.spells).get(key);
  }
  item(key: string): ItemDef | undefined {
    return this.map("items", this.data.items).get(key);
  }
  monster(key: string): MonsterDef | undefined {
    return this.map("monsters", this.data.monsters).get(key);
  }

  get skills(): SkillDef[] {
    return this.data.skills ?? [];
  }

  spellsFor(list: string, maxLevel: number, minLevel = 0): SpellDef[] {
    return (this.data.spells ?? []).filter((s) => s.classes.includes(list) && s.level <= maxLevel && s.level >= minLevel);
  }

  subclassesOf(classKey: string): SubclassDef[] {
    return (this.data.subclasses ?? []).filter((s) => s.class === classKey);
  }
}
