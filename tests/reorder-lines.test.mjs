import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeText, toPaise, formatRupees } from "../lib/zippy/catalog.ts";
import { buildReorderLines } from "../lib/zippy/actions.ts";

const deps = { sanitize: sanitizeText, toPaise, formatRupees, newId: () => "id" };
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const product = (over = {}) => ({
  id: U1, name: "Masala Dosa", price: "130.00", imageUrl: null, isAvailable: true,
  storeId: "s1", storeName: "Dosa Corner", storeOpen: true, storeSuspended: false,
  groups: [{ id: "g1", name: "Size", minSelect: 1, maxSelect: 1, options: [{ id: "o1", name: "Regular", priceDeltaPaise: 0 }, { id: "o2", name: "Large", priceDeltaPaise: 2000 }] }],
  ...over,
});
const line = (over = {}) => ({ product_id: U1, quantity: 2, note: null, option_ids: ["o2"], ...over });
const source = (lines) => ({ order_id: "ord1", store_id: "s1", lines });

test("uses today's price including option deltas", () => {
  const out = buildReorderLines(source([line()]), new Map([[U1, product({ price: "150.00" })]]), deps);
  assert.equal(out.ok, true);
  assert.equal(out.items[0].price, 150);
  assert.equal(out.items[0].selectedOptions[0].priceDeltaPaise, 2000);
  assert.equal(out.totalPaise, (15000 + 2000) * 2);
  assert.equal(out.storeName, "Dosa Corner");
});

test("skips unavailable, missing and changed-option lines with reasons", () => {
  const products = new Map([[U1, product()], [U2, product({ id: U2, name: "Idli", isAvailable: false, groups: [] })]]);
  const out = buildReorderLines(source([line(), line({ product_id: U2, option_ids: [] }), line({ product_id: "33333333-3333-4333-8333-333333333333" }), line({ option_ids: ["gone"] })]), products, deps);
  assert.equal(out.ok, true);
  assert.equal(out.items.length, 1);
  assert.deepEqual(out.skipped.map((s) => s.reason), ["unavailable now", "no longer on the menu", "options changed"]);
});

test("closed store, suspended store and nothing reorderable are errors", () => {
  assert.match(buildReorderLines(source([line()]), new Map([[U1, product({ storeOpen: false })]]), deps).error, /closed/i);
  assert.equal(buildReorderLines(source([line()]), new Map([[U1, product({ storeSuspended: true })]]), deps).error, "not found");
  assert.match(buildReorderLines(source([]), new Map(), deps).error, /none of the items/i);
});

test("quantity is clamped to the line limit and notes go through the sanitizer", () => {
  const out = buildReorderLines(source([line({ quantity: 99, note: 'extra "hot"' })]), new Map([[U1, product()]]), deps);
  assert.equal(out.items[0].quantity, 20);
  assert.equal(out.items[0].specialInstructions, sanitizeText('extra "hot"', 200));
});
