import { View, Text, TextInput, Pressable, FlatList, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useCart, CartItem } from "../../../lib/cart-store";
import { useDeliveryFee } from "../../../lib/use-delivery-fee";
import { BRAND } from "../../../theme";
import { useRequireSession } from "../../../lib/use-require-session";

// Mirrors components/CartPanel.tsx on the web, as a dedicated screen rather
// than a persistent sidebar (no room for one on a phone). Same paise-
// arithmetic total calc via useDeliveryFee.
export default function CartScreen() {
  useRequireSession("/login/customer");
  const router = useRouter();
  const {
    storeName,
    storeId,
    items,
    subtotalPaise,
    orderNote,
    updateQuantity,
    removeItem,
    setSpecialInstructions,
    setOrderNote,
    clearCart,
  } = useCart();
  const { deliveryFeePaise, loading: feeLoading } = useDeliveryFee(storeId);

  const totalPaise = deliveryFeePaise !== null ? subtotalPaise + deliveryFeePaise : null;

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.mutedText}>Your cart is empty.</Text>
        <Pressable style={styles.secondaryButton} onPress={() => router.push("/customer/home")}>
          <Text style={styles.secondaryButtonText}>Browse restaurants</Text>
        </Pressable>
      </View>
    );
  }

  function renderItem({ item }: { item: CartItem }) {
    return (
      <View style={styles.itemRow}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.itemImage} />
        ) : (
          <View style={[styles.itemImage, styles.itemImageFallback]} />
        )}
        <View style={styles.itemBody}>
          <Text style={styles.itemName}>{item.name}</Text>
          {item.selectedOptions.length > 0 && (
            <Text style={styles.itemOptions}>
              {item.selectedOptions.map((o) => o.optionName).join(", ")}
            </Text>
          )}
          <View style={styles.qtyRow}>
            <Pressable
              onPress={() => updateQuantity(item.lineId, item.quantity - 1)}
              style={styles.qtyButton}
            >
              <Text style={styles.qtyButtonText}>−</Text>
            </Pressable>
            <Text style={styles.qtyValue}>{item.quantity}</Text>
            <Pressable
              onPress={() => updateQuantity(item.lineId, item.quantity + 1)}
              style={styles.qtyButton}
            >
              <Text style={styles.qtyButtonText}>+</Text>
            </Pressable>
            <Pressable onPress={() => removeItem(item.lineId)} style={{ marginLeft: 8 }}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.noteInput}
            value={item.specialInstructions ?? ""}
            onChangeText={(text) => setSpecialInstructions(item.lineId, text)}
            placeholder="Add a note (optional)"
            placeholderTextColor={BRAND.colors.inkMuted}
            maxLength={500}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.storeName}>{storeName}</Text>
      <FlatList
        data={items}
        keyExtractor={(i) => i.lineId}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListFooterComponent={
          <View style={styles.orderNoteWrap}>
            <Text style={styles.orderNoteLabel}>Order note</Text>
            <TextInput
              style={styles.orderNoteInput}
              value={orderNote}
              onChangeText={setOrderNote}
              placeholder="Add a note for the whole order (e.g. gate code, leave at door)"
              placeholderTextColor={BRAND.colors.inkMuted}
              multiline
              maxLength={500}
            />
            <Pressable onPress={clearCart}>
              <Text style={styles.clearText}>Clear cart</Text>
            </Pressable>
          </View>
        }
      />

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Subtotal</Text>
          <Text style={styles.summaryValue}>₹{(subtotalPaise / 100).toFixed(2)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Delivery fee</Text>
          <Text style={styles.summaryValue}>
            {feeLoading ? "…" : deliveryFeePaise !== null ? `₹${(deliveryFeePaise / 100).toFixed(2)}` : "—"}
          </Text>
        </View>
        {totalPaise !== null && (
          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>₹{(totalPaise / 100).toFixed(2)}</Text>
          </View>
        )}
        <Pressable
          style={styles.checkoutButton}
          onPress={() => router.push("/customer/checkout")}
        >
          <Text style={styles.checkoutButtonText}>Checkout</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
    backgroundColor: BRAND.colors.background,
  },
  mutedText: {
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.inkMuted,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    fontFamily: BRAND.fonts.bodyMedium,
    color: BRAND.colors.ink,
  },
  storeName: {
    fontFamily: BRAND.fonts.heading,
    fontSize: 18,
    color: BRAND.colors.ink,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  listContent: {
    padding: 16,
    paddingBottom: 8,
  },
  itemRow: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.inkMuted + "15",
  },
  itemImage: {
    width: 56,
    height: 56,
    borderRadius: BRAND.radius,
  },
  itemImageFallback: {
    backgroundColor: BRAND.colors.accent + "20",
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 14,
    color: BRAND.colors.ink,
  },
  itemOptions: {
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  qtyButton: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "40",
    borderRadius: 999,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonText: {
    fontFamily: BRAND.fonts.bodySemiBold,
    color: BRAND.colors.ink,
  },
  qtyValue: {
    fontFamily: BRAND.fonts.bodyMedium,
    color: BRAND.colors.ink,
    minWidth: 14,
    textAlign: "center",
  },
  removeText: {
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: "#c0392b",
  },
  noteInput: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "25",
    borderRadius: BRAND.radius,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: BRAND.colors.ink,
  },
  orderNoteWrap: {
    marginTop: 8,
    gap: 6,
  },
  orderNoteLabel: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 13,
    color: BRAND.colors.ink,
  },
  orderNoteInput: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "25",
    borderRadius: BRAND.radius,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 60,
    textAlignVertical: "top",
    fontFamily: BRAND.fonts.body,
    fontSize: 13,
    color: BRAND.colors.ink,
  },
  clearText: {
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    textDecorationLine: "underline",
  },
  summary: {
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.inkMuted + "15",
    backgroundColor: BRAND.colors.surface,
    padding: 16,
    gap: 4,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryLabel: {
    fontFamily: BRAND.fonts.body,
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  summaryValue: {
    fontFamily: BRAND.fonts.body,
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  totalLabel: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 14,
    color: BRAND.colors.ink,
  },
  totalValue: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 14,
    color: BRAND.colors.ink,
  },
  checkoutButton: {
    backgroundColor: BRAND.colors.primary,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  checkoutButtonDisabled: {
    opacity: 0.5,
  },
  checkoutButtonText: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 15,
    color: BRAND.colors.surface,
  },
  checkoutNote: {
    fontFamily: BRAND.fonts.body,
    fontSize: 11,
    color: BRAND.colors.inkMuted,
    textAlign: "center",
    marginTop: 6,
  },
});
