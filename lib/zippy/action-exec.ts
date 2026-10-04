import type { ActionCard, CartApi } from "./action-types";

export const CART_CHANGED_MESSAGE = "Your cart changed, ask me again.";

// Runs ONE confirmed card against the live cart. `replace` is decided here, at tap time, from the live cart, and the
// store's atomic addItems is used so the "clear cart?" modal (which reads render-time state) can never open.
// Whether adding from this card's store would replace the live cart differs from what the card said (it was built
// from an older snapshot): then nothing runs and the user is asked to ask again.
const replaceChanged = (card: { storeId: string; cartStoreId: string | null }, cart: CartApi) => {
  const assumed = card.cartStoreId !== null && card.cartStoreId !== card.storeId;
  const now = cart.storeId !== null && cart.storeId !== card.storeId;
  return assumed !== now;
};

export function executeAction(card: ActionCard, cart: CartApi): { ok: boolean; message: string } {
  switch (card.kind) {
    case "add_item": {
      if (replaceChanged(card, cart)) return { ok: false, message: CART_CHANGED_MESSAGE };
      const replace = cart.storeId !== null && cart.storeId !== card.storeId;
      cart.addItems(card.storeId, card.storeName, [card.item], replace);
      return { ok: true, message: replace ? "Cart replaced and item added." : "Added to your cart." };
    }
    case "reorder": {
      if (card.items.length === 0) return { ok: false, message: "Nothing to add." };
      if (replaceChanged(card, cart)) return { ok: false, message: CART_CHANGED_MESSAGE };
      const replace = cart.storeId !== null && cart.storeId !== card.storeId;
      cart.addItems(card.storeId, card.storeName, card.items, replace);
      const count = card.items.length;
      return { ok: true, message: `${replace ? "Cart replaced. " : ""}Added ${count} ${count === 1 ? "item" : "items"} to your cart.` };
    }
    case "update_quantity": {
      if (!Number.isInteger(card.quantity) || card.quantity < 1 || card.quantity > 20) {
        return { ok: false, message: "That quantity is not allowed." };
      }
      if (!cart.items.some((line) => line.lineId === card.lineId)) return { ok: false, message: CART_CHANGED_MESSAGE };
      cart.updateQuantity(card.lineId, card.quantity);
      return { ok: true, message: "Quantity updated." };
    }
    case "remove_line": {
      if (!cart.items.some((line) => line.lineId === card.lineId)) return { ok: false, message: CART_CHANGED_MESSAGE };
      cart.removeItem(card.lineId);
      return { ok: true, message: "Removed from your cart." };
    }
    case "clear_cart": {
      cart.clearCart();
      return { ok: true, message: "Cart cleared." };
    }
    case "go_to_checkout": {
      // Navigation only: never mutates the cart, just confirms the card still matches it.
      if (cart.storeId !== card.storeId) return { ok: false, message: CART_CHANGED_MESSAGE };
      return { ok: true, message: "Opening checkout." };
    }
  }
}
