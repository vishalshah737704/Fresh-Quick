import test from "node:test";
import assert from "node:assert/strict";
import { caseOk } from "../scripts/zippy-eval-match.mjs";

const hit = (content, similarity) => ({ kind: "product", ref_id: "x", content, similarity });

test("catalog case passes on case-insensitive substring in a usable hit", () => {
  const c = { expectCatalogIncludes: "Wok Style Chilli Paneer" };
  assert.equal(caseOk(c, [], [hit("Dish: wok style chilli paneer at X", 0.5)], 0.3), true);
});

test("catalog case ignores hits below MIN and beyond the first 5", () => {
  const c = { expectCatalogIncludes: "Bella Italia" };
  assert.equal(caseOk(c, [], [hit("Bella Italia", 0.1)], 0.3), false);
  const six = [1, 2, 3, 4, 5].map((n) => hit(`other ${n}`, 0.9)).concat(hit("Bella Italia", 0.8));
  assert.equal(caseOk(c, [], six, 0.3), false);
});

test("catalog case fails when catalog is missing", () => {
  assert.equal(caseOk({ expectCatalogIncludes: "x" }, [], undefined, 0.3), false);
});

test("existing shapes are unchanged", () => {
  const m = [{ title: "How do I pay?", similarity: 0.6 }];
  assert.equal(caseOk({ expectTitleIncludes: "How do I pay?" }, m, [], 0.3), true);
  assert.equal(caseOk({ expectTitleIncludes: null }, m, [], 0.3), false);
  assert.equal(caseOk({ expectTitleExcludes: "pay" }, m, [], 0.3), false);
});
