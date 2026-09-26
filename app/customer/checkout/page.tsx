"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { useAddress } from "@/lib/address-store";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useDeliveryFee } from "@/lib/use-delivery-fee";

const PAYMENT_METHODS = [
  { value: "mock_card", label: "Mock Card", icon: "💳" },
  { value: "mock_upi", label: "Mock UPI", icon: "📱" },
  { value: "mock_cod", label: "Cash on Delivery", icon: "💵" },
] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const { restaurantId, restaurantName, items, subtotal, orderNote, clearCart } = useCart();
  const { lat, lng, label } = useAddress();
  const { userId, loading: sessionLoading } = useSession();

  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]["value"]>("mock_card");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { deliveryFeePaise, error: feeLoadError } = useDeliveryFee(restaurantId);

  if (sessionLoading) {
    return <p className="text-gray-500">Loading…</p>;
  }

  if (!userId) {
    router.push("/customer/login?redirectTo=/customer/checkout");
    return null;
  }

  if (items.length === 0 || !restaurantId) {
    return <p className="text-gray-500">Your cart is empty.</p>;
  }

  if (feeLoadError) {
    return <p className="text-red-600">Couldn&apos;t load delivery fee: {feeLoadError}</p>;
  }

  if (deliveryFeePaise === null) {
    return <p className="text-gray-500">Loading…</p>;
  }

  const totalPaise = Math.round(subtotal * 100) + deliveryFeePaise;
  const total = totalPaise / 100;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError("Session expired — please log in again");
        setSubmitting(false);
        return;
      }
      const res = await fetch("/api/cart/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({
          restaurantId,
          items: items.map((i) => ({
            menuItemId: i.menuItemId,
            quantity: i.quantity,
            selectedOptionIds: i.selectedOptions.map((o) => o.optionId),
            specialInstructions: i.specialInstructions,
          })),
          deliveryAddress: { label, lat, lng },
          paymentMethod,
          expectedTotal: total,
          deliveryNote: orderNote.trim() === "" ? null : orderNote,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Checkout failed");
        setSubmitting(false);
        return;
      }
      if (result.paymentStatus === "success") {
        clearCart();
      }
      router.push(`/customer/orders/${result.orderId}`);
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-ink">Checkout</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-1 font-semibold text-brand-ink">Delivery address</h2>
            <p className="text-sm text-brand-ink-muted">{label}</p>
          </section>

          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-3 font-semibold text-brand-ink">Payment method</h2>
            <div className="flex flex-col gap-2">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                    paymentMethod === m.value
                      ? "border-brand-primary bg-brand-primary/5"
                      : "border-brand-ink-muted/15"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === m.value}
                    onChange={() => setPaymentMethod(m.value)}
                    className="accent-brand-primary"
                  />
                  <span className="text-lg">{m.icon}</span>
                  <span className="font-medium text-brand-ink">{m.label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-3 font-semibold text-brand-ink">
              {items.length} item{items.length !== 1 ? "s" : ""} from {restaurantName}
            </h2>
            <div className="flex flex-col gap-3">
              {items.map((item) => (
                <div key={item.lineId} className="flex items-start gap-3">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.name}
                      width={48}
                      height={48}
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-lg bg-brand-accent/10" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-brand-ink">
                        {item.quantity}× {item.name}
                      </span>
                      <span className="shrink-0 text-sm font-medium text-brand-ink">
                        ₹{((Math.round(item.price * 100) * item.quantity) / 100).toFixed(2)}
                      </span>
                    </div>
                    {item.selectedOptions.length > 0 && (
                      <p className="mt-0.5 text-xs text-brand-ink-muted">
                        {item.selectedOptions.map((o) => o.optionName).join(", ")}
                      </p>
                    )}
                    {item.specialInstructions && (
                      <p className="mt-0.5 text-xs text-brand-ink-muted">
                        &quot;{item.specialInstructions}&quot;
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {orderNote && (
              <p className="mt-3 border-t border-brand-ink-muted/10 pt-3 text-xs text-brand-ink-muted">
                Note: &quot;{orderNote}&quot;{" "}
                <span className="text-brand-ink-muted/70">(edit in cart)</span>
              </p>
            )}

            <div className="mt-3 flex flex-col gap-1 border-t border-brand-ink-muted/10 pt-3 text-sm text-brand-ink-muted">
              <p>Subtotal: ₹{subtotal.toFixed(2)}</p>
              <p>Delivery fee: ₹{(deliveryFeePaise / 100).toFixed(2)}</p>
              <p className="font-semibold text-brand-ink">Total: ₹{total.toFixed(2)}</p>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              disabled={submitting}
              onClick={handleSubmit}
              className="mt-4 w-full rounded-full bg-brand-primary px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Placing order…" : "Place order"}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
