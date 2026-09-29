// Thin wrapper: `npm run app:start:all-roles` == `npm run app:start:dev -- --all-roles`.
// Kept as its own script/npm-script for discoverability; all the actual
// logic (Supabase/n8n bring-up, background service + log-tail windows,
// the 4 role ports) lives in start.mjs so there's one implementation to
// keep in sync, not two.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const extraArgs = process.argv.slice(2);

const result = spawnSync(
  "node",
  [join(root, "scripts", "start.mjs"), "--dev", "--all-roles", ...extraArgs],
  { stdio: "inherit" }
);
process.exit(result.status ?? 1);
