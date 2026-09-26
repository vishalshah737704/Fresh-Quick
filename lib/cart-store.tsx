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
  restaurantId: string;
  restaurantName: string;
  item: NewCartItem;
} | null;

type CartContextValue = {
  restaurantId: string | null;
  restaurantName: string | null;
  items: CartItem[];
  subtotal: number;
  orderNote: string;
  pendingConflict: PendingConflict;
  addItem: (restaurantId: string, restaurantName: string, item: NewCartItem) => void;
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
  restaurantId: string | null;
  restaurantName: string | null;
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
    return { restaurantId: null, restaurantName: null, items: [], orderNote: "" };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { restaurantId: null, restaurantName: null, items: [], orderNote: "" };
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !(parsed.restaurantId === null || typeof parsed.restaurantId === "string") ||
      !(parsed.restaurantName === null || typeof parsed.restaurantName === "string") ||
      !Array.isArray(parsed.items)
    ) {
      return { restaurantId: null, restaurantName: null, items: [], orderNote: "" };
    }
    const items = (parsed.items as unknown[])
      .map((i) =>
        i !== null && typeof i === "object"
          ? normalizeStoredItem(i as Record<string, unknown>)
          : null
      )
      .filter((i): i is CartItem => i !== null);
    const orderNote = typeof parsed.orderNote === "string" ? parsed.orderNote : "";
    return { restaurantId: parsed.restaurantId, restaurantName: parsed.restaurantName, items, orderNote };
  } catch {
    return { restaurantId: null, restaurantName: null, items: [], orderNote: "" };
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [orderNote, setOrderNoteState] = useState("");
  const [pendingConflict, setPendingConflict] = useState<PendingConflict>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStoredCart();
    setRestaurantId(stored.restaurantId);
    setRestaurantName(stored.restaurantName);
    setItems(stored.items);
    setOrderNoteState(stored.orderNote);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ restaurantId, restaurantName, items, orderNote })
      );
    } catch {
      // localStorage unavailable (private mode, quota) — cart just won't persist
    }
  }, [restaurantId, restaurantName, items, orderNote, hydrated]);

  function addItemDirect(rId: string, rName: string, item: NewCartItem) {
    const lineId = buildLineId(item.menuItemId, item.selectedOptions);
    setRestaurantId(rId);
    setRestaurantName(rName);
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

  function addItem(rId: string, rName: string, item: NewCartItem) {
    if (restaurantId !== null && restaurantId !== rId) {
      setPendingConflict({ restaurantId: rId, restaurantName: rName, item });
      return;
    }
    addItemDirect(rId, rName, item);
  }

  function confirmClearAndAdd() {
    if (!pendingConflict) return;
    setItems([]);
    setOrderNoteState("");
    addItemDirect(pendingConflict.restaurantId, pendingConflict.restaurantName, pendingConflict.item);
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
        setRestaurantId(null);
        setRestaurantName(null);
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
    setRestaurantId(null);
    setRestaurantName(null);
    setOrderNoteState("");
    setPendingConflict(null);
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        restaurantId,
        restaurantName,
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
