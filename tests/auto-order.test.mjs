import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextAutoStatus,
  parseAutoOrderSetting,
  parseEnabledBody,
  runAutoStep,
} from "../lib/auto-order.ts";

test("nextAutoStatus maps the four automatic steps only", () => {
  assert.equal(nextAutoStatus("placed"), "accepted");
  assert.equal(nextAutoStatus("accepted"), "preparing");
  assert.equal(nextAutoStatus("preparing"), "ready");
  assert.equal(nextAutoStatus("assigned"), "picked_up");
  for (const s of ["ready", "picked_up", "delivered", "cancelled", "rejected", "toString", "", "x"]) {
    assert.equal(nextAutoStatus(s), null, s);
  }
});

test("parseAutoOrderSetting is true only for {enabled: true}", () => {
  assert.equal(parseAutoOrderSetting({ enabled: true }), true);
  for (const v of [{ enabled: false }, { enabled: "true" }, {}, null, undefined, "x", 1, []]) {
    assert.equal(parseAutoOrderSetting(v), false);
  }
});

test("parseEnabledBody needs a strict boolean", () => {
  assert.equal(parseEnabledBody({ enabled: true }), true);
  assert.equal(parseEnabledBody({ enabled: false }), false);
  for (const v of [{ enabled: "true" }, { enabled: 1 }, {}, null, "x"]) {
    assert.equal(parseEnabledBody(v), null);
  }
});

function makeDeps({ enabled = true, order = { status: "placed", paymentSucceeded: true }, advanceOk = true, retrigger = true } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      readEnabled: async () => enabled,
      readOrder: async () => order,
      advance: async (id, from, to) => { calls.push(["advance", id, from, to]); return advanceOk; },
      retriggerAssignment: async (id) => { calls.push(["retrigger", id]); return retrigger; },
    },
  };
}

test("runAutoStep advances one step", async () => {
  const { deps, calls } = makeDeps();
  const result = await runAutoStep(deps, "o1", "placed");
  assert.deepEqual(result, { advanced: true, from: "placed", to: "accepted" });
  assert.deepEqual(calls, [["advance", "o1", "placed", "accepted"]]);
});

test("runAutoStep skips: off, missing, changed, no_step, payment_pending, raced", async () => {
  assert.deepEqual(await runAutoStep(makeDeps({ enabled: false }).deps, "o", "placed"), { advanced: false, reason: "off" });
  assert.deepEqual(await runAutoStep(makeDeps({ order: null }).deps, "o", "placed"), { advanced: false, reason: "missing" });
  assert.deepEqual(await runAutoStep(makeDeps({ order: { status: "cancelled", paymentSucceeded: true } }).deps, "o", "placed"), { advanced: false, reason: "changed" });
  assert.deepEqual(await runAutoStep(makeDeps().deps, "o", "picked_up"), { advanced: false, reason: "no_step" });
  assert.deepEqual(await runAutoStep(makeDeps({ order: { status: "placed", paymentSucceeded: false } }).deps, "o", "placed"), { advanced: false, reason: "payment_pending" });
  assert.deepEqual(await runAutoStep(makeDeps({ advanceOk: false }).deps, "o", "placed"), { advanced: false, reason: "raced" });
});

test("runAutoStep never touches the order when off or when the status changed", async () => {
  const off = makeDeps({ enabled: false });
  await runAutoStep(off.deps, "o", "placed");
  const changed = makeDeps({ order: { status: "accepted", paymentSucceeded: true } });
  await runAutoStep(changed.deps, "o", "placed");
  assert.deepEqual(off.calls, []);
  assert.deepEqual(changed.calls, []);
});

test("a ready order re-triggers assignment instead of advancing", async () => {
  const { deps, calls } = makeDeps({ order: { status: "ready", paymentSucceeded: true } });
  assert.deepEqual(await runAutoStep(deps, "o1", "ready"), { advanced: false, reason: "retriggered" });
  assert.deepEqual(calls, [["retrigger", "o1"]]);
});
