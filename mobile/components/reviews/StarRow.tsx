import { Pressable, StyleSheet, Text, View } from "react-native";
import { BRAND } from "../../theme";

export function StarDisplay({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <Text accessibilityLabel={`${value} out of 5 stars`} style={styles.display}>
      {"★".repeat(filled)}
      <Text style={styles.empty}>{"★".repeat(5 - filled)}</Text>
    </Text>
  );
}

export function StarInput({ label, value, onChange }: { label: string; value: number; onChange: (stars: number) => void }) {
  return (
    <View accessibilityLabel={label} style={styles.row}>
      {[1, 2, 3, 4, 5].map((stars) => (
        <Pressable
          key={stars}
          accessibilityRole="button"
          accessibilityLabel={`${stars} star${stars === 1 ? "" : "s"}`}
          accessibilityState={{ selected: value === stars }}
          hitSlop={6}
          onPress={() => onChange(value === stars ? 0 : stars)}
        >
          <Text style={[styles.star, stars <= value ? styles.on : styles.off]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  display: { fontSize: 16, color: BRAND.colors.primaryTextSafe },
  empty: { color: "#D1D5DB" },
  row: { flexDirection: "row", gap: 6 },
  star: { fontSize: 30 },
  on: { color: BRAND.colors.primaryTextSafe },
  off: { color: "#D1D5DB" },
});
