import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-store";
import { apiFetch } from "./api";
import { isReorderBusy, reorderNotice, reorderPath, type ReorderResponse } from "./favorites-model";

export function useReorder() {
  const cart = useCart();
  // The cart can change while the request is in flight, so read it after the await from a ref, not the closure.
  const cartRef = useRef(cart);
  useEffect(() => {
    cartRef.current = cart;
  });
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The ref blocks a double tap in the same tick, before state has re-rendered.
  const busyRef = useRef<string | null>(null);

  async function reorder(orderId: string) {
    if (isReorderBusy(busyRef.current, orderId)) return;
    busyRef.current = orderId;
    setBusyOrderId(orderId);
    setNotice(null);
    setError(null);
    try {
      const result = await apiFetch<ReorderResponse>(reorderPath(orderId), { method: "POST" });
      const current = cartRef.current;
      const replacing = current.storeId !== null && current.storeId !== result.storeId && current.items.length > 0;
      const replaced = replacing
        ? { count: current.items.reduce((sum, line) => sum + line.quantity, 0), storeName: current.storeName }
        : null;
      current.addItems(result.storeId, result.storeName, result.lines, replacing);
      setNotice(reorderNotice({ storeName: result.storeName, added: result.lines.length, skipped: result.skipped, replaced }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder");
    } finally {
      busyRef.current = null;
      setBusyOrderId(null);
    }
  }

  return { busyOrderId, notice, error, reorder };
}
