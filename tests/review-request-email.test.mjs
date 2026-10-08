import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewRequestEmail } from "../lib/review-request-email.ts";

const base = { orderId: "abcdef12-0000-4000-8000-000000000000", storeName: "Dosa Corner", recipientName: "Asha", orderUrl: "http://localhost:3000/customer/orders/abcdef12-0000-4000-8000-000000000000" };

test("subject names the store and strips line breaks", () => {
  assert.equal(buildReviewRequestEmail(base).subject, "How was your order from Dosa Corner?");
  assert.equal(buildReviewRequestEmail({ ...base, storeName: "A\r\nBcc: x@evil" }).subject, "How was your order from A Bcc: x@evil?");
});

test("html greets the customer, shows the short order id and links to the order page", () => {
  const { html } = buildReviewRequestEmail(base);
  assert.match(html, /Hi Asha,/);
  assert.match(html, /#abcdef12/);
  assert.ok(html.includes(`href="${base.orderUrl}"`));
});

test("everything dynamic is escaped", () => {
  const { html } = buildReviewRequestEmail({ ...base, storeName: "<img src=x onerror=1>", recipientName: "\"><script>alert(1)</script>" });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.match(html, /&lt;script&gt;/);
});

test("a non-http(s) link is dropped rather than emitted", () => {
  for (const orderUrl of ["javascript:alert(1)", "data:text/html,x", "", "not a url"]) {
    const { html } = buildReviewRequestEmail({ ...base, orderUrl });
    assert.ok(!html.includes("href="), orderUrl);
  }
});
