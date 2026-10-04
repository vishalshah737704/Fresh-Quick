import test from "node:test";
import assert from "node:assert/strict";
import {
  formatEta,
  formatRouteDistance,
  parseRoute,
  shouldRequestRoute,
} from "../lib/maps/route.ts";

const A = { lat: 19.07, lng: 72.87 };
const B = { lat: 19.1, lng: 72.9 };
// About 111 m north of A, and about 222 m north of A.
const NEAR = { lat: 19.071, lng: 72.87 };
const FAR = { lat: 19.072, lng: 72.87 };

const getterPoint = (lat, lng) => ({ lat: () => lat, lng: () => lng });

test("parseRoute accepts LatLng getter points", () => {
  const route = parseRoute({
    path: [getterPoint(1, 2), getterPoint(3, 4)],
    durationMillis: 600000,
    distanceMeters: 2500,
  });
  assert.deepEqual(route, {
    path: [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }],
    durationSeconds: 600,
    distanceMeters: 2500,
  });
});

test("parseRoute accepts plain numeric lat/lng points", () => {
  const route = parseRoute({
    path: [{ lat: 1, lng: 2, altitude: 0 }, { lat: 3, lng: 4, altitude: 0 }],
    durationMillis: 90000,
    distanceMeters: 0,
  });
  assert.equal(route?.path.length, 2);
  assert.equal(route?.durationSeconds, 90);
  assert.equal(route?.distanceMeters, 0);
});

test("parseRoute drops invalid points but needs two valid ones", () => {
  const ok = parseRoute({
    path: [{ lat: 1, lng: 2 }, { lat: NaN, lng: 2 }, { lat: 3, lng: 4 }, null, "x"],
    durationMillis: 1000,
    distanceMeters: 10,
  });
  assert.equal(ok?.path.length, 2);
  assert.equal(
    parseRoute({ path: [{ lat: 1, lng: 2 }, { lat: "a", lng: 2 }], durationMillis: 1, distanceMeters: 1 }),
    null
  );
});

test("parseRoute rejects malformed input", () => {
  const path = [{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }];
  assert.equal(parseRoute(null), null);
  assert.equal(parseRoute(undefined), null);
  assert.equal(parseRoute("route"), null);
  assert.equal(parseRoute({}), null);
  assert.equal(parseRoute({ path: "nope", durationMillis: 1, distanceMeters: 1 }), null);
  assert.equal(parseRoute({ path: [], durationMillis: 1, distanceMeters: 1 }), null);
  assert.equal(parseRoute({ path: [path[0]], durationMillis: 1, distanceMeters: 1 }), null);
  assert.equal(parseRoute({ path, durationMillis: -1, distanceMeters: 1 }), null);
  assert.equal(parseRoute({ path, durationMillis: NaN, distanceMeters: 1 }), null);
  assert.equal(parseRoute({ path, durationMillis: "5", distanceMeters: 1 }), null);
  assert.equal(parseRoute({ path, durationMillis: 1, distanceMeters: Infinity }), null);
  assert.equal(parseRoute({ path, durationMillis: 1 }), null);
});

test("parseRoute rejects out-of-range coordinates and throwing getters", () => {
  assert.equal(
    parseRoute({ path: [{ lat: 91, lng: 0 }, { lat: 0, lng: 181 }], durationMillis: 1, distanceMeters: 1 }),
    null
  );
  const bad = { lat: () => { throw new Error("x"); }, lng: () => 1 };
  assert.equal(parseRoute({ path: [bad, bad], durationMillis: 1, distanceMeters: 1 }), null);
});

const base = { origin: A, destination: B, inFlight: false, repeat: true };
const last = (over = {}) => ({ origin: A, destination: B, at: 1_000_000, ...over });

test("shouldRequestRoute: never while in flight", () => {
  assert.equal(shouldRequestRoute({ ...base, inFlight: true, last: null }, 0), false);
  assert.equal(shouldRequestRoute({ ...base, inFlight: true, last: last({ destination: A }) }, 9e9), false);
});

test("shouldRequestRoute: first request when none yet", () => {
  assert.equal(shouldRequestRoute({ ...base, last: null }, 0), true);
});

test("shouldRequestRoute: destination change requests at once", () => {
  const s = { ...base, last: last({ destination: A }) };
  assert.equal(shouldRequestRoute(s, 1_000_001), true);
});

test("shouldRequestRoute: origin moved over 150 m needs 30 s since last success", () => {
  const now = 1_000_000;
  assert.equal(shouldRequestRoute({ ...base, origin: FAR, last: last() }, now + 29_999), false);
  assert.equal(shouldRequestRoute({ ...base, origin: FAR, last: last() }, now + 30_000), true);
});

test("shouldRequestRoute: small movement never requests", () => {
  assert.equal(shouldRequestRoute({ ...base, origin: NEAR, last: last() }, 1_000_000 + 600_000), false);
  assert.equal(shouldRequestRoute({ ...base, last: last() }, 1_000_000 + 600_000), false);
});

test("shouldRequestRoute: repeat false requests once only", () => {
  const s = { ...base, repeat: false, origin: FAR, last: last() };
  assert.equal(shouldRequestRoute(s, 1_000_000 + 600_000), false);
  assert.equal(shouldRequestRoute({ ...s, last: null }, 0), true);
});

test("shouldRequestRoute: waits 60 s after a failure, then retries", () => {
  const failed = last({ failedAt: 2_000_000 });
  assert.equal(shouldRequestRoute({ ...base, last: failed }, 2_059_999), false);
  assert.equal(shouldRequestRoute({ ...base, last: failed }, 2_060_000), true);
  // retry applies even when repeat is false (nothing succeeded yet)
  assert.equal(shouldRequestRoute({ ...base, repeat: false, last: failed }, 2_060_000), true);
});

test("formatEta", () => {
  assert.equal(formatEta(0), "Less than 1 min away");
  assert.equal(formatEta(59), "Less than 1 min away");
  assert.equal(formatEta(60), "About 1 min");
  assert.equal(formatEta(89), "About 1 min");
  assert.equal(formatEta(90), "About 2 min");
  assert.equal(formatEta(59 * 60), "About 59 min");
  assert.equal(formatEta(62 * 60), "About 1 h 2 min");
  assert.equal(formatEta(3600), "About 1 h");
  assert.equal(formatEta(65 * 60), "About 1 h 5 min");
  assert.equal(formatEta(2 * 3600), "About 2 h");
  assert.equal(formatEta(59 * 60 + 31), "About 1 h");
});

test("formatRouteDistance", () => {
  assert.equal(formatRouteDistance(0), "0 m");
  assert.equal(formatRouteDistance(84), "80 m");
  assert.equal(formatRouteDistance(85), "90 m");
  assert.equal(formatRouteDistance(994), "990 m");
  assert.equal(formatRouteDistance(1000), "1.0 km");
  assert.equal(formatRouteDistance(2540), "2.5 km");
  assert.equal(formatRouteDistance(12345), "12.3 km");
});
