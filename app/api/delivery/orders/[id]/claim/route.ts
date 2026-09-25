import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data: partner, error: partnerError } = await supabaseServer
    .from("delivery_partners")
    .select("is_online")
    .eq("user_id", resolved.partnerId)
    .single();
  if (partnerError || !partner?.is_online) {
    return NextResponse.json({ error: "You must be online to claim an order" }, { status: 403 });
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ delivery_partner_id: resolved.partnerId, status: "assigned" })
    .eq("id", id)
    .eq("status", "ready")
    .is("delivery_partner_id", null)
    .select("id, status")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: "Order is no longer available to claim" },
      { status: 409 }
    );
  }

  return NextResponse.json({ order: updated });
}
