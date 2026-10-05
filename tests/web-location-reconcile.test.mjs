import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileWebLocation } from "../lib/location-reconcile.ts";

const a = { lat: 1, lng: 2, label: "A" };
const b = { lat: 3, lng: 4, label: "B" };

test("server value wins over a local pin", () => {
  assert.deepEqual(reconcileWebLocation(a, b, true), { use: b, pushToServer: null });
  assert.deepEqual(reconcileWebLocation(null, b, true), { use: b, pushToServer: null });
});
test("no server value pushes the local pin", () => {
  assert.deepEqual(reconcileWebLocation(a, null, true), { use: null, pushToServer: a });
  assert.deepEqual(reconcileWebLocation(null, null, true), { use: null, pushToServer: null });
});
test("unknown server state changes nothing", () => {
  assert.deepEqual(reconcileWebLocation(a, null, false), { use: null, pushToServer: null });
});
