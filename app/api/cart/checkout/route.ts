import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { PAYMENT_SUCCESS_RATE } from "@/lib/order-constants";

type CheckoutRequestItem = {
  menuItemId: string;
  quantity: number;
  selectedOptionIds: string[];
  specialInstructions: string | null;
};

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
    if (item.selectedOptionIds !== undefined && !Array.isArray(item.selectedOptionIds)) {
      return NextResponse.json({ error: "Invalid selected options" }, { status: 400 });
    }
    if (
      item.specialInstructions !== undefined &&
      item.specialInstructions !== null &&
      typeof item.specialInstructions !== "string"
    ) {
      return NextResponse.json({ error: "Invalid special instructions" }, { status: 400 });
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
    .select(
      "id, restaurant_id, price, is_available, menu_item_option_groups(id, name, min_select, max_select, menu_item_options(id, name, price_delta_paise))"
    )
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

  type OptionInfo = {
    groupId: string;
    groupName: string;
    optionName: string;
    priceDeltaPaise: number;
  };
  const optionInfoById = new Map<string, OptionInfo>();
  const groupsByMenuItem = new Map<
    string,
    { id: string; min_select: number; max_select: number }[]
  >();
  for (const mi of menuItems) {
    const groups = mi.menu_item_option_groups ?? [];
    groupsByMenuItem.set(
      mi.id,
      groups.map((g) => ({ id: g.id, min_select: g.min_select, max_select: g.max_select }))
    );
    for (const g of groups) {
      for (const o of g.menu_item_options ?? []) {
        optionInfoById.set(o.id, {
          groupId: g.id,
          groupName: g.name,
          optionName: o.name,
          priceDeltaPaise: o.price_delta_paise,
        });
      }
    }
  }

  // Every selected option must belong to a group on THAT SPECIFIC menu
  // item, and every group's own min/max must be satisfied — never trust
  // the client's selections, prices, or which item they claim to attach to.
  for (const item of items) {
    const groups = groupsByMenuItem.get(item.menuItemId) ?? [];
    const groupIds = new Set(groups.map((g) => g.id));
    const countByGroup = new Map<string, number>();
    for (const optionId of item.selectedOptionIds ?? []) {
      const info = optionInfoById.get(optionId);
      if (!info || !groupIds.has(info.groupId)) {
        return NextResponse.json(
          { error: "One or more selected options are invalid for this item" },
          { status: 400 }
        );
      }
      countByGroup.set(info.groupId, (countByGroup.get(info.groupId) ?? 0) + 1);
    }
    for (const group of groups) {
      const count = countByGroup.get(group.id) ?? 0;
      if (count < group.min_select || count > group.max_select) {
        return NextResponse.json(
          { error: "One or more required option selections are missing or invalid" },
          { status: 400 }
        );
      }
    }
  }

  const subtotalPaise = items.reduce((sum, item) => {
    const basePaise = Math.round((priceById.get(item.menuItemId) ?? 0) * 100);
    const deltaPaise = (item.selectedOptionIds ?? []).reduce(
      (s, optionId) => s + (optionInfoById.get(optionId)?.priceDeltaPaise ?? 0),
      0
    );
    return sum + (basePaise + deltaPaise) * item.quantity;
  }, 0);
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

  const orderItemsPayload = items.map((item) => {
    const basePaise = Math.round((priceById.get(item.menuItemId) ?? 0) * 100);
    const options = (item.selectedOptionIds ?? []).map((optionId) => {
      const info = optionInfoById.get(optionId)!;
      return {
        option_id: optionId,
        group_name: info.groupName,
        option_name: info.optionName,
        price_delta_paise: info.priceDeltaPaise,
      };
    });
    const deltaPaise = options.reduce((s, o) => s + o.price_delta_paise, 0);
    return {
      menu_item_id: item.menuItemId,
      quantity: item.quantity,
      unit_price: (basePaise + deltaPaise) / 100,
      special_instructions: item.specialInstructions ?? null,
      options,
    };
  });

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
