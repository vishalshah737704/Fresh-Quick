import { View, Text, StyleSheet } from "react-native";
import { BRAND } from "../theme";
import { STATUS_COLOR, STATUS_LABEL, type OrderStatus } from "../lib/order-status";

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return (
    <View style={[styles.pill, { backgroundColor: STATUS_COLOR[status].background }]}>
      <Text style={styles.text}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: BRAND.radiusPill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  text: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 13, color: BRAND.colors.surface },
});
