import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("restaurants")
    .select("id, name, is_open, is_suspended, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load restaurants" }, { status: 500 });
  }
  return NextResponse.json({ restaurants: data });
}
