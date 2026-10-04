import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildLineId, mergeCartLines } from "../lib/cart-line.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("buildLineId is menu item id plus sorted option ids", () => {
  assert.equal(buildLineId("m1", []), "m1::");
  assert.equal(buildLineId("m1", [{ optionId: "b" }, { optionId: "a" }]), "m1::a,b");
  assert.equal(buildLineId("m1", [{ optionId: "a" }, { optionId: "b" }]), buildLineId("m1", [{ optionId: "b" }, { optionId: "a" }]));
});

test("mergeCartLines sums equal lines, appends new ones and never mutates its inputs", () => {
  const existing = [{ lineId: "a", quantity: 1 }, { lineId: "b", quantity: 2 }];
  const incoming = [{ lineId: "b", quantity: 3 }, { lineId: "c", quantity: 1 }];
  const out = mergeCartLines(existing, incoming);
  assert.deepEqual(out, [{ lineId: "a", quantity: 1 }, { lineId: "b", quantity: 5 }, { lineId: "c", quantity: 1 }]);
  assert.deepEqual(existing, [{ lineId: "a", quantity: 1 }, { lineId: "b", quantity: 2 }]);
  assert.deepEqual(incoming, [{ lineId: "b", quantity: 3 }, { lineId: "c", quantity: 1 }]);
  assert.deepEqual(mergeCartLines([], incoming), incoming);
  assert.deepEqual(mergeCartLines(existing, []), existing);
});

test("two incoming lines with the same id merge into one", () => {
  assert.deepEqual(mergeCartLines([], [{ lineId: "x", quantity: 1 }, { lineId: "x", quantity: 2 }]), [{ lineId: "x", quantity: 3 }]);
});

test("the mobile copy is byte-identical", () => {
  assert.equal(read("../mobile/lib/cart-line.ts"), read("../lib/cart-line.ts"));
});
