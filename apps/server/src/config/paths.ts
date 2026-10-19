import path from "node:path";

/** Repository root (src/config or dist/config are three levels below apps/server). */
export const REPO_ROOT = process.env.TAVERNLIGHT_ROOT ?? path.resolve(__dirname, "../../../..");
export const DATA_DIR = path.join(REPO_ROOT, "data");
export const WEB_DIST_DIR = process.env.WEB_DIST_DIR ?? path.join(REPO_ROOT, "apps/web/dist");
