// Loads seed data into the local database.
//
// Wraps `npx supabase db reset`, which drops and recreates the local
// database, re-applies every migration in supabase/migrations/, then runs
// supabase/seed.sql (demo vendor/restaurant/menu, cuisine taxonomy, seeded
// admin account). This is the project's only supported way to (re)seed —
// migrations and seed data are applied together as one unit, so there is
// no seed-without-reset path.
//
// Requires Docker Desktop running.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

console.log("Resetting database and loading seed data (supabase/seed.sql)...");
const result = spawnSync("npx supabase db reset", { stdio: "inherit", shell: true });
if (result.status !== 0) {
  console.error("Seed failed. Is Docker Desktop running? Try 'npx supabase status' to check.");
  process.exit(1);
}
console.log("Seed complete.");
