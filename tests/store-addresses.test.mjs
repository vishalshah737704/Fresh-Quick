import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAddressQuery,
  buildApplySql,
  checkStoreResult,
  parseEnvText,
  parseGeocodeResponse,
  planChanges,
  validateLocationsFile,
} from "../scripts/lib/store-geocode.mjs";

const dataPath = fileURLToPath(new URL("../scripts/data/mumbai-store-addresses.json", import.meta.url));
const seedPath = fileURLToPath(new URL("../supabase/seed.sql", import.meta.url));
const geocodeScript = fileURLToPath(new URL("../scripts/geocode-stores.mjs", import.meta.url));
const addresses = JSON.parse(readFileSync(dataPath, "utf8"));

function seedStoreNames() {
  const sql = readFileSync(seedPath, "utf8");
  const pattern = /\('[0-9a-f-]{36}', '[0-9a-f-]{36}', '((?:[^']|'')*)', array\[/g;
  return [...sql.matchAll(pattern)].map((match) => match[1].replace(/''/g, "'"));
}

test("address data file covers exactly the 77 seeded stores", () => {
  const seeded = seedStoreNames();
  assert.equal(new Set(seeded).size, 77);
  assert.deepEqual(Object.keys(addresses).sort(), [...new Set(seeded)].sort());
});

test("address data entries are complete, unique and Mumbai-region", () => {
  const seen = new Set();
  for (const [name, entry] of Object.entries(addresses)) {
    assert.match(entry.pincode, /^\d{6}$/, `${name} pincode`);
    assert.ok(entry.line1.length > 10, `${name} line1`);
    assert.ok(entry.line2, `${name} line2`);
    assert.equal(entry.state, "Maharashtra");
    assert.ok(["Mumbai", "Thane"].includes(entry.city), `${name} city`);
    const key = `${entry.line1}|${entry.line2}|${entry.pincode}`.toLowerCase();
    assert.ok(!seen.has(key), `${name} duplicates another address`);
    seen.add(key);
    assert.ok(/^40\d{4}$/.test(entry.pincode), `${name} pincode in the 40xxxx range`);
  }
  assert.equal(new Set(Object.values(addresses).map((e) => e.line1.toLowerCase())).size, 77, "line1 values are unique");
});

test("parseEnvText handles quotes, comments and export", () => {
  const env = parseEnvText('# c\nA=1\nexport B="two words"\nC=\'x\'\n\nbad line\nD=a=b\r\n');
  assert.deepEqual(env, { A: "1", B: "two words", C: "x", D: "a=b" });
});

test("buildAddressQuery joins the parts", () => {
  assert.equal(
    buildAddressQuery({ line1: "Shop 1, X Road", line2: "Bandra West", city: "Mumbai", state: "Maharashtra", pincode: "400050" }),
    "Shop 1, X Road, Bandra West, Mumbai, Maharashtra 400050, India",
  );
});

const okBody = (extra = {}) => ({
  status: "OK",
  results: [
    {
      formatted_address: "X Road, Mumbai",
      geometry: { location: { lat: 19.07, lng: 72.87 }, location_type: "ROOFTOP", ...extra.geometry },
      ...extra.result,
    },
  ],
});

test("parseGeocodeResponse accepts OK and rejects bad bodies", () => {
  const parsed = parseGeocodeResponse(okBody());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.lat, 19.07);
  assert.equal(parsed.formatted, "X Road, Mumbai");
  assert.equal(parseGeocodeResponse({ status: "ZERO_RESULTS", results: [] }).ok, false);
  assert.equal(parseGeocodeResponse({ status: "OK", results: [{ geometry: { location: { lat: "x" } } }] }).ok, false);
  assert.equal(parseGeocodeResponse(null).ok, false);
});

test("checkStoreResult enforces partial match, approximate and bounding box", () => {
  assert.equal(checkStoreResult(parseGeocodeResponse(okBody())).ok, true);
  const partial = checkStoreResult(parseGeocodeResponse(okBody({ result: { partial_match: true } })));
  assert.equal(partial.ok, false);
  assert.ok(/^partial match( -> .{1,120})?$/.test(partial.reason));
  const longPartial = checkStoreResult(
    parseGeocodeResponse(okBody({ result: { partial_match: true, formatted_address: "A".repeat(300) } })),
  );
  assert.equal(longPartial.reason, `partial match -> ${"A".repeat(120)}`);
  assert.equal(
    checkStoreResult(parseGeocodeResponse(okBody({ geometry: { location_type: "APPROXIMATE" } }))).reason,
    "approximate location",
  );
  const far = okBody();
  far.results[0].geometry.location = { lat: 28.6, lng: 77.2 };
  assert.equal(checkStoreResult(parseGeocodeResponse(far)).reason, "outside the Mumbai area");
});

test("buildApplySql escapes quotes and wraps one transaction", () => {
  const sql = buildApplySql([
    { name: "Bella's", line1: "A'B", line2: "C", city: "Mumbai", state: "Maharashtra", pincode: "400050", lat: 19.1, lng: 72.8 },
  ]);
  assert.ok(sql.startsWith("begin;"));
  assert.ok(sql.trimEnd().endsWith("commit;"));
  assert.ok(sql.includes("'Bella''s'") && sql.includes("'A''B'"));
  assert.ok(sql.includes("19.1::numeric"));
  assert.throws(() => buildApplySql([{ name: "x", lat: NaN, lng: 1 }]));
});

test("planChanges reports changed, unchanged and missing stores", () => {
  const loc = { name: "A", line1: "L1", line2: "L2", city: "Mumbai", state: "Maharashtra", pincode: "400001", lat: 19.1, lng: 72.8 };
  const row = { name: "A", line1: "L1", line2: "L2", city: "Mumbai", state: "Maharashtra", pincode: "400001", addr_lat: "19.1", addr_lng: "72.8", store_lat: "19.1", store_lng: "72.8" };
  assert.deepEqual(planChanges([row], [loc]), { changes: [], missing: [] });
  assert.equal(planChanges([{ ...row, store_lat: "19.2" }], [loc]).changes.length, 1);
  assert.deepEqual(planChanges([row], [{ ...loc, name: "B" }]).missing, ["B"]);
});

test("validateLocationsFile catches bad input", () => {
  const good = { stores: [{ name: "A", line1: "x", city: "Mumbai", state: "M", pincode: "400001", lat: 1, lng: 2 }] };
  assert.equal(validateLocationsFile(good), null);
  assert.ok(validateLocationsFile({}));
  assert.ok(validateLocationsFile({ stores: [{ ...good.stores[0] }, { ...good.stores[0] }] }));
  assert.ok(validateLocationsFile({ stores: [{ ...good.stores[0], lat: null }] }));
});

async function withStub(handler, fn) {
  const urls = [];
  const server = http.createServer((req, res) => {
    urls.push(req.url);
    const { status, body } = handler(new URL(req.url, "http://x"));
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`, urls);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function runGeocode(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [geocodeScript, ...args], {
      env: { ...process.env, GOOGLE_MAPS_SERVER_API_KEY: "dummy-test-key", ...env },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

function tinyAddressFile(dir) {
  const file = join(dir, "addr.json");
  const entry = (line1) => ({ line1, line2: "Area", city: "Mumbai", state: "Maharashtra", pincode: "400001" });
  writeFileSync(file, JSON.stringify({ "Good Store": entry("1 Good Road"), "Bad Store": entry("2 Bad Road"), "Far Store": entry("3 Far Road") }));
  return file;
}

test("geocode-stores.mjs runs end to end against a stub, reports failures, never prints the key", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geo-"));
  const addrFile = tinyAddressFile(dir);
  const out = join(dir, "out.json");
  await withStub(
    (url) => {
      const address = url.searchParams.get("address");
      assert.equal(url.searchParams.get("components"), "country:IN");
      assert.equal(url.searchParams.get("key"), "dummy-test-key");
      if (address.startsWith("1 Good")) return { status: 200, body: okBody() };
      if (address.startsWith("2 Bad")) return { status: 200, body: { status: "ZERO_RESULTS", results: [] } };
      const far = okBody();
      far.results[0].geometry.location = { lat: 28.6, lng: 77.2 };
      return { status: 200, body: far };
    },
    async (base, urls) => {
      const first = await runGeocode(["--base-url", base, "--addresses", addrFile, "--out", out]);
      assert.equal(first.code, 1);
      assert.ok(first.out.includes("1 of 3 stores resolved, 2 failed"));
      assert.ok(first.err.includes("Bad Store") && first.err.includes("Far Store"));
      assert.ok(!(first.out + first.err).includes("dummy-test-key"));
      const saved = JSON.parse(readFileSync(out, "utf8"));
      assert.deepEqual(saved.stores.map((s) => s.name), ["Good Store"]);
      assert.equal(saved.stores[0].lat, 19.07);
      assert.equal(urls.length, 3);

      const second = await runGeocode(["--base-url", base, "--addresses", addrFile, "--out", out]);
      assert.equal(urls.length, 5, "resume skips the resolved store");
      assert.equal(second.code, 1);

      await runGeocode(["--base-url", base, "--addresses", addrFile, "--out", out, "--force"]);
      assert.equal(urls.length, 8, "--force redoes every store");
    },
  );
});

test("geocode-stores.mjs shows Google's error_message (redacted, truncated) plus a REQUEST_DENIED hint", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geo-"));
  const addrFile = join(dir, "addr.json");
  writeFileSync(addrFile, JSON.stringify({ Only: { line1: "1 Good Road", line2: "Area", city: "Mumbai", state: "Maharashtra", pincode: "400001" } }));
  const message = `API keys with referer restrictions cannot be used with this API. dummy-test-key and key=abc123 ${"x".repeat(300)}`;
  await withStub(() => ({ status: 200, body: { status: "REQUEST_DENIED", error_message: message, results: [] } }), async (base) => {
    const result = await runGeocode(["--base-url", base, "--addresses", addrFile, "--out", join(dir, "o.json")]);
    assert.equal(result.code, 1);
    assert.ok(result.out.includes("status REQUEST_DENIED: API keys with referer restrictions"));
    assert.ok(result.err.includes("Google said (REQUEST_DENIED)"));
    assert.ok(result.err.includes("Application restriction must be None"));
    assert.ok(result.err.includes("Geocoding API") && result.err.includes("billing"));
    const all = result.out + result.err;
    assert.ok(!all.includes("dummy-test-key") && !all.includes("abc123"));
    assert.ok(all.includes("[redacted]"));
    assert.ok(!all.includes("x".repeat(201)));
  });
  assert.equal(parseGeocodeResponse({ status: "OVER_QUERY_LIMIT" }).reason, "status OVER_QUERY_LIMIT");
});

test("geocode-stores.mjs exits 0 when every store passes and 1 on HTTP errors or a missing key", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geo-"));
  const addrFile = join(dir, "addr.json");
  writeFileSync(addrFile, JSON.stringify({ Only: { line1: "1 Good Road", line2: "Area", city: "Mumbai", state: "Maharashtra", pincode: "400001" } }));
  const out = join(dir, "out.json");
  await withStub(() => ({ status: 200, body: okBody() }), async (base) => {
    const result = await runGeocode(["--base-url", base, "--addresses", addrFile, "--out", out]);
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(readFileSync(out, "utf8")).stores.length, 1);
  });
  const out2 = join(dir, "out2.json");
  await withStub(() => ({ status: 500, body: {} }), async (base) => {
    const result = await runGeocode(["--base-url", base, "--addresses", addrFile, "--out", out2]);
    assert.equal(result.code, 1);
    assert.ok(result.err.includes("HTTP 500"));
    assert.ok(!(result.out + result.err).includes("dummy-test-key"));
  });
  const noKey = await runGeocode(["--addresses", addrFile, "--out", out2, "--env-path", join(dir, "none.env")], { GOOGLE_MAPS_SERVER_API_KEY: "" });
  assert.equal(noKey.code, 1);
});
