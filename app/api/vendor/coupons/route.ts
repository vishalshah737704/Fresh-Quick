import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";
import { validateCouponDefinition } from "@/lib/coupon-model";
import { COUPON_SELECT, attachCouponStats, couponInsertRow, type RawCouponRow } from "@/lib/coupons-server";

export async function GET(request: NextRequest) {
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { data, error } = await supabaseServer
    .from("coupons")
    .select(COUPON_SELECT)
    .eq("store_id", resolved.storeId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: "Failed to load coupons" }, { status: 500 });
  return NextResponse.json({ coupons: await attachCouponStats((data ?? []) as unknown as RawCouponRow[]) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const body = await request.json().catch(() => null);
  const parsed = validateCouponDefinition(body, "vendor");
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("coupons")
    .insert(couponInsertRow(parsed.value, resolved.storeId, resolved.vendorId))
    .select(COUPON_SELECT)
    .single();
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That code is already taken" }, { status: 409 });
    if (error.code === "23514") return NextResponse.json({ error: "Those coupon settings are not valid" }, { status: 400 });
    return NextResponse.json({ error: "Failed to create coupon" }, { status: 500 });
  }
  const [coupon] = await attachCouponStats([data as unknown as RawCouponRow]);
  return NextResponse.json({ coupon }, { status: 201 });
}
