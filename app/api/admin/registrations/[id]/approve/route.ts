import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { isUuid } from "@/lib/registration-admin";

const ALREADY_DECIDED = "This request was already decided.";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid request id" }, { status: 400 });

  const { data: row } = await supabaseServer
    .from("users")
    .select("role, approval_status")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.role !== "customer") return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (row.approval_status !== "pending") return NextResponse.json({ error: ALREADY_DECIDED }, { status: 409 });

  // Lift the ban first, then record the decision. If a concurrent decision wins, put the ban back
  // unless that decision was also an approval.
  const { error: unbanError } = await supabaseServer.auth.admin.updateUserById(id, { ban_duration: "none" });
  if (unbanError) return NextResponse.json({ error: "Failed to approve" }, { status: 500 });

  const { data: decided, error: decideError } = await supabaseServer.rpc("decide_registration", {
    p_user_id: id,
    p_decision: "approved",
    p_reason: null,
    p_admin: resolved.adminId,
  });
  if (decideError || !Array.isArray(decided) || decided.length === 0) {
    const { data: now } = await supabaseServer.from("users").select("approval_status").eq("id", id).maybeSingle();
    if (now?.approval_status !== "approved") {
      await supabaseServer.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    }
    return decideError
      ? NextResponse.json({ error: "Failed to approve" }, { status: 500 })
      : NextResponse.json({ error: ALREADY_DECIDED }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
