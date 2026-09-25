import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("delivery_partners")
    .select("user_id, is_online, current_lat, current_lng, last_ping_at, vehicle_type, users(full_name)");
  if (error) {
    return NextResponse.json({ error: "Failed to load delivery partners" }, { status: 500 });
  }
  return NextResponse.json({ partners: data });
}
