import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSavedLocation } from "../lib/saved-location.ts";

test("accepts a valid location and trims the label", () => {
  const result = parseSavedLocation({ lat: 19.07, lng: 72.87, label: "  Home  " });
  assert.deepEqual(result, { ok: true, value: { lat: 19.07, lng: 72.87, label: "Home" } });
});

test("accepts boundary values", () => {
  assert.equal(parseSavedLocation({ lat: -90, lng: 180, label: "x" }).ok, true);
  assert.equal(parseSavedLocation({ lat: 90, lng: -180, label: "x" }).ok, true);
});

test("rejects non-object bodies", () => {
  for (const body of [null, undefined, "x", 5, []]) {
    assert.equal(parseSavedLocation(body).ok, false);
  }
});

test("rejects out-of-range, non-finite and non-number coordinates", () => {
  const bad = [999, -90.1, NaN, Infinity, "19", null, undefined];
  for (const lat of bad) assert.equal(parseSavedLocation({ lat, lng: 0, label: "x" }).ok, false);
  for (const lng of [180.1, -181, NaN, "1", null]) {
    assert.equal(parseSavedLocation({ lat: 0, lng, label: "x" }).ok, false);
  }
});

test("rejects bad labels", () => {
  assert.equal(parseSavedLocation({ lat: 0, lng: 0, label: "   " }).ok, false);
  assert.equal(parseSavedLocation({ lat: 0, lng: 0, label: 5 }).ok, false);
  assert.equal(parseSavedLocation({ lat: 0, lng: 0 }).ok, false);
  assert.equal(parseSavedLocation({ lat: 0, lng: 0, label: "a".repeat(201) }).ok, false);
  assert.equal(parseSavedLocation({ lat: 0, lng: 0, label: "a".repeat(200) }).ok, true);
});
