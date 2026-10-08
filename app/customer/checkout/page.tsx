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
import MapErrorBoundary from "@/components/maps/MapErrorBoundary";
import AddressSearch, { type SelectedPlace } from "@/components/maps/AddressSearch";
import { customerFetch } from "@/lib/customer-api";
import { setCheckoutAdjustments } from "@/lib/checkout-adjustments";
import {
  computeCheckoutTotals,
  formatPaise,
  normalizeCouponCode,
  type CouponPreview,
} from "@/lib/coupon-model";
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

type AvailableCoupon = { code: string; description: string | null; summary: string };
type AppliedCoupon = { key: string; code: string; discountPaise: number; description: string | null };

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
  const [couponInput, setCouponInput] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponMessage, setCouponMessage] = useState<string | null>(null);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [useCredit, setUseCredit] = useState(false);
  const [walletData, setWalletData] = useState<{ key: string; balancePaise: number } | null>(null);
  const [availableData, setAvailableData] = useState<{ key: string; coupons: AvailableCoupon[] } | null>(null);

  function updateAddressField(field: keyof DeliveryDetails, value: string) {
    setAddress((prev) => ({ ...prev, [field]: value }));
  }

  // Autofill only sets this page's own form state; nothing here is stored.
  // Autofill never knows a flat number or landmark, so keep what the user typed.
  function keepTypedLine2(prev: DeliveryDetails, next: DeliveryDetails): DeliveryDetails {
    return prev.line2.trim() ? { ...next, line2: prev.line2 } : next;
  }

  function applyPlace(place: SelectedPlace) {
    pinLookupSeq.current += 1;
    setPinLookupBusy(false);
    setLookupNote(null);
    setAddress((prev) => keepTypedLine2(prev, toAddressFormFields(place.components, place.displayName)));
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
    setAddress((prev) => keepTypedLine2(prev, toAddressFormFields(found.components)));
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

  const subtotalPaise = Math.round(subtotal * 100);
  const couponKey = `${storeId ?? ""}:${subtotalPaise}`;
  const ownerKey = `${userId ?? ""}:${storeId ?? ""}`;

  // Fetched data is tagged with the key it was fetched for and only used while the key
  // still matches, so nothing is reset inside an effect.
  useEffect(() => {
    if (!userId || !storeId) return;
    let cancelled = false;
    const key = `${userId}:${storeId}`;
    customerFetch<{ balancePaise: number }>("/api/customer/wallet")
      .then((w) => {
        if (!cancelled) setWalletData({ key: userId, balancePaise: w.balancePaise });
      })
      .catch(() => {});
    customerFetch<{ coupons: AvailableCoupon[] }>(
      `/api/customer/coupons/available?storeId=${encodeURIComponent(storeId)}`
    )
      .then((r) => {
        if (!cancelled) setAvailableData({ key, coupons: r.coupons });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId, storeId]);

  const walletBalancePaise = walletData && walletData.key === userId ? walletData.balancePaise : 0;
  const availableCoupons = availableData && availableData.key === ownerKey ? availableData.coupons : [];
  // An applied coupon is only valid for the store and subtotal it was checked against.
  const activeCoupon = appliedCoupon && appliedCoupon.key === couponKey ? appliedCoupon : null;
  const couponStale = appliedCoupon !== null && activeCoupon === null;
  const creditOn = useCredit && walletBalancePaise > 0;
  const totals =
    deliveryFeePaise !== null
      ? computeCheckoutTotals({
          subtotalPaise,
          deliveryFeePaise,
          discountPaise: activeCoupon?.discountPaise ?? 0,
          creditBalancePaise: walletBalancePaise,
          useCredit: creditOn,
        })
      : null;
  const total = totals ? totals.totalPaise / 100 : null;
  const adjDiscount = totals?.discountPaise ?? 0;
  const adjCredit = totals?.creditPaise ?? 0;
  const adjCode = activeCoupon?.code ?? null;
  useEffect(() => {
    setCheckoutAdjustments({ discountPaise: adjDiscount, creditPaise: adjCredit, couponCode: adjCode });
    return () => setCheckoutAdjustments(null);
  }, [adjDiscount, adjCredit, adjCode]);

  async function applyCoupon(rawCode: string) {
    if (!storeId) return;
    const code = normalizeCouponCode(rawCode);
    if (!code) {
      setCouponMessage("Enter a valid promo code (3 to 20 letters or digits).");
      return;
    }
    setCouponBusy(true);
    setCouponMessage(null);
    try {
      const preview = await customerFetch<CouponPreview>("/api/customer/coupons/preview", {
        method: "POST",
        body: { code, storeId, subtotalPaise },
      });
      if (preview.ok) {
        setAppliedCoupon({
          key: couponKey,
          code: preview.code,
          discountPaise: preview.discountPaise,
          description: preview.description,
        });
        setCouponInput("");
      } else {
        setAppliedCoupon(null);
        setCouponMessage(preview.message);
      }
    } catch (e) {
      setCouponMessage(e instanceof Error ? e.message : "Could not check the promo code");
    } finally {
      setCouponBusy(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponMessage(null);
  }

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
          couponCode: activeCoupon ? activeCoupon.code : null,
          useCredit: creditOn,
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
        if (result.couponError) {
          setAppliedCoupon(null);
          setCouponMessage(result.error ?? "That promo code cannot be used.");
        }
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
    activeCoupon,
    creditOn,
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
              <MapErrorBoundary>
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
              </MapErrorBoundary>
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

        <section className="rounded-[var(--radius-card)] border-t-4 border-brand-primary bg-brand-surface p-4 shadow-sm">
          <h2 className="mb-3 font-semibold text-brand-primary">Promo code and wallet</h2>
          {activeCoupon ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-primary/30 bg-brand-primary-tint px-3 py-2 text-sm">
              <span className="font-medium text-brand-ink">
                {activeCoupon.code} applied: you save {formatPaise(totals?.discountPaise ?? 0)}
              </span>
              <button
                type="button"
                onClick={removeCoupon}
                className="rounded-full border border-brand-ink-muted/30 px-3 py-1 text-xs font-medium text-brand-ink"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Promo code"
                  aria-label="Promo code"
                  className="min-w-0 flex-1 rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => applyCoupon(couponInput)}
                  disabled={couponBusy || couponInput.trim() === ""}
                  className="rounded-full bg-brand-primary-text-safe px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {couponBusy ? "Checking…" : "Apply"}
                </button>
              </div>
              {availableCoupons.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {availableCoupons.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => applyCoupon(c.code)}
                      disabled={couponBusy}
                      title={c.description ?? undefined}
                      className="rounded-full border border-dashed border-brand-primary px-3 py-1 text-left text-xs text-brand-ink disabled:opacity-60"
                    >
                      <span className="font-semibold">{c.code}</span> · {c.summary}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {couponStale && (
            <p className="mt-2 text-xs text-brand-ink-muted">
              Your cart changed, so the promo code was removed. Apply it again.
            </p>
          )}
          {couponMessage && (
            <p role="alert" className="mt-2 text-sm text-red-600">
              {couponMessage}
            </p>
          )}
          {walletBalancePaise > 0 && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-brand-ink">
              <input
                type="checkbox"
                checked={useCredit}
                onChange={(e) => setUseCredit(e.target.checked)}
                className="accent-brand-primary"
              />
              <span>Use wallet credit (balance {formatPaise(walletBalancePaise)})</span>
            </label>
          )}
          {totals && (
            <dl className="mt-4 flex flex-col gap-1 border-t border-brand-ink-muted/10 pt-3 text-sm text-brand-ink">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatPaise(subtotalPaise)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Delivery fee</dt>
                <dd>{formatPaise(deliveryFeePaise ?? 0)}</dd>
              </div>
              {activeCoupon && totals.discountPaise > 0 && (
                <div className="flex justify-between text-brand-primary-text-safe">
                  <dt>Discount ({activeCoupon.code})</dt>
                  <dd>-{formatPaise(totals.discountPaise)}</dd>
                </div>
              )}
              {totals.creditPaise > 0 && (
                <div className="flex justify-between text-brand-primary-text-safe">
                  <dt>Wallet credit</dt>
                  <dd>-{formatPaise(totals.creditPaise)}</dd>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <dt>Total</dt>
                <dd>{formatPaise(totals.totalPaise)}</dd>
              </div>
            </dl>
          )}
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
