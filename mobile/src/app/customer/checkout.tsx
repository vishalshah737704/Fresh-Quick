import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../lib/supabase";
import { apiFetch, ApiError } from "../../../lib/api";
import { useCart } from "../../../lib/cart-store";
import { BRAND } from "../../../theme";
import { useRequireSession } from "../../../lib/use-require-session";
import { validateRecipientPhone } from "../../../lib/phone";
import { AddressSearchBox } from "../../../components/AddressSearchBox";
import { useDeliveryLocation } from "../../../lib/location-store";
import { reverseGeocode } from "../../../lib/places-api";
import { toAddressFormFields } from "../../../lib/place";
import type { PlaceDetails } from "../../../lib/places-parse";
import { computeCheckoutTotals, formatPaise, type CouponPreview } from "../../../lib/coupon-model";

type PaymentMethod = "mock_card" | "mock_upi" | "mock_cod";

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: "mock_card", label: "Mock Card", icon: "💳" },
  { value: "mock_upi", label: "Mock UPI", icon: "📱" },
  { value: "mock_cod", label: "Cash on Delivery", icon: "💵" },
];

function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : "Enter a valid email address";
}

function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

function validateCard(cardNumber: string, expiry: string, cardholderName: string): string | null {
  if (digitsOnly(cardNumber).length !== 16) return "Card number must be 16 digits";
  const match = /^(\d{2})\/(\d{2})$/.exec(expiry.trim());
  if (!match) return "Expiry must be in MM/YY format";
  if (cardholderName.trim().length === 0) return "Cardholder name is required";
  return null;
}

function validateUpi(upiId: string): string | null {
  return /^[\w.\-]+@[\w]+$/.test(upiId.trim()) ? null : "Enter a valid UPI ID, e.g. name@bank";
}

// Row-based tappable section matching UberEats checkout: a collapsed summary
// row that expands in place to reveal its fields — no new bottom-sheet
// dependency needed since this screen already scrolls.
function CheckoutRow({
  icon,
  title,
  summary,
  expanded,
  onToggle,
  children,
  error,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  error?: string | null;
}) {
  return (
    <View style={styles.section}>
      <Pressable style={styles.rowHeader} onPress={onToggle}>
        <Ionicons name={icon} size={20} color={BRAND.colors.ink} style={styles.rowIcon} />
        <View style={styles.rowHeaderText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.rowSummary} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={BRAND.colors.inkMuted}
        />
      </Pressable>
      {error && !expanded && <Text style={styles.errorTextSmall}>{error}</Text>}
      {expanded && <View style={styles.rowBody}>{children}</View>}
    </View>
  );
}

export default function CheckoutScreen() {
  useRequireSession("/login/customer");
  const router = useRouter();
  const { storeId, items, subtotalPaise, orderNote, setOrderNote, clearCart } = useCart();
  const [deliveryFeePaise, setDeliveryFeePaise] = useState<number | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [pincode, setPincode] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("mock_card");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { location: savedLocation } = useDeliveryLocation();
  // Point chosen through address search; kept when Address 1 is edited.
  const [pickedPoint, setPickedPoint] = useState<{ lat: number; lng: number } | null>(null);
  // The saved point, only while the fields still hold what "Use my saved location" filled in.
  const [savedPoint, setSavedPoint] = useState<{ lat: number; lng: number } | null>(null);
  // Bumped on every pick or manual address edit so a late reverse geocode cannot overwrite newer input.
  const fillSeq = useRef(0);
  const [savedBusy, setSavedBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which row is currently expanded — only one at a time, UberEats-style.
  const [expandedRow, setExpandedRow] = useState<"address" | "instructions" | "payment" | null>(
    null
  );
  function toggleRow(row: "address" | "instructions" | "payment") {
    setExpandedRow((prev) => (prev === row ? null : row));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData.session?.user.email ?? "";
      if (!cancelled) setRecipientEmail(email);

      const userId = sessionData.session?.user.id;
      if (userId) {
        const { data: profile } = await supabase.from("users").select("full_name").eq("id", userId).single();
        if (!cancelled) setRecipientName(profile?.full_name ?? "");
      }
      if (!cancelled) setProfileLoaded(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function applyFields(fields: { line1: string; city: string; state: string; pincode: string }) {
    setLine1(fields.line1);
    setCity(fields.city);
    setStateField(fields.state);
    setPincode(fields.pincode);
  }

  function handlePlacePicked(place: PlaceDetails) {
    // Address 2 stays as typed; a geocoder cannot know a flat number or landmark.
    applyFields(toAddressFormFields(place.components, place.formattedAddress));
    fillSeq.current += 1;
    setPickedPoint({ lat: place.lat, lng: place.lng });
    setSavedPoint(null);
  }

  function editAddressField(setter: (value: string) => void) {
    return (value: string) => {
      fillSeq.current += 1;
      setSavedPoint(null);
      setter(value);
    };
  }

  async function handleUseSavedLocation() {
    if (!savedLocation || savedBusy) return;
    setSavedBusy(true);
    const point = { lat: savedLocation.lat, lng: savedLocation.lng };
    const mine = ++fillSeq.current;
    setPickedPoint(null);
    setSavedPoint(point);
    try {
      const result = await reverseGeocode(point.lat, point.lng);
      if (mine === fillSeq.current) applyFields(toAddressFormFields(result.components, savedLocation.label));
    } catch {
      // Reverse geocoding is Android-native only: fill just the label and keep the point.
      if (mine === fillSeq.current) setLine1(savedLocation.label);
    } finally {
      setSavedBusy(false);
    }
  }

  // Promo code and wallet credit: screen state only, never persisted.
  const [promoInput, setPromoInput] = useState("");
  const [appliedRaw, setAppliedCoupon] = useState<{ code: string; discountPaise: number; subtotalPaise: number; storeId: string } | null>(null);
  // A coupon only counts while the cart it was checked against is unchanged.
  const appliedCoupon =
    appliedRaw && appliedRaw.subtotalPaise === subtotalPaise && appliedRaw.storeId === storeId ? appliedRaw : null;
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [creditBalancePaise, setCreditBalancePaise] = useState(0);
  const [useCredit, setUseCredit] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState<{ code: string; summary: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ balancePaise: number }>("/api/customer/wallet")
      .then((w) => {
        if (!cancelled && typeof w.balancePaise === "number") setCreditBalancePaise(w.balancePaise);
      })
      .catch(() => {
        // Wallet is optional at checkout: no balance shown if it cannot load.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!storeId) return;
    apiFetch<{ coupons: { code: string; summary: string }[] }>(
      `/api/customer/coupons/available?storeId=${encodeURIComponent(storeId)}`
    )
      .then((r) => {
        if (!cancelled) setAvailableCoupons(Array.isArray(r.coupons) ? r.coupons : []);
      })
      .catch(() => {
        // Suggestions are optional.
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  async function applyPromo(rawCode: string) {
    if (!storeId || promoBusy) return;
    const code = rawCode.trim();
    if (!code) return;
    setPromoBusy(true);
    setPromoMessage(null);
    try {
      const preview = await apiFetch<CouponPreview>("/api/customer/coupons/preview", {
        method: "POST",
        body: { code, storeId, subtotalPaise },
      });
      if (preview.ok) {
        setAppliedCoupon({ code: preview.code, discountPaise: preview.discountPaise, subtotalPaise, storeId });
        setPromoInput(preview.code);
      } else {
        setAppliedCoupon(null);
        setPromoMessage(preview.message);
      }
    } catch (err) {
      setAppliedCoupon(null);
      setPromoMessage(err instanceof ApiError ? err.message : "Could not check the promo code");
    } finally {
      setPromoBusy(false);
    }
  }

  function removePromo() {
    setAppliedCoupon(null);
    setPromoMessage(null);
    setPromoInput("");
  }

  useEffect(() => {
    let cancelled = false;
    if (!storeId) {
      setDeliveryFeePaise(null);
      setFeeError(null);
      return;
    }
    async function loadFee() {
      const { data: store, error: storeError } = await supabase
        .from("stores")
        .select("delivery_fee_paise")
        .eq("id", storeId)
        .single();
      if (cancelled) return;
      if (storeError || !store) {
        setFeeError(storeError?.message ?? "Couldn't load delivery fee");
      } else {
        setDeliveryFeePaise(store.delivery_fee_paise);
      }
    }
    loadFee();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  if (!profileLoaded) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND.colors.primary} />
      </View>
    );
  }

  if (!storeId || items.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.mutedText}>Your cart is empty.</Text>
      </View>
    );
  }

  if (feeError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Couldn&apos;t load delivery fee: {feeError}</Text>
      </View>
    );
  }

  if (deliveryFeePaise === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={BRAND.colors.primary} />
      </View>
    );
  }

  const totals = computeCheckoutTotals({
    subtotalPaise,
    deliveryFeePaise,
    discountPaise: appliedCoupon?.discountPaise ?? 0,
    creditBalancePaise,
    useCredit,
  });
  const total = totals.totalPaise / 100;

  const recipientNameError = recipientName.trim().length === 0 ? "Name is required" : null;
  const recipientEmailError = validateEmail(recipientEmail);
  const recipientPhoneError = validateRecipientPhone(recipientPhone);
  const paymentFieldError =
    paymentMethod === "mock_card"
      ? validateCard(cardNumber, cardExpiry, cardholderName)
      : paymentMethod === "mock_upi"
        ? validateUpi(upiId)
        : null;
  const addressFieldError =
    line1.trim().length === 0 || city.trim().length === 0 || stateField.trim().length === 0 || pincode.trim().length === 0
      ? "Address 1, City, State, and Pincode are required"
      : null;
  const canPlaceOrder =
    !recipientNameError && !recipientEmailError && !recipientPhoneError && !paymentFieldError && !addressFieldError && !submitting;

  const addressSummary =
    line1.trim().length > 0
      ? [line1.trim(), city.trim()].filter(Boolean).join(", ")
      : "Add a delivery address";
  const paymentSummary = PAYMENT_METHODS.find((m) => m.value === paymentMethod)?.label ?? "";
  const instructionsSummary = orderNote.trim().length > 0 ? orderNote.trim() : "Add delivery instructions (optional)";

  async function handlePlaceOrder() {
    if (!canPlaceOrder || !storeId) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch<{ orderId: string; paymentStatus: "success" | "failed" }>(
        "/api/cart/checkout",
        {
          method: "POST",
          body: {
            storeId,
            items: items.map((i) => ({
              productId: i.menuItemId,
              quantity: i.quantity,
              selectedOptionIds: i.selectedOptions.map((o) => o.optionId),
              specialInstructions: i.specialInstructions,
            })),
            deliveryAddress: {
              label: "Delivery address",
              // Picked point, else the saved point only if the fields were filled from it, else
              // 0/0 (the API only requires finite numbers).
              lat: (pickedPoint ?? savedPoint)?.lat ?? 0,
              lng: (pickedPoint ?? savedPoint)?.lng ?? 0,
              line1: line1.trim(),
              line2: line2.trim() === "" ? null : line2.trim(),
              city: city.trim(),
              state: stateField.trim(),
              pincode: pincode.trim(),
            },
            paymentMethod,
            expectedTotal: total,
            couponCode: appliedCoupon?.code ?? null,
            useCredit,
            deliveryNote: orderNote.trim() === "" ? null : orderNote,
            recipientName: recipientName.trim(),
            recipientEmail: recipientEmail.trim(),
            recipientPhone: recipientPhone.trim(),
            cardFields: paymentMethod === "mock_card" ? { cardNumber, expiry: cardExpiry, cardholderName } : undefined,
            upiFields: paymentMethod === "mock_upi" ? { upiId } : undefined,
          },
        }
      );
      if (result.paymentStatus === "success") {
        clearCart();
      }
      router.replace(`/customer/orders/${result.orderId}` as never);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error — please try again");
      // The API's couponError is not exposed by apiFetch; on a 409 re-check the coupon and drop it if it fails.
      if (err instanceof ApiError && err.status === 409 && appliedCoupon && storeId) {
        try {
          const recheck = await apiFetch<CouponPreview>("/api/customer/coupons/preview", {
            method: "POST",
            body: { code: appliedCoupon.code, storeId, subtotalPaise },
          });
          if (!recheck.ok) {
            setAppliedCoupon(null);
            setPromoMessage(recheck.message);
          }
        } catch {
          // Leave the coupon as is; the error above is already shown.
        }
      }
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Checkout</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact details</Text>
          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={recipientName}
            onChangeText={setRecipientName}
            placeholder="Who's this order for?"
          />
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={recipientEmail}
            onChangeText={setRecipientEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            keyboardType="phone-pad"
            placeholder="10-digit mobile number"
          />
          {recipientPhone.length > 0 && recipientPhoneError && (
            <Text style={styles.errorText}>{recipientPhoneError}</Text>
          )}
        </View>

        <CheckoutRow
          icon="location-outline"
          title="Delivery address"
          summary={addressSummary}
          expanded={expandedRow === "address"}
          onToggle={() => toggleRow("address")}
          error={addressFieldError}
        >
          <Text style={styles.label}>Search for your address</Text>
          <AddressSearchBox onPick={handlePlacePicked} />
          {savedLocation && (
            <Pressable
              style={styles.savedButton}
              onPress={() => void handleUseSavedLocation()}
              disabled={savedBusy}
              accessibilityRole="button"
            >
              {savedBusy ? (
                <ActivityIndicator size="small" color={BRAND.colors.primary} />
              ) : (
                <Ionicons name="navigate" size={16} color={BRAND.colors.primary} />
              )}
              <Text style={styles.savedButtonText}>Use my saved location</Text>
            </Pressable>
          )}
          <Text style={styles.label}>Address 1</Text>
          <TextInput style={styles.input} value={line1} onChangeText={editAddressField(setLine1)} placeholder="House/flat no., building, street" />
          <Text style={styles.label}>Address 2</Text>
          <TextInput style={styles.input} value={line2} onChangeText={setLine2} placeholder="Landmark, area (optional)" />
          <Text style={styles.label}>City</Text>
          <TextInput style={styles.input} value={city} onChangeText={editAddressField(setCity)} />
          <Text style={styles.label}>State</Text>
          <TextInput style={styles.input} value={stateField} onChangeText={setStateField} />
          <Text style={styles.label}>Pincode</Text>
          <TextInput style={styles.input} value={pincode} onChangeText={editAddressField(setPincode)} keyboardType="number-pad" />
        </CheckoutRow>

        <CheckoutRow
          icon="chatbubble-outline"
          title="Delivery instructions"
          summary={instructionsSummary}
          expanded={expandedRow === "instructions"}
          onToggle={() => toggleRow("instructions")}
        >
          <TextInput
            style={[styles.input, styles.textArea]}
            value={orderNote}
            onChangeText={setOrderNote}
            placeholder="e.g. Leave at the door, call on arrival…"
            multiline
          />
        </CheckoutRow>

        <CheckoutRow
          icon="card-outline"
          title="Payment method"
          summary={paymentSummary}
          expanded={expandedRow === "payment"}
          onToggle={() => toggleRow("payment")}
          error={paymentFieldError}
        >
          {PAYMENT_METHODS.map((m) => (
            <View key={m.value}>
              <Pressable
                style={[styles.paymentRow, paymentMethod === m.value && styles.paymentRowActive]}
                onPress={() => setPaymentMethod(m.value)}
              >
                <Text style={styles.paymentIcon}>{m.icon}</Text>
                <Text style={styles.paymentLabel}>{m.label}</Text>
              </Pressable>
              {paymentMethod === m.value && m.value === "mock_card" && (
                <View style={styles.subFields}>
                  <TextInput
                    style={styles.input}
                    value={cardNumber}
                    onChangeText={setCardNumber}
                    placeholder="Card number (16 digits)"
                    keyboardType="number-pad"
                  />
                  <View style={styles.row}>
                    <TextInput
                      style={[styles.input, styles.inputSmall]}
                      value={cardExpiry}
                      onChangeText={setCardExpiry}
                      placeholder="MM/YY"
                    />
                    <TextInput
                      style={[styles.input, styles.inputFlex]}
                      value={cardholderName}
                      onChangeText={setCardholderName}
                      placeholder="Cardholder name"
                    />
                  </View>
                </View>
              )}
              {paymentMethod === m.value && m.value === "mock_upi" && (
                <View style={styles.subFields}>
                  <TextInput style={styles.input} value={upiId} onChangeText={setUpiId} placeholder="UPI ID, e.g. name@bank" autoCapitalize="none" />
                </View>
              )}
            </View>
          ))}
        </CheckoutRow>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Promo code</Text>
          {appliedCoupon ? (
            <View style={styles.summaryRow}>
              <Text style={styles.promoApplied}>
                {appliedCoupon.code} applied: -{formatPaise(totals.discountPaise)}
              </Text>
              <Pressable onPress={removePromo} accessibilityRole="button">
                <Text style={styles.savedButtonText}>Remove</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.row}>
                <TextInput
                  style={[styles.input, styles.inputFlex]}
                  value={promoInput}
                  onChangeText={(v) => {
                    setPromoInput(v);
                    setPromoMessage(null);
                  }}
                  placeholder="Enter promo code"
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
                <Pressable
                  style={[styles.applyButton, (promoBusy || promoInput.trim() === "") && styles.placeOrderButtonDisabled]}
                  onPress={() => void applyPromo(promoInput)}
                  disabled={promoBusy || promoInput.trim() === ""}
                  accessibilityRole="button"
                >
                  {promoBusy ? (
                    <ActivityIndicator size="small" color={BRAND.colors.surface} />
                  ) : (
                    <Text style={styles.applyButtonText}>Apply</Text>
                  )}
                </Pressable>
              </View>
              {availableCoupons.length > 0 && (
                <View style={styles.chipWrap}>
                  {availableCoupons.map((c) => (
                    <Pressable
                      key={c.code}
                      style={styles.chip}
                      onPress={() => void applyPromo(c.code)}
                      disabled={promoBusy}
                      accessibilityRole="button"
                    >
                      <Text style={styles.chipCode}>{c.code}</Text>
                      <Text style={styles.chipSummary}>{c.summary}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
          {promoMessage && <Text style={styles.errorText}>{promoMessage}</Text>}
          {creditBalancePaise > 0 && (
            <View style={[styles.summaryRow, styles.creditRow]}>
              <View style={styles.rowHeaderText}>
                <Text style={styles.label}>Use wallet credit</Text>
                <Text style={styles.rowSummary}>Balance {formatPaise(creditBalancePaise)}</Text>
              </View>
              <Switch value={useCredit} onValueChange={setUseCredit} />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Order summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.mutedText}>Subtotal</Text>
            <Text style={styles.summaryValue}>₹{(subtotalPaise / 100).toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.mutedText}>Delivery fee</Text>
            <Text style={styles.summaryValue}>₹{(deliveryFeePaise / 100).toFixed(2)}</Text>
          </View>
          {appliedCoupon && totals.discountPaise > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.mutedText}>Discount ({appliedCoupon.code})</Text>
              <Text style={styles.summaryValue}>-{formatPaise(totals.discountPaise)}</Text>
            </View>
          )}
          {totals.creditPaise > 0 && (
            <View style={styles.summaryRow}>
              <Text style={styles.mutedText}>Wallet credit</Text>
              <Text style={styles.summaryValue}>-{formatPaise(totals.creditPaise)}</Text>
            </View>
          )}
          <View style={styles.summaryRow}>
            <Text style={styles.sectionTitle}>Total</Text>
            <Text style={styles.sectionTitle}>₹{total.toFixed(2)}</Text>
          </View>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        {/* Spacer so the last section isn't hidden behind the pinned button */}
        <View style={{ height: 72 }} />
      </ScrollView>

      <View style={styles.pinnedBar}>
        <Pressable
          style={[styles.placeOrderButton, !canPlaceOrder && styles.placeOrderButtonDisabled]}
          onPress={handlePlaceOrder}
          disabled={!canPlaceOrder}
        >
          {submitting ? (
            <ActivityIndicator color={BRAND.colors.surface} />
          ) : (
            <Text style={styles.placeOrderButtonText}>Place order · ₹{total.toFixed(2)}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.colors.background },
  container: { padding: 16, gap: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: BRAND.colors.background },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  section: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 16,
    gap: 8,
  },
  rowHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowIcon: { width: 20 },
  rowHeaderText: { flex: 1, gap: 2 },
  rowSummary: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted },
  rowBody: { gap: 8, paddingTop: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: BRAND.colors.inkMuted + "22" },
  sectionTitle: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 15, color: BRAND.colors.ink },
  label: { fontFamily: BRAND.fonts.bodyMedium, fontSize: 13, color: BRAND.colors.ink },
  input: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "33",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.ink,
  },
  savedButton: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingVertical: 4 },
  savedButtonText: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 14, color: BRAND.colors.primaryTextSafe },
  textArea: { minHeight: 72, textAlignVertical: "top" },
  inputSmall: { width: 96 },
  inputFlex: { flex: 1 },
  row: { flexDirection: "row", gap: 8 },
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "33",
    borderRadius: BRAND.radius,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  paymentRowActive: { borderColor: BRAND.colors.primary, backgroundColor: BRAND.colors.primary + "0d" },
  paymentIcon: { fontSize: 18 },
  paymentLabel: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.ink },
  subFields: { gap: 8, paddingTop: 8, marginTop: 8, borderTopWidth: 1, borderTopColor: BRAND.colors.inkMuted + "22" },
  promoApplied: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.primaryTextSafe, flex: 1 },
  applyButton: {
    backgroundColor: BRAND.colors.primaryTextSafe,
    borderRadius: 999,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  applyButtonText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.surface },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: BRAND.colors.primary,
    borderRadius: BRAND.radius,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
  },
  chipCode: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 13, color: BRAND.colors.primaryTextSafe },
  chipSummary: { fontFamily: BRAND.fonts.body, fontSize: 11, color: BRAND.colors.inkMuted },
  creditRow: { alignItems: "center", paddingTop: 8 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryValue: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.ink },
  mutedText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted },
  errorText: { fontFamily: BRAND.fonts.body, color: "#dc2626" },
  errorTextSmall: { fontFamily: BRAND.fonts.body, fontSize: 12, color: "#dc2626" },
  pinnedBar: {
    padding: 16,
    paddingBottom: 24,
    backgroundColor: BRAND.colors.background,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.inkMuted + "22",
  },
  placeOrderButton: {
    backgroundColor: BRAND.colors.accentTextSafe,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  placeOrderButtonDisabled: { opacity: 0.5 },
  placeOrderButtonText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.surface },
});
