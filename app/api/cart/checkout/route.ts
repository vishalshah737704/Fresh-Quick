import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { PAYMENT_SUCCESS_RATE } from "@/lib/order-constants";

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
    expectedTotal,
  }: {
    restaurantId: string;
    items: CheckoutRequestItem[];
    deliveryAddress: { label: string; lat: number; lng: number };
    paymentMethod: "mock_card" | "mock_upi" | "mock_cod";
    expectedTotal?: number;
  } = body;

  if (!restaurantId || !items?.length || !deliveryAddress) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0 || item.quantity > 50) {
      return NextResponse.json({ error: "Invalid item quantity" }, { status: 400 });
    }
  }

  const VALID_PAYMENT_METHODS = ["mock_card", "mock_upi", "mock_cod"];
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return NextResponse.json({ error: "Invalid payment method" }, { status: 400 });
  }
  if (
    typeof deliveryAddress.lat !== "number" ||
    !Number.isFinite(deliveryAddress.lat) ||
    typeof deliveryAddress.lng !== "number" ||
    !Number.isFinite(deliveryAddress.lng) ||
    typeof deliveryAddress.label !== "string" ||
    deliveryAddress.label.trim().length === 0
  ) {
    return NextResponse.json({ error: "Invalid delivery address" }, { status: 400 });
  }

  const { data: restaurant, error: restaurantError } = await supabaseServer
    .from("restaurants")
    .select("id, is_open, is_suspended, delivery_fee_paise")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  if (!restaurant.is_open || restaurant.is_suspended) {
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
  const subtotalPaise = items.reduce(
    (sum, item) => sum + Math.round((priceById.get(item.menuItemId) ?? 0) * 100) * item.quantity,
    0
  );
  const deliveryFeePaise = restaurant.delivery_fee_paise;
  const totalPaise = subtotalPaise + deliveryFeePaise;
  const subtotal = subtotalPaise / 100;
  const total = totalPaise / 100;

  if (typeof expectedTotal === "number" && Math.abs(expectedTotal - total) > 0.01) {
    return NextResponse.json(
      { error: "Prices have changed since you added items to your cart. Please review your order." },
      { status: 409 }
    );
  }

  const orderItemsPayload = items.map((item) => ({
    menu_item_id: item.menuItemId,
    quantity: item.quantity,
    unit_price: priceById.get(item.menuItemId) ?? 0,
  }));

  // Mock payment resolution — synchronous, in-process (no n8n yet).
  // mock_cod always succeeds; mock_card/mock_upi resolve randomly.
  // This determination is not itself a write, so it stays here in TS
  // and its result is passed into the RPC to be inserted atomically
  // with the order/address/order_items.
  const paymentSucceeds =
    paymentMethod === "mock_cod" || Math.random() < PAYMENT_SUCCESS_RATE;
  const paymentStatus = paymentSucceeds ? "success" : "failed";

  const { data: rpcRows, error: rpcError } = await supabaseServer.rpc("checkout_place_order", {
    p_customer_id: customerId,
    p_address_label: deliveryAddress.label,
    p_address_line1: deliveryAddress.label,
    p_address_lat: deliveryAddress.lat,
    p_address_lng: deliveryAddress.lng,
    p_restaurant_id: restaurantId,
    p_subtotal: subtotal,
    p_delivery_fee: deliveryFeePaise / 100,
    p_total: total,
    p_items: orderItemsPayload,
    p_payment_method: paymentMethod,
    p_payment_status: paymentStatus,
    p_payment_amount: total,
    p_payment_paid_at: paymentSucceeds ? new Date().toISOString() : null,
  });

  if (rpcError || !rpcRows || !rpcRows[0]) {
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }

  const order = { id: rpcRows[0].order_id as string };

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
