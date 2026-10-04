import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { buildLineId, mergeCartLines } from "./cart-line";

// Mirrors the web cart (repo root lib/cart-store.tsx): same CartItem shape,
// same lineId scheme (menuItemId + sorted option ids), same single-store
// enforcement with a "clear cart?" confirmation on cross-store add. This
// mobile version persists to AsyncStorage only (per-device) rather than the
// web's server-synced cart — no server round-trip exists for the mobile app
// yet, matching Phase 2 scope.

export type SelectedOption = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDeltaPaise: number;
};

export type CartItem = {
  lineId: string;
  menuItemId: string;
  name: string;
  price: number; // rupees, matches web convention (paise math done via Math.round(price * 100))
  quantity: number;
  imageUrl: string | null;
  selectedOptions: SelectedOption[];
  specialInstructions: string | null;
};

type NewCartItem = Omit<CartItem, "lineId">;

type PendingConflict = {
  storeId: string;
  storeName: string;
  item: NewCartItem;
} | null;

type CartContextValue = {
  storeId: string | null;
  storeName: string | null;
  items: CartItem[];
  subtotalPaise: number;
  orderNote: string;
  pendingConflict: PendingConflict;
  addItem: (storeId: string, storeName: string, item: NewCartItem) => void;
  addItems: (storeId: string, storeName: string, items: NewCartItem[], replace: boolean) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  setSpecialInstructions: (lineId: string, text: string) => void;
  setOrderNote: (text: string) => void;
  clearCart: () => void;
  confirmClearAndAdd: () => void;
  cancelPendingAdd: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export { buildLineId };

const STORAGE_KEY = "freshquick.cart.v1";

type PersistedCart = {
  storeId: string | null;
  storeName: string | null;
  items: CartItem[];
  orderNote: string;
};

export function CartProvider({ children }: { children: ReactNode }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [orderNote, setOrderNoteState] = useState("");
  const [pendingConflict, setPendingConflict] = useState<PendingConflict>(null);
  const hydrated = useRef(false);

  // Load persisted cart once on mount.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: PersistedCart = JSON.parse(raw);
          setStoreId(parsed.storeId ?? null);
          setStoreName(parsed.storeName ?? null);
          setItems(parsed.items ?? []);
          setOrderNoteState(parsed.orderNote ?? "");
        }
      } catch {
        // Corrupt or unavailable storage: start from an empty cart rather
        // than throwing during app boot.
      } finally {
        hydrated.current = true;
      }
    })();
  }, []);

  // Persist on every mutation, skipping the pre-hydration initial state so
  // we never overwrite a saved cart with the empty default before it loads.
  useEffect(() => {
    if (!hydrated.current) return;
    const cart: PersistedCart = { storeId, storeName, items, orderNote };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cart)).catch(() => {
      // Best-effort persistence; an in-memory cart still works this session.
    });
  }, [storeId, storeName, items, orderNote]);

  function resetCartState() {
    setItems([]);
    setStoreId(null);
    setStoreName(null);
    setOrderNoteState("");
    setPendingConflict(null);
  }

  function addItemDirect(sId: string, sName: string, item: NewCartItem) {
    const lineId = buildLineId(item.menuItemId, item.selectedOptions);
    setStoreId(sId);
    setStoreName(sName);
    setItems((prev) => {
      const existing = prev.find((i) => i.lineId === lineId);
      if (existing) {
        return prev.map((i) =>
          i.lineId === lineId ? { ...i, quantity: i.quantity + item.quantity } : i
        );
      }
      return [...prev, { ...item, lineId }];
    });
  }

  // Atomic bulk add used by Zippy's confirmed cards. `replace` empties the cart first. It sets state directly, so it
  // cannot trigger the "clear cart?" conflict modal that addItem opens when the render-time storeId differs.
  function addItems(sId: string, sName: string, newItems: NewCartItem[], replace: boolean) {
    if (newItems.length === 0) return;
    const lines = newItems.map((item) => ({ ...item, lineId: buildLineId(item.menuItemId, item.selectedOptions) }));
    if (replace) setOrderNoteState("");
    // Any open "clear cart?" modal is stale once Zippy changes the cart; dropping it (never auto-applying it) means the user just taps the store-page add again.
    setPendingConflict(null);
    setStoreId(sId);
    setStoreName(sName);
    setItems((prev) => mergeCartLines(replace ? [] : prev, lines));
  }

  function addItem(sId: string, sName: string, item: NewCartItem) {
    if (storeId !== null && storeId !== sId) {
      setPendingConflict({ storeId: sId, storeName: sName, item });
      return;
    }
    addItemDirect(sId, sName, item);
  }

  function confirmClearAndAdd() {
    if (!pendingConflict) return;
    setItems([]);
    setOrderNoteState("");
    addItemDirect(pendingConflict.storeId, pendingConflict.storeName, pendingConflict.item);
    setPendingConflict(null);
  }

  function cancelPendingAdd() {
    setPendingConflict(null);
  }

  function updateQuantity(lineId: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(lineId);
      return;
    }
    setItems((prev) => prev.map((i) => (i.lineId === lineId ? { ...i, quantity } : i)));
  }

  function removeItem(lineId: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.lineId !== lineId);
      if (next.length === 0) {
        setStoreId(null);
        setStoreName(null);
      }
      return next;
    });
  }

  function setSpecialInstructions(lineId: string, text: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.lineId === lineId ? { ...i, specialInstructions: text.trim() === "" ? null : text } : i
      )
    );
  }

  function setOrderNote(text: string) {
    setOrderNoteState(text.trim() === "" ? "" : text);
  }

  function clearCart() {
    resetCartState();
  }

  // Integer paise arithmetic throughout, per project convention — never
  // plain float multiplication on money.
  const subtotalPaise = items.reduce(
    (sum, i) => sum + Math.round(i.price * 100) * i.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        storeId,
        storeName,
        items,
        subtotalPaise,
        orderNote,
        pendingConflict,
        addItem,
        addItems,
        updateQuantity,
        removeItem,
        setSpecialInstructions,
        setOrderNote,
        clearCart,
        confirmClearAndAdd,
        cancelPendingAdd,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
