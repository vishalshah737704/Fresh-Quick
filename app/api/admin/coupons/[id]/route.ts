import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { COUPON_SELECT, attachCouponStats, couponPatchRow, type RawCouponRow } from "@/lib/coupons-server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const parsed = couponPatchRow(body as Record<string, unknown>);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("coupons")
    .update(parsed.patch)
    .eq("id", id)
    .select(COUPON_SELECT)
    .maybeSingle();
  if (error) {
    if (error.code === "23514") return NextResponse.json({ error: "Those coupon settings are not valid" }, { status: 400 });
    return NextResponse.json({ error: "Failed to update coupon" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Coupon not found" }, { status: 404 });
  const [coupon] = await attachCouponStats([data as unknown as RawCouponRow]);
  return NextResponse.json({ coupon });
}
