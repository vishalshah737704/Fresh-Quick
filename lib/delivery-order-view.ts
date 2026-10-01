import type { OrderDetail } from "./order-detail";

export type DeliveryScope = "available" | "active" | "history";

// Server-side privacy gate mirroring the RLS policy
// delivery_can_read_assigned_order_address: a partner sees the recipient's
// phone and drop-off address only while the order is theirs and in flight.
export function redactForDelivery(order: OrderDetail, scope: DeliveryScope): OrderDetail {
  const base = { ...order, recipientEmail: "" };
  if (scope === "active") return base;
  if (scope === "history") {
    return { ...base, recipientPhone: "", address: null, deliveryNote: null };
  }
  return { ...base, recipientName: "", recipientPhone: "", address: null, deliveryNote: null };
}
