import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";
import {
  ORDER_DETAIL_SELECT,
  normalizeOrderDetail,
  type RawOrderDetail,
} from "@/lib/order-detail";
import { redactForDelivery } from "@/lib/delivery-order-view";

export async function GET(request: NextRequest) {
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const raw = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(raw) && raw >= 1 ? Math.min(raw, 100) : 50;

  const { data: rows, error } = await supabaseServer
    .from("orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("delivery_partner_id", resolved.partnerId)
    .in("status", ["delivered", "cancelled", "rejected"])
    .order("placed_at", { ascending: false })
    .limit(limit);
  if (error) {
    return NextResponse.json({ error: "Failed to load history" }, { status: 500 });
  }

  return NextResponse.json({
    orders: (rows ?? []).map((row) =>
      redactForDelivery(normalizeOrderDetail(row as unknown as RawOrderDetail), "history"),
    ),
  });
}
