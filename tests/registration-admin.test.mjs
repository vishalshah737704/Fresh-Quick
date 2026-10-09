import test from "node:test";
import assert from "node:assert/strict";
import { shapeRegistrationRows, isUuid } from "../lib/registration-admin.ts";

test("shapeRegistrationRows allow-lists fields and renames to camelCase", () => {
  const rows = shapeRegistrationRows([
    {
      user_id: "11111111-1111-4111-8111-111111111111", email: "a@b.co", full_name: "Asha", phone: "+91982",
      line1: "12 Rd", city: "Mumbai", pincode: "400050", created_at: "2026-10-08T10:00:00Z",
      approval_status: "pending", rejection_reason: null, reviewed_at: null,
      secret_field: "must not leak", password_hash: "x",
    },
  ]);
  assert.deepEqual(rows[0], {
    id: "11111111-1111-4111-8111-111111111111", email: "a@b.co", fullName: "Asha", phone: "+91982",
    line1: "12 Rd", city: "Mumbai", pincode: "400050", createdAt: "2026-10-08T10:00:00Z",
    status: "pending", reason: null, reviewedAt: null,
  });
  assert.ok(!("secret_field" in rows[0]) && !("password_hash" in rows[0]));
});

test("missing optional columns become null and non-arrays shape to an empty list", () => {
  assert.equal(shapeRegistrationRows([{ user_id: "u", email: "e", approval_status: "approved" }])[0].line1, null);
  assert.deepEqual(shapeRegistrationRows(null), []);
});

test("isUuid accepts v4-style ids only", () => {
  assert.equal(isUuid("11111111-1111-4111-8111-111111111111"), true);
  for (const bad of ["", "abc", "11111111-1111-4111-8111-11111111111", "11111111-1111-4111-8111-1111111111111", "' or 1=1 --"]) {
    assert.equal(isUuid(bad), false, bad);
  }
});
