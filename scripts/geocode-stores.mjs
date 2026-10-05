// Geocodes every store address in scripts/data/mumbai-store-addresses.json with the
// Google Geocoding API and writes supabase/data/store-locations.json.
// Run by Vishal (needs GOOGLE_MAPS_SERVER_API_KEY in .env.local). Never prints the key.
//
//   node scripts/geocode-stores.mjs [--force] [--base-url <url>] [--addresses <file>] [--out <file>] [--env-path <file>]
//
// Resumable: stores already in the output file are skipped unless --force.
// Exit code 1 if any store failed; the passing ones are still saved.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAddressQuery, checkStoreResult, parseEnvText, parseGeocodeResponse } from "./lib/store-geocode.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readArgs(argv) {
  const args = {
    force: false,
    baseUrl: "https://maps.googleapis.com",
    addresses: join(root, "scripts/data/mumbai-store-addresses.json"),
    out: join(root, "supabase/data/store-locations.json"),
    envFile: join(root, ".env.local"),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--force") args.force = true;
    else if (arg === "--base-url") args.baseUrl = argv[++i];
    else if (arg === "--addresses") args.addresses = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--env-path") args.envFile = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function loadKey(envPath) {
  if (!process.env.GOOGLE_MAPS_SERVER_API_KEY) {
    if (existsSync(envPath)) {
      const parsed = parseEnvText(readFileSync(envPath, "utf8"));
      if (parsed.GOOGLE_MAPS_SERVER_API_KEY) process.env.GOOGLE_MAPS_SERVER_API_KEY = parsed.GOOGLE_MAPS_SERVER_API_KEY;
    }
  }
  return process.env.GOOGLE_MAPS_SERVER_API_KEY || "";
}

async function main() {
  const args = readArgs(process.argv.slice(2));
  const key = loadKey(args.envFile);
  if (!key) {
    console.error("GOOGLE_MAPS_SERVER_API_KEY is not set (add it to .env.local). Nothing was geocoded.");
    process.exitCode = 1;
    return;
  }

  const addresses = JSON.parse(readFileSync(args.addresses, "utf8"));
  let saved = [];
  if (!args.force && existsSync(args.out)) {
    saved = JSON.parse(readFileSync(args.out, "utf8")).stores ?? [];
  }
  const resolved = new Map(saved.map((store) => [store.name, store]));

  const rows = [];
  let firstProviderError = null;
  for (const [name, entry] of Object.entries(addresses)) {
    if (resolved.has(name)) {
      rows.push({ name, status: "skipped", note: "already resolved" });
      continue;
    }
    try {
      const url = new URL("/maps/api/geocode/json", args.baseUrl);
      url.searchParams.set("address", buildAddressQuery(entry));
      url.searchParams.set("components", "country:IN");
      url.searchParams.set("region", "in");
      url.searchParams.set("key", key);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = parseGeocodeResponse(await response.json(), key);
      if (!parsed.ok && parsed.errorMessage && !firstProviderError) {
        firstProviderError = { status: parsed.status, message: parsed.errorMessage };
      }
      const verdict = checkStoreResult(parsed);
      if (!verdict.ok) {
        rows.push({ name, status: "FAIL", note: verdict.reason });
        continue;
      }
      resolved.set(name, {
        name,
        line1: entry.line1,
        line2: entry.line2 ?? "",
        city: entry.city,
        state: entry.state,
        pincode: entry.pincode,
        lat: parsed.lat,
        lng: parsed.lng,
        formatted: parsed.formatted,
      });
      rows.push({ name, status: "ok", note: parsed.formatted });
    } catch (error) {
      // Only the message: never the request URL, which carries the key.
      rows.push({ name, status: "FAIL", note: `request failed (${error instanceof Error ? error.message : "error"})` });
    }
  }

  const stores = Object.keys(addresses)
    .filter((name) => resolved.has(name))
    .map((name) => resolved.get(name));
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify({ generatedAt: new Date().toISOString(), stores }, null, 2)}\n`);

  for (const row of rows) console.log(`${row.status.padEnd(7)} ${row.name.padEnd(24)} ${row.note}`);
  const failed = rows.filter((row) => row.status === "FAIL");
  console.log(`\n${stores.length} of ${Object.keys(addresses).length} stores resolved, ${failed.length} failed.`);
  if (failed.length > 0) {
    console.error(`Failed stores (fix their entries in ${args.addresses}, then run again; passing stores are kept):`);
    for (const row of failed) console.error(`  - ${row.name}: ${row.note}`);
    if (firstProviderError) {
      let line = `Google said (${firstProviderError.status}): ${firstProviderError.message}`;
      if (firstProviderError.status === "REQUEST_DENIED") {
        line +=
          " | Hint: the key's Application restriction must be None (or IP addresses); HTTP referrer and Android app restrictions are rejected by the Geocoding web service. The API restriction list must include Geocoding API, and billing must be enabled.";
      }
      console.error(line);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "geocode-stores failed");
  process.exitCode = 1;
});
