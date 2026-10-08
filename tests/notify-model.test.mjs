import test from "node:test";
import assert from "node:assert/strict";
import { validatePreferencesPatch, validateDeviceToken, planDispatch, toPreferences, unreadCount, describeAge } from "../lib/notify-model.ts";

const note = { title: "T", body: "B", kind: "order_delivered", orderId: "o1" };

test("preferences patch validation", () => {
  assert.deepEqual(validatePreferencesPatch({ push: false, orderUpdates: true }), { ok: true, patch: { push: false, order_updates: true } });
  assert.equal(validatePreferencesPatch({ push: "no" }).ok, false);
  assert.equal(validatePreferencesPatch({ nope: true }).ok, false);
  assert.equal(validatePreferencesPatch({}).ok, false);
  assert.equal(validatePreferencesPatch([]).ok, false);
});

test("device token validation", () => {
  assert.equal(validateDeviceToken("ExponentPushToken[abcdefghij1234]", "ios").ok, true);
  assert.equal(validateDeviceToken("garbage", "ios").ok, false);
  assert.equal(validateDeviceToken("ExponentPushToken[abcdefghij1234]", "web").ok, false);
});

test("planDispatch: push per token, sms/whatsapp only when enabled everywhere", () => {
  const prefs = toPreferences(null);
  const off = { smsEnabled: false, whatsappEnabled: false };
  assert.equal(planDispatch(note, prefs, ["a", "b"], "+919999999999", off).length, 2);
  assert.equal(planDispatch(note, { ...prefs, push: false }, ["a"], null, off).length, 0);
  const on = { smsEnabled: true, whatsappEnabled: true };
  assert.equal(planDispatch(note, { ...prefs, sms: true }, [], "+919999999999", on).length, 1);
  assert.equal(planDispatch(note, { ...prefs, sms: true, whatsapp: true }, [], "+919999999999", on).length, 2);
  assert.equal(planDispatch(note, { ...prefs, sms: true }, [], "9999999999", on).length, 0);
  assert.equal(planDispatch(note, { ...prefs, sms: true }, [], "+919999999999", off).length, 0);
});

test("unreadCount and describeAge", () => {
  assert.equal(unreadCount([{ read: true }, { read: false }, { read: false }]), 2);
  const now = Date.parse("2026-10-08T12:00:00Z");
  assert.equal(describeAge("2026-10-08T11:59:30Z", now), "just now");
  assert.equal(describeAge("2026-10-08T11:30:00Z", now), "30 min ago");
  assert.equal(describeAge("2026-10-08T06:00:00Z", now), "6 h ago");
});
