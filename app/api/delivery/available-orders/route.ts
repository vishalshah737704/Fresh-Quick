import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";

export async function GET(request: NextRequest) {
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
    return NextResponse.json({ orders: [] });
  }
  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, status, total, placed_at, restaurants(name)")
    .eq("status", "ready")
    .is("delivery_partner_id", null)
    .order("placed_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Failed to load available orders" }, { status: 500 });
  }
  return NextResponse.json({ orders: data });
}
