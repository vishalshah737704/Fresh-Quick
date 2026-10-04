import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_LINE_QUANTITY, MAX_CARDS_PER_REPLY, MAX_SNAPSHOT_LINES } from "../lib/zippy/action-types.ts";
import { executeAction, CART_CHANGED_MESSAGE } from "../lib/zippy/action-exec.ts";
import { snapshotCart } from "../lib/zippy/client-cart.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const item = (menuItemId = "m1", quantity = 2) => ({ menuItemId, name: "Masala Dosa", price: 130, quantity, imageUrl: null, selectedOptions: [], specialInstructions: null });

function fakeCart(storeId = null, lineIds = [], orderNote = "") {
  const calls = [];
  return {
    calls,
    storeId,
    orderNote,
    items: lineIds.map((lineId) => ({ lineId })),
    addItems: (...args) => calls.push(["addItems", ...args]),
    updateQuantity: (...args) => calls.push(["updateQuantity", ...args]),
    removeItem: (...args) => calls.push(["removeItem", ...args]),
    clearCart: () => calls.push(["clearCart"]),
    setOrderNote: (...args) => calls.push(["setOrderNote", ...args]),
  };
}
const addCard = { kind: "add_item", id: "c1", title: "t", description: "d", storeId: "s1", storeName: "Dosa Corner", cartStoreId: null, item: item() };

test("add_item into an empty cart or the same store does not replace", () => {
  for (const [card, cart] of [[addCard, fakeCart(null)], [{ ...addCard, cartStoreId: "s1" }, fakeCart("s1", ["x"])]]) {
    const out = executeAction(card, cart);
    assert.equal(out.ok, true);
    assert.deepEqual(cart.calls, [["addItems", "s1", "Dosa Corner", [addCard.item], false]]);
  }
});

test("add_item into another store replaces the cart atomically (never clearCart then addItem)", () => {
  const cart = fakeCart("s2", ["x"]);
  const out = executeAction({ ...addCard, cartStoreId: "s2" }, cart);
  assert.equal(out.ok, true);
  assert.deepEqual(cart.calls, [["addItems", "s1", "Dosa Corner", [addCard.item], true]]);
  assert.match(out.message, /replaced/i);
});

test("reorder adds every kept line, replacing only for another store; an empty reorder fails", () => {
  const card = { kind: "reorder", id: "c2", title: "t", description: "d", storeId: "s1", storeName: "Dosa Corner", cartStoreId: null, items: [item("m1", 1), item("m2", 2)], skipped: [] };
  const same = fakeCart("s1", []);
  assert.equal(executeAction(card, same).ok, true);
  assert.deepEqual(same.calls, [["addItems", "s1", "Dosa Corner", card.items, false]]);
  const other = fakeCart("s9", []);
  executeAction({ ...card, cartStoreId: "s9" }, other);
  assert.equal(other.calls[0][4], true);
  const empty = fakeCart(null);
  assert.equal(executeAction({ ...card, items: [] }, empty).ok, false);
  assert.deepEqual(empty.calls, []);
});

test("update_quantity and remove_line need the line to exist; otherwise nothing changes", () => {
  const update = { kind: "update_quantity", id: "c3", title: "t", description: "d", lineId: "L1", quantity: 3 };
  const remove = { kind: "remove_line", id: "c4", title: "t", description: "d", lineId: "L1" };
  const hit = fakeCart("s1", ["L1"]);
  assert.equal(executeAction(update, hit).ok, true);
  assert.equal(executeAction(remove, hit).ok, true);
  assert.deepEqual(hit.calls, [["updateQuantity", "L1", 3], ["removeItem", "L1"]]);
  const miss = fakeCart("s1", ["L2"]);
  for (const card of [update, remove]) {
    const out = executeAction(card, miss);
    assert.deepEqual(out, { ok: false, message: CART_CHANGED_MESSAGE });
  }
  assert.deepEqual(miss.calls, []);
});

test("update_quantity rejects quantities outside 1..20 or non-integers even if a card carries them", () => {
  const cart = fakeCart("s1", ["L1"]);
  for (const quantity of [0, 21, 1.5, -1, Number.NaN]) {
    assert.equal(executeAction({ kind: "update_quantity", id: "c", title: "t", description: "d", lineId: "L1", quantity }, cart).ok, false);
  }
  assert.deepEqual(cart.calls, []);
});

test("clear_cart clears", () => {
  const cart = fakeCart("s1", ["L1"]);
  assert.equal(executeAction({ kind: "clear_cart", id: "c5", title: "t", description: "d" }, cart).ok, true);
  assert.deepEqual(cart.calls, [["clearCart"]]);
});

test("go_to_checkout is ok only when the live cart is that store, and never mutates the cart", () => {
  const card = { kind: "go_to_checkout", id: "c6", title: "t", description: "d", storeId: "s1", storeName: "Dosa Corner", itemCount: 2 };
  const match = fakeCart("s1", ["L1"]);
  assert.deepEqual(executeAction(card, match), { ok: true, message: "Opening checkout." });
  for (const cart of [fakeCart("s2", ["L1"]), fakeCart(null)]) {
    assert.deepEqual(executeAction(card, cart), { ok: false, message: CART_CHANGED_MESSAGE });
    assert.deepEqual(cart.calls, []);
  }
  assert.deepEqual(match.calls, []);
});

test("snapshotCart keeps ids, names, quantities, prices and option names, capped at 50 lines", () => {
  const line = (n) => ({ lineId: `L${n}`, name: `Dish ${n}`, quantity: 1, price: 10, selectedOptions: [{ optionName: "Large" }] });
  const snap = snapshotCart({ storeId: "s1", storeName: "Dosa Corner", items: Array.from({ length: 60 }, (_, n) => line(n)) });
  assert.equal(snap.items.length, MAX_SNAPSHOT_LINES);
  assert.deepEqual(snap.items[0], { lineId: "L0", name: "Dish 0", quantity: 1, price: 10, options: ["Large"] });
  assert.deepEqual(snapshotCart({ storeId: null, storeName: null, items: [] }), { storeId: null, storeName: null, orderNote: "", items: [] });
});

test("limits are the agreed values and the mobile copies are byte-identical", () => {
  assert.equal(MAX_LINE_QUANTITY, 20);
  assert.equal(MAX_CARDS_PER_REPLY, 3);
  assert.equal(MAX_SNAPSHOT_LINES, 50);
  for (const [web, mobile] of [
    ["../lib/zippy/action-types.ts", "../mobile/lib/action-types.ts"],
    ["../lib/zippy/action-exec.ts", "../mobile/lib/action-exec.ts"],
    ["../lib/zippy/client-cart.ts", "../mobile/lib/client-cart.ts"],
  ]) {
    assert.equal(read(mobile), read(web), mobile);
  }
});

test("a card whose replace notice no longer matches the live cart does nothing and says the cart changed", () => {
  const reorder = { kind: "reorder", id: "c2", title: "t", description: "d", storeId: "s1", storeName: "Dosa Corner", cartStoreId: null, items: [item("m1", 1)], skipped: [] };
  const cases = [
    [addCard, fakeCart("s2", ["x"])],
    [{ ...addCard, cartStoreId: "s2" }, fakeCart(null)],
    [{ ...addCard, cartStoreId: "s2" }, fakeCart("s1", ["x"])],
    [reorder, fakeCart("s2", ["x"])],
    [{ ...reorder, cartStoreId: "s2" }, fakeCart("s1", ["x"])],
  ];
  for (const [card, cart] of cases) {
    assert.deepEqual(executeAction(card, cart), { ok: false, message: CART_CHANGED_MESSAGE });
    assert.deepEqual(cart.calls, []);
  }
  const still = fakeCart("s3", ["x"]);
  assert.equal(executeAction({ ...addCard, cartStoreId: "s2" }, still).ok, true);
});

const noteCard = { kind: "set_order_note", id: "n1", title: "Order note", description: "d", text: "no onions", cartStoreId: "s1", expectedNote: "" };

test("set_order_note saves the card text on a matching non-empty cart", () => {
  const cart = fakeCart("s1", ["x"]);
  assert.deepEqual(executeAction(noteCard, cart), { ok: true, message: "Order note saved." });
  assert.deepEqual(cart.calls, [["setOrderNote", "no onions"]]);
});

test("set_order_note with empty text clears and says so", () => {
  const cart = fakeCart("s1", ["x"]);
  assert.deepEqual(executeAction({ ...noteCard, text: "" }, cart), { ok: true, message: "Order note cleared." });
  assert.deepEqual(cart.calls, [["setOrderNote", ""]]);
});

test("set_order_note refuses an empty cart, a different store and a null card store", () => {
  for (const [card, cart] of [[noteCard, fakeCart("s1", [])], [noteCard, fakeCart("s2", ["x"])], [noteCard, fakeCart(null, ["x"])], [{ ...noteCard, cartStoreId: null }, fakeCart("s1", ["x"])]]) {
    assert.deepEqual(executeAction(card, cart), { ok: false, message: CART_CHANGED_MESSAGE });
    assert.deepEqual(cart.calls, []);
  }
});

test("snapshotCart carries the order note, capped at 500, and defaults to empty", () => {
  const base = { storeId: "s1", storeName: "S", items: [] };
  assert.equal(snapshotCart({ ...base, orderNote: "no onions" }).orderNote, "no onions");
  assert.equal(snapshotCart({ ...base, orderNote: "x".repeat(900) }).orderNote.length, 500);
  assert.equal(snapshotCart(base).orderNote, "");
});

test("set_order_note failure leaves the cart untouched (no setOrderNote call)", () => {
  const cart = fakeCart("s2", ["x"]);
  assert.equal(executeAction(noteCard, cart).ok, false);
  assert.equal(cart.calls.some((call) => call[0] === "setOrderNote"), false);
});

test("set_order_note refuses when the live note differs from the one the card was built from", () => {
  const replace = { ...noteCard, expectedNote: "no onions" };
  const edited = fakeCart("s1", ["x"], "typed after the card");
  assert.deepEqual(executeAction(replace, edited), { ok: false, message: CART_CHANGED_MESSAGE });
  assert.deepEqual(edited.calls, []);
  const emptied = fakeCart("s1", ["x"], "");
  assert.deepEqual(executeAction(replace, emptied), { ok: false, message: CART_CHANGED_MESSAGE });
  assert.deepEqual(emptied.calls, []);
  const newNote = fakeCart("s1", ["x"], "something");
  assert.equal(executeAction(noteCard, newNote).ok, false);
});

test("set_order_note still works when the live note is unchanged, including a long one (compared at 500)", () => {
  const same = fakeCart("s1", ["x"], "no onions");
  assert.equal(executeAction({ ...noteCard, expectedNote: "no onions", text: "new" }, same).ok, true);
  assert.deepEqual(same.calls, [["setOrderNote", "new"]]);
  const long = fakeCart("s1", ["x"], "y".repeat(500));
  assert.equal(executeAction({ ...noteCard, expectedNote: "y".repeat(500) }, long).ok, true);
});
