import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { RulesData, RulesKind } from "@tavernlight/engine";
import { readOverrides, readRaw, SRD_SOURCE_VERSION } from "./source";
import { FORMAT_VERSION, transform } from "./transform";

const KINDS: RulesKind[] = ["skills", "conditions", "damageTypes", "species", "backgrounds", "classes", "subclasses", "feats", "spells", "items", "magicItems", "monsters"];

export function buildRules(): { rules: RulesData; checksum: string } {
  const rules = transform(readRaw(), readOverrides(), SRD_SOURCE_VERSION);
  const { importedAt: _ignored, ...version } = rules.version;
  const checksum = createHash("sha256").update(JSON.stringify({ ...rules, version })).digest("hex");
  return { rules, checksum };
}

export interface ImportReport {
  ruleSetId: string;
  created: boolean;
  counts: Record<string, number>;
}

/**
 * Imports the rules into the database. Re-running the import is safe: an
 * identical result (same source, format and checksum) is just re-activated,
 * a different one becomes a new active RuleSet (older ones stay for history).
 */
export async function importRules(prisma: PrismaClient, options: { force?: boolean } = {}): Promise<ImportReport> {
  const { rules, checksum } = buildRules();
  const counts: Record<string, number> = Object.fromEntries(KINDS.map((k) => [k, (rules[k] as unknown[]).length]));
  const existing = await prisma.ruleSet.findUnique({
    where: { sourceVersion_formatVersion_checksum: { sourceVersion: SRD_SOURCE_VERSION, formatVersion: FORMAT_VERSION, checksum } },
  });
  if (existing && !options.force) {
    await prisma.$transaction([
      prisma.ruleSet.updateMany({ where: { id: { not: existing.id } }, data: { active: false } }),
      prisma.ruleSet.update({ where: { id: existing.id }, data: { active: true } }),
    ]);
    return { ruleSetId: existing.id, created: false, counts };
  }
  if (existing) await prisma.ruleSet.delete({ where: { id: existing.id } });

  const ruleSet = await prisma.ruleSet.create({
    data: {
      source: rules.version.source,
      sourceVersion: SRD_SOURCE_VERSION,
      formatVersion: FORMAT_VERSION,
      checksum,
      attribution: rules.version.attribution,
      active: false,
    },
  });
  const rows: Prisma.RuleEntityCreateManyInput[] = KINDS.flatMap((kind) =>
    (rules[kind] as { key: string; name: string; level?: number; cr?: number; type?: string; size?: string }[]).map((entity) => ({
      ruleSetId: ruleSet.id,
      kind,
      key: entity.key,
      name: entity.name,
      data: entity as object,
      level: kind === "spells" ? entity.level : null,
      cr: kind === "monsters" ? entity.cr : null,
      creatureType: kind === "monsters" ? entity.type : null,
      size: kind === "monsters" ? entity.size : null,
    })),
  );
  rows.push({ ruleSetId: ruleSet.id, kind: "encounters", key: "thresholds", name: "Encounter thresholds", data: rules.encounters as object, level: null, cr: null, creatureType: null, size: null });
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.ruleEntity.createMany({ data: rows.slice(i, i + 500) });
  }
  await prisma.$transaction([
    prisma.ruleSet.updateMany({ where: { id: { not: ruleSet.id } }, data: { active: false } }),
    prisma.ruleSet.update({ where: { id: ruleSet.id }, data: { active: true } }),
  ]);
  return { ruleSetId: ruleSet.id, created: true, counts };
}
