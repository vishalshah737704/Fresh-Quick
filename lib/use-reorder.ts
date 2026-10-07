"use client";

import { useRef, useState } from "react";
import { useCart } from "@/lib/cart-store";
import { customerFetch } from "@/lib/customer-api";
import { isReorderBusy, reorderNotice, reorderPath, type ReorderResponse } from "@/lib/favorites-model";

export function useReorder() {
  const cart = useCart();
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
      const result = await customerFetch<ReorderResponse>(reorderPath(orderId), { method: "POST" });
      const replacing = cart.storeId !== null && cart.storeId !== result.storeId && cart.items.length > 0;
      const replaced = replacing
        ? { count: cart.items.reduce((sum, line) => sum + line.quantity, 0), storeName: cart.storeName }
        : null;
      cart.addItems(result.storeId, result.storeName, result.lines, replacing);
      setNotice(reorderNotice({ storeName: result.storeName, added: result.lines.length, skipped: result.skipped, replaced }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder");
    } finally {
      busyRef.current = null;
      setBusyOrderId(null);
    }
  }

  return { busyOrderId, notice, error, reorder, clearMessages: () => { setNotice(null); setError(null); } };
}
