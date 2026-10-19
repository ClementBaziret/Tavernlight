import { Controller, Get, Param, Query } from "@nestjs/common";
import type { RulesKind } from "@tavernlight/engine";
import type { MonsterSummary, SpellSummary } from "@tavernlight/shared";
import { Public } from "../common/auth";
import { RulesService } from "./rules.service";

function matches(name: string, search?: string) {
  return !search || name.toLowerCase().includes(search.toLowerCase());
}

/** Rules content is public SRD material: no login needed. */
@Public()
@Controller("rules")
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get("version")
  version() {
    return this.rules.version;
  }

  /** e.g. /rules/bundle?kinds=species,backgrounds,classes,subclasses,feats,spells,items,skills */
  @Get("bundle")
  bundle(@Query("kinds") kinds = "") {
    return this.rules.bundle(kinds.split(",").filter(Boolean) as RulesKind[]);
  }

  @Get("monsters")
  monsters(@Query("search") search?: string, @Query("type") type?: string, @Query("size") size?: string, @Query("crMin") crMin?: string, @Query("crMax") crMax?: string): MonsterSummary[] {
    const min = crMin !== undefined && crMin !== "" ? Number(crMin) : -1;
    const max = crMax !== undefined && crMax !== "" ? Number(crMax) : 99;
    return this.rules.all.monsters
      .filter((m) => matches(m.name, search) && (!type || m.type.includes(type.toLowerCase())) && (!size || m.size === size) && m.cr >= min && m.cr <= max)
      .map((m) => ({ key: m.key, name: m.name, type: m.type, size: m.size, cr: m.cr, xp: m.xp, ac: m.ac, hp: m.hp }));
  }

  @Get("monsters/:key")
  monster(@Param("key") key: string) {
    return this.rules.get("monsters", key);
  }

  @Get("spells")
  spells(@Query("search") search?: string, @Query("class") cls?: string, @Query("level") level?: string): SpellSummary[] {
    return this.rules.all.spells
      .filter((s) => matches(s.name, search) && (!cls || s.classes.includes(cls)) && (level === undefined || level === "" || s.level === Number(level)))
      .map((s) => ({ key: s.key, name: s.name, level: s.level, school: s.school, classes: s.classes, concentration: s.concentration, ritual: s.ritual }));
  }

  @Get("spells/:key")
  spell(@Param("key") key: string) {
    return this.rules.get("spells", key);
  }

  @Get("conditions")
  conditions() {
    return this.rules.all.conditions;
  }

  @Get("items")
  items(@Query("search") search?: string) {
    return this.rules.all.items.filter((i) => matches(i.name, search));
  }

  @Get("magic-items")
  magicItems(@Query("search") search?: string) {
    return this.rules.all.magicItems.filter((i) => matches(i.name, search));
  }
}
