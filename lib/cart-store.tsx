"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type CartItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
};

type PendingConflict = {
  restaurantId: string;
  restaurantName: string;
  item: CartItem;
} | null;

type CartContextValue = {
  restaurantId: string | null;
  restaurantName: string | null;
  items: CartItem[];
  subtotal: number;
  pendingConflict: PendingConflict;
  addItem: (restaurantId: string, restaurantName: string, item: CartItem) => void;
  updateQuantity: (menuItemId: string, quantity: number) => void;
  removeItem: (menuItemId: string) => void;
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
};

function loadStoredCart(): StoredCart {
  if (typeof window === "undefined") {
    return { restaurantId: null, restaurantName: null, items: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { restaurantId: null, restaurantName: null, items: [] };
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.restaurantId === null || typeof parsed.restaurantId === "string") &&
      (parsed.restaurantName === null || typeof parsed.restaurantName === "string") &&
      Array.isArray(parsed.items) &&
      parsed.items.every(
        (i: unknown) =>
          i !== null &&
          typeof i === "object" &&
          typeof (i as Record<string, unknown>).menuItemId === "string" &&
          typeof (i as Record<string, unknown>).name === "string" &&
          typeof (i as Record<string, unknown>).price === "number" &&
          typeof (i as Record<string, unknown>).quantity === "number" &&
          ((i as Record<string, unknown>).quantity as number) > 0
      )
    ) {
      return parsed as StoredCart;
    }
    return { restaurantId: null, restaurantName: null, items: [] };
  } catch {
    return { restaurantId: null, restaurantName: null, items: [] };
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [pendingConflict, setPendingConflict] = useState<PendingConflict>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadStoredCart();
    setRestaurantId(stored.restaurantId);
    setRestaurantName(stored.restaurantName);
    setItems(stored.items);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ restaurantId, restaurantName, items })
      );
    } catch {
      // localStorage unavailable (private mode, quota) — cart just won't persist
    }
  }, [restaurantId, restaurantName, items, hydrated]);

  function addItemDirect(rId: string, rName: string, item: CartItem) {
    setRestaurantId(rId);
    setRestaurantName(rName);
    setItems((prev) => {
      const existing = prev.find((i) => i.menuItemId === item.menuItemId);
      if (existing) {
        return prev.map((i) =>
          i.menuItemId === item.menuItemId
            ? { ...i, quantity: i.quantity + item.quantity }
            : i
        );
      }
      return [...prev, item];
    });
  }

  function addItem(rId: string, rName: string, item: CartItem) {
    if (restaurantId !== null && restaurantId !== rId) {
      setPendingConflict({ restaurantId: rId, restaurantName: rName, item });
      return;
    }
    addItemDirect(rId, rName, item);
  }

  function confirmClearAndAdd() {
    if (!pendingConflict) return;
    setItems([]);
    addItemDirect(pendingConflict.restaurantId, pendingConflict.restaurantName, pendingConflict.item);
    setPendingConflict(null);
  }

  function cancelPendingAdd() {
    setPendingConflict(null);
  }

  function updateQuantity(menuItemId: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(menuItemId);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.menuItemId === menuItemId ? { ...i, quantity } : i))
    );
  }

  function removeItem(menuItemId: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.menuItemId !== menuItemId);
      if (next.length === 0) {
        setRestaurantId(null);
        setRestaurantName(null);
      }
      return next;
    });
  }

  function clearCart() {
    setItems([]);
    setRestaurantId(null);
    setRestaurantName(null);
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
        pendingConflict,
        addItem,
        updateQuantity,
        removeItem,
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
