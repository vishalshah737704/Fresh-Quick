import test from "node:test";
import assert from "node:assert/strict";
import { interpolateLatLng, boundsOf, formatDistanceKm } from "../lib/maps/geo-math.ts";

const a = { lat: 10, lng: 20 };
const b = { lat: 20, lng: 40 };

test("interpolation at 0, 0.5 and 1", () => {
  assert.deepEqual(interpolateLatLng(a, b, 0), a);
  assert.deepEqual(interpolateLatLng(a, b, 0.5), { lat: 15, lng: 30 });
  assert.deepEqual(interpolateLatLng(a, b, 1), b);
});

test("interpolation clamps t and survives NaN", () => {
  assert.deepEqual(interpolateLatLng(a, b, -3), a);
  assert.deepEqual(interpolateLatLng(a, b, 7), b);
  assert.deepEqual(interpolateLatLng(a, b, NaN), a);
});

test("interpolation works with decreasing coordinates", () => {
  assert.deepEqual(interpolateLatLng(b, a, 0.5), { lat: 15, lng: 30 });
});

test("bounds of no points is null", () => {
  assert.equal(boundsOf([]), null);
  assert.equal(boundsOf([{ lat: NaN, lng: 1 }]), null);
});

test("bounds of one point is that point", () => {
  assert.deepEqual(boundsOf([a]), { south: 10, west: 20, north: 10, east: 20 });
});

test("bounds of several points, order independent, bad points ignored", () => {
  const pts = [{ lat: 19, lng: 72 }, { lat: 18.9, lng: 73.1 }, { lat: 19.2, lng: 72.5 }, { lat: NaN, lng: 0 }];
  const expected = { south: 18.9, west: 72, north: 19.2, east: 73.1 };
  assert.deepEqual(boundsOf(pts), expected);
  assert.deepEqual(boundsOf([...pts].reverse()), expected);
});

test("distance formatting", () => {
  assert.equal(formatDistanceKm(0), "0 m");
  assert.equal(formatDistanceKm(0.234), "230 m");
  assert.equal(formatDistanceKm(0.999), "1000 m");
  assert.equal(formatDistanceKm(1), "1.0 km");
  assert.equal(formatDistanceKm(2.46), "2.5 km");
  assert.equal(formatDistanceKm(9.94), "9.9 km");
  assert.equal(formatDistanceKm(12.4), "12 km");
  assert.equal(formatDistanceKm(-1), "");
  assert.equal(formatDistanceKm(NaN), "");
});
