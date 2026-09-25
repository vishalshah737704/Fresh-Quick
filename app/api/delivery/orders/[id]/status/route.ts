import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";
import { DELIVERY_STATUS_TRANSITIONS } from "@/lib/order-constants";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, status, delivery_partner_id")
    .eq("id", id)
    .eq("delivery_partner_id", resolved.partnerId)
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const nextStatus = DELIVERY_STATUS_TRANSITIONS[order.status];
  if (!nextStatus) {
    return NextResponse.json(
      { error: `Order in status "${order.status}" cannot be advanced by a delivery partner` },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("delivery_partner_id", resolved.partnerId)
    .eq("status", order.status)
    .select("id, status")
    .single();
  if (updateError || !updated) {
    return NextResponse.json({ error: "Order status changed, please refresh" }, { status: 409 });
  }
  return NextResponse.json({ order: updated });
}
