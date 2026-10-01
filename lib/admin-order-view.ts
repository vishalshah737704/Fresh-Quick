import type { OrderStatus } from "./order-status";

export const ADMIN_ORDER_SELECT =
  "id, status, total, placed_at, recipient_name, stores(name), partner:users!delivery_partner_id(full_name)";

type OneOrMany<T> = T | T[] | null;

export type RawAdminOrderRow = {
  id: string;
  status: OrderStatus;
  total: number | string;
  placed_at: string;
  recipient_name: string;
  stores: OneOrMany<{ name: string }>;
  partner: OneOrMany<{ full_name: string }>;
};

export type AdminOrderRow = {
  id: string;
  status: OrderStatus;
  total: number;
  placedAt: string;
  storeName: string;
  customerName: string;
  partnerName: string | null;
};

const TERMINAL_STATUSES: string[] = ["delivered", "cancelled", "rejected"];
const NON_REVENUE_STATUSES: string[] = ["cancelled", "rejected"];

function first<T>(value: OneOrMany<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function normalizeAdminOrderRow(raw: RawAdminOrderRow): AdminOrderRow {
  return {
    id: raw.id,
    status: raw.status,
    total: Number(raw.total),
    placedAt: raw.placed_at,
    storeName: first(raw.stores)?.name ?? "Unknown store",
    customerName: raw.recipient_name,
    partnerName: first(raw.partner)?.full_name ?? null,
  };
}

export function overviewStats(
  orders: { status: OrderStatus; total: number }[],
  vendorCount: number
): { activeOrders: number; vendors: number; revenuePaise: number } {
  return {
    activeOrders: orders.filter((order) => !TERMINAL_STATUSES.includes(order.status)).length,
    vendors: vendorCount,
    revenuePaise: orders
      .filter((order) => !NON_REVENUE_STATUSES.includes(order.status))
      .reduce((sum, order) => sum + Math.round(order.total * 100), 0),
  };
}
