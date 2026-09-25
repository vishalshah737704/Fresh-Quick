import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

const REASSIGNABLE_STATUSES = ["assigned", "picked_up"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { deliveryPartnerId } = await request.json();
  if (!deliveryPartnerId || typeof deliveryPartnerId !== "string") {
    return NextResponse.json({ error: "deliveryPartnerId is required" }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, status")
    .eq("id", id)
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!REASSIGNABLE_STATUSES.includes(order.status)) {
    return NextResponse.json(
      { error: `Order in status "${order.status}" cannot be reassigned` },
      { status: 400 }
    );
  }

  const { data: partner, error: partnerError } = await supabaseServer
    .from("delivery_partners")
    .select("user_id, is_online")
    .eq("user_id", deliveryPartnerId)
    .single();
  if (partnerError || !partner) {
    return NextResponse.json({ error: "Delivery partner not found" }, { status: 404 });
  }
  if (!partner.is_online) {
    return NextResponse.json({ error: "Delivery partner is not online" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ delivery_partner_id: deliveryPartnerId })
    .eq("id", id)
    .eq("status", order.status)
    .select("id, delivery_partner_id, status")
    .single();
  if (updateError || !updated) {
    return NextResponse.json({ error: "Order status changed, please refresh" }, { status: 409 });
  }
  return NextResponse.json({ order: updated });
}
