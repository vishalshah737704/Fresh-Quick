import test from "node:test";
import assert from "node:assert/strict";
import { pickClass } from "../lib/maps/library.ts";

test("pickClass prefers the library class", () => {
  class A {}
  class B {}
  assert.equal(pickClass("Marker", A, B), A);
});

test("pickClass falls back to the global class", () => {
  class B {}
  assert.equal(pickClass("Marker", undefined, B), B);
});

test("pickClass throws a clear error when neither exists (not 'is not a constructor')", () => {
  assert.throws(() => pickClass("Marker", undefined, undefined), /Marker is not available/);
});
