"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/lib/cart-store";
import { useDeliveryFee } from "@/lib/use-delivery-fee";

export function CartPanel() {
  const {
    restaurantId,
    restaurantName,
    items,
    subtotal,
    orderNote,
    updateQuantity,
    removeItem,
    setSpecialInstructions,
    setOrderNote,
    clearCart,
  } = useCart();
  const [open, setOpen] = useState(false);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [orderNoteDraft, setOrderNoteDraft] = useState<string | null>(null);
  const { deliveryFeePaise, loading: feeLoading } = useDeliveryFee(open ? restaurantId : null);

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (items.length === 0) return null;

  function noteValue(lineId: string, current: string | null) {
    return noteDrafts[lineId] ?? current ?? "";
  }

  const total =
    deliveryFeePaise !== null ? subtotal + deliveryFeePaise / 100 : null;

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 border-t border-brand-ink-muted/15 bg-brand-surface shadow-lg">
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between px-4 py-3"
        >
          <span className="text-sm text-brand-ink">
            {itemCount} item{itemCount !== 1 ? "s" : ""} from {restaurantName}
          </span>
          <span className="font-semibold text-brand-ink">₹{subtotal.toFixed(2)}</span>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            className="fixed inset-y-0 right-0 flex w-full max-w-md flex-col bg-brand-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-brand-ink-muted/10 px-4 py-3">
              <h2 className="text-lg font-bold text-brand-ink">{restaurantName}</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close cart"
                className="text-brand-ink-muted"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2">
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
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.lineId, item.quantity - 1)}
                            className="rounded border border-brand-ink-muted/20 px-2"
                          >
                            −
                          </button>
                          <span className="text-brand-ink">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.lineId, item.quantity + 1)}
                            className="rounded border border-brand-ink-muted/20 px-2"
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
                        className="mt-1 w-full rounded border border-brand-ink-muted/15 px-2 py-1 text-xs"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="mt-3">
                <label className="mb-1 block text-sm font-medium text-brand-ink">
                  Order note
                </label>
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
                  className="w-full rounded border border-brand-ink-muted/15 px-2 py-1 text-sm"
                />
              </div>
            </div>

            <div className="border-t border-brand-ink-muted/10 px-4 py-3">
              <div className="flex flex-col gap-1 text-sm text-brand-ink-muted">
                <p>Subtotal: ₹{subtotal.toFixed(2)}</p>
                {feeLoading ? (
                  <p>Delivery fee: …</p>
                ) : deliveryFeePaise !== null ? (
                  <p>Delivery fee: ₹{(deliveryFeePaise / 100).toFixed(2)}</p>
                ) : null}
                {total !== null && (
                  <p className="font-semibold text-brand-ink">Total: ₹{total.toFixed(2)}</p>
                )}
              </div>
              <button onClick={clearCart} className="mt-2 text-xs text-brand-ink-muted underline">
                Clear cart
              </button>
              <Link
                href="/customer/checkout"
                className="mt-2 block rounded-full bg-brand-primary px-3 py-2 text-center text-sm font-semibold text-white"
              >
                Checkout
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
