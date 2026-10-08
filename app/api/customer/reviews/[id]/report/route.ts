import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import { REVIEW_LIMITS, cleanComment } from "@/lib/reviews-model";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
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
    .select("id, status, customer_id, reported_at")
    .eq("id", id.toLowerCase())
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not report this review right now" }, { status: 500 });
  if (!review || review.status !== "visible") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (review.customer_id === who.userId) {
    return NextResponse.json({ error: "You cannot report your own review" }, { status: 400 });
  }
  if (review.reported_at) return NextResponse.json({ reported: true });

  const { error: updateError } = await supabaseServer
    .from("reviews")
    .update({ reported_at: new Date().toISOString(), report_reason: reason.value, reported_by: "customer" })
    .eq("id", review.id)
    .is("reported_at", null);
  if (updateError) return NextResponse.json({ error: "Could not report this review right now" }, { status: 500 });
  return NextResponse.json({ reported: true });
}
