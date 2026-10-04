import test from "node:test";
import assert from "node:assert/strict";
import {
  geolocationErrorMessage,
  parseCoordinates,
  formatCoordinate,
} from "../lib/maps/geolocation.ts";

test("geolocation messages differ by code and have a default", () => {
  const msgs = [1, 2, 3, undefined].map(geolocationErrorMessage);
  assert.equal(new Set(msgs).size, 4);
  assert.match(msgs[0], /denied/);
  assert.match(msgs[2], /too long/);
});

test("parseCoordinates accepts valid numbers", () => {
  assert.deepEqual(parseCoordinates(" 19.076 ", "72.8777"), { lat: 19.076, lng: 72.8777 });
  assert.deepEqual(parseCoordinates("-90", "180"), { lat: -90, lng: 180 });
});

test("parseCoordinates rejects blanks, junk and out-of-range", () => {
  assert.equal(parseCoordinates("", "72"), null);
  assert.equal(parseCoordinates("12abc", "72"), null);
  assert.equal(parseCoordinates("91", "72"), null);
  assert.equal(parseCoordinates("10", "181"), null);
  assert.equal(parseCoordinates("NaN", "Infinity"), null);
});

test("formatCoordinate trims to 6 decimals", () => {
  assert.equal(formatCoordinate(19.07600001234), "19.076");
  assert.equal(formatCoordinate(72.877712345), "72.877712");
});
