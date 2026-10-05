// Applies supabase/data/store-locations.json to the local database: each store's
// address row (line1, line2, city, state, pincode, lat, lng) and stores.lat/lng,
// in one transaction. Dry run by default; pass --apply to write. Idempotent.
//
//   node scripts/apply-store-locations.mjs [--apply] [--file <path>]
//
// Database access: docker exec psql, like the rest of the local tooling.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApplySql, planChanges, validateLocationsFile } from "./lib/store-geocode.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const container = process.env.SUPABASE_DB_CONTAINER || "supabase_db_phase1-scaffold-db";

function psql(sql, extraArgs = []) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", ...extraArgs], {
    input: sql,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`psql failed: ${(result.stderr || result.error?.message || "unknown error").trim()}`);
  }
  return result.stdout;
}

function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const fileIndex = argv.indexOf("--file");
  const file = fileIndex >= 0 ? argv[fileIndex + 1] : join(root, "supabase/data/store-locations.json");

  const data = JSON.parse(readFileSync(file, "utf8"));
  const problem = validateLocationsFile(data);
  if (problem) throw new Error(problem);

  const currentJson = psql(
    "select coalesce(json_agg(json_build_object('name', s.name, 'line1', a.line1, 'line2', a.line2, 'city', a.city, 'state', a.state, 'pincode', a.pincode, 'addr_lat', a.lat, 'addr_lng', a.lng, 'store_lat', s.lat, 'store_lng', s.lng)), '[]'::json) from public.stores s left join public.addresses a on a.id = s.address_id;",
    ["-At"],
  );
  const { changes, missing } = planChanges(JSON.parse(currentJson.trim()), data.stores);

  if (missing.length > 0) {
    throw new Error(`These stores are not in the database, nothing was changed: ${missing.join(", ")}`);
  }
  for (const change of changes) {
    const { from, to } = change;
    console.log(`${change.name}: "${from.line1}" (${from.store_lat}, ${from.store_lng}) -> "${to.line1}, ${to.line2}" (${to.lat}, ${to.lng})`);
  }
  console.log(`${changes.length} of ${data.stores.length} stores ${apply ? "to update" : "would change"}.`);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to write.");
    return;
  }
  if (changes.length === 0) {
    console.log("Nothing to do.");
    return;
  }
  psql(buildApplySql(data.stores));
  console.log("Applied.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "apply-store-locations failed");
  process.exitCode = 1;
}
