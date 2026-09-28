import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";
import { VENDOR_STATUS_TRANSITIONS } from "@/lib/order-constants";

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

  const nextStatus = VENDOR_STATUS_TRANSITIONS[order.status];
  if (!nextStatus) {
    return NextResponse.json(
      { error: `Order in status "${order.status}" cannot be advanced by a vendor` },
      { status: 400 }
    );
  }

  // A "placed" order's payment can still be "pending" for up to ~10s while
  // checkout polls n8n / runs its fallback (see app/api/cart/checkout/
  // route.ts). Advancing a vendor order past "placed" while payment is
  // still pending would let a later payment failure slip through, since
  // applyPaymentResult() only cancels an order still "placed".
  if (order.status === "placed") {
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
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("store_id", resolved.storeId)
    .eq("status", order.status)
    .select("id, status")
    .single();
  if (updateError || !updated) {
    if (updateError?.code === "PGRST116") {
      return NextResponse.json(
        { error: "Order status changed, please refresh" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to update order status" }, { status: 500 });
  }
  return NextResponse.json({ order: updated });
}
