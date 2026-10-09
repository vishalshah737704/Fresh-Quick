import test from "node:test";
import assert from "node:assert/strict";
import { guardProfile } from "../lib/registration-guard.ts";

test("only an approved profile passes", () => {
  assert.deepEqual(guardProfile({ role: "customer", approval_status: "approved" }), { ok: true });
  assert.deepEqual(guardProfile({ role: "vendor", approval_status: "approved" }), { ok: true });
});

test("pending, rejected, unknown and missing profiles are blocked", () => {
  for (const status of ["pending", "rejected", "x", null, undefined]) {
    assert.deepEqual(guardProfile({ role: "customer", approval_status: status }), { ok: false, reason: "unapproved" });
  }
  assert.deepEqual(guardProfile(null), { ok: false, reason: "missing" });
});
