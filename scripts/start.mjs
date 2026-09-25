import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const dev = process.argv.includes("--dev");

if (!existsSync(".env.local")) {
  console.error(
    ".env.local not found. Run 'npx supabase start' then create .env.local from its output (see docs/DEPLOYMENT.md)."
  );
  process.exit(1);
}

console.log("Checking Supabase status...");
const status = spawnSync("npx supabase status", { encoding: "utf8", shell: true });
const stopped = status.status !== 0 || /Stopped services/.test(status.stdout ?? "");
if (stopped) {
  console.log("Starting Supabase (Docker)...");
  const start = spawnSync("npx supabase start", { stdio: "inherit", shell: true });
  if (start.status !== 0) {
    console.error("Failed to start Supabase. Is Docker Desktop running?");
    process.exit(1);
  }
} else {
  console.log("Supabase already running.");
}

if (dev) {
  console.log("Starting Next.js dev server...");
  const result = spawnSync("npm run dev", { stdio: "inherit", shell: true });
  process.exit(result.status ?? 1);
}

if (!existsSync(".next")) {
  console.error("No production build found. Run 'npm run app:build' first, or pass --dev for the dev server.");
  process.exit(1);
}
console.log("Starting Next.js production server...");
const result = spawnSync("npm start", { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
