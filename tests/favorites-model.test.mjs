import test from "node:test";
import assert from "node:assert/strict";
import { pickReorderStores, reorderNotice, isReorderBusy, reorderPath } from "../lib/favorites-model.ts";

const store = (id, over = {}) => ({ id, name: `Store ${id}`, banner_url: null, is_open: true, is_suspended: false, ...over });
const row = (id, storeRow, over = {}) => ({ id, store_id: storeRow?.id ?? "x", status: "delivered", placed_at: `2026-10-0${id}T10:00:00Z`, stores: storeRow, ...over });

test("pickReorderStores: distinct stores, newest first, default limit 3", () => {
  const rows = [row("9", store("a")), row("8", store("a")), row("7", store("b")), row("6", store("c")), row("5", store("d"))];
  const out = pickReorderStores(rows);
  assert.deepEqual(out.map((o) => o.storeId), ["a", "b", "c"]);
  assert.equal(out[0].lastOrderId, "9");
});

test("pickReorderStores: skips cancelled, rejected, suspended and missing stores", () => {
  const rows = [
    row("9", store("a"), { status: "cancelled" }),
    row("8", store("b"), { status: "rejected" }),
    row("7", store("c", { is_suspended: true })),
    row("6", null),
    row("5", [store("d")]),
  ];
  assert.deepEqual(pickReorderStores(rows).map((o) => o.storeId), ["d"]);
});

test("pickReorderStores: a closed store is kept but flagged", () => {
  const out = pickReorderStores([row("1", store("a", { is_open: false }))]);
  assert.equal(out[0].isOpen, false);
});

test("reorderNotice: plain add", () => {
  assert.equal(reorderNotice({ storeName: "Dosa Corner", added: 2, skipped: [], replaced: null }), "Added 2 items from Dosa Corner to your cart.");
  assert.equal(reorderNotice({ storeName: "Dosa Corner", added: 1, skipped: [], replaced: null }), "Added 1 item from Dosa Corner to your cart.");
});

test("reorderNotice: lists skipped lines and discloses a cart replacement", () => {
  const text = reorderNotice({
    storeName: "Dosa Corner",
    added: 1,
    skipped: [{ name: "Idli", reason: "unavailable now" }],
    replaced: { count: 3, storeName: "Pizza Hub" },
  });
  assert.match(text, /Replaced the 3 items from Pizza Hub/);
  assert.match(text, /Skipped: Idli \(unavailable now\)/);
});

test("isReorderBusy blocks a second tap while one runs", () => {
  assert.equal(isReorderBusy(null, "o1"), false);
  assert.equal(isReorderBusy("o1", "o1"), true);
  assert.equal(isReorderBusy("o1", "o2"), true);
});

test("reorderPath", () => {
  assert.equal(reorderPath("abc"), "/api/customer/orders/abc/reorder");
});
