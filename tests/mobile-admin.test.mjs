import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as webView from "../lib/admin-order-view.ts";
import * as mobileView from "../mobile/lib/admin-order-view.ts";
import * as mobileAdmin from "../mobile/lib/registration-admin.ts";
import { notifyAdminPendingChanged, onAdminPendingChanged } from "../mobile/lib/admin-pending.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("overviewStats on the phone copy matches web and survives an empty list", () => {
  assert.deepEqual(mobileView.overviewStats([], 0), { activeOrders: 0, vendors: 0, revenuePaise: 0 });
  const orders = [
    { status: "placed", total: 100 },
    { status: "delivered", total: 50.5 },
    { status: "cancelled", total: 70 },
    { status: "rejected", total: 20 },
  ];
  assert.deepEqual(mobileView.overviewStats(orders, 3), webView.overviewStats(orders, 3));
  assert.deepEqual(mobileView.overviewStats(orders, 3), { activeOrders: 1, vendors: 3, revenuePaise: 15050 });
});

test("shapeRegistrationRows on the phone copy is allow-listed and tolerant", () => {
  assert.deepEqual(mobileAdmin.shapeRegistrationRows(null), []);
  const [row] = mobileAdmin.shapeRegistrationRows([{ user_id: "u1", email: "a@b.co", full_name: "A", secret: "x" }]);
  assert.equal(row.id, "u1");
  assert.equal(row.fullName, "A");
  assert.equal("secret" in row, false);
});

test("admin pending event notifies subscribers until they unsubscribe", () => {
  let calls = 0;
  const off = onAdminPendingChanged(() => { calls += 1; });
  notifyAdminPendingChanged();
  notifyAdminPendingChanged();
  assert.equal(calls, 2);
  off();
  notifyAdminPendingChanged();
  assert.equal(calls, 2);
});

test("session guard accepts the admin login route", () => {
  assert.match(read("../mobile/lib/use-require-session.ts"), /"\/login\/admin"/);
});
