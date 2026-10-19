/**
 * CLI: `pnpm seed:demo [--reset]` — creates the demo campaign, its four
 * characters, three maps and their encounters. `--reset` deletes it first.
 */
import { PrismaClient } from "@prisma/client";
import { DEMO_CAMPAIGN_NAME, DEMO_USERS, seedDemo } from "./demo";

async function main() {
  const prisma = new PrismaClient();
  try {
    if (process.argv.includes("--reset")) {
      await prisma.campaign.deleteMany({ where: { name: DEMO_CAMPAIGN_NAME } });
      await prisma.user.deleteMany({ where: { email: { in: DEMO_USERS.map((u) => u.email) } } });
    }
    const result = await seedDemo(prisma);
    console.log(result.created ? "Demo campaign created." : "Demo campaign already exists (use --reset to recreate it).");
    console.log(`Accounts (password "${process.env.DEMO_PASSWORD ?? "tavernlight"}"):`);
    for (const u of DEMO_USERS) console.log(`  ${u.email.padEnd(28)} ${u.displayName}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
