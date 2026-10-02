import test from "node:test";
import assert from "node:assert/strict";
import { DELIVERY_STATUS_TRANSITIONS } from "../lib/order-constants.ts";

test("delivery partners can only advance assigned -> picked_up; delivered is customer/n8n-driven", () => {
  assert.deepEqual(DELIVERY_STATUS_TRANSITIONS, { assigned: "picked_up" });
});
