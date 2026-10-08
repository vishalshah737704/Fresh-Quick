import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TUNNEL_CONTAINER,
  run,
  readState,
  stateFile,
  containerRunning,
  setEnvValue,
  restartCustomerDev,
} from "./lib/tunnel.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

if (containerRunning(TUNNEL_CONTAINER)) {
  run(`docker stop ${TUNNEL_CONTAINER}`);
  console.log(`Stopped ${TUNNEL_CONTAINER}.`);
} else {
  console.log(`${TUNNEL_CONTAINER} was not running.`);
}

const state = readState(root);
if (state?.originalSupabaseUrl) {
  setEnvValue(root, state.originalSupabaseUrl);
  console.log("Restored NEXT_PUBLIC_SUPABASE_URL in .env.local.");
  // --no-restart: the caller (stop-all-roles) has already stopped the dev servers.
  if (!process.argv.includes("--no-restart")) {
    console.log("Restarting the customer dev server on port 3000...");
    restartCustomerDev(root);
  }
  rmSync(stateFile(root));
} else {
  console.log("No saved .env.local value, so .env.local was left unchanged.");
}
console.log("Tunnel stopped.");
