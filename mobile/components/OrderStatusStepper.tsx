import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BRAND } from "../theme";
import { TIMELINE_STEPS } from "../lib/order-status";

// Six dots joined by lines plus one caption line (six labels can't fit a phone width), UberEats-style: filled/checked
// segments in brand accent, connecting line fills progressively as the
// order advances. Pure presentation — all status mapping logic (which step
// is "current") stays in lib/order-status.ts's TIMELINE_STEP_INDEX so this
// component and web's OrderStatusTimeline never disagree on semantics.
export function OrderStatusStepper({ currentIndex }: { currentIndex: number }) {
  return (
    <View>
    <View style={styles.row}>
      {TIMELINE_STEPS.map((label, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        const lineFilled = index < currentIndex;
        return (
          <View key={label} style={styles.step}>
            <View style={styles.dotRow}>
              <View style={[styles.dot, (complete || active) && styles.dotActive]}>
                {complete ? (
                  <Ionicons name="checkmark" size={14} color={BRAND.colors.surface} />
                ) : (
                  <Text style={[styles.dotText, active && styles.dotTextActive]}>{index + 1}</Text>
                )}
              </View>
              {index < TIMELINE_STEPS.length - 1 && (
                <View style={[styles.line, lineFilled && styles.lineFilled]} />
              )}
            </View>
          </View>
        );
      })}
    </View>
    <Text style={styles.caption}>
      Step {currentIndex + 1} of {TIMELINE_STEPS.length} · <Text style={styles.captionLabel}>{TIMELINE_STEPS[currentIndex]}</Text>
    </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  step: { flex: 1, alignItems: "flex-start" },
  dotRow: { flexDirection: "row", alignItems: "center", width: "100%" },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.colors.inkMuted + "22",
  },
  dotActive: { backgroundColor: BRAND.colors.accent },
  dotText: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 12, color: BRAND.colors.inkMuted },
  dotTextActive: { color: BRAND.colors.primary },
  line: { flex: 1, height: 3, backgroundColor: BRAND.colors.inkMuted + "22", marginHorizontal: 2 },
  lineFilled: { backgroundColor: BRAND.colors.accent },
  caption: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted, marginTop: 8 },
  captionLabel: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.ink },
});
