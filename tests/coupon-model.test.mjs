import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCouponCode,
  validateCouponDefinition,
  describeCoupon,
  formatPaise,
  parseCheckoutRpcError,
  computeCheckoutTotals,
  ledgerKindLabel,
} from "../lib/coupon-model.ts";

test("normalizeCouponCode trims, upper-cases and rejects bad codes", () => {
  assert.equal(normalizeCouponCode("  save10 "), "SAVE10");
  assert.equal(normalizeCouponCode("a"), null);
  assert.equal(normalizeCouponCode("has space"), null);
  assert.equal(normalizeCouponCode(5), null);
});

test("validateCouponDefinition: admin percent and fixed", () => {
  const ok = validateCouponDefinition({ code: "fest20", kind: "percent", value: 20, maxDiscountPaise: 10000, minOrderPaise: 20000 }, "admin");
  assert.equal(ok.ok, true);
  assert.equal(ok.value.code, "FEST20");
  assert.equal(ok.value.perCustomerLimit, 1);
  assert.equal(ok.value.isActive, true);
  assert.equal(validateCouponDefinition({ code: "ABC", kind: "percent", value: 101 }, "admin").ok, false);
  assert.equal(validateCouponDefinition({ code: "ABC", kind: "fixed", value: 1.5 }, "admin").ok, false);
  assert.equal(validateCouponDefinition({ code: "ABC", kind: "fixed", value: 100, validFrom: "2026-01-02", validUntil: "2026-01-01" }, "admin").ok, false);
});

test("validateCouponDefinition: vendors are capped", () => {
  assert.equal(validateCouponDefinition({ code: "ABC", kind: "percent", value: 51 }, "vendor").ok, false);
  assert.equal(validateCouponDefinition({ code: "ABC", kind: "percent", value: 50 }, "vendor").ok, true);
  assert.equal(validateCouponDefinition({ code: "ABC", kind: "fixed", value: 50001 }, "vendor").ok, false);
  assert.equal(validateCouponDefinition({ code: "ABC", kind: "fixed", value: 50000 }, "vendor").ok, true);
});

test("max discount is dropped for fixed coupons", () => {
  const r = validateCouponDefinition({ code: "ABC", kind: "fixed", value: 100, maxDiscountPaise: 500 }, "admin");
  assert.equal(r.value.maxDiscountPaise, null);
});

test("describe and format", () => {
  assert.equal(formatPaise(5000), "₹50");
  assert.equal(formatPaise(1550), "₹15.50");
  assert.equal(describeCoupon({ kind: "percent", value: 10, maxDiscountPaise: 1500, minOrderPaise: 10000 }), "10% off up to ₹15, min order ₹100");
  assert.equal(describeCoupon({ kind: "fixed", value: 5000, maxDiscountPaise: null, minOrderPaise: 0 }), "₹50 off");
});

test("parseCheckoutRpcError", () => {
  assert.deepEqual(parseCheckoutRpcError("COUPON:expired:That promo code has expired."), { kind: "coupon", errorCode: "expired", message: "That promo code has expired." });
  assert.deepEqual(parseCheckoutRpcError("PRICE_CHANGED"), { kind: "price_changed" });
  assert.equal(parseCheckoutRpcError("boom"), null);
  assert.equal(parseCheckoutRpcError(null), null);
});

test("computeCheckoutTotals applies coupon then credit and never goes negative", () => {
  assert.deepEqual(computeCheckoutTotals({ subtotalPaise: 20000, deliveryFeePaise: 3000, discountPaise: 1500, creditBalancePaise: 5000, useCredit: true }), { discountPaise: 1500, creditPaise: 5000, totalPaise: 16500 });
  assert.deepEqual(computeCheckoutTotals({ subtotalPaise: 1000, deliveryFeePaise: 0, discountPaise: 5000, creditBalancePaise: 9000, useCredit: true }), { discountPaise: 1000, creditPaise: 0, totalPaise: 0 });
  assert.deepEqual(computeCheckoutTotals({ subtotalPaise: 1000, deliveryFeePaise: 500, discountPaise: 0, creditBalancePaise: 9000, useCredit: false }), { discountPaise: 0, creditPaise: 0, totalPaise: 1500 });
});

test("ledgerKindLabel", () => {
  assert.equal(ledgerKindLabel("spend"), "Used at checkout");
});
