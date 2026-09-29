"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { useAddress, type DeliveryDetails } from "@/lib/address-store";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useDeliveryFee } from "@/lib/use-delivery-fee";
import { validateCardFields, validateUpiFields, validateRecipientEmail } from "@/lib/payment-fields";

const PAYMENT_METHODS = [
  { value: "mock_card", label: "Mock Card", icon: "💳" },
  { value: "mock_upi", label: "Mock UPI", icon: "📱" },
  { value: "mock_cod", label: "Cash on Delivery", icon: "💵" },
] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const { storeId, items, subtotal, orderNote, clearCart, setCheckoutHandler } = useCart();
  const { lat, lng, label, deliveryDetails, setDeliveryDetails } = useAddress();
  const { userId, loading: sessionLoading } = useSession();

  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]["value"]>("mock_card");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { deliveryFeePaise, error: feeLoadError } = useDeliveryFee(storeId);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [address, setAddress] = useState<DeliveryDetails>(deliveryDetails);

  function updateAddressField(field: keyof DeliveryDetails, value: string) {
    setAddress((prev) => ({ ...prev, [field]: value }));
  }

  // Persist to AddressProvider (a different component's state) as an effect,
  // never inside the setAddress updater — React forbids updating another
  // component's state synchronously while this component is rendering.
  useEffect(() => {
    setDeliveryDetails(address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadProfile() {
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData.session?.user.email ?? "";
      const { data: profile } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", userId)
        .single();
      if (cancelled) return;
      setRecipientEmail(email);
      setRecipientName(profile?.full_name ?? "");
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const total = deliveryFeePaise !== null ? (Math.round(subtotal * 100) + deliveryFeePaise) / 100 : null;

  const recipientNameError = recipientName.trim().length === 0 ? "Name is required" : null;
  const recipientEmailError = validateRecipientEmail(recipientEmail);
  const paymentFieldError =
    paymentMethod === "mock_card"
      ? validateCardFields({ cardNumber, expiry: cardExpiry, cardholderName })
      : paymentMethod === "mock_upi"
        ? validateUpiFields({ upiId })
        : null;
  const addressFieldError =
    address.line1.trim().length === 0 ||
    address.city.trim().length === 0 ||
    address.state.trim().length === 0 ||
    address.pincode.trim().length === 0
      ? "Address 1, City, State, and Pincode are required"
      : null;
  const canPlaceOrder =
    total !== null &&
    !recipientNameError &&
    !recipientEmailError &&
    !paymentFieldError &&
    !addressFieldError;

  async function handleSubmit() {
    if (total === null) return;
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
          storeId,
          items: items.map((i) => ({
            productId: i.menuItemId,
            quantity: i.quantity,
            selectedOptionIds: i.selectedOptions.map((o) => o.optionId),
            specialInstructions: i.specialInstructions,
          })),
          deliveryAddress: {
            label,
            lat,
            lng,
            line1: address.line1.trim(),
            line2: address.line2.trim() === "" ? null : address.line2.trim(),
            city: address.city.trim(),
            state: address.state.trim(),
            pincode: address.pincode.trim(),
          },
          paymentMethod,
          expectedTotal: total,
          deliveryNote: orderNote.trim() === "" ? null : orderNote,
          recipientName: recipientName.trim(),
          recipientEmail: recipientEmail.trim(),
          cardFields: paymentMethod === "mock_card" ? { cardNumber, expiry: cardExpiry, cardholderName } : undefined,
          upiFields: paymentMethod === "mock_upi" ? { upiId } : undefined,
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

  // Registers with the persistent CartPanel sidebar so it can render the
  // single "Place order" button for this route instead of this page
  // duplicating its own cart summary alongside the sidebar's.
  useEffect(() => {
    if (userId && items.length > 0 && storeId && !feeLoadError) {
      setCheckoutHandler({ canPlaceOrder, submitting, error, onPlaceOrder: handleSubmit });
    } else {
      setCheckoutHandler(null);
    }
    return () => setCheckoutHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    userId,
    items,
    storeId,
    feeLoadError,
    canPlaceOrder,
    submitting,
    error,
    address,
    paymentMethod,
    recipientName,
    recipientEmail,
    cardNumber,
    cardExpiry,
    cardholderName,
    upiId,
    orderNote,
    total,
    label,
    lat,
    lng,
  ]);

  if (sessionLoading) {
    return <p className="text-brand-ink-muted">Loading…</p>;
  }

  if (!userId) {
    router.push("/customer/login?redirectTo=/customer/checkout");
    return null;
  }

  if (items.length === 0 || !storeId) {
    return <p className="text-brand-ink-muted">Your cart is empty.</p>;
  }

  if (feeLoadError) {
    return (
      <p className="rounded-[var(--radius-card)] bg-brand-danger px-4 py-3 text-white">
        Couldn&apos;t load delivery fee: {feeLoadError}
      </p>
    );
  }

  if (deliveryFeePaise === null) {
    return <p className="text-brand-ink-muted">Loading…</p>;
  }

  return (
    <div className="bg-brand-bg">
      <h1 className="mb-6 text-2xl font-bold text-brand-ink">Checkout</h1>
      <div className="flex max-w-2xl flex-col gap-6">
        <section className="rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface p-4">
          <h2 className="mb-3 font-semibold text-brand-ink">Contact details</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Name</label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                placeholder="Who's this order for?"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Email</label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                placeholder="Where should order updates go?"
              />
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface p-4">
          <h2 className="mb-3 font-semibold text-brand-ink">Delivery address</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Address 1</label>
              <input
                type="text"
                value={address.line1}
                onChange={(e) => updateAddressField("line1", e.target.value)}
                className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                placeholder="House/flat no., building, street"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Address 2</label>
              <input
                type="text"
                value={address.line2}
                onChange={(e) => updateAddressField("line2", e.target.value)}
                className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                placeholder="Landmark, area (optional)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-ink">City</label>
                <input
                  type="text"
                  value={address.city}
                  onChange={(e) => updateAddressField("city", e.target.value)}
                  className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-ink">State</label>
                <input
                  type="text"
                  value={address.state}
                  onChange={(e) => updateAddressField("state", e.target.value)}
                  className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Pincode</label>
              <input
                type="text"
                value={address.pincode}
                onChange={(e) => updateAddressField("pincode", e.target.value)}
                className="w-full max-w-[160px] rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface p-4">
          <h2 className="mb-3 font-semibold text-brand-ink">Payment method</h2>
          <div className="flex flex-col gap-2">
            {PAYMENT_METHODS.map((m) => (
              <div key={m.value}>
                <label
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
                {paymentMethod === m.value && m.value === "mock_card" && (
                  <div className="mt-2 flex flex-col gap-2 border-t border-brand-ink-muted/10 pt-2">
                    <input
                      type="text"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="Card number (16 digits)"
                      className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/YY"
                        className="w-24 rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={cardholderName}
                        onChange={(e) => setCardholderName(e.target.value)}
                        placeholder="Cardholder name"
                        className="flex-1 rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}
                {paymentMethod === m.value && m.value === "mock_upi" && (
                  <div className="mt-2 border-t border-brand-ink-muted/10 pt-2">
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="UPI ID, e.g. name@bank"
                      className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
