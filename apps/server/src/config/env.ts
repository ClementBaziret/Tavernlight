import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./paths";

// Development: read the repository .env (Docker passes real environment
// variables). Imported first by main.ts, before any module reads process.env.
const envFile = path.join(REPO_ROOT, ".env");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
