import type { PrismaClient } from "@prisma/client";
import type { EncounterThresholds, RulesData, RulesKind } from "@tavernlight/engine";

export const LIST_KINDS: RulesKind[] = ["skills", "conditions", "damageTypes", "species", "backgrounds", "classes", "subclasses", "feats", "spells", "items", "magicItems", "monsters"];

/** Reads the active rule set back from the database. */
export async function loadActiveRules(prisma: PrismaClient): Promise<{ id: string; data: RulesData; count: number } | null> {
  const ruleSet = await prisma.ruleSet.findFirst({ where: { active: true }, orderBy: { importedAt: "desc" } });
  if (!ruleSet) return null;
  const entities = await prisma.ruleEntity.findMany({ where: { ruleSetId: ruleSet.id }, select: { kind: true, data: true } });
  const data: Partial<RulesData> = Object.fromEntries(LIST_KINDS.map((k) => [k, []]));
  for (const e of entities) {
    if (e.kind === "encounters") data.encounters = e.data as unknown as EncounterThresholds;
    else if (data[e.kind as RulesKind]) (data[e.kind as RulesKind] as unknown[]).push(e.data);
  }
  for (const kind of LIST_KINDS) (data[kind] as { name: string }[]).sort((a, b) => a.name.localeCompare(b.name));
  data.version = {
    source: ruleSet.source,
    sourceVersion: ruleSet.sourceVersion,
    formatVersion: ruleSet.formatVersion,
    importedAt: ruleSet.importedAt.toISOString(),
    attribution: ruleSet.attribution,
  };
  return { id: ruleSet.id, data: data as RulesData, count: entities.length };
}
