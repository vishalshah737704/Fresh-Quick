"use client";

import { useCart } from "@/lib/cart-store";

export function CartConflictDialog() {
  const { pendingConflict, confirmClearAndAdd, cancelPendingAdd } = useCart();

  if (!pendingConflict) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-lg bg-white p-6 shadow-lg">
        <p className="mb-4">
          Your cart has items from another restaurant. Start a new cart for{" "}
          <strong>{pendingConflict.restaurantName}</strong>?
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={cancelPendingAdd}
            className="rounded border px-3 py-1 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={confirmClearAndAdd}
            className="rounded bg-brand-primary px-3 py-1 text-sm text-white"
          >
            Clear cart and add
          </button>
        </div>
      </div>
    </div>
  );
}
