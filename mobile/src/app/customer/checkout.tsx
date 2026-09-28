import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { apiFetch, ApiError } from "../../../lib/api";
import { useCart } from "../../../lib/cart-store";
import { BRAND } from "../../../theme";

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

export default function CheckoutScreen() {
  const router = useRouter();
  const { storeId, items, subtotalPaise, orderNote, clearCart } = useCart();
  const [deliveryFeePaise, setDeliveryFeePaise] = useState<number | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
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
  const [error, setError] = useState<string | null>(null);

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

  const totalPaise = subtotalPaise + deliveryFeePaise;
  const total = totalPaise / 100;

  const recipientNameError = recipientName.trim().length === 0 ? "Name is required" : null;
  const recipientEmailError = validateEmail(recipientEmail);
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
    !recipientNameError && !recipientEmailError && !paymentFieldError && !addressFieldError && !submitting;

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
              // No Google Maps key available (matches web's stub) — send a
              // fixed placeholder lat/lng; the API only requires finite
              // numbers, it doesn't validate real-world plausibility.
              lat: 0,
              lng: 0,
              line1: line1.trim(),
              line2: line2.trim() === "" ? null : line2.trim(),
              city: city.trim(),
              state: stateField.trim(),
              pincode: pincode.trim(),
            },
            paymentMethod,
            expectedTotal: total,
            deliveryNote: orderNote.trim() === "" ? null : orderNote,
            recipientName: recipientName.trim(),
            recipientEmail: recipientEmail.trim(),
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
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Delivery address</Text>
        <Text style={styles.label}>Address 1</Text>
        <TextInput style={styles.input} value={line1} onChangeText={setLine1} placeholder="House/flat no., building, street" />
        <Text style={styles.label}>Address 2</Text>
        <TextInput style={styles.input} value={line2} onChangeText={setLine2} placeholder="Landmark, area (optional)" />
        <Text style={styles.label}>City</Text>
        <TextInput style={styles.input} value={city} onChangeText={setCity} />
        <Text style={styles.label}>State</Text>
        <TextInput style={styles.input} value={stateField} onChangeText={setStateField} />
        <Text style={styles.label}>Pincode</Text>
        <TextInput style={styles.input} value={pincode} onChangeText={setPincode} keyboardType="number-pad" />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment method</Text>
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
        <View style={styles.summaryRow}>
          <Text style={styles.sectionTitle}>Total</Text>
          <Text style={styles.sectionTitle}>₹{total.toFixed(2)}</Text>
        </View>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable
        style={[styles.placeOrderButton, !canPlaceOrder && styles.placeOrderButtonDisabled]}
        onPress={handlePlaceOrder}
        disabled={!canPlaceOrder}
      >
        {submitting ? (
          <ActivityIndicator color={BRAND.colors.surface} />
        ) : (
          <Text style={styles.placeOrderButtonText}>Place order</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, backgroundColor: BRAND.colors.background },
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
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryValue: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.ink },
  mutedText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted },
  errorText: { fontFamily: BRAND.fonts.body, color: "#dc2626" },
  placeOrderButton: {
    backgroundColor: BRAND.colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  placeOrderButtonDisabled: { opacity: 0.5 },
  placeOrderButtonText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.surface },
});
