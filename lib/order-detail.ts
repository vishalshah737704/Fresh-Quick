import type { OrderStatus } from "./order-status";

// `addresses!delivery_address_id` pins the embed to the orders->addresses FK.
export const ORDER_DETAIL_SELECT =
  "id, status, subtotal, delivery_fee, total, placed_at, accepted_at, picked_up_at, delivered_at, delivery_note, recipient_name, recipient_email, recipient_phone, delivery_partner_id, " +
  "stores(name, lat, lng, store_address:addresses!address_id(label, line1, line2, city, state, pincode)), " +
  "address:addresses!delivery_address_id(label, line1, line2, city, state, pincode, lat, lng), " +
  "payments(status, method), " +
  "order_items(id, quantity, unit_price, special_instructions, products(name, image_url), order_item_options(id, group_name, option_name))";

export const ORDER_LIST_SELECT =
  "id, status, total, placed_at, stores(name), order_items(id, quantity, products(name, image_url))";

type OneOrMany<T> = T | T[] | null;

type RawAddress = {
  label: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  lat?: number | string | null;
  lng?: number | string | null;
};

export type RawOrderDetail = {
  id: string;
  status: OrderStatus;
  subtotal: number | string;
  delivery_fee: number | string;
  total: number | string;
  placed_at: string;
  accepted_at?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  delivery_note: string | null;
  recipient_name: string;
  recipient_email: string;
  recipient_phone: string;
  delivery_partner_id: string | null;
  stores: OneOrMany<{ name: string; lat?: number | string | null; lng?: number | string | null; store_address?: OneOrMany<RawAddress> }>;
  address: OneOrMany<RawAddress>;
  payments: OneOrMany<{ status: string; method: string }>;
  order_items: {
    id: string;
    quantity: number;
    unit_price: number | string;
    special_instructions: string | null;
    products: OneOrMany<{ name: string; image_url: string | null }>;
    order_item_options: { id: string; group_name: string; option_name: string }[];
  }[];
};

export type RawOrderListRow = {
  id: string;
  status: OrderStatus;
  total: number | string;
  placed_at: string;
  stores: OneOrMany<{ name: string }>;
  order_items: {
    id: string;
    quantity: number;
    products: OneOrMany<{ name: string; image_url: string | null }>;
  }[];
};

export type OrderDetailItem = {
  id: string;
  quantity: number;
  unitPrice: number;
  specialInstructions: string | null;
  name: string;
  imageUrl: string | null;
  options: { id: string; groupName: string; optionName: string }[];
};

export type OrderDetail = {
  id: string;
  status: OrderStatus;
  placedAt: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryNote: string | null;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string;
  storeName: string;
  storeAddress: { label: string | null; lines: string[] } | null;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  deliveryPartnerId: string | null;
  address: { label: string | null; lines: string[] } | null;
  // Coordinates for the tracking map; null when missing or not numeric.
  storePoint: { lat: number; lng: number } | null;
  deliveryPoint: { lat: number; lng: number } | null;
  payment: { status: string; method: string } | null;
  items: OrderDetailItem[];
};

export type OrderListRow = {
  id: string;
  status: OrderStatus;
  total: number;
  placedAt: string;
  storeName: string;
  itemCount: number;
  items: { id: string; name: string; imageUrl: string | null }[];
};

function toPoint(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const parse = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && value.trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };
  const la = parse(lat);
  const ln = parse(lng);
  if (la === null || ln === null) return null;
  if (la < -90 || la > 90 || ln < -180 || ln > 180) return null;
  return { lat: la, lng: ln };
}

function first<T>(value: OneOrMany<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function lineTotalPaise(unitPrice: number, quantity: number): number {
  return Math.round(unitPrice * 100) * quantity;
}

export function formatPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function formatAddress(raw: RawAddress): { label: string | null; lines: string[] } | null {
  const cityLine = [
    [cleanText(raw.city), cleanText(raw.state)].filter(Boolean).join(", "),
    cleanText(raw.pincode),
  ]
    .filter(Boolean)
    .join(" ");
  const lines = [cleanText(raw.line1), cleanText(raw.line2), cityLine || null].filter(
    (line): line is string => Boolean(line)
  );
  if (lines.length === 0) return null;
  return { label: cleanText(raw.label), lines };
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  success: "Paid",
  pending: "Pending",
  failed: "Failed",
  refunded: "Refunded",
};
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  mock_card: "Card",
  mock_upi: "UPI",
  mock_cod: "Cash on delivery",
};

export function formatPayment(payment: { status: string; method: string } | null): string {
  if (!payment) return "—";
  const status = PAYMENT_STATUS_LABEL[payment.status] ?? payment.status;
  const method = PAYMENT_METHOD_LABEL[payment.method] ?? payment.method;
  return `${status} · ${method}`;
}

export function normalizeOrderDetail(raw: RawOrderDetail): OrderDetail {
  const address = first(raw.address);
  const payment = first(raw.payments);
  const store = first(raw.stores);
  const storeAddress = first(store?.store_address);
  return {
    id: raw.id,
    status: raw.status,
    placedAt: raw.placed_at,
    subtotal: Number(raw.subtotal),
    deliveryFee: Number(raw.delivery_fee),
    total: Number(raw.total),
    deliveryNote: cleanText(raw.delivery_note),
    recipientName: raw.recipient_name,
    recipientEmail: raw.recipient_email,
    recipientPhone: cleanText(raw.recipient_phone) ?? "Not provided",
    storeName: store?.name ?? "Unknown store",
    storeAddress: storeAddress ? formatAddress(storeAddress) : null,
    acceptedAt: raw.accepted_at ?? null,
    pickedUpAt: raw.picked_up_at ?? null,
    deliveredAt: raw.delivered_at ?? null,
    deliveryPartnerId: raw.delivery_partner_id,
    address: address ? formatAddress(address) : null,
    storePoint: toPoint(store?.lat, store?.lng),
    deliveryPoint: address ? toPoint(address.lat, address.lng) : null,
    payment: payment ? { status: payment.status, method: payment.method } : null,
    items: raw.order_items.map((item) => {
      const product = first(item.products);
      return {
        id: item.id,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        specialInstructions: cleanText(item.special_instructions),
        name: product?.name ?? "Item",
        imageUrl: product?.image_url ?? null,
        options: item.order_item_options.map((option) => ({
          id: option.id,
          groupName: option.group_name,
          optionName: option.option_name,
        })),
      };
    }),
  };
}

export function normalizeOrderListRow(raw: RawOrderListRow): OrderListRow {
  return {
    id: raw.id,
    status: raw.status,
    total: Number(raw.total),
    placedAt: raw.placed_at,
    storeName: first(raw.stores)?.name ?? "Unknown store",
    itemCount: raw.order_items.reduce((sum, item) => sum + item.quantity, 0),
    items: raw.order_items.map((item) => {
      const product = first(item.products);
      return { id: item.id, name: product?.name ?? "Item", imageUrl: product?.image_url ?? null };
    }),
  };
}
