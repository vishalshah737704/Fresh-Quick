import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";

export async function POST(request: NextRequest) {
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { lat, lng } = await request.json();
  if (
    typeof lat !== "number" || !Number.isFinite(lat) ||
    typeof lng !== "number" || !Number.isFinite(lng)
  ) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }
  const { error } = await supabaseServer
    .from("delivery_partners")
    .update({ current_lat: lat, current_lng: lng, last_ping_at: new Date().toISOString() })
    .eq("user_id", resolved.partnerId);
  if (error) {
    return NextResponse.json({ error: "Failed to record ping" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
