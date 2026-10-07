// Shared by the web and phone favorites / reorder features.
// mobile/lib/favorites-model.ts is a byte-identical copy (tests/mobile-parity.test.mjs guards drift), so this file imports nothing.

export const FAVORITES_PATH = "/api/customer/favorites";
export const REORDER_OPTIONS_PATH = "/api/customer/reorder-options";
export const reorderPath = (orderId: string): string => `/api/customer/orders/${orderId}/reorder`;

type StoreEmbed = { id: string; name: string; banner_url: string | null; is_open: boolean; is_suspended: boolean };

export type RecentOrderRow = {
  id: string;
  store_id: string;
  status: string;
  placed_at: string;
  stores: StoreEmbed | StoreEmbed[] | null;
};

export type ReorderOption = {
  storeId: string;
  storeName: string;
  imageUrl: string | null;
  isOpen: boolean;
  lastOrderId: string;
  lastOrderedAt: string;
};

export type ReorderLine = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  selectedOptions: { groupId: string; groupName: string; optionId: string; optionName: string; priceDeltaPaise: number }[];
  specialInstructions: string | null;
};

export type ReorderResponse = {
  storeId: string;
  storeName: string;
  lines: ReorderLine[];
  skipped: { name: string; reason: string }[];
};

// Rows must already be newest first. Orders that never reached the kitchen (cancelled, rejected) do not make a store "recent".
export function pickReorderStores(rows: RecentOrderRow[], limit = 3): ReorderOption[] {
  const seen = new Set<string>();
  const out: ReorderOption[] = [];
  for (const row of rows) {
    if (row.status === "cancelled" || row.status === "rejected") continue;
    const store = Array.isArray(row.stores) ? row.stores[0] : row.stores;
    if (!store || store.is_suspended || seen.has(store.id)) continue;
    seen.add(store.id);
    out.push({
      storeId: store.id,
      storeName: store.name,
      imageUrl: store.banner_url,
      isOpen: store.is_open,
      lastOrderId: row.id,
      lastOrderedAt: row.placed_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function reorderNotice(args: {
  storeName: string;
  added: number;
  skipped: { name: string; reason: string }[];
  replaced: { count: number; storeName: string | null } | null;
}): string {
  const parts = [`Added ${args.added} ${args.added === 1 ? "item" : "items"} from ${args.storeName} to your cart.`];
  if (args.replaced) {
    const from = args.replaced.storeName ? ` from ${args.replaced.storeName}` : "";
    parts.push(`Replaced the ${args.replaced.count} ${args.replaced.count === 1 ? "item" : "items"}${from} that were in your cart.`);
  }
  if (args.skipped.length > 0) {
    parts.push(`Skipped: ${args.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.`);
  }
  return parts.join(" ");
}

// One reorder at a time: a second tap while the first request is running must do nothing.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const isReorderBusy = (current: string | null, _next: string): boolean => current !== null;
