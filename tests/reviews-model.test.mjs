import test from "node:test";
import assert from "node:assert/strict";
import {
  REVIEW_LIMITS,
  PARTNER_SCORE_MIN_RATINGS,
  parseStars,
  cleanComment,
  validateReviewPayload,
  reviewerDisplayName,
  averageOf,
  buildHistogram,
  partnerScore,
  isLowPartnerScore,
  toPublicReview,
  toOwnReview,
  toVendorReview,
  toAdminReview,
  toPartnerReviewRow,
} from "../lib/reviews-model.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ctx = { orderProductIds: [A, B], hasPartner: true };

test("parseStars accepts only integers 1 to 5", () => {
  for (const ok of [1, 2, 3, 4, 5]) assert.equal(parseStars(ok), ok);
  for (const bad of [0, 6, -1, 2.5, "3", null, undefined, NaN, Infinity]) assert.equal(parseStars(bad), null, String(bad));
});

test("cleanComment: trims, whitespace-only is no comment, counts code points, rejects NUL and non-text", () => {
  assert.deepEqual(cleanComment("  nice  ", 10), { ok: true, value: "nice" });
  assert.deepEqual(cleanComment("   \n ", 10), { ok: true, value: null });
  assert.deepEqual(cleanComment(undefined, 10), { ok: true, value: null });
  assert.deepEqual(cleanComment(null, 10), { ok: true, value: null });
  assert.equal(cleanComment("a".repeat(11), 10).ok, false);
  assert.equal(cleanComment("😀".repeat(10), 10).ok, true);
  assert.equal(cleanComment("😀".repeat(11), 10).ok, false);
  assert.equal(cleanComment("bad\u0000byte", 100).ok, false);
  assert.equal(cleanComment(42, 10).ok, false);
  assert.equal(cleanComment("<script>alert(1)</script>", 100).value, "<script>alert(1)</script>");
});

test("validateReviewPayload: minimal valid payload", () => {
  const out = validateReviewPayload({ storeStars: 4 }, ctx);
  assert.deepEqual(out, { ok: true, value: { storeStars: 4, storeComment: null, dishes: [], partner: null } });
});

test("validateReviewPayload: full payload, product ids normalised to lower case", () => {
  const out = validateReviewPayload(
    {
      storeStars: 5,
      storeComment: " great ",
      dishes: [{ productId: A.toUpperCase(), stars: 4, comment: "tasty" }, { productId: B, stars: 2 }],
      partner: { stars: 5, comment: "polite" },
    },
    ctx
  );
  assert.equal(out.ok, true);
  assert.equal(out.value.storeComment, "great");
  assert.deepEqual(out.value.dishes, [
    { productId: A, stars: 4, comment: "tasty" },
    { productId: B, stars: 2, comment: null },
  ]);
  assert.deepEqual(out.value.partner, { stars: 5, comment: "polite" });
});

test("validateReviewPayload: rejects bad input with a message, never throws", () => {
  const bad = [
    null,
    "x",
    [],
    {},
    { storeStars: 0 },
    { storeStars: 6 },
    { storeStars: 3, dishes: "no" },
    { storeStars: 3, dishes: [{ productId: "not-a-uuid", stars: 3 }] },
    { storeStars: 3, dishes: [{ productId: "33333333-3333-4333-8333-333333333333", stars: 3 }] },
    { storeStars: 3, dishes: [{ productId: A, stars: 3 }, { productId: A, stars: 4 }] },
    { storeStars: 3, dishes: [{ productId: A, stars: 9 }] },
    { storeStars: 3, dishes: [null] },
    { storeStars: 3, storeComment: "x".repeat(REVIEW_LIMITS.storeComment + 1) },
    { storeStars: 3, dishes: [{ productId: A, stars: 3, comment: "x".repeat(REVIEW_LIMITS.dishComment + 1) }] },
    { storeStars: 3, partner: { stars: 7 } },
    { storeStars: 3, partner: "x" },
    { storeStars: 3, dishes: Array.from({ length: 51 }, () => ({ productId: A, stars: 3 })) },
  ];
  for (const raw of bad) {
    const out = validateReviewPayload(raw, ctx);
    assert.equal(out.ok, false, JSON.stringify(raw)?.slice(0, 80));
    assert.equal(typeof out.error, "string");
  }
});

test("validateReviewPayload: a partner rating needs an order with a partner", () => {
  const out = validateReviewPayload({ storeStars: 3, partner: { stars: 4 } }, { orderProductIds: [A], hasPartner: false });
  assert.equal(out.ok, false);
  assert.match(out.error, /delivery partner/i);
});

test("reviewerDisplayName: first name plus last initial, safe fallbacks", () => {
  const cases = [
    ["Vishal Shah", "Vishal S."],
    ["  vishal   shah  ", "vishal S."],
    ["Asha Devi Verma", "Asha V."],
    ["Madonna", "Madonna"],
    ["", "Customer"],
    ["   ", "Customer"],
    [null, "Customer"],
    [undefined, "Customer"],
    ["asha@example.com", "Customer"],
    ["Asha asha@example.com", "Customer"],
    ["9876543210", "Customer"],
    ["Ravi 9876543210", "Customer"],
    ["अनु शर्मा", "अनु श."],
    ["😀 Smile", "😀 S."],
    ["Zoë Émile", "Zoë É."],
  ];
  for (const [input, expected] of cases) assert.equal(reviewerDisplayName(input), expected, String(input));
});

test("averageOf: one decimal, null when there are no ratings", () => {
  assert.equal(averageOf(0, 0), null);
  assert.equal(averageOf(5, 0), null);
  assert.equal(averageOf(Number.NaN, 3), null);
  assert.equal(averageOf(4, 1), 4);
  assert.equal(averageOf(13, 3), 4.3);
  assert.equal(averageOf(14, 3), 4.7);
  assert.equal(averageOf(9, 2), 4.5);
  assert.equal(averageOf(9, 4), 2.3); // 2.25 rounds half up, same as SQL round(numeric, 1)
});

test("buildHistogram counts stars one to five and ignores junk", () => {
  assert.deepEqual(buildHistogram([5, 5, 4, 1, 3, 3, 3]), [1, 0, 3, 1, 2]);
  assert.deepEqual(buildHistogram([]), [0, 0, 0, 0, 0]);
  assert.deepEqual(buildHistogram([0, 6, 2.5, 5]), [0, 0, 0, 0, 1]);
});

test("partnerScore: New partner below the threshold, average after", () => {
  assert.deepEqual(partnerScore(0, 0), { isNew: true });
  assert.deepEqual(partnerScore(16, PARTNER_SCORE_MIN_RATINGS - 1), { isNew: true });
  assert.deepEqual(partnerScore(23, 5), { isNew: false, average: 4.6, count: 5 });
});

test("isLowPartnerScore needs enough ratings and an average under 3.0", () => {
  assert.equal(isLowPartnerScore(8, 4), false);
  assert.equal(isLowPartnerScore(14, 5), true);
  assert.equal(isLowPartnerScore(15, 5), false);
  assert.equal(isLowPartnerScore(0, 0), false);
});

const raw = (over = {}) => ({
  id: "r1",
  store_id: "s1",
  rating: 4,
  comment: "Good <b>food</b>",
  photo_path: "reviews/o1/a.jpg",
  status: "visible",
  vendor_reply: "Thanks!",
  vendor_reply_at: "2026-10-07T12:00:00Z",
  created_at: "2026-10-07T10:00:00Z",
  reported_at: null,
  report_reason: null,
  reported_by: null,
  hidden_reason: null,
  hidden_at: null,
  customer: { full_name: "Asha Verma" },
  stores: { name: "Dosa Corner" },
  review_dishes: [{ stars: 5, comment: "great", products: { name: "Masala Dosa" } }],
  review_partner: { stars: 4, comment: "polite" },
  ...over,
});

test("toPublicReview exposes only the allow-listed fields", () => {
  const out = toPublicReview(raw(), "https://signed/photo");
  assert.deepEqual(Object.keys(out).sort(), [
    "comment", "createdAt", "dishes", "id", "photoUrl", "reviewerName", "stars", "vendorReply", "vendorReplyAt",
  ]);
  assert.equal(out.reviewerName, "Asha V.");
  assert.equal(out.comment, "Good <b>food</b>");
  assert.deepEqual(out.dishes, [{ name: "Masala Dosa", stars: 5 }]);
  const text = JSON.stringify(out);
  assert.ok(!text.includes("polite"), "partner comment leaked");
  assert.ok(!text.includes("customer_id"));
});

test("toPublicReview: deleted customer, array embeds and missing dish product do not crash", () => {
  const out = toPublicReview(
    raw({ customer: null, review_dishes: [{ stars: 3, comment: null, products: [{ name: "Idli" }] }, { stars: 2, comment: null, products: null }] }),
    null
  );
  assert.equal(out.reviewerName, "Customer");
  assert.deepEqual(out.dishes, [{ name: "Idli", stars: 3 }, { name: "Dish", stars: 2 }]);
  assert.equal(out.photoUrl, null);
});

test("toOwnReview adds dish comments and the customer's own partner rating", () => {
  const out = toOwnReview(raw(), "u");
  assert.deepEqual(out.dishes, [{ name: "Masala Dosa", stars: 5, comment: "great" }]);
  assert.deepEqual(out.partner, { stars: 4, comment: "polite" });
  assert.equal(out.status, "visible");
  assert.deepEqual(toOwnReview(raw({ review_partner: null }), null).partner, null);
  assert.deepEqual(toOwnReview(raw({ review_partner: [{ stars: 2, comment: null }] }), null).partner, { stars: 2, comment: null });
});

test("toVendorReview: hidden reviews carry no content; visible ones never expose partner data", () => {
  const hidden = toVendorReview(raw({ status: "hidden", comment: "secret" }), "u");
  assert.deepEqual(hidden, { id: "r1", hidden: true, createdAt: "2026-10-07T10:00:00Z" });
  const shown = toVendorReview(raw({ reported_at: "2026-10-07T11:00:00Z" }), "u");
  assert.equal(shown.hidden, false);
  assert.equal(shown.reported, true);
  const text = JSON.stringify(shown);
  assert.ok(!text.includes("polite"), "partner comment leaked to vendor");
  assert.ok(!text.includes("Asha Verma"), "full name leaked to vendor");
});

test("toAdminReview shows everything moderation needs", () => {
  const out = toAdminReview(
    raw({ status: "hidden", hidden_reason: "abusive", reported_at: "2026-10-07T11:00:00Z", report_reason: "rude", reported_by: "vendor" }),
    null
  );
  assert.equal(out.customerName, "Asha Verma");
  assert.equal(out.storeName, "Dosa Corner");
  assert.equal(out.status, "hidden");
  assert.equal(out.hiddenReason, "abusive");
  assert.equal(out.reportReason, "rude");
  assert.equal(out.reportedBy, "vendor");
  assert.deepEqual(out.partner, { stars: 4, comment: "polite" });
  assert.equal(toAdminReview(raw({ customer: null }), null).customerName, "Customer");
});

test("toPartnerReviewRow: stars, comment and date only", () => {
  const out = toPartnerReviewRow({ created_at: "2026-10-07T10:00:00Z", review_partner: [{ stars: 5, comment: null }] });
  assert.deepEqual(out, { stars: 5, comment: null, createdAt: "2026-10-07T10:00:00Z" });
  assert.equal(toPartnerReviewRow({ created_at: "x", review_partner: null }), null);
});
