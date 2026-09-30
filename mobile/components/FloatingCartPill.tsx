import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useCart } from "../lib/cart-store";
import { BRAND } from "../theme";

// Floating "N item · View cart · ₹total" pill shown above the tab bar on
// Home/Store-detail screens whenever the cart has items — mirrors the real
// UberEats app's floating cart pill pattern (mobile UberEats redesign spec,
// Phase 1). Not shown on Cart/Checkout/Account/Orders.
export function FloatingCartPill() {
  const router = useRouter();
  const { items, subtotalPaise } = useCart();
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  if (count === 0) return null;

  return (
    <Pressable style={styles.container} onPress={() => router.push("/customer/cart")}>
      <Text style={styles.text} numberOfLines={1}>
        {count} {count === 1 ? "item" : "items"} · View cart · ₹{(subtotalPaise / 100).toFixed(2)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 12,
    backgroundColor: BRAND.colors.primaryTextSafe,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  text: {
    fontFamily: BRAND.fonts.bodySemiBold,
    color: BRAND.colors.surface,
    fontSize: 14,
  },
});
