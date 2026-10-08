import test from "node:test";
import assert from "node:assert/strict";
import { pushTapTarget } from "../mobile/lib/push-target.ts";

const id = "123e4567-e89b-12d3-a456-426614174000";

test("customer with an order opens that order", () => {
  assert.equal(pushTapTarget("customer", { orderId: id, kind: "order_delivered" }), `/customer/orders/${id}`);
});
test("customer without an order id opens the inbox", () => {
  assert.equal(pushTapTarget("customer", { orderId: null }), "/customer/notifications");
  assert.equal(pushTapTarget("customer", undefined), "/customer/notifications");
});
test("a malformed order id is never put into a route", () => {
  assert.equal(pushTapTarget("customer", { orderId: "../../x" }), "/customer/notifications");
});
test("delivery partner opens their inbox; other roles open nothing", () => {
  assert.equal(pushTapTarget("delivery", { orderId: id }), "/delivery/notifications");
  assert.equal(pushTapTarget("vendor", { orderId: id }), null);
  assert.equal(pushTapTarget(null, {}), null);
});
