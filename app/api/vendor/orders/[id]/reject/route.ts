import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";

// A vendor may only reject an order before they've started preparing it —
// once accepted/preparing/etc. the customer is already committed, so
// "reject" only ever applies to a still-"placed" order.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, status, store_id, payments(status)")
    .eq("id", id)
    .eq("store_id", resolved.storeId)
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "placed") {
    return NextResponse.json(
      { error: `Order in status "${order.status}" cannot be rejected` },
      { status: 400 }
    );
  }

  // A "placed" order's payment can still be "pending" for up to ~10s while
  // checkout polls n8n / runs its fallback (see app/api/cart/checkout/
  // route.ts) — it's no longer guaranteed to already be resolved by the
  // time a vendor can see the order. Rejecting now would let a payment
  // that later resolves to "success" go unrefunded, since the refund
  // below only matches payments already in "success".
  const paymentsField = order.payments as { status: string }[] | { status: string } | null;
  const paymentStatus = Array.isArray(paymentsField)
    ? paymentsField[0]?.status
    : paymentsField?.status;
  if (paymentStatus === "pending") {
    return NextResponse.json(
      { error: "Order payment is still processing — try again in a moment" },
      { status: 409 }
    );
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ status: "rejected" })
    .eq("id", id)
    .eq("store_id", resolved.storeId)
    .eq("status", "placed")
    .select("id, status")
    .single();
  if (updateError || !updated) {
    if (updateError?.code === "PGRST116") {
      return NextResponse.json(
        { error: "Order status changed, please refresh" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to reject order" }, { status: 500 });
  }

  // Refund the payment if it already settled successfully. A rejected
  // order's checkout payment is, at this point, either "success" (the
  // pending-payment check above already ruled out "pending", and checkout
  // cancels the order itself on payment failure, so "failed" can't reach
  // here as "placed") or already refunded by a retried request — the
  // "success" filter here just makes that retry safe.
  const { error: refundError } = await supabaseServer
    .from("payments")
    .update({ status: "refunded" })
    .eq("order_id", id)
    .eq("status", "success");
  if (refundError) {
    console.error("Failed to refund payment after order rejection:", id, refundError);
  }

  return NextResponse.json({ order: updated });
}
