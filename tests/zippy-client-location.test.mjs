import test from "node:test";
import assert from "node:assert/strict";
import { readStoredLocation, resolveLocation, DEFAULT_LAT, DEFAULT_LNG, LOCATION_STORAGE_KEY } from "../lib/zippy/client-location.ts";

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

const DEFAULT = { lat: DEFAULT_LAT, lng: DEFAULT_LNG };
const storedPin = JSON.stringify({ lat: 12.97, lng: 77.59, label: "Bangalore" });

test("stored pin wins over the default on any page", () => {
  assert.deepEqual(resolveLocation(reader(storedPin), "/customer"), { lat: 12.97, lng: 77.59 });
  assert.deepEqual(resolveLocation(reader(storedPin), "/vendor"), { lat: 12.97, lng: 77.59 });
});

test("no stored pin: default on customer pages only", () => {
  assert.deepEqual(resolveLocation(reader(null), "/customer"), DEFAULT);
  assert.deepEqual(resolveLocation(reader(null), "/customer/stores/abc"), DEFAULT);
  for (const p of ["/vendor/dashboard", "/delivery/login", "/admin/overview", "/", "/customers", "/customer-x", "/vendor/customer"]) {
    assert.equal(resolveLocation(reader(null), p), null, p);
  }
});

test("invalid stored value falls back like a missing one", () => {
  assert.deepEqual(resolveLocation(reader("garbage"), "/customer"), DEFAULT);
  assert.equal(resolveLocation(reader("garbage"), "/vendor"), null);
});

test("default pin matches the address store", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/address-store.tsx", import.meta.url), "utf8");
  assert.ok(src.includes(`DEFAULT_LAT = ${DEFAULT_LAT};`));
  assert.ok(src.includes(`DEFAULT_LNG = ${DEFAULT_LNG};`));
});

test("the storage key matches the one the address store writes", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/address-store.tsx", import.meta.url), "utf8");
  assert.ok(src.includes(`"${LOCATION_STORAGE_KEY}"`));
});
