import type Anthropic from "@anthropic-ai/sdk";
import type { Parsed } from "./catalog";
import type { RawOrderDetail, RawOrderListRow } from "../order-detail";

// This file is pure on purpose: value imports from sibling modules would not resolve under node's test
// runner, so the helpers it needs (sanitize, money, status labels) are injected through `OrderShapeDeps`.
export type OrderShapeDeps = {
  sanitize(value: unknown, max?: number): string;
  toPaise(value: number | string): number;
  formatRupees(paise: number): string;
  statusLabel: Record<string, string>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Must stay a partition of ORDER_STATUSES (a test checks this against lib/order-status.ts).
export const ACTIVE_STATUSES = ["placed", "accepted", "preparing", "ready", "assigned", "picked_up"] as const;
export const PAST_STATUSES = ["delivered", "cancelled", "rejected"] as const;
export const MAX_LIST_ORDERS = 10;
export const DEFAULT_LIST_ORDERS = 5;
export const MAX_DETAIL_ITEMS = 40;
const MAX_SUMMARY_ITEMS = 5;

const asObject = (raw: unknown): Record<string, unknown> | null =>
  typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

export type ListMyOrdersInput = { status_group: "active" | "past" | "any"; limit: number };

export function parseListMyOrdersInput(raw: unknown): Parsed<ListMyOrdersInput> {
  const o = asObject(raw);
  if (!o) return { ok: false, error: "input must be an object" };
  const group = o.status_group === undefined || o.status_group === null ? "any" : o.status_group;
  if (group !== "active" && group !== "past" && group !== "any") {
    return { ok: false, error: "status_group must be active, past or any" };
  }
  let limit = DEFAULT_LIST_ORDERS;
  if (o.limit !== undefined && o.limit !== null) {
    if (typeof o.limit !== "number" || !Number.isFinite(o.limit)) return { ok: false, error: "limit must be a number" };
    limit = Math.min(MAX_LIST_ORDERS, Math.max(1, Math.trunc(o.limit)));
  }
  return { ok: true, value: { status_group: group, limit } };
}

export type GetMyOrderInput = { order_id: string };

// A malformed id says "not found", the same text a missing or foreign order gets, so ids cannot be probed.
export function parseGetMyOrderInput(raw: unknown): Parsed<GetMyOrderInput> {
  const o = asObject(raw);
  if (!o) return { ok: false, error: "input must be an object" };
  const id = typeof o.order_id === "string" ? o.order_id.trim() : "";
  if (id.toLowerCase() === "latest") return { ok: true, value: { order_id: "latest" } };
  if (!UUID.test(id)) return { ok: false, error: "not found" };
  return { ok: true, value: { order_id: id.toLowerCase() } };
}

type OneOrMany<T> = T | T[] | null | undefined;
function firstOf<T>(value: OneOrMany<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

type AddressParts = {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
};

function joinAddress(address: AddressParts | null, deps: OrderShapeDeps): string | null {
  if (!address) return null;
  const parts = [address.line1, address.line2, address.city, address.state, address.pincode]
    .map((part) => deps.sanitize(part, 100))
    .filter((part) => part !== "");
  return parts.length > 0 ? parts.join(", ") : null;
}

const rupees = (value: number | string, deps: OrderShapeDeps) => deps.formatRupees(deps.toPaise(value));

const PAYMENT_STATUS: Record<string, string> = { success: "paid", pending: "pending", failed: "failed", refunded: "refunded" };
const PAYMENT_METHOD: Record<string, string> = { mock_card: "card", mock_upi: "UPI", mock_cod: "cash on delivery" };

export function shapeOrderListRow(raw: RawOrderListRow, deps: OrderShapeDeps) {
  const store = firstOf(raw.stores);
  const lines = raw.order_items.map((item) => `${item.quantity} x ${deps.sanitize(firstOf(item.products)?.name ?? "Item", 80)}`);
  const shown = lines.slice(0, MAX_SUMMARY_ITEMS);
  const extra = lines.length - shown.length;
  return {
    order_id: raw.id,
    store: deps.sanitize(store?.name ?? "Unknown store", 80),
    status: raw.status,
    status_label: deps.statusLabel[raw.status] ?? raw.status,
    total: rupees(raw.total, deps),
    placed_at: raw.placed_at,
    items_summary: shown.join(", ") + (extra > 0 ? ` and ${extra} more` : ""),
  };
}

export function shapeOrderDetail(raw: RawOrderDetail, deps: OrderShapeDeps) {
  const store = firstOf(raw.stores);
  const payment = firstOf(raw.payments);
  const timeline = (
    [
      ["placed", raw.placed_at],
      ["accepted", raw.accepted_at],
      ["picked_up", raw.picked_up_at],
      ["delivered", raw.delivered_at],
    ] as const
  )
    .filter(([, at]) => Boolean(at))
    .map(([step, at]) => ({ step, at: at as string }));
  const items = raw.order_items.slice(0, MAX_DETAIL_ITEMS).map((item) => {
    const note = deps.sanitize(item.special_instructions);
    return {
      name: deps.sanitize(firstOf(item.products)?.name ?? "Item", 80),
      quantity: item.quantity,
      unit_price: rupees(item.unit_price, deps),
      line_total: deps.formatRupees(deps.toPaise(item.unit_price) * item.quantity),
      options: item.order_item_options.map((option) => `${deps.sanitize(option.group_name, 60)}: ${deps.sanitize(option.option_name, 60)}`),
      note: note === "" ? null : note,
    };
  });
  const deliveryNote = deps.sanitize(raw.delivery_note);
  return {
    order_id: raw.id,
    store: deps.sanitize(store?.name ?? "Unknown store", 80),
    store_address: joinAddress(firstOf(store?.store_address) as AddressParts | null, deps),
    status: raw.status,
    status_label: deps.statusLabel[raw.status] ?? raw.status,
    timeline,
    items,
    more_items: Math.max(0, raw.order_items.length - MAX_DETAIL_ITEMS),
    subtotal: rupees(raw.subtotal, deps),
    delivery_fee: rupees(raw.delivery_fee, deps),
    total: rupees(raw.total, deps),
    payment: payment
      ? { status: PAYMENT_STATUS[payment.status] ?? deps.sanitize(payment.status, 30), method: PAYMENT_METHOD[payment.method] ?? deps.sanitize(payment.method, 30) }
      : null,
    recipient: {
      name: deps.sanitize(raw.recipient_name, 100),
      email: deps.sanitize(raw.recipient_email, 100),
      phone: deps.sanitize(raw.recipient_phone, 40),
    },
    delivery_address: joinAddress(firstOf(raw.address) as AddressParts | null, deps),
    delivery_note: deliveryNote === "" ? null : deliveryNote,
  };
}

export type ShapedOrderListRow = ReturnType<typeof shapeOrderListRow>;
export type ShapedOrderDetail = ReturnType<typeof shapeOrderDetail>;

export const ORDER_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_my_orders",
    description:
      "List the signed-in customer's own orders, newest first, with store, status, total, time and a short item summary. Use for 'my orders', 'my recent orders', 'what is still on the way' or order history. Use get_my_order for the full detail of one order.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        status_group: { type: "string", enum: ["active", "past", "any"], description: "active = not finished yet, past = delivered, cancelled or rejected; default any" },
        limit: { type: "number", description: "How many orders, 1 to 10; default 5" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_my_order",
    description:
      "Get the full detail of ONE of the signed-in customer's own orders: status and timestamps, items with options and notes, totals, payment, store, and the recipient name, email, phone and delivery address. The order_id is an id from list_my_orders, or the word latest for the most recent order. Only fetch this when the question needs those details.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order id (uuid) from an earlier result, or latest" } },
      required: ["order_id"],
      additionalProperties: false,
    },
  },
];

// Order tools exist only for a verified customer with orders switched on; every other caller never sees them.
export function selectTools(
  base: Anthropic.Tool[],
  ctx: { customerId: string | null; ordersEnabled: boolean }
): Anthropic.Tool[] {
  return ctx.customerId && ctx.ordersEnabled ? [...base, ...ORDER_TOOLS] : base;
}
