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
  assert.equal(plan.length, 4);
  for (const p of plan.slice(0, 2)) assert.match(p.bucket, /^ip:[0-9a-f]{16}:(min|day)$/);
  for (const p of plan) assert.ok(!p.bucket.includes("1.2.3.4"));
  assert.deepEqual(plan.map((p) => p.limit), [10, 40, 60, 1000]);
});

test("visitors also hit a global backstop independent of IP", () => {
  for (const ip of ["1.2.3.4", "5.6.7.8", null]) {
    const plan = rateLimitPlan({ userId: null, ip });
    assert.deepEqual(plan.slice(2).map((p) => p.bucket), ["visitors:all:min", "visitors:all:day"]);
    assert.deepEqual(plan.slice(2).map((p) => p.windowSeconds), [60, 86400]);
    assert.deepEqual(plan.slice(2).map((p) => p.limit), [60, 1000]);
  }
  assert.equal(rateLimitPlan({ userId: "u1", ip: "1.2.3.4" }).length, 2);
});

test("same IP gives the same bucket; unknown IP shares one strict bucket", () => {
  const a = rateLimitPlan({ userId: null, ip: "9.9.9.9" })[0].bucket;
  const b = rateLimitPlan({ userId: null, ip: "9.9.9.9" })[0].bucket;
  assert.equal(a, b);
  assert.equal(rateLimitPlan({ userId: null, ip: null })[0].bucket, "ip:unknown:min");
});
