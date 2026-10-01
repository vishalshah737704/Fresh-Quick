import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import {
  ORDER_DETAIL_SELECT,
  normalizeOrderDetail,
  type RawOrderDetail,
} from "@/lib/order-detail";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  const order = normalizeOrderDetail(data as unknown as RawOrderDetail);
  let partnerName: string | null = null;
  if (order.deliveryPartnerId) {
    const { data: partner } = await supabaseServer
      .from("users")
      .select("full_name")
      .eq("id", order.deliveryPartnerId)
      .maybeSingle();
    partnerName = partner?.full_name ?? null;
  }
  return NextResponse.json({ order, partnerName });
}
