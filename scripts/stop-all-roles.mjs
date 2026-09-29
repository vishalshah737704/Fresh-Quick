// Stops the 4 per-role Next.js dev servers started by start-all-roles.mjs
// (ports 3000-3003). Does not touch Supabase/n8n -- use scripts/stop.mjs
// for those, or pass --all here to stop everything in one go.
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const stopEverything = args.includes("--all");

const PORTS = [3000, 3001, 3002, 3003];

function stopWindows(port) {
  const netstat = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
  const lines = (netstat.stdout ?? "")
    .split("\n")
    .filter((l) => l.includes(`:${port} `) && l.includes("LISTENING"));
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

for (const port of PORTS) {
  if (process.platform === "win32") {
    stopWindows(port);
  } else {
    stopPosix(port);
  }
}

if (stopEverything) {
  console.log("Stopping n8n and Supabase too (--all passed)...");
  spawnSync("node", ["scripts/stop.mjs", "--keep-mobile"], { stdio: "inherit" });
}
