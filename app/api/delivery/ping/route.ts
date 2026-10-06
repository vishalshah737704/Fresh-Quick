import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";
import { resolvePartnerLocation } from "@/lib/mumbai-region";

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
  const { data: stored } = await supabaseServer
    .from("delivery_partners")
    .select("current_lat, current_lng")
    .eq("user_id", resolved.partnerId)
    .maybeSingle();
  const location = resolvePartnerLocation(
    { lat, lng },
    { lat: stored?.current_lat ?? null, lng: stored?.current_lng ?? null }
  );
  const { error } = await supabaseServer
    .from("delivery_partners")
    .update({ current_lat: location.lat, current_lng: location.lng, last_ping_at: new Date().toISOString() })
    .eq("user_id", resolved.partnerId);
  if (error) {
    return NextResponse.json({ error: "Failed to record ping" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
