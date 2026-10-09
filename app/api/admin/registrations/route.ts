import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { shapeRegistrationRows } from "@/lib/registration-admin";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const view = request.nextUrl.searchParams.get("view") === "history" ? "history" : "pending";
  const { data, error } = await supabaseServer.rpc("registration_requests", { p_view: view });
  if (error) return NextResponse.json({ error: "Failed to load registrations" }, { status: 500 });
  return NextResponse.json({ requests: shapeRegistrationRows(data) });
}
