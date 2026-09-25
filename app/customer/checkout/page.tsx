"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { useAddress } from "@/lib/address-store";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { DELIVERY_FEE_RUPEES } from "@/lib/order-constants";

const PAYMENT_METHODS = [
  { value: "mock_card", label: "Mock Card" },
  { value: "mock_upi", label: "Mock UPI" },
  { value: "mock_cod", label: "Cash on Delivery" },
] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const { restaurantId, restaurantName, items, subtotal, clearCart } = useCart();
  const { lat, lng, label } = useAddress();
  const { userId, loading: sessionLoading } = useSession();

  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]["value"]>("mock_card");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          items: items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
          deliveryAddress: { label, lat, lng },
          paymentMethod,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Checkout failed");
        setSubmitting(false);
        return;
      }
      clearCart();
      router.push(`/customer/orders/${result.orderId}`);
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  const total = subtotal + DELIVERY_FEE_RUPEES;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Checkout</h1>
      <p className="mb-2 text-sm text-gray-600">
        {items.length} item{items.length !== 1 ? "s" : ""} from {restaurantName}
      </p>
      <p className="mb-4 text-sm text-gray-600">Delivering to: {label}</p>

      <div className="mb-4 flex flex-col gap-2">
        <p className="font-medium">Payment method</p>
        {PAYMENT_METHODS.map((m) => (
          <label key={m.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="paymentMethod"
              checked={paymentMethod === m.value}
              onChange={() => setPaymentMethod(m.value)}
            />
            {m.label}
          </label>
        ))}
      </div>

      <div className="mb-4 border-t border-gray-200 pt-2 text-sm">
        <p>Subtotal: ₹{subtotal.toFixed(2)}</p>
        <p>Delivery fee: ₹{DELIVERY_FEE_RUPEES.toFixed(2)}</p>
        <p className="font-semibold">Total: ₹{total.toFixed(2)}</p>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <button
        disabled={submitting}
        onClick={handleSubmit}
        className="rounded bg-brand-primary px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "Placing order…" : "Place order"}
      </button>
    </div>
  );
}
