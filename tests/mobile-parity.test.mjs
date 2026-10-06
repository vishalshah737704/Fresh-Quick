import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as web from "../lib/order-status.ts";
import * as mobile from "../mobile/lib/order-status.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("status list, terminal list and labels/messages are identical", () => {
  assert.deepEqual([...mobile.ORDER_STATUSES], [...web.ORDER_STATUSES]);
  assert.deepEqual([...mobile.TERMINAL_STATUSES], [...web.TERMINAL_STATUSES]);
  assert.deepEqual(mobile.STATUS_LABEL, web.STATUS_LABEL);
  assert.deepEqual(mobile.STATUS_MESSAGE, web.STATUS_MESSAGE);
  for (const status of web.ORDER_STATUSES) {
    assert.equal(mobile.isTerminalStatus(status), web.isTerminalStatus(status), status);
  }
});

test("timeline labels and index map are identical", () => {
  assert.deepEqual([...mobile.TIMELINE_STEPS], [...web.TIMELINE_STEPS]);
  assert.deepEqual(mobile.TIMELINE_STEP_INDEX, web.TIMELINE_STEP_INDEX);
});

test("assigned and picked_up are distinguishable everywhere", () => {
  assert.notEqual(mobile.STATUS_LABEL.assigned, mobile.STATUS_LABEL.picked_up);
  assert.notEqual(mobile.STATUS_COLOR.assigned.background, mobile.STATUS_COLOR.picked_up.background);
});

test("colour tables cover the same statuses with the same sharing pattern as web", () => {
  assert.deepEqual(Object.keys(mobile.STATUS_COLOR).sort(), Object.keys(web.STATUS_COLOR).sort());
  const partition = (colours) => {
    const groups = new Map();
    for (const status of web.ORDER_STATUSES) {
      const key = typeof colours[status] === "string" ? colours[status] : colours[status].background;
      groups.set(key, [...(groups.get(key) ?? []), status]);
    }
    return [...groups.values()].map((g) => g.join(",")).sort();
  };
  assert.deepEqual(partition(mobile.STATUS_COLOR), partition(web.STATUS_COLOR));
});

test("mobile colours are 6-digit hex with white text", () => {
  for (const status of web.ORDER_STATUSES) {
    assert.match(mobile.STATUS_COLOR[status].background, /^#[0-9A-Fa-f]{6}$/, status);
    assert.equal(mobile.STATUS_COLOR[status].text.toUpperCase(), "#FFFFFF", status);
  }
});

test("shared modules are byte-identical copies of the web files", () => {
  assert.equal(read("../mobile/lib/order-detail.ts"), read("../lib/order-detail.ts"));
  assert.equal(read("../mobile/lib/image-url.ts"), read("../lib/image-url.ts"));
  assert.equal(read("../mobile/lib/delivery-animation.ts"), read("../lib/delivery-animation.ts"));
  assert.equal(read("../mobile/lib/brand-logo.ts"), read("../lib/brand-logo.ts"));
  assert.equal(read("../mobile/lib/tracking.ts"), read("../lib/maps/tracking.ts"));
  assert.equal(read("../mobile/lib/geo-math.ts"), read("../lib/maps/geo-math.ts"));
  assert.equal(read("../mobile/lib/geo.ts"), read("../lib/geo.ts"));
  assert.equal(read("../mobile/lib/place.ts"), read("../lib/maps/place.ts"));
  assert.equal(read("../mobile/lib/geolocation.ts"), read("../lib/maps/geolocation.ts"));
  assert.equal(read("../mobile/lib/signup-validation.ts"), read("../lib/signup-validation.ts"));
});

test("phone sign-up screen uses the shared validator, no hand-written pincode regex", () => {
  const screen = read("../mobile/src/app/login/customer.tsx");
  assert.match(screen, /validateSignupAddress/);
  assert.doesNotMatch(screen, /\.test\(pincode/);
});

test("legacy mobile label exports are gone", () => {
  assert.equal(mobile.ORDERS_LIST_STATUS_LABEL, undefined);
  assert.equal(mobile.ORDER_DETAIL_STATUS_LABEL, undefined);
});
