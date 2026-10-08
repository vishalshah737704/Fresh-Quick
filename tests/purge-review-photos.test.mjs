import test from "node:test";
import assert from "node:assert/strict";
import { collectPaths } from "../scripts/purge-review-photos.mjs";

test("collectPaths keeps files (entries with an id) and skips folders", () => {
  const entries = [{ name: "a.jpg", id: "1" }, { name: "reviews", id: null }, { name: "b.png", id: "2" }];
  assert.deepEqual(collectPaths(entries, "reviews/o1/"), ["reviews/o1/a.jpg", "reviews/o1/b.png"]);
  assert.deepEqual(collectPaths([], ""), []);
});
