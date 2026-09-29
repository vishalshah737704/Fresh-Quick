// Thin wrapper: `npm run app:stop:all-roles` == `npm run app:stop -- --all-roles --keep-mobile`.
// Kept as its own script/npm-script for discoverability; the actual
// port-killing logic lives in stop.mjs. Pass --all to also stop
// n8n/Supabase (dropping the default --keep-mobile too).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const stopEverything = args.includes("--all");

const stopArgs = ["--all-roles"];
if (!stopEverything) {
  stopArgs.push("--keep-n8n", "--keep-supabase", "--keep-mobile");
}

const result = spawnSync("node", [join(root, "scripts", "stop.mjs"), ...stopArgs], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
