import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TUNNEL_CONTAINER,
  WEB_URL,
  SUPABASE_URL,
  LOCAL_SUPABASE_URL,
  run,
  readState,
  writeState,
  containerRunning,
  waitForConnected,
  readEnvValue,
  setEnvValue,
  restartCustomerDev,
} from "./lib/tunnel.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

if (run("docker info").status !== 0) {
  console.error("Docker is not running. Start Docker Desktop first.");
  process.exit(1);
}
if (containerRunning(TUNNEL_CONTAINER)) {
  console.error("The tunnel is already running. Run scripts/stopCloudFareTunnel.ps1 first.");
  process.exit(1);
}

const token = readEnvValue(root, "CLOUDFLARE_TUNNEL_TOKEN");
if (!token) {
  console.error("CLOUDFLARE_TUNNEL_TOKEN is missing in .env.local.");
  process.exit(1);
}

// The token goes in through the environment, not the command line, so it never shows in
// 'docker ps' or this script's output. -d keeps the tunnel alive after this script and VS Code exit.
console.log("Starting the Cloudflare tunnel (web 3000, Supabase 54321)...");
const started = run(
  `docker run -d --rm --name ${TUNNEL_CONTAINER} -e TUNNEL_TOKEN cloudflare/cloudflared:latest tunnel --no-autoupdate run`,
  { TUNNEL_TOKEN: token }
);
if (started.status !== 0) {
  console.error(`Could not start the tunnel: ${started.stderr.trim().replaceAll(token, "***")}`);
  process.exit(1);
}

if (!(await waitForConnected(TUNNEL_CONTAINER))) {
  console.error(`The tunnel did not connect within 60 s. Stopping it; check 'docker logs ${TUNNEL_CONTAINER}'.`);
  run(`docker stop ${TUNNEL_CONTAINER}`);
  process.exit(1);
}

// Keep the first original value if state already exists from an interrupted run.
const candidate = readState(root)?.originalSupabaseUrl ?? readEnvValue(root);
const isTunnelUrl = !candidate || /trycloudflare\.com|demoaiprojects\.com/.test(candidate);
const originalSupabaseUrl = isTunnelUrl ? LOCAL_SUPABASE_URL : candidate;
writeState(root, { originalSupabaseUrl });

setEnvValue(root, SUPABASE_URL);
console.log("NEXT_PUBLIC_SUPABASE_URL in .env.local now points at the Supabase tunnel.");
// --no-restart: the caller (start-all-roles) starts the dev servers after this, so they read the new value.
if (!process.argv.includes("--no-restart")) {
  console.log("Restarting the customer dev server on port 3000...");
  restartCustomerDev(root);
}

console.log("\nThe tunnel runs in the background (Docker) and survives closing VS Code.");
console.log("Stop it and restore .env.local with: scripts/stopCloudFareTunnel.ps1");
console.log(`Supabase tunnel (do not open in a browser): ${SUPABASE_URL}`);
console.log(`Web app URL: ${WEB_URL}/customer`);
