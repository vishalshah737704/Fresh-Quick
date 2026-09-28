import { View, Text, StyleSheet } from "react-native";
import { BRAND } from "../../../theme";

const METHODS = [
  { icon: "💳", label: "Mock Card" },
  { icon: "📱", label: "Mock UPI" },
  { icon: "💵", label: "Cash on Delivery" },
];

export default function WalletScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Wallet</Text>
      <Text style={styles.mutedText}>Payment methods used at checkout on this account.</Text>
      <View style={{ gap: 12 }}>
        {METHODS.map((m) => (
          <View key={m.label} style={styles.card}>
            <Text style={{ fontSize: 18 }}>{m.icon}</Text>
            <Text style={styles.cardLabel}>{m.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.footnote}>
        These are the payment options available at checkout — this app uses mock payments only, no
        real card or bank details are stored.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, backgroundColor: BRAND.colors.background },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  mutedText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 16,
  },
  cardLabel: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.ink },
  footnote: { fontFamily: BRAND.fonts.body, fontSize: 11, color: BRAND.colors.inkMuted },
});
