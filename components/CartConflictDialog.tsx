"use client";

import { useCart } from "@/lib/cart-store";

export function CartConflictDialog() {
  const { pendingConflict, confirmClearAndAdd, cancelPendingAdd } = useCart();

  if (!pendingConflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-[var(--radius-card)] bg-brand-surface p-6 shadow-lg">
        <p className="mb-4 text-brand-ink">
          Your cart has items from another restaurant. Start a new cart for{" "}
          <strong>{pendingConflict.storeName}</strong>?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={cancelPendingAdd}
            className="rounded-[var(--radius-pill)] border border-brand-ink-muted/20 px-3 py-1 text-sm text-brand-ink"
          >
            Cancel
          </button>
          <button
            onClick={confirmClearAndAdd}
            className="rounded-[var(--radius-pill)] bg-brand-accent-text-safe px-3 py-1 text-sm text-white"
          >
            Clear cart and add
          </button>
        </div>
      </div>
    </div>
  );
}
