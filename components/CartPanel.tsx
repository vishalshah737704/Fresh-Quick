"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { useDeliveryFee } from "@/lib/use-delivery-fee";

export function CartPanel() {
  const pathname = usePathname();
  const isOnCheckoutPage = pathname === "/customer/checkout";
  const {
    storeId,
    storeName,
    items,
    subtotal,
    orderNote,
    updateQuantity,
    removeItem,
    setSpecialInstructions,
    setOrderNote,
    clearCart,
    checkoutHandler,
  } = useCart();
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [orderNoteDraft, setOrderNoteDraft] = useState<string | null>(null);
  const { deliveryFeePaise, loading: feeLoading } = useDeliveryFee(storeId);

  if (items.length === 0) return null;

  function noteValue(lineId: string, current: string | null) {
    return noteDrafts[lineId] ?? current ?? "";
  }

  const totalPaise =
    deliveryFeePaise !== null ? Math.round(subtotal * 100) + deliveryFeePaise : null;
  const total = totalPaise !== null ? totalPaise / 100 : null;

  return (
    <aside className="hidden h-full w-96 shrink-0 flex-col overflow-y-auto rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:flex">
      <div className="rounded-t-[var(--radius-card)] bg-brand-accent px-4 py-3">
        <h2 className="text-lg font-bold text-white">My Basket</h2>
        <p className="text-sm text-white/85">{storeName}</p>
      </div>

      <div className="bg-brand-accent-tint px-4 py-2">
        {items.map((item) => (
          <div key={item.lineId} className="border-b border-brand-ink-muted/10 py-3 last:border-b-0">
            <div className="flex items-start gap-3">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-lg bg-brand-accent/10" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-brand-ink">{item.name}</span>
                </div>
                <div className="mt-1 flex shrink-0 items-center gap-2">
                  <button
                    onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                    className="rounded-[var(--radius-pill)] border border-brand-ink-muted/20 px-2 text-brand-ink"
                  >
                    −
                  </button>
                  <span className="text-brand-ink">{item.quantity}</span>
                  <button
                    onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                    className="rounded-[var(--radius-pill)] border border-brand-ink-muted/20 px-2 text-brand-ink"
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
                {item.selectedOptions.length > 0 && (
                  <p className="mt-0.5 text-xs text-brand-ink-muted">
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
                  maxLength={500}
                  placeholder="Add a note (optional)"
                  className="mt-1 w-full rounded-lg border border-brand-ink-muted/15 px-2 py-1 text-xs text-brand-ink"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-brand-ink-muted/10 bg-brand-primary px-4 py-3">
        <div className="flex flex-col gap-1 text-sm text-white/85">
          <p>Subtotal: ₹{subtotal.toFixed(2)}</p>
          {feeLoading ? (
            <p>Delivery fee: …</p>
          ) : deliveryFeePaise !== null ? (
            <p>Delivery fee: ₹{(deliveryFeePaise / 100).toFixed(2)}</p>
          ) : null}
          {total !== null && (
            <p className="mt-1 flex items-center justify-between text-base font-semibold text-white">
              <span>Total to pay</span>
              <span>₹{total.toFixed(2)}</span>
            </p>
          )}
        </div>
        {!isOnCheckoutPage && (
          <Link
            href="/customer/checkout"
            className="mt-2 block rounded-[var(--radius-pill)] bg-brand-accent px-3 py-2 text-center text-sm font-semibold text-white"
          >
            Checkout
          </Link>
        )}
        {isOnCheckoutPage && checkoutHandler && (
          <>
            {checkoutHandler.error && (
              <p className="mt-2 rounded-[var(--radius-pill)] bg-white px-2 py-1 text-xs font-medium text-brand-danger">
                {checkoutHandler.error}
              </p>
            )}
            <button
              disabled={checkoutHandler.submitting || !checkoutHandler.canPlaceOrder}
              onClick={checkoutHandler.onPlaceOrder}
              className="mt-2 block w-full rounded-[var(--radius-pill)] bg-brand-accent px-3 py-2 text-center text-sm font-semibold text-white disabled:opacity-50"
            >
              {checkoutHandler.submitting ? "Placing order…" : "Place order"}
            </button>
          </>
        )}
      </div>

      <div className="px-4 py-3">
        <label className="mb-1 block text-sm font-medium text-brand-ink">Order note</label>
        <textarea
          value={orderNoteDraft ?? orderNote}
          onChange={(e) => setOrderNoteDraft(e.target.value)}
          onBlur={(e) => {
            setOrderNote(e.target.value);
            setOrderNoteDraft(null);
          }}
          maxLength={500}
          placeholder="Add a note for the whole order (e.g. gate code, leave at door)"
          rows={2}
          className="w-full rounded-lg border border-brand-ink-muted/15 px-2 py-1 text-sm text-brand-ink"
        />
        <button onClick={clearCart} className="mt-2 text-xs text-brand-ink-muted underline">
          Clear cart
        </button>
      </div>
    </aside>
  );
}
