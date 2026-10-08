import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startBackgroundService, logsDir } from "./background-service.mjs";

export const TUNNEL_CONTAINER = "fq-tunnel";
export const WEB_URL = "https://freshquick.demoaiprojects.com";
export const SUPABASE_URL = "https://freshquick-db.demoaiprojects.com";
// Used when .env.local already holds a tunnel URL at start, so there is nothing local to restore.
export const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const ENV_KEY = "NEXT_PUBLIC_SUPABASE_URL";

export function run(command, env = {}) {
  return spawnSync(command, { encoding: "utf8", shell: true, env: { ...process.env, ...env } });
}

export function stateFile(root) {
  const dir = logsDir(root);
  mkdirSync(dir, { recursive: true });
  return join(dir, "tunnel-state.json");
}

export function readState(root) {
  const file = stateFile(root);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}

export function writeState(root, state) {
  writeFileSync(stateFile(root), JSON.stringify(state, null, 2));
}

export function containerRunning(name) {
  const result = run(`docker ps --filter "name=^${name}$" --format "{{.Names}}"`);
  return result.stdout.trim() === name;
}

export async function waitForConnected(name, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const logs = run(`docker logs ${name}`);
    if (/Registered tunnel connection/.test(`${logs.stdout}${logs.stderr}`)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

export function readEnvValue(root, key = ENV_KEY) {
  const text = readFileSync(join(root, ".env.local"), "utf8");
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : null;
}

export function setEnvValue(root, value, key = ENV_KEY) {
  const file = join(root, ".env.local");
  const text = readFileSync(file, "utf8");
  const line = new RegExp(`^${key}=.*$`, "m");
  if (!line.test(text)) throw new Error(`${key} not found in .env.local`);
  writeFileSync(file, text.replace(line, `${key}=${value}`));
}

// NEXT_PUBLIC_* values are fixed when the dev server starts, so a restart is required.
export function restartCustomerDev(root) {
  const lookup = run(
    'powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).OwningProcess"'
  );
  const pid = lookup.stdout.trim().split(/\s+/)[0];
  if (pid) {
    run(`taskkill /PID ${pid} /T /F`);
    spawnSync("powershell", ["-NoProfile", "-Command", "Start-Sleep -Seconds 3"]);
  }
  startBackgroundService(
    "Customer (localhost:3000)",
    "set NEXT_ROLE_DIST_DIR=.next-customer&& npm run dev -- -p 3000",
    join(logsDir(root), "web-customer.log"),
    { cwd: root }
  );
}
