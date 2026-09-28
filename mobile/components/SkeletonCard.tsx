import { View, StyleSheet } from "react-native";
import { BRAND } from "../theme";

// Grey rounded-rect placeholder matching StoreCard's shape, shown while the
// Home feed loads instead of a bare spinner (mobile UberEats redesign spec,
// Phase 2).
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <View style={styles.image} />
      <View style={styles.body}>
        <View style={styles.line} />
        <View style={[styles.line, styles.lineShort]} />
      </View>
    </View>
  );
}

export function SkeletonRow() {
  return (
    <View style={styles.rowCard}>
      <View style={styles.rowImage} />
      <View style={styles.rowLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "15",
  },
  image: {
    width: "100%",
    height: 140,
    backgroundColor: BRAND.colors.inkMuted + "20",
  },
  body: {
    padding: 12,
    gap: 8,
  },
  line: {
    height: 12,
    borderRadius: 6,
    backgroundColor: BRAND.colors.inkMuted + "20",
    width: "70%",
  },
  lineShort: {
    width: "40%",
  },
  rowCard: {
    width: 120,
  },
  rowImage: {
    width: 120,
    height: 90,
    borderRadius: 12,
    backgroundColor: BRAND.colors.inkMuted + "20",
  },
  rowLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: BRAND.colors.inkMuted + "20",
    width: "80%",
    marginTop: 6,
  },
});
