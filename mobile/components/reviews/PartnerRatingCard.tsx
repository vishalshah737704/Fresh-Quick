import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { BRAND } from "../../theme";
import { apiFetch } from "../../lib/api";
import { DELIVERY_RATING_PATH, PARTNER_SCORE_MIN_RATINGS, type PartnerRating } from "../../lib/reviews-model";

export function PartnerRatingCard() {
  const [rating, setRating] = useState<PartnerRating | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const body = await apiFetch<PartnerRating>(DELIVERY_RATING_PATH);
          if (!cancelled) setRating(body);
        } catch {
          // card simply stays hidden when the rating cannot load
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (!rating) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>My rating</Text>
      {rating.average === null ? (
        <Text style={styles.muted}>No ratings yet.</Text>
      ) : (
        <>
          <Text style={styles.score}>
            ★ {rating.average.toFixed(1)} <Text style={styles.muted}>({rating.count} {rating.count === 1 ? "rating" : "ratings"})</Text>
          </Text>
          {rating.count < PARTNER_SCORE_MIN_RATINGS && (
            <Text style={styles.muted}>Customers see &quot;New partner&quot; until you have {PARTNER_SCORE_MIN_RATINGS} ratings.</Text>
          )}
        </>
      )}
      {rating.recent.slice(0, 3).map((row) =>
        row.comment ? (
          <Text key={row.createdAt + row.stars} style={styles.body}>
            {"★".repeat(row.stars)} · {row.comment}
          </Text>
        ) : null
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 16, padding: 16, gap: 4 },
  title: { fontFamily: BRAND.fonts.heading, fontSize: 18, color: BRAND.colors.ink },
  score: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 22, color: BRAND.colors.ink },
  body: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.ink },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted },
});
