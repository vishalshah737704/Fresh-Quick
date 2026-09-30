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
