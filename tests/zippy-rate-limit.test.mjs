import test from "node:test";
import assert from "node:assert/strict";
import { rateLimitPlan } from "../lib/zippy/rate-limit.ts";

test("signed-in users get per-user minute and day buckets", () => {
  const plan = rateLimitPlan({ userId: "u1", ip: "1.2.3.4" });
  assert.deepEqual(plan.map((p) => p.bucket), ["user:u1:min", "user:u1:day"]);
  assert.deepEqual(plan.map((p) => p.windowSeconds), [60, 86400]);
  assert.deepEqual(plan.map((p) => p.limit), [20, 100]);
});

test("visitors are bucketed by hashed IP with tighter limits; raw IP never stored", () => {
  const plan = rateLimitPlan({ userId: null, ip: "1.2.3.4" });
  assert.equal(plan.length, 2);
  for (const p of plan) {
    assert.match(p.bucket, /^ip:[0-9a-f]{16}:(min|day)$/);
    assert.ok(!p.bucket.includes("1.2.3.4"));
  }
  assert.deepEqual(plan.map((p) => p.limit), [10, 40]);
});

test("same IP gives the same bucket; unknown IP shares one strict bucket", () => {
  const a = rateLimitPlan({ userId: null, ip: "9.9.9.9" })[0].bucket;
  const b = rateLimitPlan({ userId: null, ip: "9.9.9.9" })[0].bucket;
  assert.equal(a, b);
  assert.equal(rateLimitPlan({ userId: null, ip: null })[0].bucket, "ip:unknown:min");
});
