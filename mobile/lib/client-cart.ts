import type { CartSnapshot } from "./action-types";

// The cart snapshot sent with each chat request so Zippy can talk about the live cart (the cart is client state).
export function snapshotCart(cart: {
  storeId: string | null;
  storeName: string | null;
  items: { lineId: string; name: string; quantity: number; price: number; selectedOptions: { optionName: string }[] }[];
}): CartSnapshot {
  return {
    storeId: cart.storeId,
    storeName: cart.storeName,
    items: cart.items.slice(0, 50).map((line) => ({
      lineId: line.lineId,
      name: line.name,
      quantity: line.quantity,
      price: line.price,
      options: line.selectedOptions.map((option) => option.optionName),
    })),
  };
}
