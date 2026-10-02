import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { BRAND } from "../theme";
import { formatPaise, type OrderDetail } from "../lib/order-detail";
import { STATUS_LABEL } from "../lib/order-status";
import { OrderStatusPill } from "./OrderStatusPill";
import { OrderItemsList } from "./OrderItemsList";

// Mirrors components/delivery/DeliveryOrderCard.tsx on the web. The server
// redacts recipient fields by scope, so empty values are omitted, never
// rendered as empty labels.
export function DeliveryOrderCard({
  order,
  scope,
  busy = false,
  onClaim,
  onAdvance,
}: {
  order: OrderDetail;
  scope: "available" | "active" | "history";
  busy?: boolean;
  onClaim?: () => void;
  onAdvance?: () => void;
}) {
  const totalQty = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const advanceLabel = order.status === "assigned" ? "Mark picked up" : null;
  const historyWhen = order.deliveredAt ?? order.placedAt;
  const phone = order.recipientPhone.trim();

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.orderId}>#{order.id.slice(0, 8)}</Text>
          <OrderStatusPill status={order.status} />
        </View>
        <Text style={styles.orderId}>{formatPaise(Math.round(order.total * 100))}</Text>
      </View>

      <View style={styles.pickupBlock}>
        <Text style={styles.blockTitle}>Pickup — {order.storeName}</Text>
        <Text style={styles.addressText}>
          {order.storeAddress ? order.storeAddress.lines.join(", ") : "Address not on file"}
        </Text>
      </View>

      {scope === "available" && (
        <Text style={styles.muted}>Customer details appear after you accept.</Text>
      )}

      {scope === "active" && (
        <View style={styles.dropoffBlock}>
          <Text style={styles.blockTitle}>Drop-off</Text>
          {order.recipientName.trim() ? (
            <Text style={styles.recipientName}>{order.recipientName}</Text>
          ) : null}
          {phone ? (
            phone.startsWith("+") ? (
              <Pressable onPress={() => Linking.openURL(`tel:${phone}`).catch(() => {})}>
                <Text style={styles.phoneLink}>{phone}</Text>
              </Pressable>
            ) : (
              <Text style={styles.muted}>{phone}</Text>
            )
          ) : null}
          {order.address ? (
            <>
              {order.address.label ? <Text style={styles.addressLabel}>{order.address.label}</Text> : null}
              <Text style={styles.addressText}>{order.address.lines.join(", ")}</Text>
            </>
          ) : (
            <Text style={styles.addressText}>No delivery address on file</Text>
          )}
          {order.deliveryNote ? <Text style={styles.muted}>Note: “{order.deliveryNote}”</Text> : null}
        </View>
      )}

      {scope === "history" && (
        <Text style={styles.muted}>
          {order.status === "delivered" && order.recipientName.trim()
            ? `Delivered to ${order.recipientName}`
            : STATUS_LABEL[order.status]}
          {" · "}
          {new Date(historyWhen).toLocaleString()}
        </Text>
      )}

      {scope === "history" ? (
        <Text style={styles.itemsSummary} numberOfLines={2}>
          {totalQty} {totalQty === 1 ? "item" : "items"}: {order.items.map((item) => item.name).join(", ")}
        </Text>
      ) : (
        <OrderItemsList items={order.items} showLineTotals={false} />
      )}

      {scope === "available" && onClaim && (
        <Pressable
          style={[styles.acceptButton, busy && styles.disabled]}
          onPress={onClaim}
          disabled={busy}
        >
          <Text style={styles.buttonText}>Accept</Text>
        </Pressable>
      )}

      {scope === "active" && advanceLabel && onAdvance && (
        <Pressable
          style={[styles.advanceButton, busy && styles.disabled]}
          onPress={onAdvance}
          disabled={busy}
        >
          <Text style={styles.buttonText}>{advanceLabel}</Text>
        </Pressable>
      )}

      {scope === "active" && order.status === "picked_up" && (
        <Text style={styles.muted}>Customer is receiving the order…</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  orderId: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 16, color: BRAND.colors.ink },
  pickupBlock: {
    borderRadius: 10,
    padding: 8,
    gap: 2,
    backgroundColor: BRAND.colors.primaryTint,
  },
  dropoffBlock: {
    borderRadius: 10,
    padding: 8,
    gap: 2,
    backgroundColor: BRAND.colors.primaryTint,
  },
  blockTitle: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 14,
    color: BRAND.colors.ink,
    flexShrink: 1,
  },
  recipientName: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 14, color: BRAND.colors.ink },
  addressLabel: { fontFamily: BRAND.fonts.bodyMedium, fontSize: 14, color: BRAND.colors.ink },
  phoneLink: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 14,
    color: BRAND.colors.primaryTextSafe,
    textDecorationLine: "underline",
  },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.inkMuted, flexShrink: 1 },
  addressText: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.ink, flexShrink: 1 },
  itemsSummary: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.ink },
  acceptButton: {
    alignSelf: "flex-start",
    backgroundColor: BRAND.colors.accentTextSafe,
    borderRadius: BRAND.radiusPill,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  advanceButton: {
    alignSelf: "flex-start",
    backgroundColor: BRAND.colors.primaryTextSafe,
    borderRadius: BRAND.radiusPill,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  disabled: { opacity: 0.5 },
  buttonText: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 14, color: BRAND.colors.surface },
});
