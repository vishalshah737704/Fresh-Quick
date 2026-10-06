import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isInMumbaiRegion,
  resolvePartnerLocation,
  DEFAULT_PARTNER_LOCATION,
} from "../lib/mumbai-region.ts";

test("Mumbai, Thane and Navi Mumbai points are inside; New Jersey is not", () => {
  assert.equal(isInMumbaiRegion(19.0176, 72.8277), true);
  assert.equal(isInMumbaiRegion(19.2183, 72.9781), true);
  assert.equal(isInMumbaiRegion(19.033, 73.0297), true);
  assert.equal(isInMumbaiRegion(40.4733, -74.3295), false);
  assert.equal(isInMumbaiRegion(0, 0), false);
});

test("a Mumbai ping is stored as reported", () => {
  const got = resolvePartnerLocation({ lat: 19.07, lng: 72.88 }, { lat: 19.0, lng: 72.8 });
  assert.deepEqual(got, { lat: 19.07, lng: 72.88 });
});

test("an out-of-region ping keeps the stored Mumbai point", () => {
  const got = resolvePartnerLocation({ lat: 40.47, lng: -74.33 }, { lat: 19.0, lng: 72.8 });
  assert.deepEqual(got, { lat: 19.0, lng: 72.8 });
});

test("an out-of-region ping with nothing or a bad stored point falls back to the default", () => {
  assert.deepEqual(
    resolvePartnerLocation({ lat: 40.47, lng: -74.33 }, { lat: null, lng: null }),
    DEFAULT_PARTNER_LOCATION
  );
  assert.deepEqual(
    resolvePartnerLocation({ lat: 40.47, lng: -74.33 }, { lat: 40.47, lng: -74.33 }),
    DEFAULT_PARTNER_LOCATION
  );
});
