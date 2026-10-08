import test from "node:test";
import assert from "node:assert/strict";
import { reviewRequestDecision } from "../lib/review-eligibility.ts";

const nowMs = Date.parse("2026-10-07T12:00:00Z");
const base = {
  status: "delivered",
  customerId: "c1",
  deliveredAt: "2026-10-07T10:00:00Z",
  recipientEmail: "a@b.test",
  hasReview: false,
  nowMs,
  minAgeMinutes: 55,
};
const reason = (over) => reviewRequestDecision({ ...base, ...over });

test("eligible when delivered long enough ago, has email, no review", () => {
  assert.deepEqual(reason({}), { eligible: true });
});
test("each ineligible branch returns its reason", () => {
  assert.deepEqual(reason({ status: "picked_up" }), { eligible: false, reason: "not delivered" });
  assert.deepEqual(reason({ customerId: null }), { eligible: false, reason: "customer account deleted" });
  assert.deepEqual(reason({ deliveredAt: null }), { eligible: false, reason: "too early" });
  assert.deepEqual(reason({ deliveredAt: "2026-10-07T11:30:00Z" }), { eligible: false, reason: "too early" });
  assert.deepEqual(reason({ recipientEmail: "   " }), { eligible: false, reason: "no email" });
  assert.deepEqual(reason({ recipientEmail: null }), { eligible: false, reason: "no email" });
  assert.deepEqual(reason({ hasReview: true }), { eligible: false, reason: "already reviewed" });
});
test("age boundary: exactly minAge is old enough, minAge 0 allows a just-delivered order", () => {
  assert.equal(reason({ deliveredAt: "2026-10-07T11:05:00Z" }).eligible, true);
  assert.equal(reason({ deliveredAt: "2026-10-07T11:05:01Z" }).eligible, false);
  assert.equal(reason({ deliveredAt: "2026-10-07T12:00:00Z", minAgeMinutes: 0 }).eligible, true);
});
test("reason order: status beats everything, then account, age, email, review", () => {
  assert.equal(reason({ status: "placed", customerId: null, hasReview: true }).reason, "not delivered");
  assert.equal(reason({ customerId: null, deliveredAt: null }).reason, "customer account deleted");
  assert.equal(reason({ deliveredAt: null, recipientEmail: "", hasReview: true }).reason, "too early");
  assert.equal(reason({ recipientEmail: "", hasReview: true }).reason, "no email");
});
