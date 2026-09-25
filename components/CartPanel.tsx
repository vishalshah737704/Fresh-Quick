"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart-store";

export function CartPanel() {
  const { restaurantName, items, subtotal, updateQuantity, removeItem, clearCart } =
    useCart();
  const [open, setOpen] = useState(false);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  if (items.length === 0) return null;

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
        <div className="max-h-64 overflow-y-auto border-t border-gray-100 px-4 py-2">
          {items.map((item) => (
            <div
              key={item.menuItemId}
              className="flex items-center justify-between py-2"
            >
              <span className="text-sm">{item.name}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                  className="rounded border px-2"
                >
                  −
                </button>
                <span>{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                  className="rounded border px-2"
                >
                  +
                </button>
                <button
                  onClick={() => removeItem(item.menuItemId)}
                  className="text-xs text-red-600"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={clearCart}
            className="mt-2 text-xs text-gray-500 underline"
          >
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
