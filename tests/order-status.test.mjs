import test from "node:test";
import assert from "node:assert/strict";
import {
  ORDER_STATUSES,
  TERMINAL_STATUSES,
  STATUS_LABEL,
  STATUS_MESSAGE,
  TIMELINE_STEPS,
  TIMELINE_STEP_INDEX,
  isTerminalStatus,
  STATUS_COLOR,
} from "../lib/order-status.ts";

test("timeline has the 6 agreed steps in order", () => {
  assert.deepEqual([...TIMELINE_STEPS], [
    "Placed",
    "Accepted",
    "Preparing",
    "Ready",
    "On the way",
    "Delivered",
  ]);
});

test("accepted is its own step, after placed", () => {
  assert.equal(TIMELINE_STEP_INDEX.placed, 0);
  assert.equal(TIMELINE_STEP_INDEX.accepted, 1);
});

test("every non-cancelled/rejected status maps to a valid step", () => {
  for (const status of ORDER_STATUSES) {
    if (status === "cancelled" || status === "rejected") {
      assert.equal(TIMELINE_STEP_INDEX[status], undefined);
      continue;
    }
    const index = TIMELINE_STEP_INDEX[status];
    assert.ok(Number.isInteger(index) && index >= 0 && index < TIMELINE_STEPS.length, status);
  }
});

test("happy-path chain never moves backwards on the timeline", () => {
  const chain = ["placed", "accepted", "preparing", "ready", "assigned", "picked_up", "delivered"];
  const indices = chain.map((s) => TIMELINE_STEP_INDEX[s]);
  for (let i = 1; i < indices.length; i += 1) {
    assert.ok(indices[i] >= indices[i - 1], `${chain[i]} went backwards`);
  }
  assert.equal(TIMELINE_STEP_INDEX.assigned, 4);
  assert.equal(TIMELINE_STEP_INDEX.picked_up, 4);
  assert.equal(TIMELINE_STEP_INDEX.delivered, 5);
});

test("terminal statuses", () => {
  assert.deepEqual([...TERMINAL_STATUSES].sort(), ["cancelled", "delivered", "rejected"]);
  assert.equal(isTerminalStatus("delivered"), true);
  assert.equal(isTerminalStatus("preparing"), false);
});

test("labels and messages exist for every status", () => {
  for (const status of ORDER_STATUSES) {
    assert.ok(STATUS_LABEL[status], `label ${status}`);
    assert.ok(STATUS_MESSAGE[status], `message ${status}`);
  }
});

test("every status has a colour class with white text", () => {
  for (const status of ORDER_STATUSES) {
    const cls = STATUS_COLOR[status];
    assert.ok(typeof cls === "string" && cls.includes("text-white"), status);
    assert.ok(/\bbg-(?:[a-z]+-(?:700|800|900)|brand-[a-z-]*text-safe)\b/.test(cls), status);
  }
});

test("cancelled and rejected share the failure colour; delivered differs from them", () => {
  assert.equal(STATUS_COLOR.cancelled, STATUS_COLOR.rejected);
  assert.notEqual(STATUS_COLOR.delivered, STATUS_COLOR.cancelled);
});

test("assigned and picked_up are distinguishable by label and colour", () => {
  assert.notEqual(STATUS_LABEL.assigned, STATUS_LABEL.picked_up);
  assert.notEqual(STATUS_COLOR.assigned, STATUS_COLOR.picked_up);
  const labels = ORDER_STATUSES.map((s) => STATUS_LABEL[s]);
  assert.equal(new Set(labels).size, ORDER_STATUSES.length);
});
