import test from "node:test";
import assert from "node:assert/strict";
import { decideCompletion } from "../lib/complete-delivery.ts";

const base = {
  status: "picked_up",
  pickedUpAt: "2026-10-02T10:00:00.000Z",
  nowMs: Date.parse("2026-10-02T10:00:15.000Z"),
  mode: "customer",
  animationMs: 15000,
  toleranceMs: 1000,
};

test("customer, 15 s elapsed -> deliver", () => {
  assert.deepEqual(decideCompletion(base), { kind: "deliver" });
});

test("customer, exactly at the 14 s tolerance boundary -> deliver", () => {
  assert.deepEqual(
    decideCompletion({ ...base, nowMs: Date.parse("2026-10-02T10:00:14.000Z") }),
    { kind: "deliver" }
  );
});

test("customer, too early -> 425 with retryAfterMs", () => {
  const d = decideCompletion({ ...base, nowMs: Date.parse("2026-10-02T10:00:05.000Z") });
  assert.equal(d.kind, "reject");
  assert.equal(d.httpStatus, 425);
  assert.equal(d.retryAfterMs, 9000);
});

test("customer, picked_up_at in the future (clock skew) -> 425", () => {
  const d = decideCompletion({ ...base, nowMs: Date.parse("2026-10-02T09:59:50.000Z") });
  assert.equal(d.kind, "reject");
  assert.equal(d.httpStatus, 425);
});

test("already delivered -> idempotent 'already' for both modes", () => {
  assert.deepEqual(decideCompletion({ ...base, status: "delivered" }), { kind: "already" });
  assert.deepEqual(decideCompletion({ ...base, status: "delivered", mode: "internal" }), { kind: "already" });
});

test("other statuses -> 409 for both modes", () => {
  for (const status of ["placed", "assigned", "ready", "cancelled", "rejected"]) {
    for (const mode of ["customer", "internal"]) {
      const d = decideCompletion({ ...base, status, mode });
      assert.equal(d.kind, "reject", `${status}/${mode}`);
      assert.equal(d.httpStatus, 409, `${status}/${mode}`);
    }
  }
});

test("internal (n8n fallback) skips the time rule", () => {
  const d = decideCompletion({ ...base, mode: "internal", nowMs: Date.parse("2026-10-02T10:00:01.000Z") });
  assert.deepEqual(d, { kind: "deliver" });
});

test("legacy picked_up row with null picked_up_at delivers without the time rule", () => {
  assert.deepEqual(decideCompletion({ ...base, pickedUpAt: null }), { kind: "deliver" });
  assert.deepEqual(decideCompletion({ ...base, pickedUpAt: "garbage" }), { kind: "deliver" });
});
