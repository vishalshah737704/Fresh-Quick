import { View, Text, StyleSheet } from "react-native";
import { BRAND } from "../theme";
import { formatPaise, lineTotalPaise, type OrderDetailItem } from "../lib/order-detail";
import { ItemThumb } from "./ItemThumb";

export function OrderItemsList({
  items,
  showLineTotals = true,
}: {
  items: OrderDetailItem[];
  showLineTotals?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <View style={styles.list}>
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <ItemThumb url={item.imageUrl} name={item.name} />
          <View style={styles.textColumn}>
            <Text style={styles.name}>
              {item.quantity}× {item.name}
            </Text>
            {item.options.length > 0 && (
              <Text style={styles.muted}>{item.options.map((option) => option.optionName).join(", ")}</Text>
            )}
            {item.specialInstructions ? (
              <Text style={styles.muted}>“{item.specialInstructions}”</Text>
            ) : null}
          </View>
          {showLineTotals && (
            <Text style={styles.price}>{formatPaise(lineTotalPaise(item.unitPrice, item.quantity))}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  textColumn: { flex: 1, flexShrink: 1, gap: 2 },
  name: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 15, color: BRAND.colors.ink },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.inkMuted },
  price: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 15, color: BRAND.colors.ink, flexShrink: 0 },
});
