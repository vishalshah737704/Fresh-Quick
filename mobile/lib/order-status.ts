// Mirrors lib/order-status.ts — tests/mobile-parity.test.mjs enforces it.
// Must stay erasable TypeScript with no project imports so Node can load it.
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

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "assigned",
  "picked_up",
  "delivered",
  "cancelled",
  "rejected",
];

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["delivered", "cancelled", "rejected"];

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Placed",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Partner assigned",
  picked_up: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const STATUS_MESSAGE: Record<OrderStatus, string> = {
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

export const TIMELINE_STEPS = [
  "Placed",
  "Accepted",
  "Preparing",
  "Ready",
  "On the way",
  "Delivered",
] as const;

export type TimelineStatus = Exclude<OrderStatus, "cancelled" | "rejected">;

// Typed over the narrowed union so the compiler rejects any future status
// that isn't explicitly mapped (cancelled/rejected are handled as banners).
export const TIMELINE_STEP_INDEX: Record<TimelineStatus, number> = {
  placed: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  assigned: 4,
  picked_up: 4,
  delivered: 5,
};

// Hex equivalents of the web's Tailwind pill classes; white text on all,
// every background >= 4.5:1. picked_up is BRAND.colors.primaryTextSafe.
export const STATUS_COLOR: Record<OrderStatus, { background: string; text: string }> = {
  placed: { background: "#334155", text: "#FFFFFF" },
  accepted: { background: "#1D4ED8", text: "#FFFFFF" },
  preparing: { background: "#B45309", text: "#FFFFFF" },
  ready: { background: "#0F766E", text: "#FFFFFF" },
  assigned: { background: "#4338CA", text: "#FFFFFF" },
  picked_up: { background: "#A85800", text: "#FFFFFF" },
  delivered: { background: "#15803D", text: "#FFFFFF" },
  cancelled: { background: "#B91C1C", text: "#FFFFFF" },
  rejected: { background: "#B91C1C", text: "#FFFFFF" },
};

export const SHOW_LOCATION_FOR_STATUS: OrderStatus[] = ["assigned", "picked_up"];
