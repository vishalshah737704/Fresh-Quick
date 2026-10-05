// Pure helpers for scripts/geocode-stores.mjs and scripts/apply-store-locations.mjs.
// Import-free on purpose so node's test runner can load it.

export const MUMBAI_BBOX = { minLat: 18.89, maxLat: 19.3, minLng: 72.77, maxLng: 73.0 };

// Tiny .env parser: KEY=VALUE lines, optional quotes, # comments. No expansion.
export function parseEnvText(text) {
  const env = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function buildAddressQuery(entry) {
  return [entry.line1, entry.line2, entry.city, `${entry.state} ${entry.pincode}`, "India"]
    .filter((part) => part && String(part).trim())
    .join(", ");
}

// Reduces a Google Geocoding response to the fields we use, or a failure reason.
export function parseGeocodeResponse(body) {
  if (!body || typeof body !== "object") return { ok: false, reason: "invalid response" };
  if (body.status !== "OK") return { ok: false, reason: `status ${String(body.status)}` };
  const first = Array.isArray(body.results) ? body.results[0] : null;
  const lat = first?.geometry?.location?.lat;
  const lng = first?.geometry?.location?.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: "no coordinates" };
  return {
    ok: true,
    lat,
    lng,
    formatted: String(first.formatted_address ?? ""),
    locationType: String(first.geometry.location_type ?? ""),
    partialMatch: first.partial_match === true,
  };
}

// Applies the spec's acceptance rules to a parsed result.
export function checkStoreResult(parsed, bbox = MUMBAI_BBOX) {
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  if (parsed.partialMatch) return { ok: false, reason: "partial match" };
  if (parsed.locationType === "APPROXIMATE") return { ok: false, reason: "approximate location" };
  const inside =
    parsed.lat >= bbox.minLat && parsed.lat <= bbox.maxLat && parsed.lng >= bbox.minLng && parsed.lng <= bbox.maxLng;
  if (!inside) return { ok: false, reason: "outside the Mumbai area" };
  return { ok: true, reason: "" };
}

export function sqlText(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlNumber(value) {
  if (!Number.isFinite(value)) throw new Error("non-finite coordinate");
  return `${value}::numeric`;
}

// One transaction: update each store's address row and the store's own lat/lng.
// Idempotent: re-running sets the same values.
export function buildApplySql(locations) {
  const rows = locations.map(
    (loc) =>
      `(${sqlText(loc.name)}, ${sqlText(loc.line1)}, ${sqlText(loc.line2)}, ${sqlText(loc.city)}, ${sqlText(loc.state)}, ${sqlText(loc.pincode)}, ${sqlNumber(loc.lat)}, ${sqlNumber(loc.lng)})`,
  );
  const values = `with v(name, line1, line2, city, state, pincode, lat, lng) as (values\n  ${rows.join(",\n  ")}\n)`;
  return [
    "begin;",
    `${values}\nupdate public.addresses a set line1 = v.line1, line2 = v.line2, city = v.city, state = v.state, pincode = v.pincode, lat = v.lat, lng = v.lng\nfrom v join public.stores s on s.name = v.name where a.id = s.address_id;`,
    `${values}\nupdate public.stores s set lat = v.lat, lng = v.lng from v where s.name = v.name;`,
    "commit;",
    "",
  ].join("\n");
}

// current: rows from the database {name, line1, line2, city, state, pincode, addr_lat, addr_lng, store_lat, store_lng}.
// Returns which stores would change and which names are not in the database.
export function planChanges(current, locations) {
  const byName = new Map(current.map((row) => [row.name, row]));
  const changes = [];
  const missing = [];
  const same = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;
  for (const loc of locations) {
    const row = byName.get(loc.name);
    if (!row) {
      missing.push(loc.name);
      continue;
    }
    const unchanged =
      row.line1 === loc.line1 &&
      (row.line2 ?? "") === (loc.line2 ?? "") &&
      row.city === loc.city &&
      row.state === loc.state &&
      row.pincode === loc.pincode &&
      same(row.addr_lat, loc.lat) &&
      same(row.addr_lng, loc.lng) &&
      same(row.store_lat, loc.lat) &&
      same(row.store_lng, loc.lng);
    if (!unchanged) changes.push({ name: loc.name, from: row, to: loc });
  }
  return { changes, missing };
}

export function validateLocationsFile(data) {
  if (!data || !Array.isArray(data.stores)) return "store-locations.json must have a stores array";
  const names = new Set();
  for (const s of data.stores) {
    if (!s || typeof s.name !== "string" || !s.name) return "a store entry has no name";
    if (names.has(s.name)) return `duplicate store ${s.name}`;
    names.add(s.name);
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) return `${s.name}: bad coordinates`;
    for (const key of ["line1", "city", "state", "pincode"]) {
      if (typeof s[key] !== "string" || !s[key]) return `${s.name}: missing ${key}`;
    }
  }
  return null;
}
