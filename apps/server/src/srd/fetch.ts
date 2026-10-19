/**
 * Downloads the raw SRD 5.2 files of a pinned 5e-database release into
 * data/srd/5e-database-<version>/. Run once when changing SRD_VERSION; the
 * import itself never needs the network.
 */
import fs from "node:fs";
import path from "node:path";
import { SRD_FILES, SRD_REPOSITORY, SRD_SOURCE_VERSION, rawDir } from "./source";

async function main() {
  const dir = rawDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const file of SRD_FILES) {
    const url = `${SRD_REPOSITORY}/${SRD_SOURCE_VERSION}/src/2024/en/${file}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
    const text = await response.text();
    JSON.parse(text); // refuse anything that isn't JSON
    fs.writeFileSync(path.join(dir, file), text);
    console.log(`✓ ${file}`);
  }
  console.log(`SRD ${SRD_SOURCE_VERSION} saved in ${dir}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
