import test from "node:test";
import assert from "node:assert/strict";
import { createBridge } from "../lib/cart-bridge.ts";

test("starts null, set/get round-trips, notifies on change only", () => {
  const bridge = createBridge();
  let calls = 0;
  const off = bridge.subscribe(() => calls++);
  assert.equal(bridge.get(), null);
  const value = { items: [] };
  bridge.set(value);
  bridge.set(value);
  assert.equal(bridge.get(), value);
  assert.equal(calls, 1);
  bridge.set({ items: [1] });
  assert.equal(calls, 2);
  bridge.set(null);
  assert.equal(bridge.get(), null);
  off();
  bridge.set({ items: [2] });
  assert.equal(calls, 3);
});
