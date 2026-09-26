"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart-store";

export function CartPanel() {
  const {
    restaurantName,
    items,
    subtotal,
    updateQuantity,
    removeItem,
    setSpecialInstructions,
    clearCart,
  } = useCart();
  const [open, setOpen] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  if (items.length === 0) return null;

  function noteValue(lineId: string, current: string | null) {
    return noteDrafts[lineId] ?? current ?? "";
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 border-t border-gray-200 bg-white shadow-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="text-sm">
          {itemCount} item{itemCount !== 1 ? "s" : ""} from {restaurantName}
        </span>
        <span className="font-semibold">₹{subtotal.toFixed(2)}</span>
      </button>
      {open && (
        <div className="max-h-80 overflow-y-auto border-t border-gray-100 px-4 py-2">
          {items.map((item) => (
            <div key={item.lineId} className="border-b border-gray-100 py-2 last:border-b-0">
              <div className="flex items-center justify-between">
                <span className="text-sm">{item.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                    className="rounded border px-2"
                  >
                    −
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                    className="rounded border px-2"
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeItem(item.lineId)}
                    className="text-xs text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
              {item.selectedOptions.length > 0 && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {item.selectedOptions.map((o) => o.optionName).join(", ")}
                </p>
              )}
              <input
                type="text"
                value={noteValue(item.lineId, item.specialInstructions)}
                onChange={(e) =>
                  setNoteDrafts((prev) => ({ ...prev, [item.lineId]: e.target.value }))
                }
                onBlur={(e) => setSpecialInstructions(item.lineId, e.target.value)}
                placeholder="Add a note (optional)"
                className="mt-1 w-full rounded border border-gray-200 px-2 py-1 text-xs"
              />
            </div>
          ))}
          <button onClick={clearCart} className="mt-2 text-xs text-gray-500 underline">
            Clear cart
          </button>
          <Link
            href="/customer/checkout"
            className="mt-2 block rounded bg-brand-primary px-3 py-2 text-center text-sm text-white"
          >
            Checkout
          </Link>
        </div>
      )}
    </div>
  );
}
