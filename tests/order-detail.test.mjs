import test from "node:test";
import assert from "node:assert/strict";
import {
  ORDER_DETAIL_SELECT,
  cleanText,
  formatPaise,
  formatPayment,
  lineTotalPaise,
  normalizeOrderDetail,
  normalizeOrderListRow,
} from "../lib/order-detail.ts";
import { isAllowedImageUrl } from "../lib/image-url.ts";

const baseRaw = {
  id: "abcdef12-0000-0000-0000-000000000000",
  status: "placed",
  subtotal: 250,
  delivery_fee: 30,
  total: 280,
  placed_at: "2026-09-30T10:00:00Z",
  delivery_note: "  ring bell  ",
  recipient_name: "Asha",
  recipient_email: "asha@example.com",
  recipient_phone: "+919876543210",
  delivery_partner_id: null,
  stores: { name: "Spice Hub" },
  address: {
    label: "Home",
    line1: "12 MG Road",
    line2: null,
    city: "Pune",
    state: "MH",
    pincode: "411001",
  },
  payments: [{ status: "success", method: "mock_card" }],
  order_items: [
    {
      id: "i1",
      quantity: 2,
      unit_price: 125.5,
      special_instructions: "   ",
      products: { name: "Paneer Tikka", image_url: "https://images.pexels.com/photos/1.jpeg" },
      order_item_options: [{ id: "o1", group_name: "Spice", option_name: "Hot" }],
    },
  ],
};

test("select string embeds the relations the UI needs", () => {
  for (const part of ["stores(name,", "addresses!delivery_address_id", "payments(", "order_items(", "order_item_options("]) {
    assert.ok(ORDER_DETAIL_SELECT.includes(part), part);
  }
});

test("normalizes a full order", () => {
  const order = normalizeOrderDetail(baseRaw);
  assert.equal(order.storeName, "Spice Hub");
  assert.equal(order.recipientName, "Asha");
  assert.equal(order.recipientPhone, "+919876543210");
  assert.equal(normalizeOrderDetail({ ...baseRaw, recipient_phone: "" }).recipientPhone, "Not provided");
  assert.equal(order.total, 280);
  assert.equal(order.deliveryNote, "ring bell");
  assert.deepEqual(order.address?.lines, ["12 MG Road", "Pune, MH 411001"]);
  assert.equal(order.address?.label, "Home");
  assert.deepEqual(order.payment, { status: "success", method: "mock_card" });
  assert.equal(order.items[0].name, "Paneer Tikka");
  assert.equal(order.items[0].imageUrl, "https://images.pexels.com/photos/1.jpeg");
  assert.deepEqual(order.items[0].options, [{ id: "o1", groupName: "Spice", optionName: "Hot" }]);
});

test("missing address -> null (Review Focus 1)", () => {
  assert.equal(normalizeOrderDetail({ ...baseRaw, address: null }).address, null);
});

test("deleted product -> fallback name, null image (Review Focus 3)", () => {
  const raw = {
    ...baseRaw,
    order_items: [{ ...baseRaw.order_items[0], products: null }],
  };
  const item = normalizeOrderDetail(raw).items[0];
  assert.equal(item.name, "Item");
  assert.equal(item.imageUrl, null);
});

test("blank instructions and note -> null (Review Focus 4)", () => {
  const order = normalizeOrderDetail({ ...baseRaw, delivery_note: "   " });
  assert.equal(order.deliveryNote, null);
  assert.equal(order.items[0].specialInstructions, null);
  assert.equal(cleanText(undefined), null);
  assert.equal(cleanText(" x "), "x");
});

test("accepts object or array forms for embeds and no payment", () => {
  const asObjects = normalizeOrderDetail({
    ...baseRaw,
    stores: [{ name: "Spice Hub" }],
    payments: { status: "pending", method: "mock_upi" },
  });
  assert.equal(asObjects.storeName, "Spice Hub");
  assert.equal(asObjects.payment?.status, "pending");
  assert.equal(normalizeOrderDetail({ ...baseRaw, payments: [] }).payment, null);
});

test("address with only line1 has no stray separators", () => {
  const order = normalizeOrderDetail({
    ...baseRaw,
    address: { label: null, line1: "5 Lane", line2: null, city: null, state: null, pincode: null },
  });
  assert.deepEqual(order.address?.lines, ["5 Lane"]);
});

test("money helpers use integer paise", () => {
  assert.equal(lineTotalPaise(125.5, 2), 25100);
  assert.equal(lineTotalPaise(0.1, 3), 30);
  assert.equal(formatPaise(28000), "₹280.00");
  assert.equal(formatPaise(25100), "₹251.00");
});

test("list row normalization", () => {
  const row = normalizeOrderListRow({
    id: "x1",
    status: "delivered",
    total: 99,
    placed_at: "2026-09-30T10:00:00Z",
    stores: { name: "Spice Hub" },
    order_items: [
      { id: "a", quantity: 1, products: { name: "Dosa", image_url: null } },
      { id: "b", quantity: 3, products: null },
    ],
  });
  assert.equal(row.storeName, "Spice Hub");
  assert.equal(row.itemCount, 4);
  assert.equal(row.items[1].name, "Item");
});

test("image host guard rejects unknown hosts and http (Review Focus 2)", () => {
  assert.equal(isAllowedImageUrl("https://images.pexels.com/photos/1.jpeg"), true);
  assert.equal(isAllowedImageUrl("https://evil.example.com/a.jpg"), false);
  assert.equal(isAllowedImageUrl("http://images.pexels.com/a.jpg"), false);
  assert.equal(isAllowedImageUrl("not a url"), false);
});

test("select string asks for store address and the three timestamps", () => {
  assert.match(ORDER_DETAIL_SELECT, /accepted_at/);
  assert.match(ORDER_DETAIL_SELECT, /picked_up_at/);
  assert.match(ORDER_DETAIL_SELECT, /delivered_at/);
  assert.match(ORDER_DETAIL_SELECT, /store_address:addresses!address_id/);
});

test("store address normalizes from object or array embed; null when absent", () => {
  const addr = { label: null, line1: "12 MG Road", line2: null, city: "Bengaluru", state: "KA", pincode: "560001" };
  const withObj = normalizeOrderDetail({ ...baseRaw, stores: { name: "S", store_address: addr } });
  assert.deepEqual(withObj.storeAddress, { label: null, lines: ["12 MG Road", "Bengaluru, KA 560001"] });
  const withArr = normalizeOrderDetail({ ...baseRaw, stores: [{ name: "S", store_address: [addr] }] });
  assert.deepEqual(withArr.storeAddress, withObj.storeAddress);
  const none = normalizeOrderDetail({ ...baseRaw, stores: { name: "S", store_address: null } });
  assert.equal(none.storeAddress, null);
});

test("timestamps pass through and default to null", () => {
  const stamped = normalizeOrderDetail({
    ...baseRaw,
    accepted_at: "2026-09-30T10:05:00Z",
    picked_up_at: "2026-09-30T10:30:00Z",
    delivered_at: "2026-09-30T10:50:00Z",
  });
  assert.equal(stamped.acceptedAt, "2026-09-30T10:05:00Z");
  assert.equal(stamped.pickedUpAt, "2026-09-30T10:30:00Z");
  assert.equal(stamped.deliveredAt, "2026-09-30T10:50:00Z");
  const old = normalizeOrderDetail(baseRaw);
  assert.equal(old.acceptedAt, null);
  assert.equal(old.pickedUpAt, null);
  assert.equal(old.deliveredAt, null);
});

test("formatPayment gives readable labels for every DB value", () => {
  assert.equal(formatPayment(null), "—");
  assert.equal(formatPayment({ status: "success", method: "mock_card" }), "Paid · Card");
  assert.equal(formatPayment({ status: "pending", method: "mock_cod" }), "Pending · Cash on delivery");
  assert.equal(formatPayment({ status: "failed", method: "mock_upi" }), "Failed · UPI");
  assert.equal(formatPayment({ status: "refunded", method: "mock_card" }), "Refunded · Card");
  assert.equal(formatPayment({ status: "weird", method: "other" }), "weird · other");
});
