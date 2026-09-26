import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyInternalSecret } from "@/lib/internal-auth";

// Called by n8n's "Restaurant Status Change" workflow (workflow 03) when
// an order is accepted, to get the data an order-confirmation email needs.
// public.users has no email column (it lives on auth.users), so this is
// the one place that joins across to auth.admin to read it.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select(
      "id, customer_id, total, status, addresses:delivery_address_id(label, line1), stores:store_id(name)"
    )
    .eq("id", id)
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const { data: userResult, error: userError } = await supabaseServer.auth.admin.getUserById(
    order.customer_id
  );
  if (userError || !userResult.user?.email) {
    return NextResponse.json({ error: "Customer email not found" }, { status: 404 });
  }

  const address = Array.isArray(order.addresses) ? order.addresses[0] : order.addresses;
  const restaurant = Array.isArray(order.stores) ? order.stores[0] : order.stores;

  return NextResponse.json({
    orderId: order.id,
    customerEmail: userResult.user.email,
    restaurantName: restaurant?.name ?? "the restaurant",
    total: order.total,
    deliveryAddress: address?.label || address?.line1 || "your saved address",
  });
}
