import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import type { CouponDefinition } from "@/lib/coupon-model";

export const COUPON_SELECT =
  "id, code, description, kind, value, max_discount_paise, min_order_paise, store_id, valid_from, valid_until, total_limit, per_customer_limit, first_order_only, is_active, created_at, stores(name)";

export type RawCouponRow = {
  id: string;
  code: string;
  description: string | null;
  kind: "percent" | "fixed";
  value: number;
  max_discount_paise: number | null;
  min_order_paise: number;
  store_id: string | null;
  valid_from: string;
  valid_until: string | null;
  total_limit: number | null;
  per_customer_limit: number;
  first_order_only: boolean;
  is_active: boolean;
  created_at: string;
  stores: { name: string } | { name: string }[] | null;
};

export type CouponRow = {
  id: string;
  code: string;
  description: string | null;
  kind: "percent" | "fixed";
  value: number;
  maxDiscountPaise: number | null;
  minOrderPaise: number;
  storeId: string | null;
  storeName: string | null;
  validFrom: string;
  validUntil: string | null;
  totalLimit: number | null;
  perCustomerLimit: number;
  firstOrderOnly: boolean;
  isActive: boolean;
  createdAt: string;
  redemptions: number;
  discountGivenPaise: number;
};

// Allow-list mapping: only these fields ever leave the server for a coupon.
export async function attachCouponStats(rows: RawCouponRow[]): Promise<CouponRow[]> {
  const stats = new Map<string, { count: number; paise: number }>();
  if (rows.length > 0) {
    const { data } = await supabaseServer
      .from("coupon_redemptions")
      .select("coupon_id, discount_paise")
      .in("coupon_id", rows.map((r) => r.id))
      .eq("status", "applied")
      .limit(50000);
    for (const r of data ?? []) {
      const s = stats.get(r.coupon_id) ?? { count: 0, paise: 0 };
      s.count += 1;
      s.paise += r.discount_paise;
      stats.set(r.coupon_id, s);
    }
  }
  return rows.map((r) => {
    const store = Array.isArray(r.stores) ? r.stores[0] : r.stores;
    const s = stats.get(r.id);
    return {
      id: r.id,
      code: r.code,
      description: r.description,
      kind: r.kind,
      value: r.value,
      maxDiscountPaise: r.max_discount_paise,
      minOrderPaise: r.min_order_paise,
      storeId: r.store_id,
      storeName: store?.name ?? null,
      validFrom: r.valid_from,
      validUntil: r.valid_until,
      totalLimit: r.total_limit,
      perCustomerLimit: r.per_customer_limit,
      firstOrderOnly: r.first_order_only,
      isActive: r.is_active,
      createdAt: r.created_at,
      redemptions: s?.count ?? 0,
      discountGivenPaise: s?.paise ?? 0,
    };
  });
}

export function couponInsertRow(def: CouponDefinition, storeId: string | null, createdBy: string) {
  return {
    code: def.code,
    description: def.description,
    kind: def.kind,
    value: def.value,
    max_discount_paise: def.maxDiscountPaise,
    min_order_paise: def.minOrderPaise,
    store_id: storeId,
    created_by: createdBy,
    valid_from: def.validFrom ?? new Date().toISOString(),
    valid_until: def.validUntil,
    total_limit: def.totalLimit,
    per_customer_limit: def.perCustomerLimit,
    first_order_only: def.firstOrderOnly,
    is_active: def.isActive,
  };
}

// Editable after creation: pause/resume, window and limits. The code, kind and value
// stay fixed so past redemptions keep their meaning.
export function couponPatchRow(body: Record<string, unknown>): { patch: Record<string, unknown> } | { error: string } {
  const patch: Record<string, unknown> = {};
  if ("isActive" in body) {
    if (typeof body.isActive !== "boolean") return { error: "Active flag must be true or false" };
    patch.is_active = body.isActive;
  }
  if ("validUntil" in body) {
    if (body.validUntil === null || body.validUntil === "") patch.valid_until = null;
    else if (typeof body.validUntil === "string" && !Number.isNaN(Date.parse(body.validUntil))) patch.valid_until = new Date(body.validUntil).toISOString();
    else return { error: "End date must be valid" };
  }
  if ("totalLimit" in body) {
    if (body.totalLimit === null || body.totalLimit === "") patch.total_limit = null;
    else if (typeof body.totalLimit === "number" && Number.isInteger(body.totalLimit) && body.totalLimit > 0) patch.total_limit = body.totalLimit;
    else return { error: "Total limit must be a positive whole number" };
  }
  if (Object.keys(patch).length === 0) return { error: "Nothing to change" };
  return { patch };
}
