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

import { bootstrapAction, failureKind, isRetryable } from "../lib/maps/library.ts";

test("failureKind: a rejected key wins over a generic load failure", () => {
  assert.equal(failureKind(true), "auth_failed");
  assert.equal(failureKind(false), "load_failed");
});

test("only a transient load failure is retryable", () => {
  assert.equal(isRetryable("load_failed"), true);
  assert.equal(isRetryable("auth_failed"), false);
  assert.equal(isRetryable("missing_key"), false);
});

test("bootstrapAction never injects a second script", () => {
  assert.equal(bootstrapAction(true, true), "resolve");
  assert.equal(bootstrapAction(true, false), "resolve");
  assert.equal(bootstrapAction(false, true), "reuse");
  assert.equal(bootstrapAction(false, false), "inject");
});
