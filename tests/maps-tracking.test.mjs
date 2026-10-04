import test from "node:test";
import assert from "node:assert/strict";
import {
  fitKey,
  formatUpdatedAt,
  showTrackingMap,
  toTrackPoint,
  trackingView,
} from "../lib/maps/tracking.ts";
import { normalizeOrderDetail, ORDER_DETAIL_SELECT } from "../lib/order-detail.ts";

const store = { lat: 19.07, lng: 72.87 };
const destination = { lat: 19.1, lng: 72.9 };
const partner = { lat: 19.08, lng: 72.88 };

test("map shows for assigned, picked_up and delivered only", () => {
  for (const s of ["assigned", "picked_up", "delivered"]) assert.equal(showTrackingMap(s), true, s);
  for (const s of ["placed", "accepted", "ready", "cancelled", "rejected"]) {
    assert.equal(showTrackingMap(s), false, s);
  }
});

test("toTrackPoint rejects null, blank, NaN and out of range; accepts numeric strings", () => {
  assert.equal(toTrackPoint(null, 1), null);
  assert.equal(toTrackPoint("", "2"), null);
  assert.equal(toTrackPoint(NaN, 2), null);
  assert.equal(toTrackPoint(91, 2), null);
  assert.deepEqual(toTrackPoint("19.5", "72.5"), { lat: 19.5, lng: 72.5 });
});

test("live status with a ping shows the partner", () => {
  const view = trackingView({ status: "picked_up", store, destination, partner });
  assert.deepEqual(view.partner, partner);
  assert.equal(view.waiting, false);
  assert.equal(view.final, false);
});

test("live status without a ping waits", () => {
  const view = trackingView({ status: "assigned", store, destination, partner: null });
  assert.equal(view.partner, null);
  assert.equal(view.waiting, true);
});

test("delivered shows the final route without the partner", () => {
  const view = trackingView({ status: "delivered", store, destination, partner });
  assert.equal(view.partner, null);
  assert.equal(view.waiting, false);
  assert.equal(view.final, true);
});

test("fitKey ignores partner movement but not point-set changes", () => {
  const a = fitKey(trackingView({ status: "picked_up", store, destination, partner }));
  const b = fitKey(
    trackingView({ status: "picked_up", store, destination, partner: { lat: 19.09, lng: 72.89 } })
  );
  const c = fitKey(trackingView({ status: "assigned", store, destination, partner: null }));
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("formatUpdatedAt handles missing and invalid input", () => {
  assert.equal(formatUpdatedAt(null), "");
  assert.equal(formatUpdatedAt("nope"), "");
  assert.match(formatUpdatedAt("2026-10-04T10:11:12Z"), /^Updated \d\d:\d\d:\d\d$/);
});

test("order detail carries store and delivery coordinates, null when missing", () => {
  assert.match(ORDER_DETAIL_SELECT, /stores\(name, lat, lng,/);
  const raw = {
    id: "o1", status: "assigned", subtotal: 1, delivery_fee: 1, total: 2, placed_at: "x",
    delivery_note: null, recipient_name: "A", recipient_email: "a@b.c", recipient_phone: "1",
    delivery_partner_id: null,
    stores: { name: "S", lat: "19.07", lng: 72.87 },
    address: { label: null, line1: "x", line2: null, city: null, state: null, pincode: null, lat: 19.1, lng: null },
    payments: [], order_items: [],
  };
  const order = normalizeOrderDetail(raw);
  assert.deepEqual(order.storePoint, { lat: 19.07, lng: 72.87 });
  assert.equal(order.deliveryPoint, null);
  assert.equal(normalizeOrderDetail({ ...raw, address: null }).deliveryPoint, null);
});
