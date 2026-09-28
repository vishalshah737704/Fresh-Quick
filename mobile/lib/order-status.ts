// Order status enum, labels, and 4-step timeline mapping — mirrors
// components/OrderStatusTimeline.tsx and app/customer/orders/[id]/page.tsx
// on the web exactly, so the two apps show identical order semantics.
export type OrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "cancelled"
  | "rejected";

export const ORDERS_LIST_STATUS_LABEL: Record<string, string> = {
  placed: "Placed",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Out for delivery",
  picked_up: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const ORDER_DETAIL_STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Order placed — waiting for restaurant",
  accepted: "Restaurant accepted your order",
  preparing: "Restaurant is preparing your order",
  ready: "Order ready for pickup",
  assigned: "Delivery partner assigned",
  picked_up: "Order picked up — on the way",
  delivered: "Delivered",
  cancelled: "Order cancelled",
  rejected: "Restaurant rejected your order — payment refunded",
};

export const TIMELINE_STEPS = ["Placed", "Preparing", "On the way", "Delivered"] as const;

// Typed as a Record over the union with "cancelled"/"rejected" excluded so a
// future new OrderStatus value fails to compile here until explicitly
// mapped — same technique web's OrderStatusTimeline uses.
export const TIMELINE_STEP_INDEX: Record<Exclude<OrderStatus, "cancelled" | "rejected">, number> = {
  placed: 0,
  accepted: 0,
  preparing: 1,
  ready: 1,
  assigned: 2,
  picked_up: 2,
  delivered: 3,
};

export const SHOW_LOCATION_FOR_STATUS: OrderStatus[] = ["assigned", "picked_up"];

export const TERMINAL_STATUSES: OrderStatus[] = ["delivered", "cancelled", "rejected"];
