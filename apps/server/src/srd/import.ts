/**
 * CLI: `pnpm srd:import [--dry-run] [--force]`
 * Converts the pinned SRD files with the overrides of data/rules and stores
 * the result as the active rule set.
 */
import { PrismaClient } from "@prisma/client";
import { buildRules, importRules } from "./importer";

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--dry-run")) {
    const { rules, checksum } = buildRules();
    const summary = Object.fromEntries(Object.entries(rules).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).length]));
    console.log(JSON.stringify({ version: rules.version.sourceVersion, checksum, summary }, null, 2));
    return;
  }
  const prisma = new PrismaClient();
  try {
    const report = await importRules(prisma, { force: args.includes("--force") });
    console.log(report.created ? `Imported rule set ${report.ruleSetId}` : `Rule set ${report.ruleSetId} already imported; activated`);
    console.table(report.counts);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
