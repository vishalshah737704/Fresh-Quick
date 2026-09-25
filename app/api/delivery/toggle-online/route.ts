import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";

export async function POST(request: NextRequest) {
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data: current, error: currentError } = await supabaseServer
    .from("delivery_partners")
    .select("is_online")
    .eq("user_id", resolved.partnerId)
    .single();
  if (currentError || !current) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }
  const { data, error } = await supabaseServer
    .from("delivery_partners")
    .update({ is_online: !current.is_online })
    .eq("user_id", resolved.partnerId)
    .select("is_online")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to toggle online status" }, { status: 500 });
  }
  return NextResponse.json({ isOnline: data.is_online });
}
