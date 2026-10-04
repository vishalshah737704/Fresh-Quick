import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeText, toPaise, formatRupees } from "../lib/zippy/catalog.ts";
import { MAX_LINE_QUANTITY, MAX_CARDS_PER_REPLY } from "../lib/zippy/action-types.ts";
import {
  parseProposeAddInput, parseProposeReorderInput, parseProposeCartChangeInput, parseProposeClearInput,
  selectOptions, buildAddItemCard, buildReorderCard, buildCartChangeCard, buildClearCartCard,
  shapeCartForModel, ACTION_TOOLS, ACTION_TOOL_NAMES, selectActionTools, LIMITS,
} from "../lib/zippy/actions.ts";

let n = 0;
const deps = { sanitize: sanitizeText, toPaise, formatRupees, newId: () => `card-${++n}` };
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";

const product = (over = {}) => ({
  id: U1, name: "Masala Dosa", price: "130.00", imageUrl: null, isAvailable: true,
  storeId: "s1", storeName: "Dosa Corner", storeOpen: true, storeSuspended: false,
  groups: [
    { id: "g1", name: "Size", minSelect: 1, maxSelect: 1, options: [{ id: "o1", name: "Regular", priceDeltaPaise: 0 }, { id: "o2", name: "Large", priceDeltaPaise: 2000 }] },
    { id: "g2", name: "Extras", minSelect: 0, maxSelect: 2, options: [{ id: "o3", name: "Cheese", priceDeltaPaise: 1500 }, { id: "o4", name: "Butter", priceDeltaPaise: 1000 }, { id: "o5", name: "Ghee", priceDeltaPaise: 1200 }] },
  ],
  ...over,
});

test("limits match the shared client constants", () => {
  assert.equal(LIMITS.maxLineQuantity, MAX_LINE_QUANTITY);
  assert.equal(LIMITS.maxCardsPerReply, MAX_CARDS_PER_REPLY);
});

test("add input: defaults, bounds and bad values", () => {
  assert.deepEqual(parseProposeAddInput({ product_id: U1 }), { ok: true, value: { product_id: U1, quantity: 1, option_ids: [], note: undefined } });
  assert.deepEqual(parseProposeAddInput({ product_id: U1.toUpperCase(), quantity: 20, option_ids: [U2], note: " no onions " }), { ok: true, value: { product_id: U1, quantity: 20, option_ids: [U2], note: "no onions" } });
  for (const bad of [{}, { product_id: "x" }, { product_id: U1, quantity: 0 }, { product_id: U1, quantity: 21 }, { product_id: U1, quantity: 1.5 }, { product_id: U1, quantity: "2" },
    { product_id: U1, option_ids: "o1" }, { product_id: U1, option_ids: ["not-a-uuid"] }, { product_id: U1, option_ids: Array.from({ length: 21 }, () => U2) }, { product_id: U1, note: "x".repeat(201) }]) {
    assert.equal(parseProposeAddInput(bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(parseProposeAddInput(null).ok, false);
});

test("add input dedupes option ids", () => {
  assert.deepEqual(parseProposeAddInput({ product_id: U1, option_ids: [U2, U2] }).value.option_ids, [U2]);
});

test("reorder input: latest, uuid, and everything else is 'not found'", () => {
  assert.deepEqual(parseProposeReorderInput({ order_id: "latest" }), { ok: true, value: { order_id: "latest" } });
  assert.deepEqual(parseProposeReorderInput({ order_id: U1.toUpperCase() }), { ok: true, value: { order_id: U1 } });
  assert.deepEqual(parseProposeReorderInput({ order_id: "nope" }), { ok: false, error: "not found" });
  assert.deepEqual(parseProposeReorderInput({}), { ok: false, error: "not found" });
});

test("cart change input: 0 removes, 1..20 sets, others rejected", () => {
  assert.deepEqual(parseProposeCartChangeInput({ line_id: "m1::o1", quantity: 0 }), { ok: true, value: { line_id: "m1::o1", quantity: 0 } });
  assert.deepEqual(parseProposeCartChangeInput({ line_id: "m1::", quantity: 20 }), { ok: true, value: { line_id: "m1::", quantity: 20 } });
  for (const bad of [{}, { line_id: "", quantity: 1 }, { line_id: "a", quantity: 21 }, { line_id: "a", quantity: -1 }, { line_id: "a", quantity: 1.5 }, { line_id: "a" }, { line_id: "x".repeat(201), quantity: 1 }]) {
    assert.equal(parseProposeCartChangeInput(bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(parseProposeClearInput({}).ok, true);
  assert.equal(parseProposeClearInput("x").ok, false);
});

test("selectOptions enforces membership, min and max per group", () => {
  const groups = product().groups;
  assert.deepEqual(selectOptions(groups, ["o2", "o3"]), {
    ok: true,
    selected: [
      { groupId: "g1", groupName: "Size", optionId: "o2", optionName: "Large", priceDeltaPaise: 2000 },
      { groupId: "g2", groupName: "Extras", optionId: "o3", optionName: "Cheese", priceDeltaPaise: 1500 },
    ],
  });
  assert.match(selectOptions(groups, []).error, /Size/);            // min_select 1 unmet
  assert.match(selectOptions(groups, ["o1", "o2"]).error, /Size/);   // max_select 1 exceeded
  assert.match(selectOptions(groups, ["o1", "o3", "o4", "o5"]).error, /Extras/); // max_select 2 exceeded
  assert.match(selectOptions(groups, ["o1", "zzz"]).error, /not an option/i);
  assert.deepEqual(selectOptions([], []), { ok: true, selected: [] });
});

test("add card: live price, options, rupees in the description, sanitized note", () => {
  const out = buildAddItemCard({ product: product(), quantity: 2, optionIds: ["o2", "o3"], note: "no <b>onions</b>" }, deps);
  assert.equal(out.ok, true);
  const card = out.card;
  assert.equal(card.kind, "add_item");
  assert.equal(card.storeId, "s1");
  assert.equal(card.storeName, "Dosa Corner");
  assert.deepEqual(card.item, {
    menuItemId: U1, name: "Masala Dosa", price: 130, quantity: 2, imageUrl: null,
    selectedOptions: [
      { groupId: "g1", groupName: "Size", optionId: "o2", optionName: "Large", priceDeltaPaise: 2000 },
      { groupId: "g2", groupName: "Extras", optionId: "o3", optionName: "Cheese", priceDeltaPaise: 1500 },
    ],
    specialInstructions: "no onions",
  });
  assert.match(card.id, /^card-\d+$/);
  // (13000 + 2000 + 1500) * 2 = 33000 paise
  assert.match(card.description, /2 × Masala Dosa/);
  assert.match(card.description, /₹330/);
  assert.match(card.description, /Dosa Corner/);
});

test("add card refuses: unavailable dish, closed store, suspended store, bad options", () => {
  const ok = { quantity: 1, optionIds: ["o1"], note: undefined };
  assert.equal(buildAddItemCard({ product: product({ isAvailable: false }), ...ok }, deps).ok, false);
  assert.match(buildAddItemCard({ product: product({ storeOpen: false }), ...ok }, deps).error, /closed/i);
  assert.match(buildAddItemCard({ product: product({ storeSuspended: true }), ...ok }, deps).error, /not found/i);
  assert.match(buildAddItemCard({ product: product(), quantity: 1, optionIds: [], note: undefined }, deps).error, /Size/);
});

const source = (lines) => ({ order_id: U2, store_id: "s1", lines });
const line = (over = {}) => ({ product_id: U1, quantity: 2, note: null, option_ids: ["o1"], ...over });

test("reorder card keeps good lines and lists skipped ones with reasons", () => {
  const products = new Map([[U1, product()], ["22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa", product({ id: "22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Idli", isAvailable: false, groups: [] })]]);
  const out = buildReorderCard(source([
    line(),
    line({ product_id: "22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa", option_ids: [] }),
    line({ product_id: "33333333-3333-4333-8333-333333333333" }),
    line({ option_ids: [null] }),
    line({ option_ids: ["o1", "gone"] }),
  ]), products, deps);
  assert.equal(out.ok, true);
  assert.equal(out.card.kind, "reorder");
  assert.equal(out.card.items.length, 1);
  assert.equal(out.card.items[0].quantity, 2);
  assert.equal(out.card.storeName, "Dosa Corner");
  assert.deepEqual(out.card.skipped.map((s) => s.reason), ["unavailable now", "no longer on the menu", "options changed", "options changed"]);
  assert.match(out.card.description, /1 item/);
});

test("reorder card errors when nothing can be reordered or the store is closed", () => {
  assert.match(buildReorderCard(source([line({ option_ids: ["gone"] })]), new Map([[U1, product()]]), deps).error, /none of the items/i);
  assert.match(buildReorderCard(source([line()]), new Map([[U1, product({ storeOpen: false })]]), deps).error, /closed/i);
  assert.match(buildReorderCard(source([]), new Map(), deps).error, /none of the items/i);
});

test("reorder clamps quantity to the line limit", () => {
  const out = buildReorderCard(source([line({ quantity: 99 })]), new Map([[U1, product()]]), deps);
  assert.equal(out.card.items[0].quantity, 20);
});

const snapshot = { storeId: "s1", storeName: "Dosa Corner", items: [{ lineId: "m1::o1", name: "Masala Dosa", quantity: 2, price: 130, options: ["Regular"] }] };

test("cart change card: set or remove an existing line; unknown line and empty cart are errors", () => {
  const set = buildCartChangeCard(snapshot, { line_id: "m1::o1", quantity: 3 }, deps);
  assert.equal(set.card.kind, "update_quantity");
  assert.equal(set.card.quantity, 3);
  assert.match(set.card.description, /Masala Dosa/);
  const remove = buildCartChangeCard(snapshot, { line_id: "m1::o1", quantity: 0 }, deps);
  assert.equal(remove.card.kind, "remove_line");
  assert.deepEqual(buildCartChangeCard(snapshot, { line_id: "zzz", quantity: 1 }, deps), { ok: false, error: "not found" });
  assert.deepEqual(buildCartChangeCard(null, { line_id: "m1::o1", quantity: 1 }, deps), { ok: false, error: "The cart is empty" });
});

test("clear card needs a non-empty cart", () => {
  assert.equal(buildClearCartCard(snapshot, deps).card.kind, "clear_cart");
  assert.deepEqual(buildClearCartCard({ storeId: null, storeName: null, items: [] }, deps), { ok: false, error: "The cart is empty" });
  assert.deepEqual(buildClearCartCard(null, deps), { ok: false, error: "The cart is empty" });
});

test("cart shown to the model is sanitized, in rupees, and says when empty", () => {
  const dirty = { storeId: "s1", storeName: "Dosa <b>Corner</b>", items: [{ lineId: "L", name: "Dish <i>x</i>", quantity: 1, price: 99.5, options: ["Big <b>one</b>"] }] };
  assert.deepEqual(shapeCartForModel(dirty, deps), { store: "Dosa Corner", lines: [{ line_id: "L", name: "Dish x", quantity: 1, unit_price: "₹99.50", options: ["Big one"] }], empty: false });
  assert.deepEqual(shapeCartForModel(null, deps), { store: null, lines: [], empty: true });
});

test("tool definitions: five strict tools, offered only to a verified customer with actions on", () => {
  assert.deepEqual(ACTION_TOOL_NAMES, ["get_my_cart", "propose_add_to_cart", "propose_reorder", "propose_cart_change", "propose_clear_cart"]);
  for (const tool of ACTION_TOOLS) assert.equal(tool.strict, true);
  assert.deepEqual(ACTION_TOOLS.find((t) => t.name === "propose_add_to_cart").input_schema.required, ["product_id"]);
  const base = [{ name: "find_stores" }];
  assert.deepEqual(selectActionTools(base, { customerId: null, actionsEnabled: true }), base);
  assert.deepEqual(selectActionTools(base, { customerId: "", actionsEnabled: true }), base);
  assert.deepEqual(selectActionTools(base, { customerId: "c1", actionsEnabled: false }), base);
  assert.equal(selectActionTools(base, { customerId: "c1", actionsEnabled: true }).length, 1 + ACTION_TOOLS.length);
});
