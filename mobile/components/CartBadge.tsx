import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useCart } from "../lib/cart-store";
import { BRAND } from "../theme";

// Floating "View cart" pill shown on Home/Store screens whenever the cart
// has items, mirroring the web's always-visible CartPanel in a mobile-
// appropriate form (a single sheet screen, not a persistent sidebar).
export function CartBadge() {
  const router = useRouter();
  const { items, subtotalPaise, storeName } = useCart();
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  if (count === 0) return null;

  return (
    <Pressable style={styles.container} onPress={() => router.push("/customer/cart")}>
      <View style={styles.left}>
        <Text style={styles.count}>{count}</Text>
        <Text style={styles.storeName} numberOfLines={1}>
          {storeName}
        </Text>
      </View>
      <Text style={styles.cta}>View cart · ₹{(subtotalPaise / 100).toFixed(2)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: BRAND.colors.primary,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
  },
  count: {
    fontFamily: BRAND.fonts.bodySemiBold,
    color: BRAND.colors.surface,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 999,
    width: 22,
    height: 22,
    textAlign: "center",
    lineHeight: 22,
    fontSize: 12,
  },
  storeName: {
    fontFamily: BRAND.fonts.bodyMedium,
    color: BRAND.colors.surface,
    fontSize: 13,
    flexShrink: 1,
  },
  cta: {
    fontFamily: BRAND.fonts.bodySemiBold,
    color: BRAND.colors.surface,
    fontSize: 13,
  },
});
