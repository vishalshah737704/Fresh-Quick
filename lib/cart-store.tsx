"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/auth";

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

// The checkout page registers this so the persistent CartPanel sidebar can
// render a single "Place order" button when on the checkout route, instead
// of both the page and the sidebar showing their own competing summary.
export type CheckoutHandler = {
  canPlaceOrder: boolean;
  submitting: boolean;
  error: string | null;
  onPlaceOrder: () => void;
} | null;

type CartContextValue = {
  storeId: string | null;
  storeName: string | null;
  items: CartItem[];
  subtotal: number;
  orderNote: string;
  pendingConflict: PendingConflict;
  checkoutHandler: CheckoutHandler;
  addItem: (storeId: string, storeName: string, item: NewCartItem) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  setSpecialInstructions: (lineId: string, text: string) => void;
  setOrderNote: (text: string) => void;
  clearCart: () => void;
  confirmClearAndAdd: () => void;
  cancelPendingAdd: () => void;
  setCheckoutHandler: (handler: CheckoutHandler) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function buildLineId(menuItemId: string, selectedOptions: SelectedOption[]): string {
  const optionIds = selectedOptions.map((o) => o.optionId).sort();
  return `${menuItemId}::${optionIds.join(",")}`;
}

type ServerCart = {
  storeId: string | null;
  storeName: string | null;
  items: CartItem[];
  orderNote: string;
};

// "none" means the server confirmed no row exists; "error" means we don't know,
// so callers must never treat it as permission to overwrite the server cart.
type FetchCartResult =
  | { status: "found"; cart: ServerCart }
  | { status: "none" }
  | { status: "error" };

const FETCH_RETRY_DELAY_MS = 2000;

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

async function fetchServerCart(): Promise<FetchCartResult> {
  try {
    const res = await fetch("/api/cart", { headers: await authHeader() });
    if (!res.ok) return { status: "error" };
    const body = await res.json();
    return body.cart ? { status: "found", cart: body.cart } : { status: "none" };
  } catch {
    return { status: "error" };
  }
}

async function saveServerCart(expectedUserId: string, cart: ServerCart): Promise<void> {
  // The live session can switch accounts before React re-renders with the new
  // userId; refuse to send one account's cart under another account's token.
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== expectedUserId) return;
  await fetch("/api/cart", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify(cart),
  });
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { userId, loading: sessionLoading } = useSession();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [orderNote, setOrderNoteState] = useState("");
  const [pendingConflict, setPendingConflict] = useState<PendingConflict>(null);
  const [checkoutHandler, setCheckoutHandler] = useState<CheckoutHandler>(null);
  const previousUserId = useRef<string | null | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(false);
  // Which userId has successfully reconciled with the server. Debounced saves
  // are blocked until this matches the current userId, so neither the login
  // race nor a failed GET can let in-memory state clobber a real server cart.
  const reconciledFor = useRef<string | null>(null);

  function resetCartState() {
    setItems([]);
    setStoreId(null);
    setStoreName(null);
    setOrderNoteState("");
    setPendingConflict(null);
  }

  // Handle login/logout/mount transitions.
  useEffect(() => {
    if (sessionLoading) return;
    const previous = previousUserId.current;
    previousUserId.current = userId;
    reconciledFor.current = null;

    if (!userId) {
      // Logged out (or never logged in): clear in-memory cart, no server calls.
      if (previous) resetCartState();
      return;
    }

    // Switching directly from one account to another: the previous account's
    // cart (including its order note) must never carry into the new account.
    const switchedAccount = typeof previous === "string" && previous !== userId;
    if (switchedAccount) resetCartState();
    const carryOver: ServerCart = switchedAccount
      ? { storeId: null, storeName: null, items: [], orderNote: "" }
      : { storeId, storeName, items, orderNote };

    let cancelled = false;
    (async () => {
      let result = await fetchServerCart();
      if (cancelled) return;
      if (result.status === "error") {
        await new Promise((resolve) => setTimeout(resolve, FETCH_RETRY_DELAY_MS));
        if (cancelled) return;
        result = await fetchServerCart();
        if (cancelled) return;
      }
      if (result.status === "found") {
        reconciledFor.current = userId;
        skipNextSave.current = true;
        setStoreId(result.cart.storeId);
        setStoreName(result.cart.storeName);
        setItems(result.cart.items);
        setOrderNoteState(result.cart.orderNote);
      } else if (result.status === "none") {
        // Server confirmed no saved cart yet — persist the anonymous cart in progress (or empty).
        await saveServerCart(userId, carryOver);
        if (cancelled) return;
        reconciledFor.current = userId;
      }
      // "error" after retry: leave memory and server untouched; saves stay
      // blocked until the next reconciliation (next mount or login).
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sessionLoading]);

  // Debounced save on every mutation, only while logged in and reconciled.
  useEffect(() => {
    if (!userId) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (reconciledFor.current !== userId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveServerCart(userId, { storeId, storeName, items, orderNote });
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [userId, storeId, storeName, items, orderNote]);

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
        checkoutHandler,
        addItem,
        updateQuantity,
        removeItem,
        setSpecialInstructions,
        setOrderNote,
        clearCart,
        confirmClearAndAdd,
        cancelPendingAdd,
        setCheckoutHandler,
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
