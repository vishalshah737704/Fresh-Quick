import test from "node:test";
import assert from "node:assert/strict";
import {
  DELIVERY_ANIMATION_MS,
  RETRY_AFTER_EARLY_MS,
  SCROLL_SPAN,
  animationElapsedMs,
  clearAnimationStart,
  getAnimationStart,
  limbPolygon,
  riderPose,
  runCompletion,
  skyline,
} from "../lib/delivery-animation.ts";
import { LOGO_COLORS, LOGO_PATHS, LOGO_VIEWBOX } from "../lib/brand-logo.ts";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("animation is 15 seconds", () => {
  assert.equal(DELIVERY_ANIMATION_MS, 15000);
});

test("animationElapsedMs: null/NaN start -> 0", () => {
  assert.equal(animationElapsedMs(null, 1_000_000), 0);
  assert.equal(animationElapsedMs(NaN, 1_000_000), 0);
});

test("animationElapsedMs: elapsed time within range", () => {
  assert.equal(animationElapsedMs(1000, 5000), 4000);
  assert.equal(animationElapsedMs(1000, 1000), 0);
});

test("animationElapsedMs: clamps at 15000", () => {
  assert.equal(animationElapsedMs(0, 15000), 15000);
  assert.equal(animationElapsedMs(0, 99999), 15000);
});

test("animationElapsedMs: now before start -> 0", () => {
  assert.equal(animationElapsedMs(10_000, 5000), 0);
});

test("getAnimationStart: first call stores and returns now; later calls return the stored start", () => {
  const starts = new Map();
  assert.equal(getAnimationStart(starts, "a", 1000), 1000);
  assert.equal(getAnimationStart(starts, "a", 9000), 1000);
});

test("getAnimationStart: order ids are independent", () => {
  const starts = new Map();
  getAnimationStart(starts, "a", 1000);
  assert.equal(getAnimationStart(starts, "b", 2000), 2000);
  assert.equal(getAnimationStart(starts, "a", 3000), 1000);
});

test("clearAnimationStart: clearing makes the next call store anew", () => {
  const starts = new Map();
  getAnimationStart(starts, "a", 1000);
  clearAnimationStart(starts, "a");
  assert.equal(getAnimationStart(starts, "a", 7000), 7000);
});

test("riderPose: leg segments keep constant length (valid IK)", () => {
  for (const ms of [0, 250, 700, 1500, 4321, 9999, 15000]) {
    const pose = riderPose(ms);
    for (const leg of [pose.legNear, pose.legFar]) {
      assert.ok(Math.abs(dist(pose.hip, leg.knee) - 44) < 0.01, `thigh @${ms}`);
      assert.ok(Math.abs(dist(leg.knee, leg.foot) - 46) < 0.01, `shin @${ms}`);
    }
    for (const arm of [pose.armNear, pose.armFar]) {
      assert.ok(Math.abs(dist(pose.shoulder, arm.elbow) - 30) < 0.01, `upper arm @${ms}`);
      assert.ok(Math.abs(dist(arm.elbow, arm.hand) - 30) < 0.5, `forearm @${ms}`);
    }
  }
});

test("riderPose: near and far legs are half a turn apart; pedalling is periodic", () => {
  const a = riderPose(0);
  const b = riderPose(1000 / 1.15); // exactly one pedal turn
  assert.ok(dist(a.legNear.foot, b.legNear.foot) < 0.01);
  assert.ok(dist(a.legNear.foot, a.legFar.foot) > 20);
});

test("riderPose: scenery scrolls left and wraps within SCROLL_SPAN", () => {
  const p1 = riderPose(1000);
  assert.equal(p1.scroll.far, -14);
  assert.equal(p1.scroll.marks, -230);
  const late = riderPose(15000);
  for (const v of Object.values(late.scroll)) assert.ok(v <= 0 && v > -SCROLL_SPAN);
});

test("limbPolygon returns four x,y points", () => {
  const pts = limbPolygon([0, 0], [10, 0], 4, 2).split(" ");
  assert.equal(pts.length, 4);
  assert.deepEqual(pts[0].split(",").length, 2);
});

test("skyline is deterministic and covers the requested width", () => {
  const a = skyline(23, 70, 120, 4, 560, true);
  const b = skyline(23, 70, 120, 4, 560, true);
  assert.deepEqual(a, b);
  const last = a[a.length - 1];
  assert.ok(last.x + last.width >= 560);
  assert.ok(a.every((bld) => bld.colorIndex >= 0 && bld.colorIndex < 4));
  assert.equal(skyline(5, 60, 130, 3, 560, false).every((bld) => bld.windows.length === 0), true);
});

test("runCompletion: 200 first try -> delivered, no sleeping", async () => {
  const sleeps = [];
  const result = await runCompletion(async () => 200, async (ms) => void sleeps.push(ms));
  assert.equal(result, "delivered");
  assert.deepEqual(sleeps, []);
});

test("runCompletion: 425 (too early) retries after RETRY_AFTER_EARLY_MS then delivers", async () => {
  const statuses = [425, 425, 200];
  const sleeps = [];
  const result = await runCompletion(async () => statuses.shift(), async (ms) => void sleeps.push(ms));
  assert.equal(result, "delivered");
  assert.deepEqual(sleeps, [RETRY_AFTER_EARLY_MS, RETRY_AFTER_EARLY_MS]);
});

test("runCompletion: network error (0) and 5xx back off then deliver", async () => {
  const statuses = [0, 503, 200];
  const sleeps = [];
  const result = await runCompletion(async () => statuses.shift(), async (ms) => void sleeps.push(ms));
  assert.equal(result, "delivered");
  assert.deepEqual(sleeps, [1000, 2000]);
});

test("runCompletion: 401/404/409 stop immediately as failed", async () => {
  for (const status of [401, 404, 409]) {
    let calls = 0;
    const result = await runCompletion(async () => (calls++, status), async () => {});
    assert.equal(result, "failed", String(status));
    assert.equal(calls, 1, String(status));
  }
});

test("runCompletion: gives up after maxAttempts", async () => {
  let calls = 0;
  const result = await runCompletion(async () => (calls++, 500), async () => {}, 3);
  assert.equal(result, "failed");
  assert.equal(calls, 3);
});

test("brand logo data: viewbox, both shapes and the three brand colours", () => {
  assert.equal(LOGO_VIEWBOX, 80);
  assert.ok(LOGO_PATHS.bolt.startsWith("M") && LOGO_PATHS.leaf.startsWith("M"));
  assert.deepEqual(LOGO_COLORS, { disc: "#FFFFFF", bolt: "#F5821F", leaf: "#1E8A3E" });
});
