// Pure shared coupon / wallet model. Imports nothing at runtime so node's test runner
// can load it; mobile/lib/coupon-model.ts is a byte-identical copy (parity-tested).
// All money is integer paise.

export type CouponKind = "percent" | "fixed";

export type CouponDefinition = {
  code: string;
  description: string | null;
  kind: CouponKind;
  value: number;
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  validFrom: string | null;
  validUntil: string | null;
  totalLimit: number | null;
  perCustomerLimit: number;
  firstOrderOnly: boolean;
  isActive: boolean;
};

export type CouponPreview =
  | { ok: true; code: string; discountPaise: number; description: string | null }
  | { ok: false; errorCode: string; message: string };

export type WalletEntryKind = "referral_reward" | "referral_bonus" | "spend" | "refund" | "adjustment";

export type WalletEntry = {
  id: string;
  amountPaise: number;
  kind: WalletEntryKind;
  note: string | null;
  createdAt: string;
};

export const COUPON_CODE_PATTERN = /^[A-Z0-9_-]{3,20}$/;
export const VENDOR_MAX_PERCENT = 50;
export const VENDOR_MAX_FIXED_PAISE = 50000;
export const REFERRAL_REWARD_PAISE = 5000;
export const REFERRAL_MIN_SUBTOTAL_PAISE = 10000;
export const REFERRAL_MAX_REWARDS = 10;

export function normalizeCouponCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return COUPON_CODE_PATTERN.test(code) ? code : null;
}

export function formatPaise(paise: number): string {
  const rupees = paise / 100;
  const text = Number.isInteger(rupees) ? String(rupees) : rupees.toFixed(2);
  return "₹" + text;
}

export function describeCoupon(c: Pick<CouponDefinition, "kind" | "value" | "maxDiscountPaise" | "minOrderPaise">): string {
  const base = c.kind === "percent" ? `${c.value}% off` : `${formatPaise(c.value)} off`;
  const cap = c.kind === "percent" && c.maxDiscountPaise ? ` up to ${formatPaise(c.maxDiscountPaise)}` : "";
  const min = c.minOrderPaise > 0 ? `, min order ${formatPaise(c.minOrderPaise)}` : "";
  return base + cap + min;
}

type Scope = "vendor" | "admin";
type Raw = Record<string, unknown>;

function intOrNull(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "number" || !Number.isInteger(v)) return undefined;
  return v;
}

function dateOrNull(v: unknown): string | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) return undefined;
  return new Date(v).toISOString();
}

// Validates a coupon definition sent by a vendor or an admin. Vendors are capped.
export function validateCouponDefinition(
  body: unknown,
  scope: Scope
): { ok: true; value: CouponDefinition } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Invalid request" };
  const b = body as Raw;
  const code = normalizeCouponCode(b.code);
  if (!code) return { ok: false, error: "Code must be 3 to 20 letters, digits, dashes or underscores" };
  if (b.kind !== "percent" && b.kind !== "fixed") return { ok: false, error: "Type must be percent or fixed" };
  const value = intOrNull(b.value);
  if (value === undefined || value === null || value <= 0) return { ok: false, error: "Value must be a positive whole number" };
  if (b.kind === "percent" && value > 100) return { ok: false, error: "Percent cannot be more than 100" };
  if (scope === "vendor") {
    if (b.kind === "percent" && value > VENDOR_MAX_PERCENT) return { ok: false, error: `Store coupons can give at most ${VENDOR_MAX_PERCENT}% off` };
    if (b.kind === "fixed" && value > VENDOR_MAX_FIXED_PAISE) return { ok: false, error: `Store coupons can give at most ${formatPaise(VENDOR_MAX_FIXED_PAISE)} off` };
  }
  const maxDiscountPaise = intOrNull(b.maxDiscountPaise);
  if (maxDiscountPaise === undefined || (maxDiscountPaise !== null && maxDiscountPaise <= 0)) return { ok: false, error: "Maximum discount must be a positive whole number of paise" };
  const minOrderPaise = intOrNull(b.minOrderPaise);
  if (minOrderPaise === undefined || (minOrderPaise !== null && minOrderPaise < 0)) return { ok: false, error: "Minimum order must be zero or more paise" };
  const totalLimit = intOrNull(b.totalLimit);
  if (totalLimit === undefined || (totalLimit !== null && totalLimit <= 0)) return { ok: false, error: "Total limit must be a positive whole number" };
  const perCustomer = intOrNull(b.perCustomerLimit);
  if (perCustomer === undefined || (perCustomer !== null && (perCustomer <= 0 || perCustomer > 100))) return { ok: false, error: "Per-customer limit must be between 1 and 100" };
  const validFrom = dateOrNull(b.validFrom);
  const validUntil = dateOrNull(b.validUntil);
  if (validFrom === undefined || validUntil === undefined) return { ok: false, error: "Dates must be valid" };
  if (validFrom && validUntil && Date.parse(validUntil) <= Date.parse(validFrom)) return { ok: false, error: "End date must be after the start date" };
  let description: string | null = null;
  if (b.description !== undefined && b.description !== null && b.description !== "") {
    if (typeof b.description !== "string" || b.description.trim().length > 200) return { ok: false, error: "Description must be 200 characters or fewer" };
    description = b.description.trim();
  }
  if (b.firstOrderOnly !== undefined && typeof b.firstOrderOnly !== "boolean") return { ok: false, error: "First-order flag must be true or false" };
  if (b.isActive !== undefined && typeof b.isActive !== "boolean") return { ok: false, error: "Active flag must be true or false" };
  return {
    ok: true,
    value: {
      code,
      description,
      kind: b.kind,
      value,
      maxDiscountPaise: b.kind === "percent" ? maxDiscountPaise : null,
      minOrderPaise: minOrderPaise ?? 0,
      validFrom,
      validUntil,
      totalLimit,
      perCustomerLimit: perCustomer ?? 1,
      firstOrderOnly: b.firstOrderOnly === true,
      isActive: b.isActive !== false,
    },
  };
}

// The checkout RPC raises 'COUPON:<code>:<message>' or 'PRICE_CHANGED'.
export function parseCheckoutRpcError(
  message: string | null | undefined
): { kind: "coupon"; errorCode: string; message: string } | { kind: "price_changed" } | null {
  if (!message) return null;
  if (message.includes("PRICE_CHANGED")) return { kind: "price_changed" };
  const m = /COUPON:([a-z_]+):([\s\S]+)$/.exec(message);
  if (m) return { kind: "coupon", errorCode: m[1], message: m[2].trim() };
  return null;
}

export function ledgerKindLabel(kind: WalletEntryKind): string {
  switch (kind) {
    case "referral_reward":
      return "Referral reward";
    case "referral_bonus":
      return "Welcome bonus";
    case "spend":
      return "Used at checkout";
    case "refund":
      return "Refunded credit";
    default:
      return "Adjustment";
  }
}

// Totals shown in the checkout summary. Credit applies after the coupon and never exceeds what is left to pay.
export function computeCheckoutTotals(input: {
  subtotalPaise: number;
  deliveryFeePaise: number;
  discountPaise: number;
  creditBalancePaise: number;
  useCredit: boolean;
}): { discountPaise: number; creditPaise: number; totalPaise: number } {
  const discountPaise = Math.max(0, Math.min(input.discountPaise, input.subtotalPaise));
  const beforeCredit = input.subtotalPaise + input.deliveryFeePaise - discountPaise;
  const creditPaise = input.useCredit ? Math.max(0, Math.min(input.creditBalancePaise, beforeCredit)) : 0;
  return { discountPaise, creditPaise, totalPaise: beforeCredit - creditPaise };
}
