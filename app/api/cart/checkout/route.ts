import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { PAYMENT_SUCCESS_RATE } from "@/lib/order-constants";
import {
  validateCardFields,
  validateUpiFields,
  validateRecipientEmail,
  buildMaskedReference,
  type CardFields,
  type UpiFields,
} from "@/lib/payment-fields";
import { applyPaymentResult } from "@/lib/mock-payment";
import { validateRecipientPhone, normalizeIndianMobile } from "@/lib/phone";

type CheckoutRequestItem = {
  productId: string;
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
    storeId,
    items,
    deliveryAddress,
    paymentMethod,
    expectedTotal,
    deliveryNote,
    recipientName,
    recipientEmail,
    recipientPhone,
    cardFields,
    upiFields,
  }: {
    storeId: string;
    items: CheckoutRequestItem[];
    deliveryAddress: {
      label: string;
      lat: number;
      lng: number;
      line1: string;
      line2: string | null;
      city: string;
      state: string;
      pincode: string;
    };
    paymentMethod: "mock_card" | "mock_upi" | "mock_cod";
    expectedTotal?: number;
    deliveryNote?: string | null;
    recipientName: string;
    recipientEmail: string;
    recipientPhone: string;
    cardFields?: CardFields;
    upiFields?: UpiFields;
  } = body;

  if (!storeId || !items?.length || !deliveryAddress) {
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
    if (
      typeof item.specialInstructions === "string" &&
      item.specialInstructions.length > 500
    ) {
      return NextResponse.json(
        { error: "Special instructions must be 500 characters or fewer" },
        { status: 400 }
      );
    }
    if (
      Array.isArray(item.selectedOptionIds) &&
      new Set(item.selectedOptionIds).size !== item.selectedOptionIds.length
    ) {
      return NextResponse.json(
        { error: "Duplicate option selections are not allowed" },
        { status: 400 }
      );
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
  const requiredAddressFields: (keyof typeof deliveryAddress)[] = ["line1", "city", "state", "pincode"];
  for (const field of requiredAddressFields) {
    if (typeof deliveryAddress[field] !== "string" || (deliveryAddress[field] as string).trim().length === 0) {
      return NextResponse.json({ error: "Address 1, City, State, and Pincode are required" }, { status: 400 });
    }
  }
  if (
    deliveryAddress.line2 !== null &&
    deliveryAddress.line2 !== undefined &&
    typeof deliveryAddress.line2 !== "string"
  ) {
    return NextResponse.json({ error: "Invalid delivery address" }, { status: 400 });
  }
  if (deliveryNote !== undefined && deliveryNote !== null && typeof deliveryNote !== "string") {
    return NextResponse.json({ error: "Invalid delivery note" }, { status: 400 });
  }
  if (typeof deliveryNote === "string" && deliveryNote.length > 500) {
    return NextResponse.json(
      { error: "Delivery note must be 500 characters or fewer" },
      { status: 400 }
    );
  }
  const normalizedDeliveryNote =
    typeof deliveryNote === "string" && deliveryNote.trim() !== "" ? deliveryNote : null;

  const normalizedRecipientName = typeof recipientName === "string" ? recipientName.trim() : "";
  if (normalizedRecipientName.length === 0) {
    return NextResponse.json({ error: "Recipient name is required" }, { status: 400 });
  }
  const emailError = validateRecipientEmail(typeof recipientEmail === "string" ? recipientEmail : "");
  if (emailError) {
    return NextResponse.json({ error: emailError }, { status: 400 });
  }
  const phoneError = validateRecipientPhone(typeof recipientPhone === "string" ? recipientPhone : "");
  if (phoneError) {
    return NextResponse.json({ error: phoneError }, { status: 400 });
  }
  const normalizedRecipientPhone = normalizeIndianMobile(recipientPhone) as string;

  let paymentFieldError: string | null = null;
  if (paymentMethod === "mock_card") {
    paymentFieldError = validateCardFields(cardFields ?? { cardNumber: "", expiry: "", cardholderName: "" });
  } else if (paymentMethod === "mock_upi") {
    paymentFieldError = validateUpiFields(upiFields ?? { upiId: "" });
  }
  if (paymentFieldError) {
    return NextResponse.json({ error: paymentFieldError }, { status: 400 });
  }

  const maskedReference = buildMaskedReference(
    paymentMethod,
    cardFields ?? { cardNumber: "", expiry: "", cardholderName: "" },
    upiFields ?? { upiId: "" }
  );

  const { data: store, error: storeError } = await supabaseServer
    .from("stores")
    .select("id, is_open, is_suspended, delivery_fee_paise")
    .eq("id", storeId)
    .single();

  if (storeError || !store) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  if (!store.is_open || store.is_suspended) {
    return NextResponse.json({ error: "Restaurant is currently closed" }, { status: 409 });
  }

  const productIds = [...new Set(items.map((i) => i.productId))];
  const { data: products, error: productError } = await supabaseServer
    .from("products")
    .select(
      "id, store_id, price, is_available, menu_item_option_groups(id, name, min_select, max_select, menu_item_options(id, name, price_delta_paise))"
    )
    .in("id", productIds);

  if (productError || !products || products.length !== productIds.length) {
    return NextResponse.json({ error: "One or more menu items not found" }, { status: 404 });
  }

  for (const item of products) {
    if (item.store_id !== storeId) {
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

  const priceById = new Map(products.map((m) => [m.id, Number(m.price)]));

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
  for (const mi of products) {
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
    const groups = groupsByMenuItem.get(item.productId) ?? [];
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
    const basePaise = Math.round((priceById.get(item.productId) ?? 0) * 100);
    const deltaPaise = (item.selectedOptionIds ?? []).reduce(
      (s, optionId) => s + (optionInfoById.get(optionId)?.priceDeltaPaise ?? 0),
      0
    );
    return sum + (basePaise + deltaPaise) * item.quantity;
  }, 0);
  const deliveryFeePaise = store.delivery_fee_paise;
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
    const basePaise = Math.round((priceById.get(item.productId) ?? 0) * 100);
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
      product_id: item.productId,
      quantity: item.quantity,
      unit_price: (basePaise + deltaPaise) / 100,
      special_instructions: item.specialInstructions ?? null,
      options,
    };
  });

  const { data: rpcRows, error: rpcError } = await supabaseServer.rpc("checkout_place_order", {
    p_customer_id: customerId,
    p_recipient_name: normalizedRecipientName,
    p_recipient_email: recipientEmail.trim(),
    p_recipient_phone: normalizedRecipientPhone,
    p_address_label: deliveryAddress.label,
    p_address_line1: deliveryAddress.line1,
    p_address_line2: deliveryAddress.line2 ?? null,
    p_address_city: deliveryAddress.city,
    p_address_state: deliveryAddress.state,
    p_address_pincode: deliveryAddress.pincode,
    p_address_lat: deliveryAddress.lat,
    p_address_lng: deliveryAddress.lng,
    p_store_id: storeId,
    p_subtotal: subtotal,
    p_delivery_fee: deliveryFeePaise / 100,
    p_total: total,
    p_items: orderItemsPayload,
    p_payment_method: paymentMethod,
    p_payment_amount: total,
    p_payment_reference: maskedReference,
    p_delivery_note: normalizedDeliveryNote,
  });

  if (rpcError || !rpcRows || !rpcRows[0]) {
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }

  const order = { id: rpcRows[0].order_id as string };
  const paymentId = rpcRows[0].payment_id as string;

  // Poll briefly for n8n to resolve the payment via
  // /api/internal/payments/[id]/result (workflow 02). If it doesn't
  // resolve in time -- most commonly because n8n isn't running locally,
  // which is the default dev state -- fall back to the same in-process
  // random-outcome logic Phase 3 always used, applied through the same
  // applyPaymentResult() helper the n8n callback route uses, so behavior
  // is identical either way.
  const POLL_INTERVAL_MS = 400;
  const POLL_TIMEOUT_MS = 10_000;
  let paymentStatus: "success" | "failed" | null = null;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { data: paymentRow } = await supabaseServer
      .from("payments")
      .select("status")
      .eq("id", paymentId)
      .single();
    if (paymentRow && paymentRow.status !== "pending") {
      paymentStatus = paymentRow.status as "success" | "failed";
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  if (paymentStatus === null) {
    const fallbackSucceeds =
      paymentMethod === "mock_cod" || Math.random() < PAYMENT_SUCCESS_RATE;
    const fallbackStatus = fallbackSucceeds ? "success" : "failed";
    const applied = await applyPaymentResult(paymentId, fallbackStatus);
    if (applied.ok) {
      paymentStatus = fallbackStatus;
    } else {
      // Payment was already resolved (e.g. by n8n) between our last poll
      // check and this fallback attempt — re-read the real status instead
      // of assuming failure.
      const { data: currentPayment } = await supabaseServer
        .from("payments")
        .select("status")
        .eq("id", paymentId)
        .single();
      paymentStatus = (currentPayment?.status as "success" | "failed" | undefined) ?? "failed";
    }
  }

  return NextResponse.json({ orderId: order.id, paymentStatus });
}
