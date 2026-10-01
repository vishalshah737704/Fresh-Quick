import test from "node:test";
import assert from "node:assert/strict";
import { buildDeliveredEmail, escapeHtml, DELIVERED_GREETING } from "../lib/delivered-email.ts";

const order = {
  id: "abcdef12-0000-0000-0000-000000000000",
  status: "delivered",
  placedAt: "2026-09-30T10:00:00Z",
  acceptedAt: null, pickedUpAt: null, deliveredAt: null,
  subtotal: 250, deliveryFee: 30, total: 280,
  deliveryNote: "ring bell",
  recipientName: "Asha",
  recipientEmail: "asha@example.com",
  recipientPhone: "+919876543210",
  storeName: "Dosa Corner",
  storeAddress: null,
  deliveryPartnerId: "p1",
  address: { label: "Home", lines: ["1 Park St", "Pune 411001"] },
  payment: { status: "success", method: "mock_card" },
  items: [
    {
      id: "i1", quantity: 2, unitPrice: 100.5, specialInstructions: "no onion",
      name: "Masala Dosa", imageUrl: "https://images.pexels.com/photos/1/a.jpeg",
      options: [{ id: "o1", groupName: "Size", optionName: "Large" }],
    },
  ],
};
const allow = (url) => url.startsWith("https://images.pexels.com/");

test("escapeHtml escapes the five special characters", () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
});

test("subject and exact greeting", () => {
  const { subject, html } = buildDeliveredEmail(order, allow);
  assert.equal(subject, "Your order from Dosa Corner has been delivered");
  assert.ok(html.includes(DELIVERED_GREETING));
  assert.equal(
    DELIVERED_GREETING,
    "Thank you for your order. Your order has been successfully delivered. Please let us know your experience."
  );
  assert.ok(html.includes("Hi Asha,"));
  assert.ok(html.includes("#abcdef12"));
});

test("item row shows image, qty, options, note, and paise-correct line total", () => {
  const { html } = buildDeliveredEmail(order, allow);
  assert.ok(html.includes('<img src="https://images.pexels.com/photos/1/a.jpeg"'));
  assert.ok(html.includes("2× Masala Dosa"));
  assert.ok(html.includes("Large"));
  assert.ok(html.includes("no onion"));
  assert.ok(html.includes("₹201.00")); // 100.50 * 2
});

test("totals come from the stored order values", () => {
  const { html } = buildDeliveredEmail(order, allow);
  assert.ok(html.includes("₹250.00"));
  assert.ok(html.includes("₹30.00"));
  assert.ok(html.includes("₹280.00"));
});

test("delivered-to block has name, phone as plain text, address lines, note", () => {
  const { html } = buildDeliveredEmail(order, allow);
  assert.ok(html.includes("+919876543210"));
  assert.ok(!html.includes("href=\"tel:"));
  assert.ok(html.includes("1 Park St"));
  assert.ok(html.includes("Pune 411001"));
  assert.ok(html.includes("ring bell"));
});

test("every dynamic value is escaped, including attributes", () => {
  const evil = {
    ...order,
    recipientName: `<script>alert(1)</script>`,
    storeName: `Bob's & "Co"`,
    deliveryNote: `<b>x</b>`,
    items: [{
      ...order.items[0],
      name: `<img src=x onerror=alert(1)>`,
      specialInstructions: `"><script>1</script>`,
      imageUrl: `https://images.pexels.com/photos/1/a.jpeg"onerror="alert(1)`,
      options: [{ id: "o", groupName: "g", optionName: "<i>opt</i>" }],
    }],
  };
  const { html, subject } = buildDeliveredEmail(evil, allow);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(!html.includes("<i>opt</i>"));
  assert.ok(!/onerror="alert/.test(html));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(subject.includes("Bob's & \"Co\"")); // subject is plain text, not HTML
});

test("no <img> for null, non-https or non-allowlisted image URLs; row still renders", () => {
  for (const imageUrl of [null, "http://images.pexels.com/x.jpg", "https://evil.example/x.jpg"]) {
    const { html } = buildDeliveredEmail({ ...order, items: [{ ...order.items[0], imageUrl }] }, allow);
    assert.ok(!html.includes("<img"), String(imageUrl));
    assert.ok(html.includes("2× Masala Dosa"));
  }
});

test("missing address and 'Not provided' phone render safely", () => {
  const { html } = buildDeliveredEmail(
    { ...order, address: null, recipientPhone: "Not provided", deliveryNote: null },
    allow
  );
  assert.ok(html.includes("No delivery address on file"));
  assert.ok(html.includes("Not provided"));
  assert.ok(!html.includes("Note:"));
});

test("an order with zero items still renders greeting and totals", () => {
  const { html } = buildDeliveredEmail({ ...order, items: [] }, allow);
  assert.ok(html.includes(DELIVERED_GREETING));
  assert.ok(html.includes("₹280.00"));
});

test("phone line is labelled", () => {
  const { html } = buildDeliveredEmail(order, allow);
  assert.ok(html.includes("Phone: +919876543210"));
});

test("subject has CR/LF stripped from the store name", () => {
  const { subject } = buildDeliveredEmail({ ...order, storeName: "Dosa\r\nBcc: x@evil.com" }, allow);
  assert.ok(!/[\r\n]/.test(subject));
  assert.equal(subject, "Your order from Dosa Bcc: x@evil.com has been delivered");
});

test("text cells wrap long unbroken names", () => {
  const { html } = buildDeliveredEmail(order, allow);
  assert.ok(html.includes("word-break:break-word;"));
  assert.ok(html.includes("overflow-wrap:anywhere;"));
});
