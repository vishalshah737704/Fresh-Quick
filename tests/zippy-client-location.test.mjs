import test from "node:test";
import assert from "node:assert/strict";
import { readStoredLocation, LOCATION_STORAGE_KEY } from "../lib/zippy/client-location.ts";

const reader = (value) => (key) => (key === LOCATION_STORAGE_KEY ? value : null);

test("reads a valid stored pin", () => {
  assert.deepEqual(readStoredLocation(reader(JSON.stringify({ lat: 19.076, lng: 72.8777, label: "Mumbai" }))), { lat: 19.076, lng: 72.8777 });
});

test("returns null for missing, malformed or out-of-range values and never throws", () => {
  assert.equal(readStoredLocation(reader(null)), null);
  assert.equal(readStoredLocation(reader("not json")), null);
  assert.equal(readStoredLocation(reader(JSON.stringify({ lat: "1", lng: 2 }))), null);
  assert.equal(readStoredLocation(reader(JSON.stringify({ lat: 95, lng: 2 }))), null);
  assert.equal(readStoredLocation(reader(JSON.stringify({ lat: 1, lng: 200 }))), null);
  assert.equal(readStoredLocation(() => { throw new Error("storage blocked"); }), null);
});

test("the storage key matches the one the address store writes", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/address-store.tsx", import.meta.url), "utf8");
  assert.ok(src.includes(`"${LOCATION_STORAGE_KEY}"`));
});
