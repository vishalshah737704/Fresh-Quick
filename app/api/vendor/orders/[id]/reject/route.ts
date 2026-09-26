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
    .select("id, status, store_id")
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
  // order's checkout payment is, by construction, always either
  // "success" (checkout already cancels the order itself on payment
  // failure, so a "placed" order a vendor can see always has a
  // successful payment) or already refunded by a retried request — the
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
