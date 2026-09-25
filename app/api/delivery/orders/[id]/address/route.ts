import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";

export async function GET(
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
    .select("delivery_address_id, delivery_partner_id, status")
    .eq("id", id)
    .eq("delivery_partner_id", resolved.partnerId)
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Mirror the RLS policy's expiry window (migration 12): address access
  // ends once the order is no longer active, same as the existing
  // customer_can_read_assigned_partner_location pattern. The service-role
  // client bypasses RLS, so this check is what actually enforces it here.
  if (order.status !== "assigned" && order.status !== "picked_up") {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: address, error: addressError } = await supabaseServer
    .from("addresses")
    .select("*")
    .eq("id", order.delivery_address_id)
    .single();
  if (addressError || !address) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }
  return NextResponse.json({ address });
}
