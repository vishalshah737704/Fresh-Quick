import type { OrderDetail } from "./order-detail";

export type DeliveryScope = "available" | "active" | "history";

// Server-side privacy gate mirroring the RLS policy
// delivery_can_read_assigned_order_address: a partner sees the recipient's
// phone and drop-off address (and its exact coordinates) only while the order
// is theirs and in flight. storePoint stays: store coordinates are public and
// the pickup address is already shown.
export function redactForDelivery(order: OrderDetail, scope: DeliveryScope): OrderDetail {
  // The coupon code is customer-side detail; the amounts stay because the partner collects the total.
  const base = { ...order, recipientEmail: "", couponCode: null };
  if (scope === "active") return base;
  if (scope === "history") {
    return { ...base, recipientPhone: "", address: null, deliveryPoint: null, deliveryNote: null };
  }
  return {
    ...base,
    recipientName: "",
    recipientPhone: "",
    address: null,
    deliveryPoint: null,
    deliveryNote: null,
  };
}
