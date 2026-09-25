import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("restaurants")
    .update({ is_open: false, is_suspended: true })
    .eq("id", id)
    .select("id, is_open, is_suspended")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  return NextResponse.json({ restaurant: data });
}
