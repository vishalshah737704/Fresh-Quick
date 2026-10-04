// Shared by the web and mobile Zippy clients. The copies under mobile/lib/ are byte-identical
// (tests/zippy-action-exec.test.mjs guards drift), so this file imports nothing.

export const MAX_LINE_QUANTITY = 20;
export const MAX_CARDS_PER_REPLY = 3;
export const MAX_SNAPSHOT_LINES = 50;
export const MAX_ORDER_NOTE_CHARS = 500;

export type CartOption = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDeltaPaise: number;
};

// Same shape as the cart stores' NewCartItem (a cart line without its lineId); price is base rupees.
export type CartLineData = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  selectedOptions: CartOption[];
  specialInstructions: string | null;
};

// Per-card UI state. The chat widget owns it (keyed by card id) so it survives closing and reopening the chat.
export type CardState = { status: "idle" } | { status: "done" | "failed"; message: string } | { status: "dismissed" };

export type ActionCard =
  | { kind: "add_item"; id: string; title: string; description: string; storeId: string; storeName: string; cartStoreId: string | null; item: CartLineData }
  | {
      kind: "reorder";
      id: string;
      title: string;
      description: string;
      storeId: string;
      storeName: string;
      cartStoreId: string | null;
      items: CartLineData[];
      skipped: { name: string; reason: string }[];
    }
  | { kind: "update_quantity"; id: string; title: string; description: string; lineId: string; quantity: number }
  | { kind: "remove_line"; id: string; title: string; description: string; lineId: string }
  | { kind: "clear_cart"; id: string; title: string; description: string }
  | { kind: "set_order_note"; id: string; title: string; description: string; text: string; cartStoreId: string | null }
  | { kind: "go_to_checkout"; id: string; title: string; description: string; storeId: string; storeName: string; itemCount: number };

// What the client tells the server about its own cart (the cart is client state; mobile's is per-device).
export type CartSnapshot = {
  storeId: string | null;
  storeName: string | null;
  orderNote: string;
  items: { lineId: string; name: string; quantity: number; price: number; options: string[] }[];
};

// The part of a cart store that executeAction needs; both cart stores satisfy it.
export type CartApi = {
  storeId: string | null;
  items: { lineId: string }[];
  addItems(storeId: string, storeName: string, items: CartLineData[], replace: boolean): void;
  updateQuantity(lineId: string, quantity: number): void;
  removeItem(lineId: string): void;
  clearCart(): void;
  setOrderNote(text: string): void;
};
