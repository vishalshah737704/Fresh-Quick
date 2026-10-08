import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { validateCouponDefinition } from "@/lib/coupon-model";
import { COUPON_SELECT, attachCouponStats, couponInsertRow, type RawCouponRow } from "@/lib/coupons-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { data, error } = await supabaseServer
    .from("coupons")
    .select(COUPON_SELECT)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: "Failed to load coupons" }, { status: 500 });
  return NextResponse.json({ coupons: await attachCouponStats((data ?? []) as unknown as RawCouponRow[]) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const body = await request.json().catch(() => null);
  const parsed = validateCouponDefinition(body, "admin");
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // storeId null / missing = platform-wide coupon.
  const rawStore = (body as Record<string, unknown>).storeId;
  let storeId: string | null = null;
  if (rawStore !== undefined && rawStore !== null && rawStore !== "") {
    if (typeof rawStore !== "string" || !UUID.test(rawStore)) return NextResponse.json({ error: "Invalid store" }, { status: 400 });
    const { data: store } = await supabaseServer.from("stores").select("id").eq("id", rawStore).maybeSingle();
    if (!store) return NextResponse.json({ error: "Store not found" }, { status: 404 });
    storeId = store.id;
  }

  const { data, error } = await supabaseServer
    .from("coupons")
    .insert(couponInsertRow(parsed.value, storeId, resolved.adminId))
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
