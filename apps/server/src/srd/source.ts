import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../config/paths";
import type { Overrides, RawSrd } from "./transform";

/** Version of the 5e-bits/5e-database release the import is pinned to. */
export const SRD_SOURCE_VERSION = process.env.SRD_VERSION ?? "v5.12.0";
export const SRD_REPOSITORY = "https://raw.githubusercontent.com/5e-bits/5e-database";

export const SRD_FILES = [
  "Ability-Scores", "Alignments", "Backgrounds", "Classes", "Conditions", "Damage-Types", "Equipment-Categories",
  "Equipment", "Feats", "Features", "Languages", "Levels", "Magic-Items", "Magic-Schools", "Monsters", "Proficiencies",
  "Skills", "Species", "Spells", "Subclasses", "Subspecies", "Traits", "Weapon-Mastery-Properties", "Weapon-Properties",
].map((name) => `5e-SRD-${name}.json`);

export function rawDir(version = SRD_SOURCE_VERSION): string {
  return path.join(DATA_DIR, "srd", `5e-database-${version}`);
}

export function readRaw(version = SRD_SOURCE_VERSION): RawSrd {
  const dir = rawDir(version);
  if (!fs.existsSync(dir)) {
    throw new Error(`SRD files for ${version} not found in ${dir}. Run "pnpm srd:fetch" first.`);
  }
  const raw: RawSrd = {};
  for (const file of SRD_FILES) {
    const full = path.join(dir, file);
    if (fs.existsSync(full)) raw[file] = JSON.parse(fs.readFileSync(full, "utf8"));
  }
  return raw;
}

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, "rules", name), "utf8")) as T;
}

export function readOverrides(): Overrides {
  return {
    classFeatures: readJson("class-features.json"),
    species: readJson("species.json"),
    feats: readJson("feats.json"),
    spells: readJson("spells.json"),
    backgrounds: readJson("backgrounds.json"),
    encounters: readJson("encounters.json"),
  };
}
