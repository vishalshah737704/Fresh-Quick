import test from "node:test";
import assert from "node:assert/strict";
import { sortNearestFirst } from "../mobile/lib/nearest.ts";
import { haversineDistanceKm } from "../mobile/lib/geo.ts";

const origin = { lat: 19.076, lng: 72.8777 };

test("sorts nearest first and puts stores without coordinates last", () => {
  const items = [
    { id: "far", lat: 12.97, lng: 77.59 },
    { id: "none", lat: null, lng: null },
    { id: "near", lat: "19.08", lng: "72.88" },
    { id: "blank", lat: "", lng: "" },
  ];
  const out = sortNearestFirst(items, origin, haversineDistanceKm).map((i) => i.id);
  assert.deepEqual(out, ["near", "far", "none", "blank"]);
});

test("without an origin the order is unchanged and the input is not mutated", () => {
  const items = [{ id: "a", lat: 1, lng: 1 }, { id: "b", lat: 2, lng: 2 }];
  const out = sortNearestFirst(items, null, haversineDistanceKm);
  assert.deepEqual(out.map((i) => i.id), ["a", "b"]);
  assert.notEqual(out, items);
});
