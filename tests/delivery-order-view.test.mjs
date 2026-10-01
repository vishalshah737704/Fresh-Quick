import test from "node:test";
import assert from "node:assert/strict";
import { redactForDelivery } from "../lib/delivery-order-view.ts";

const order = {
  id: "abcdef12-0000-0000-0000-000000000000",
  status: "assigned",
  placedAt: "2026-09-30T10:00:00Z",
  acceptedAt: null, pickedUpAt: null, deliveredAt: null,
  subtotal: 250, deliveryFee: 30, total: 280,
  deliveryNote: "ring bell",
  recipientName: "Asha", recipientEmail: "asha@example.com", recipientPhone: "+919876543210",
  storeName: "Dosa Corner",
  storeAddress: { label: null, lines: ["12 MG Road"] },
  deliveryPartnerId: "p1",
  address: { label: "Home", lines: ["1 Park St", "Pune 411001"] },
  payment: { status: "success", method: "mock_card" },
  items: [],
};

test("active keeps recipient name, phone, address and note but never the email", () => {
  const out = redactForDelivery(order, "active");
  assert.equal(out.recipientName, "Asha");
  assert.equal(out.recipientPhone, "+919876543210");
  assert.deepEqual(out.address, order.address);
  assert.equal(out.deliveryNote, "ring bell");
  assert.equal(out.recipientEmail, "");
});

test("available hides every recipient detail but keeps store, pickup address, items, amount", () => {
  const out = redactForDelivery({ ...order, status: "ready", deliveryPartnerId: null }, "available");
  assert.equal(out.recipientName, "");
  assert.equal(out.recipientPhone, "");
  assert.equal(out.recipientEmail, "");
  assert.equal(out.address, null);
  assert.equal(out.deliveryNote, null);
  assert.equal(out.storeName, "Dosa Corner");
  assert.deepEqual(out.storeAddress, order.storeAddress);
  assert.equal(out.total, 280);
});

test("history hides phone/address/note, keeps name", () => {
  const out = redactForDelivery({ ...order, status: "delivered" }, "history");
  assert.equal(out.recipientName, "Asha");
  assert.equal(out.recipientPhone, "");
  assert.equal(out.address, null);
  assert.equal(out.deliveryNote, null);
});

test("does not mutate its input", () => {
  const copy = structuredClone(order);
  redactForDelivery(order, "available");
  assert.deepEqual(order, copy);
});
