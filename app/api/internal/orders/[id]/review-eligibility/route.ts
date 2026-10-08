import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import { buildReviewRequestEmail } from "@/lib/review-request-email";
import { reviewRequestDecision } from "@/lib/review-eligibility";

// Called by n8n workflow 05, one hour after an order is delivered. Eligible only if the order is delivered,
// at least `minAgeMinutes` old (default 55: a guard against a wrong or duplicate trigger), still unreviewed,
// and its customer account still exists (a deleted account has nobody to ask).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyInternalSecret(request)) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const rawMin = request.nextUrl.searchParams.get("minAgeMinutes");
  const minAge = rawMin === null ? 55 : rawMin.trim() === "" ? Number.NaN : Number(rawMin);
  if (!Number.isFinite(minAge) || minAge < 0 || minAge > 1440) {
    return NextResponse.json({ error: "minAgeMinutes must be 0 to 1440" }, { status: 400 });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select("id, status, delivered_at, customer_id, recipient_name, recipient_email, stores(name)")
    .eq("id", id.toLowerCase())
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const { data: review, error: reviewError } = await supabaseServer.from("reviews").select("id").eq("order_id", order.id).maybeSingle();
  if (reviewError) return NextResponse.json({ error: "Failed to check reviews" }, { status: 500 });

  const decision = reviewRequestDecision({
    status: order.status,
    customerId: order.customer_id,
    deliveredAt: order.delivered_at,
    recipientEmail: order.recipient_email,
    hasReview: Boolean(review),
    nowMs: Date.now(),
    minAgeMinutes: minAge,
  });
  if (!decision.eligible) return NextResponse.json({ eligible: false, reason: decision.reason });

  const store = Array.isArray(order.stores) ? order.stores[0] : order.stores;
  const base = (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const { subject, html } = buildReviewRequestEmail({
    orderId: order.id,
    storeName: store?.name ?? "the store",
    recipientName: order.recipient_name,
    orderUrl: `${base}/customer/orders/${order.id}`,
  });
  return NextResponse.json({
    eligible: true,
    customerEmail: order.recipient_email,
    emailSubject: subject,
    reviewRequestHtml: html,
  });
}
