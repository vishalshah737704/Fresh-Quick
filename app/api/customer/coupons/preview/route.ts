import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";
import { normalizeCouponCode, type CouponPreview } from "@/lib/coupon-model";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Informational check for the checkout box. The subtotal comes from the cart on the
// client; the checkout route recomputes everything from the database.
export async function POST(request: NextRequest) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });

  let body: { code?: unknown; storeId?: unknown; subtotalPaise?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const code = normalizeCouponCode(body.code);
  if (!code) {
    const preview: CouponPreview = { ok: false, errorCode: "not_found", message: "That promo code does not exist." };
    return NextResponse.json(preview);
  }
  if (typeof body.storeId !== "string" || !UUID.test(body.storeId)) {
    return NextResponse.json({ error: "Invalid store" }, { status: 400 });
  }
  const subtotalPaise = body.subtotalPaise;
  if (typeof subtotalPaise !== "number" || !Number.isInteger(subtotalPaise) || subtotalPaise < 0 || subtotalPaise > 100_000_000) {
    return NextResponse.json({ error: "Invalid subtotal" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .rpc("coupon_check", {
      p_code: code,
      p_customer: who.userId,
      p_store: body.storeId,
      p_subtotal_paise: subtotalPaise,
    })
    .single<{ coupon_id: string | null; discount_paise: number; error_code: string | null; message: string | null }>();
  if (error || !data) return NextResponse.json({ error: "Could not check the promo code" }, { status: 500 });
  if (data.error_code) {
    const preview: CouponPreview = { ok: false, errorCode: data.error_code, message: data.message ?? "That promo code cannot be used." };
    return NextResponse.json(preview);
  }
  const { data: coupon } = await supabaseServer.from("coupons").select("description").eq("id", data.coupon_id).maybeSingle();
  const preview: CouponPreview = { ok: true, code, discountPaise: data.discount_paise, description: coupon?.description ?? null };
  return NextResponse.json(preview);
}
