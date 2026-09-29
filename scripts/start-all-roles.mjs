// Starts Supabase + n8n (same as scripts/start.mjs), then launches 4
// separate Next.js dev server instances of this SAME app, one per port,
// so each role's browser session lives in its own origin and doesn't
// collide with the others in localStorage. All 4 instances share the
// same local Supabase backend/database -- only the port (and therefore
// the session) differs. See docs/DEPLOYMENT.md / README.md for why this
// is needed: Supabase Auth sessions are per-origin, and logging into a
// second role in another tab on the same port silently overwrites the
// first role's session.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const skipN8n = process.argv.includes("--skip-n8n");

const ROLE_PORTS = [
  { role: "Customer", port: 3000 },
  { role: "Vendor", port: 3001 },
  { role: "Delivery", port: 3002 },
  { role: "Admin", port: 3003 },
];

function openWindow(title, command) {
  if (process.platform === "win32") {
    spawnSync(`start "${title}" cmd /k "${command}"`, { stdio: "inherit", shell: true });
  } else {
    spawnSync(`gnome-terminal --title="${title}" -- bash -c "${command}; exec bash"`, {
      stdio: "inherit",
      shell: true,
    });
  }
}

if (!existsSync(".env.local")) {
  console.error(
    ".env.local not found. Run 'npx supabase start' then create .env.local from its output (see docs/DEPLOYMENT.md)."
  );
  process.exit(1);
}

function readEnvLocal(key) {
  const text = readFileSync(".env.local", "utf8");
  const match = text.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : undefined;
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

if (!skipN8n) {
  console.log("Checking n8n container...");
  const inspect = spawnSync("docker inspect -f {{.State.Running}} n8n", {
    encoding: "utf8",
    shell: true,
  });
  const running = inspect.status === 0 && inspect.stdout.trim() === "true";
  if (running) {
    console.log("n8n already running.");
  } else if (inspect.status === 0) {
    console.log("Starting existing n8n container...");
    spawnSync("docker start n8n", { stdio: "inherit", shell: true });
  } else {
    const internalSecret = readEnvLocal("N8N_INTERNAL_SECRET");
    const serviceRoleKey = readEnvLocal("SUPABASE_SERVICE_ROLE_KEY");
    if (!internalSecret || !serviceRoleKey) {
      console.error(
        "N8N_INTERNAL_SECRET / SUPABASE_SERVICE_ROLE_KEY not found in .env.local — skipping n8n. See docs/n8n-webhook-setup.md."
      );
    } else {
      console.log("Creating n8n container (Docker)...");
      spawnSync(
        "docker",
        [
          "run",
          "-d",
          "--rm",
          "--name",
          "n8n",
          "-p",
          "5678:5678",
          "-v",
          "n8n_data:/home/node/.n8n",
          "-e",
          `N8N_INTERNAL_SECRET=${internalSecret}`,
          "-e",
          "APP_BASE_URL=http://host.docker.internal:3000",
          "-e",
          "SUPABASE_URL=http://host.docker.internal:54321",
          "-e",
          `SUPABASE_SERVICE_ROLE_KEY=${serviceRoleKey}`,
          "-e",
          "N8N_BLOCK_ENV_ACCESS_IN_NODE=false",
          "n8nio/n8n",
        ],
        { stdio: "inherit" }
      );
    }
  }
}

console.log("");
console.log("Starting one Next.js dev server per role, each in its own window:");
for (const { role, port } of ROLE_PORTS) {
  console.log(`  ${role.padEnd(10)} -> http://localhost:${port}`);
  openWindow(`${role} (localhost:${port})`, `npm run dev -- -p ${port}`);
}

console.log("");
console.log(
  "Each port is its own browser origin, so each role's Supabase session lives in its own\n" +
    "localStorage and won't collide with the others — no Incognito windows needed. Log into\n" +
    "the matching role at each URL above (customer at :3000, vendor at :3001, etc.)."
);
