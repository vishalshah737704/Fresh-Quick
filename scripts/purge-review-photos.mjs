// Deletes every object in the private review-photos bucket through the Storage API (the bucket's rows alone are
// not enough: SQL deletes leave the files on disk). Used by "Reset Data". Local stack only.
// Usage: node scripts/purge-review-photos.mjs [--dry-run]
import { execFileSync } from "node:child_process";

const API = "http://127.0.0.1:54321";
const BUCKET = "review-photos";

export function collectPaths(entries, prefix = "") {
  // The list API returns folders as entries without an id; files have an id.
  return entries.filter((entry) => entry.id).map((entry) => `${prefix}${entry.name}`);
}

async function listFolder(key, prefix) {
  const res = await fetch(`${API}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });
  if (!res.ok) throw new Error(`list ${prefix || "/"} failed: ${res.status}`);
  return res.json();
}

async function walk(key, prefix = "") {
  const entries = await listFolder(key, prefix);
  const files = collectPaths(entries, prefix);
  for (const folder of entries.filter((entry) => !entry.id)) {
    files.push(...(await walk(key, `${prefix}${folder.name}/`)));
  }
  return files;
}

async function main() {
  const out = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", shell: process.platform === "win32" });
  const key = out.match(/^SERVICE_ROLE_KEY="?([^"\r\n]+)"?/m)?.[1];
  if (!key) throw new Error("SERVICE_ROLE_KEY not found in supabase status");
  const files = await walk(key);
  console.log(`${files.length} object(s) in ${BUCKET}`);
  if (process.argv.includes("--dry-run") || files.length === 0) return;
  const res = await fetch(`${API}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: files }),
  });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  console.log("deleted");
}

if (process.argv[1]?.endsWith("purge-review-photos.mjs")) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
