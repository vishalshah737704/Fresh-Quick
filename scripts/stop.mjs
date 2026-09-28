import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);

const args = process.argv.slice(2);
const keepSupabase = args.includes("--keep-supabase");
const keepN8n = args.includes("--keep-n8n");
const keepMobile = args.includes("--keep-mobile");
const portArg = args.find((a) => a.startsWith("--port="));
const port = portArg ? Number(portArg.split("=")[1]) : 3000;
const mobilePortArg = args.find((a) => a.startsWith("--mobile-port="));
const mobilePort = mobilePortArg ? Number(mobilePortArg.split("=")[1]) : 8081;

function stopWindows(port) {
  const netstat = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
  const lines = (netstat.stdout ?? "").split("\n").filter((l) => l.includes(`:${port} `) && l.includes("LISTENING"));
  const pids = [...new Set(lines.map((l) => l.trim().split(/\s+/).pop()))];
  if (pids.length === 0) {
    console.log(`No process found listening on port ${port}.`);
    return;
  }
  for (const pid of pids) {
    console.log(`Stopping process PID ${pid} on port ${port}...`);
    spawnSync("taskkill", ["/PID", pid, "/F"], { stdio: "inherit" });
  }
}

function stopPosix(port) {
  const lsof = spawnSync("lsof", ["-t", `-i:${port}`], { encoding: "utf8" });
  const pids = (lsof.stdout ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  if (pids.length === 0) {
    console.log(`No process found listening on port ${port}.`);
    return;
  }
  for (const pid of pids) {
    console.log(`Stopping process PID ${pid} on port ${port}...`);
    spawnSync("kill", ["-9", pid], { stdio: "inherit" });
  }
}

if (process.platform === "win32") {
  stopWindows(port);
} else {
  stopPosix(port);
}

if (!keepMobile) {
  console.log(`Stopping Expo/Metro (mobile app) on port ${mobilePort}...`);
  if (process.platform === "win32") {
    stopWindows(mobilePort);
  } else {
    stopPosix(mobilePort);
  }
} else {
  console.log("Leaving mobile app running (--keep-mobile passed).");
}

if (!keepN8n) {
  console.log("Stopping n8n container (Docker)...");
  const inspect = spawnSync("docker inspect -f {{.State.Running}} n8n", {
    encoding: "utf8",
    shell: true,
  });
  if (inspect.status === 0 && inspect.stdout.trim() === "true") {
    spawnSync("docker stop n8n", { stdio: "inherit", shell: true });
  } else {
    console.log("n8n container not running.");
  }
} else {
  console.log("Leaving n8n running (--keep-n8n passed).");
}

if (!keepSupabase) {
  console.log("Stopping Supabase (Docker)...");
  spawnSync("npx supabase stop", { stdio: "inherit", shell: true });
} else {
  console.log("Leaving Supabase running (--keep-supabase passed).");
}
