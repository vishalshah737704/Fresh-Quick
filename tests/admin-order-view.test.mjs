import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAdminOrderRow, overviewStats } from "../lib/admin-order-view.ts";

const raw = {
  id: "abcdef12-0000-0000-0000-000000000000",
  status: "assigned",
  total: "280.00",
  placed_at: "2026-09-30T10:00:00Z",
  recipient_name: "Asha",
  stores: { name: "Dosa Corner" },
  partner: { full_name: "Ravi" },
};

test("normalizes object embeds", () => {
  assert.deepEqual(normalizeAdminOrderRow(raw), {
    id: raw.id, status: "assigned", total: 280, placedAt: raw.placed_at,
    storeName: "Dosa Corner", customerName: "Asha", partnerName: "Ravi",
  });
});

test("normalizes array embeds and a missing partner / store", () => {
  const out = normalizeAdminOrderRow({ ...raw, stores: [{ name: "S" }], partner: null });
  assert.equal(out.storeName, "S");
  assert.equal(out.partnerName, null);
  assert.equal(normalizeAdminOrderRow({ ...raw, stores: null, partner: [] }).storeName, "Unknown store");
  assert.equal(normalizeAdminOrderRow({ ...raw, partner: [] }).partnerName, null);
});

test("overview: rejected counts as finished and is excluded from revenue", () => {
  const stats = overviewStats(
    [
      { status: "placed", total: 100.1 },
      { status: "delivered", total: 200.2 },
      { status: "cancelled", total: 50 },
      { status: "rejected", total: 60 },
    ],
    3
  );
  assert.deepEqual(stats, { activeOrders: 1, vendors: 3, revenuePaise: 10010 + 20020 });
});
