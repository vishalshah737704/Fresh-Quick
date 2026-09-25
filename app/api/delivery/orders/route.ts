import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, status, total, placed_at, restaurants(name)")
    .eq("delivery_partner_id", resolved.partnerId)
    .order("placed_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load your orders" }, { status: 500 });
  }
  return NextResponse.json({ orders: data });
}
