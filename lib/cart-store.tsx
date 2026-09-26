"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

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
  price: number;
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
  subtotal: number;
  orderNote: string;
  pendingConflict: PendingConflict;
  addItem: (storeId: string, storeName: string, item: NewCartItem) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  setSpecialInstructions: (lineId: string, text: string) => void;
  setOrderNote: (text: string) => void;
  clearCart: () => void;
  confirmClearAndAdd: () => void;
  cancelPendingAdd: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "foodhub_cart";

type StoredCart = {
  storeId: string | null;
  storeName: string | null;
  items: CartItem[];
  orderNote: string;
};

export function buildLineId(menuItemId: string, selectedOptions: SelectedOption[]): string {
  const optionIds = selectedOptions.map((o) => o.optionId).sort();
  return `${menuItemId}::${optionIds.join(",")}`;
}

// Accepts both the current shape and the pre-piece-4 shape (menuItemId/
// name/price/quantity only) so an in-progress customer cart already in
// localStorage survives this deploy instead of being wiped.
function normalizeStoredItem(raw: Record<string, unknown>): CartItem | null {
  if (
    typeof raw.menuItemId !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.price !== "number" ||
    typeof raw.quantity !== "number" ||
    raw.quantity <= 0
  ) {
    return null;
  }
  const selectedOptions: SelectedOption[] = Array.isArray(raw.selectedOptions)
    ? (raw.selectedOptions as unknown[]).filter(
        (o): o is SelectedOption =>
          o !== null &&
          typeof o === "object" &&
          typeof (o as Record<string, unknown>).groupId === "string" &&
          typeof (o as Record<string, unknown>).groupName === "string" &&
          typeof (o as Record<string, unknown>).optionId === "string" &&
          typeof (o as Record<string, unknown>).optionName === "string" &&
          typeof (o as Record<string, unknown>).priceDeltaPaise === "number"
      )
    : [];
  const specialInstructions =
    typeof raw.specialInstructions === "string" ? raw.specialInstructions : null;
  const imageUrl = typeof raw.imageUrl === "string" ? raw.imageUrl : null;
  const lineId =
    typeof raw.lineId === "string" ? raw.lineId : buildLineId(raw.menuItemId, selectedOptions);
  return {
    lineId,
    menuItemId: raw.menuItemId,
    name: raw.name,
    price: raw.price,
    quantity: raw.quantity,
    imageUrl,
    selectedOptions,
    specialInstructions,
  };
}

function loadStoredCart(): StoredCart {
  if (typeof window === "undefined") {
    return { storeId: null, storeName: null, items: [], orderNote: "" };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { storeId: null, storeName: null, items: [], orderNote: "" };
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !(parsed.storeId === null || typeof parsed.storeId === "string") ||
      !(parsed.storeName === null || typeof parsed.storeName === "string") ||
      !Array.isArray(parsed.items)
    ) {
      return { storeId: null, storeName: null, items: [], orderNote: "" };
    }
    const items = (parsed.items as unknown[])
      .map((i) =>
        i !== null && typeof i === "object"
          ? normalizeStoredItem(i as Record<string, unknown>)
          : null
      )
      .filter((i): i is CartItem => i !== null);
    const orderNote = typeof parsed.orderNote === "string" ? parsed.orderNote : "";
    return { storeId: parsed.storeId, storeName: parsed.storeName, items, orderNote };
  } catch {
    return { storeId: null, storeName: null, items: [], orderNote: "" };
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [orderNote, setOrderNoteState] = useState("");
  const [pendingConflict, setPendingConflict] = useState<PendingConflict>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStoredCart();
    setStoreId(stored.storeId);
    setStoreName(stored.storeName);
    setItems(stored.items);
    setOrderNoteState(stored.orderNote);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ storeId, storeName, items, orderNote })
      );
    } catch {
      // localStorage unavailable (private mode, quota) — cart just won't persist
    }
  }, [storeId, storeName, items, orderNote, hydrated]);

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
        i.lineId === lineId
          ? { ...i, specialInstructions: text.trim() === "" ? null : text }
          : i
      )
    );
  }

  function setOrderNote(text: string) {
    setOrderNoteState(text.trim() === "" ? "" : text);
  }

  function clearCart() {
    setItems([]);
    setStoreId(null);
    setStoreName(null);
    setOrderNoteState("");
    setPendingConflict(null);
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        storeId,
        storeName,
        items,
        subtotal,
        orderNote,
        pendingConflict,
        addItem,
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
