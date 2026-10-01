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

// White text on every pill: all backgrounds are -700 shades (or the darkened
// brand "-text-safe" tokens) so contrast stays >= 4.5:1.
export const STATUS_COLOR: Record<OrderStatus, string> = {
  placed: "bg-slate-700 text-white",
  accepted: "bg-blue-700 text-white",
  preparing: "bg-amber-700 text-white",
  ready: "bg-teal-700 text-white",
  assigned: "bg-indigo-700 text-white",
  picked_up: "bg-brand-primary-text-safe text-white",
  delivered: "bg-green-700 text-white",
  cancelled: "bg-red-700 text-white",
  rejected: "bg-red-700 text-white",
};
