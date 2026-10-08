import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import { REVIEW_LIMITS, cleanComment } from "@/lib/reviews-model";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { reason?: unknown } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }
  const reason = cleanComment(body.reason, REVIEW_LIMITS.reason);
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });

  const { data: review, error } = await supabaseServer
    .from("reviews")
    .select("id, reported_at")
    .eq("id", id.toLowerCase())
    .eq("store_id", resolved.storeId)
    .eq("status", "visible")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not report this review right now" }, { status: 500 });
  if (!review) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (review.reported_at) return NextResponse.json({ reported: true });

  const { error: updateError } = await supabaseServer
    .from("reviews")
    .update({ reported_at: new Date().toISOString(), report_reason: reason.value, reported_by: "vendor" })
    .eq("id", review.id)
    .is("reported_at", null);
  if (updateError) return NextResponse.json({ error: "Could not report this review right now" }, { status: 500 });
  return NextResponse.json({ reported: true });
}
