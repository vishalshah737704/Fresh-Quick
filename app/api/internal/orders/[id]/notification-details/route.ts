import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { ORDER_DETAIL_SELECT, normalizeOrderDetail, type RawOrderDetail } from "@/lib/order-detail";
import { isAllowedImageUrl } from "@/lib/image-url";
import { buildDeliveredEmail } from "@/lib/delivered-email";

// Called by n8n workflow 03 (order accepted) and workflow 05 (order
// delivered) to get the data their emails need. It deliberately has no
// status check: both workflows call it at different order statuses.
// `customerEmail` is the order's recipient_email (the email typed at
// checkout), NOT the account's auth email.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;

  const { data, error } = await supabaseServer
    .from("orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const order = normalizeOrderDetail(data as unknown as RawOrderDetail);
  if (!order.recipientEmail.trim()) {
    return NextResponse.json({ error: "Recipient email not found" }, { status: 404 });
  }

  const { subject, html } = buildDeliveredEmail(order, isAllowedImageUrl);

  return NextResponse.json({
    orderId: order.id,
    customerEmail: order.recipientEmail,
    restaurantName: order.storeName,
    total: order.total,
    deliveryAddress: order.address?.label || order.address?.lines[0] || "your saved address",
    status: order.status,
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    address: order.address,
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      imageUrl: item.imageUrl,
      options: item.options.map((option) => option.optionName),
      specialInstructions: item.specialInstructions,
    })),
    emailSubject: subject,
    deliveredEmailHtml: html,
  });
}
