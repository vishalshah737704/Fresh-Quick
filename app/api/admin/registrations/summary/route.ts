import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { count, error } = await supabaseServer
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("role", "customer")
    .eq("approval_status", "pending");
  if (error) return NextResponse.json({ error: "Failed to load the pending count" }, { status: 500 });
  return NextResponse.json({ pending: count ?? 0 });
}
