import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { DELIVERY_FEE_RUPEES, PAYMENT_SUCCESS_RATE } from "@/lib/order-constants";

type CheckoutRequestItem = { menuItemId: string; quantity: number };

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const customerId = userData.user.id;

  const body = await request.json();
  const {
    restaurantId,
    items,
    deliveryAddress,
    paymentMethod,
  }: {
    restaurantId: string;
    items: CheckoutRequestItem[];
    deliveryAddress: { label: string; lat: number; lng: number };
    paymentMethod: "mock_card" | "mock_upi" | "mock_cod";
  } = body;

  if (!restaurantId || !items?.length || !deliveryAddress) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 50) {
      return NextResponse.json({ error: "Invalid item quantity" }, { status: 400 });
    }
  }

  const { data: restaurant, error: restaurantError } = await supabaseServer
    .from("restaurants")
    .select("id, is_open")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  if (!restaurant.is_open) {
    return NextResponse.json({ error: "Restaurant is currently closed" }, { status: 409 });
  }

  const menuItemIds = items.map((i) => i.menuItemId);
  const { data: menuItems, error: menuError } = await supabaseServer
    .from("menu_items")
    .select("id, restaurant_id, price, is_available")
    .in("id", menuItemIds);

  if (menuError || !menuItems || menuItems.length !== menuItemIds.length) {
    return NextResponse.json({ error: "One or more menu items not found" }, { status: 404 });
  }

  for (const item of menuItems) {
    if (item.restaurant_id !== restaurantId) {
      return NextResponse.json(
        { error: "Cart contains items from more than one restaurant" },
        { status: 409 }
      );
    }
    if (!item.is_available) {
      return NextResponse.json(
        { error: "One or more items are no longer available" },
        { status: 409 }
      );
    }
  }

  const priceById = new Map(menuItems.map((m) => [m.id, Number(m.price)]));
  const subtotal = items.reduce(
    (sum, item) => sum + (priceById.get(item.menuItemId) ?? 0) * item.quantity,
    0
  );
  const total = subtotal + DELIVERY_FEE_RUPEES;

  const { data: address, error: addressError } = await supabaseServer
    .from("addresses")
    .insert({
      user_id: customerId,
      label: deliveryAddress.label,
      line1: deliveryAddress.label,
      lat: deliveryAddress.lat,
      lng: deliveryAddress.lng,
      is_default: false,
    })
    .select("id")
    .single();

  if (addressError || !address) {
    return NextResponse.json({ error: "Failed to save delivery address" }, { status: 500 });
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .insert({
      customer_id: customerId,
      restaurant_id: restaurantId,
      delivery_address_id: address.id,
      status: "placed",
      subtotal,
      delivery_fee: DELIVERY_FEE_RUPEES,
      total,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }

  const orderItemRows = items.map((item) => ({
    order_id: order.id,
    menu_item_id: item.menuItemId,
    quantity: item.quantity,
    unit_price: priceById.get(item.menuItemId) ?? 0,
  }));

  const { error: orderItemsError } = await supabaseServer
    .from("order_items")
    .insert(orderItemRows);

  if (orderItemsError) {
    return NextResponse.json({ error: "Failed to save order items" }, { status: 500 });
  }

  // Mock payment resolution — synchronous, in-process (no n8n yet).
  // mock_cod always succeeds; mock_card/mock_upi resolve randomly.
  const paymentSucceeds =
    paymentMethod === "mock_cod" || Math.random() < PAYMENT_SUCCESS_RATE;
  const paymentStatus = paymentSucceeds ? "success" : "failed";

  const { error: paymentError } = await supabaseServer.from("payments").insert({
    order_id: order.id,
    method: paymentMethod,
    status: paymentStatus,
    amount: total,
    mock_reference: `MOCK-${order.id.slice(0, 8)}`,
    paid_at: paymentSucceeds ? new Date().toISOString() : null,
  });

  if (paymentError) {
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }

  if (!paymentSucceeds) {
    const { error: cancelError } = await supabaseServer
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);
    if (cancelError) {
      console.error("Failed to mark order cancelled after payment failure:", order.id, cancelError);
    }
  }

  return NextResponse.json({ orderId: order.id, paymentStatus });
}
