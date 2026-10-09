import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { isUuid } from "@/lib/registration-admin";
import { cleanRejectionReason } from "@/lib/registration-model";

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const reason = cleanRejectionReason(body.reason);
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });

  const { data: row } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", id)
    .maybeSingle();
  if (!row || row.role !== "customer") return NextResponse.json({ error: "Request not found" }, { status: 404 });

  // The ban stays on, so nothing else needs changing for a rejection.
  const { data: decided, error } = await supabaseServer.rpc("decide_registration", {
    p_user_id: id,
    p_decision: "rejected",
    p_reason: reason.value,
    p_admin: resolved.adminId,
  });
  if (error) return NextResponse.json({ error: "Failed to reject" }, { status: 500 });
  if (!Array.isArray(decided) || decided.length === 0) {
    return NextResponse.json({ error: "This request was already decided." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
