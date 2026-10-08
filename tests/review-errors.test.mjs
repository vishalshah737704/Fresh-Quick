import test from "node:test";
import assert from "node:assert/strict";
import { mapCreateReviewError } from "../lib/review-errors.ts";

test("each create_review RPC message maps to its status", () => {
  assert.deepEqual(mapCreateReviewError({ message: "review_order_not_found" }), { status: 404, error: "not found" });
  assert.equal(mapCreateReviewError({ message: "review_not_delivered" }).status, 409);
  assert.equal(mapCreateReviewError({ message: "review_dish_not_in_order" }).status, 400);
  assert.equal(mapCreateReviewError({ message: "review_no_partner" }).status, 400);
});
test("unique violation 23505 is a 409 already-reviewed", () => {
  assert.deepEqual(mapCreateReviewError({ code: "23505", message: "duplicate key" }), {
    status: 409,
    error: "You have already reviewed this order",
  });
});
test("anything else is a generic 500 that leaks no detail", () => {
  const result = mapCreateReviewError({ code: "XX000", message: "secret internal detail" });
  assert.deepEqual(result, { status: 500, error: "Could not save your review right now" });
  assert.deepEqual(mapCreateReviewError({}), result);
});
