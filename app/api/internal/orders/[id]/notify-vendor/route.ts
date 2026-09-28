import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyInternalSecret } from "@/lib/internal-auth";

// Called by n8n's "01 - Order Placed" workflow once an order insert is
// confirmed as status = 'placed'. Writes a real notifications row so the
// vendor-facing "new order" alert is a verifiable database fact, not just
// an n8n execution log entry (spec section 6).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, store_id, total, order_items(quantity)")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const itemCount = (order.order_items ?? []).reduce((sum, i) => sum + i.quantity, 0);
  const shortId = order.id.slice(0, 8);
  const message = `New order #${shortId} — ${itemCount} item${itemCount === 1 ? "" : "s"}, ₹${Number(order.total).toFixed(2)}`;

  const { data: notification, error: insertError } = await supabaseServer
    .from("notifications")
    .insert({
      order_id: order.id,
      restaurant_id: order.store_id,
      channel: "vendor_new_order",
      message,
    })
    .select("id, order_id, restaurant_id, message")
    .single();

  if (insertError || !notification) {
    return NextResponse.json({ error: "Failed to write notification" }, { status: 500 });
  }

  return NextResponse.json({ notification });
}
