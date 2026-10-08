import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BRAND } from "../../theme";
import { apiFetch } from "../../lib/api";
import { reportReviewPath } from "../../lib/reviews-model";

const REASONS = ["Offensive or abusive", "Spam or fake", "Not about this store"];

export function ReportReviewRow({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function report(reason: string) {
    setError(null);
    try {
      await apiFetch(reportReviewPath(reviewId), { method: "POST", body: { reason } });
      setDone(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not report");
    }
  }

  if (done) return <Text style={styles.muted}>Reported, thank you</Text>;
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" onPress={() => setOpen((value) => !value)}>
        <Text style={styles.link}>Report</Text>
      </Pressable>
      {open && (
        <View style={styles.reasons}>
          {REASONS.map((reason) => (
            <Pressable key={reason} accessibilityRole="button" style={styles.pill} onPress={() => report(reason)}>
              <Text style={styles.muted}>{reason}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  link: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted, textDecorationLine: "underline" },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  error: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.dangerTextSafe },
});
