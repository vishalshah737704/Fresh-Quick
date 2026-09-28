import { existsSync, readFileSync } from "node:fs";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const dev = process.argv.includes("--dev");
const skipN8n = process.argv.includes("--skip-n8n");
const skipMobile = process.argv.includes("--skip-mobile");

function openWindow(title, command) {
  if (process.platform === "win32") {
    spawnSync(`start "${title}" cmd /k "${command}"`, { stdio: "inherit", shell: true });
  } else {
    const child = spawn("bash", ["-c", command], { stdio: "ignore", detached: true });
    child.unref();
    console.log(`${title} started detached (stdio ignored) — run '${command}' yourself to see logs.`);
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
    const startN8n = spawnSync("docker start n8n", { stdio: "inherit", shell: true });
    if (startN8n.status !== 0) {
      console.error("Failed to start the existing n8n container.");
      process.exit(1);
    }
  } else {
    const internalSecret = readEnvLocal("N8N_INTERNAL_SECRET");
    const serviceRoleKey = readEnvLocal("SUPABASE_SERVICE_ROLE_KEY");
    if (!internalSecret || !serviceRoleKey) {
      console.error(
        "N8N_INTERNAL_SECRET / SUPABASE_SERVICE_ROLE_KEY not found in .env.local — skipping n8n. See docs/n8n-webhook-setup.md."
      );
    } else {
      console.log("Creating n8n container (Docker)...");
      const run = spawnSync(
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
      if (run.status !== 0) {
        console.error("Failed to start n8n. Is Docker Desktop running? (pass --skip-n8n to skip)");
        process.exit(1);
      }
    }
  }
}

if (!skipMobile) {
  if (!existsSync(join("mobile", ".env"))) {
    console.warn(
      "mobile/.env not found — skipping mobile app. Copy mobile/.env.example to mobile/.env and fill in Supabase URL/anon key + EXPO_PUBLIC_API_BASE_URL (your machine's LAN IP, not localhost), or pass --skip-mobile to silence this."
    );
  } else {
    console.log("Starting Expo (mobile app) in a new window...");
    openWindow("Mobile (Expo)", "cd /d mobile && npx expo start");
  }
} else {
  console.log("Skipping mobile app (--skip-mobile passed).");
}

if (dev) {
  console.log("Starting Next.js dev server (new window)...");
  openWindow("Web (Next.js dev)", "npm run dev");
} else {
  if (!existsSync(".next")) {
    console.error("No production build found. Run 'npm run app:build' first, or pass --dev for the dev server.");
    process.exit(1);
  }
  console.log("Starting Next.js production server (new window)...");
  openWindow("Web (Next.js)", "npm start");
}

console.log("All requested services launched. This script has returned control of the terminal — check each service's own window for logs.");
