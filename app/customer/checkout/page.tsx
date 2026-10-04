"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { useAddress, type DeliveryDetails } from "@/lib/address-store";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useDeliveryFee } from "@/lib/use-delivery-fee";
import { validateCardFields, validateUpiFields, validateRecipientEmail } from "@/lib/payment-fields";
import { validateRecipientPhone } from "@/lib/phone";
import AddressSearch, { type SelectedPlace } from "@/components/maps/AddressSearch";
import { useGoogleMaps } from "@/lib/maps/loader";
import { reverseGeocodePoint } from "@/lib/maps/geocode";
import { placeLabel, toAddressFormFields } from "@/lib/maps/place";

// Spec requires every checkout field blank on every visit — never seed the
// form from AddressProvider's deliveryDetails, which survives client-side
// navigation within a session (see Finding 5).
const EMPTY_DELIVERY_DETAILS: DeliveryDetails = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
};

const PAYMENT_METHODS = [
  { value: "mock_card", label: "Mock Card", icon: "💳" },
  { value: "mock_upi", label: "Mock UPI", icon: "📱" },
  { value: "mock_cod", label: "Cash on Delivery", icon: "💵" },
] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const { storeId, items, subtotal, orderNote, clearCart, setCheckoutHandler } = useCart();
  const { lat, lng, label, setAddress: setPin, setDeliveryDetails } = useAddress();
  const maps = useGoogleMaps();
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [pinLookupBusy, setPinLookupBusy] = useState(false);
  const pinLookupSeq = useRef(0);
  const { userId, loading: sessionLoading } = useSession();

  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]["value"]>("mock_card");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { deliveryFeePaise, error: feeLoadError } = useDeliveryFee(storeId);
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [address, setAddress] = useState<DeliveryDetails>(EMPTY_DELIVERY_DETAILS);

  function updateAddressField(field: keyof DeliveryDetails, value: string) {
    setAddress((prev) => ({ ...prev, [field]: value }));
  }

  // Autofill only sets this page's own form state; nothing here is stored.
  function applyPlace(place: SelectedPlace) {
    pinLookupSeq.current += 1;
    setPinLookupBusy(false);
    setLookupNote(null);
    setAddress(toAddressFormFields(place.components, place.displayName));
    setPin(
      place.point.lat,
      place.point.lng,
      placeLabel({
        displayName: place.displayName,
        formattedAddress: place.formattedAddress,
        lat: place.point.lat,
        lng: place.point.lng,
      }) || "Custom location"
    );
  }

  async function fillFromPin() {
    const seq = ++pinLookupSeq.current;
    setLookupNote(null);
    setPinLookupBusy(true);
    const found = await reverseGeocodePoint({ lat, lng });
    if (seq !== pinLookupSeq.current) return;
    setPinLookupBusy(false);
    if (!found) {
      setLookupNote("Could not look up that location. Please type the address.");
      return;
    }
    setAddress(toAddressFormFields(found.components));
  }

  // Persist to AddressProvider (a different component's state) as an effect,
  // never inside the setAddress updater — React forbids updating another
  // component's state synchronously while this component is rendering.
  useEffect(() => {
    setDeliveryDetails(address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Redirect to login as an effect, never inside the render body — calling
  // router.push() during render triggers "Cannot update a component
  // (Router) while rendering a different component" because it updates the
  // Next.js router's own state synchronously mid-render.
  useEffect(() => {
    if (!sessionLoading && !userId) {
      router.push("/customer/login?redirectTo=/customer/checkout");
    }
  }, [sessionLoading, userId, router]);

  const total = deliveryFeePaise !== null ? (Math.round(subtotal * 100) + deliveryFeePaise) / 100 : null;

  const recipientNameError = recipientName.trim().length === 0 ? "Name is required" : null;
  const recipientEmailError = validateRecipientEmail(recipientEmail);
  const recipientPhoneError = validateRecipientPhone(recipientPhone);
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
    !recipientPhoneError &&
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
          recipientPhone: recipientPhone.trim(),
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
    recipientPhone,
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
    <div
      className="-m-4 p-4"
      style={{
        background:
          "linear-gradient(180deg, var(--color-brand-primary-tint) 0%, var(--color-brand-bg) 260px)",
      }}
    >
      <div className="-mx-4 -mt-4 mb-6 bg-brand-ink px-6 py-4">
        <h1 className="text-2xl font-bold text-white">Checkout</h1>
      </div>
      <div className="flex max-w-2xl flex-col gap-6">
        <section className="rounded-[var(--radius-card)] border-t-4 border-brand-primary bg-brand-surface p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-brand-primary">Contact details</h2>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Name</label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                className={`w-full rounded border px-3 py-2 text-sm ${
                  recipientName
                    ? "border-brand-ink-muted/15"
                    : "border-brand-primary/30 bg-brand-primary-tint"
                }`}
                placeholder="Who's this order for?"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Email</label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className={`w-full rounded border px-3 py-2 text-sm ${
                  recipientEmail
                    ? "border-brand-ink-muted/15"
                    : "border-brand-primary/30 bg-brand-primary-tint"
                }`}
                placeholder="Where should order updates go?"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Phone</label>
              <input
                type="tel"
                inputMode="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                className={`w-full rounded border px-3 py-2 text-sm ${
                  recipientPhone
                    ? "border-brand-ink-muted/15"
                    : "border-brand-primary/30 bg-brand-primary-tint"
                }`}
                placeholder="10-digit mobile number"
              />
              {recipientPhone && recipientPhoneError && (
                <p className="mt-1 text-xs text-red-600">{recipientPhoneError}</p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] border-t-4 border-brand-accent bg-brand-surface p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-brand-accent">Delivery address</h2>
          <div className="flex flex-col gap-3">
            {maps.status !== "error" && (
              <div className="flex flex-col gap-2">
                <label className="block text-sm font-medium text-brand-ink">
                  Search for your address
                </label>
                <AddressSearch
                  className="min-h-10"
                  onSelect={applyPlace}
                  onError={setLookupNote}
                />
                <button
                  type="button"
                  onClick={fillFromPin}
                  disabled={pinLookupBusy || maps.status !== "ready"}
                  className="self-start rounded-full border border-brand-accent px-3 py-1.5 text-sm font-medium text-brand-ink disabled:opacity-60"
                >
                  {pinLookupBusy ? "Looking up…" : "Use my pinned location"}
                </button>
                {lookupNote && (
                  <p role="alert" className="text-xs text-red-600">
                    {lookupNote}
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Address 1</label>
              <input
                type="text"
                value={address.line1}
                onChange={(e) => updateAddressField("line1", e.target.value)}
                className={`w-full rounded border px-3 py-2 text-sm ${
                  address.line1
                    ? "border-brand-ink-muted/15"
                    : "border-brand-accent/30 bg-brand-accent-tint"
                }`}
                placeholder="House/flat no., building, street"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Address 2</label>
              <input
                type="text"
                value={address.line2}
                onChange={(e) => updateAddressField("line2", e.target.value)}
                className={`w-full rounded border px-3 py-2 text-sm ${
                  address.line2
                    ? "border-brand-ink-muted/15"
                    : "border-brand-accent/30 bg-brand-accent-tint"
                }`}
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
                  className={`w-full rounded border px-3 py-2 text-sm ${
                    address.city
                      ? "border-brand-ink-muted/15"
                      : "border-brand-accent/30 bg-brand-accent-tint"
                  }`}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-ink">State</label>
                <input
                  type="text"
                  value={address.state}
                  onChange={(e) => updateAddressField("state", e.target.value)}
                  className={`w-full rounded border px-3 py-2 text-sm ${
                    address.state
                      ? "border-brand-ink-muted/15"
                      : "border-brand-accent/30 bg-brand-accent-tint"
                  }`}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Pincode</label>
              <input
                type="text"
                value={address.pincode}
                onChange={(e) => updateAddressField("pincode", e.target.value)}
                className={`w-full max-w-[160px] rounded border px-3 py-2 text-sm ${
                  address.pincode
                    ? "border-brand-ink-muted/15"
                    : "border-brand-accent/30 bg-brand-accent-tint"
                }`}
              />
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] border-t-4 border-brand-ink bg-brand-surface p-4 shadow-sm">
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
                      className={`w-full rounded border px-3 py-2 text-sm ${
                        cardNumber
                          ? "border-brand-ink-muted/15"
                          : "border-brand-ink/30 bg-brand-ink-tint"
                      }`}
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        placeholder="MM/YY"
                        className={`w-24 rounded border px-3 py-2 text-sm ${
                          cardExpiry
                            ? "border-brand-ink-muted/15"
                            : "border-brand-ink/30 bg-brand-ink-tint"
                        }`}
                      />
                      <input
                        type="text"
                        value={cardholderName}
                        onChange={(e) => setCardholderName(e.target.value)}
                        placeholder="Cardholder name"
                        className={`flex-1 rounded border px-3 py-2 text-sm ${
                          cardholderName
                            ? "border-brand-ink-muted/15"
                            : "border-brand-ink/30 bg-brand-ink-tint"
                        }`}
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
                      className={`w-full rounded border px-3 py-2 text-sm ${
                        upiId
                          ? "border-brand-ink-muted/15"
                          : "border-brand-ink/30 bg-brand-ink-tint"
                      }`}
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
