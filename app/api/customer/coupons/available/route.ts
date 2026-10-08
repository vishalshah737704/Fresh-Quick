import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";
import { describeCoupon } from "@/lib/coupon-model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Active codes that apply to this store, shown as tap-to-apply hints at checkout.
export async function GET(request: NextRequest) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const storeId = request.nextUrl.searchParams.get("storeId");
  if (!storeId || !UUID.test(storeId)) return NextResponse.json({ error: "Invalid store" }, { status: 400 });

  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseServer
    .from("coupons")
    .select("code, description, kind, value, max_discount_paise, min_order_paise")
    .eq("is_active", true)
    .lte("valid_from", nowIso)
    .or(`valid_until.is.null,valid_until.gt.${nowIso}`)
    .or(`store_id.is.null,store_id.eq.${storeId}`)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return NextResponse.json({ error: "Failed to load promo codes" }, { status: 500 });
  return NextResponse.json({
    coupons: (data ?? []).map((c) => ({
      code: c.code,
      description: c.description,
      summary: describeCoupon({
        kind: c.kind,
        value: c.value,
        maxDiscountPaise: c.max_discount_paise,
        minOrderPaise: c.min_order_paise,
      }),
    })),
  });
}
