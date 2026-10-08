import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { BRAND } from "../../theme";
import { apiFetch, absoluteUrl } from "../../lib/api";
import { StarDisplay } from "./StarRow";
import { ReportReviewRow } from "./ReportReviewRow";
import { storeRatingPath, storeReviewsPath, type PublicReview } from "../../lib/reviews-model";

type Summary = { rating: number | null; count: number; histogram: number[] };
type Page = { reviews: PublicReview[]; nextCursor: string | null };
type Loaded = { storeId: string; summary: Summary; reviews: PublicReview[]; nextCursor: string | null };

export function StoreReviews({ storeId }: { storeId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [summary, page] = await Promise.all([
          apiFetch<Summary>(storeRatingPath(storeId)),
          apiFetch<Page>(storeReviewsPath(storeId)),
        ]);
        if (!cancelled) setLoaded({ storeId, summary, reviews: page.reviews, nextCursor: page.nextCursor });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const current = loaded && loaded.storeId === storeId ? loaded : null;

  const loadMore = useCallback(async () => {
    if (!current?.nextCursor) return;
    setMoreBusy(true);
    try {
      const page = await apiFetch<Page>(`${storeReviewsPath(storeId)}?before=${encodeURIComponent(current.nextCursor)}`);
      setLoaded({ ...current, reviews: [...current.reviews, ...page.reviews], nextCursor: page.nextCursor });
    } catch {
      setFailed(true);
    } finally {
      setMoreBusy(false);
    }
  }, [current, storeId]);

  if (failed && !current) return <Text style={styles.muted}>Reviews are unavailable right now.</Text>;
  if (!current || current.summary.count === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>
        Reviews · ★ {current.summary.rating?.toFixed(1)} ({current.summary.count})
      </Text>
      {current.reviews.map((review) => (
        <View key={review.id} style={styles.card}>
          <Text style={styles.name}>
            {review.reviewerName} <StarDisplay value={review.stars} />
          </Text>
          {review.comment && <Text style={styles.body}>{review.comment}</Text>}
          {review.photoUrl && <Image source={{ uri: absoluteUrl(review.photoUrl) }} style={styles.photo} accessibilityLabel="Photo from a customer" />}
          {review.dishes.length > 0 && <Text style={styles.muted}>{review.dishes.map((dish) => `${dish.name} ${dish.stars}★`).join(" · ")}</Text>}
          {review.vendorReply && <Text style={styles.reply}>Reply from the store: {review.vendorReply}</Text>}
          <ReportReviewRow reviewId={review.id} />
        </View>
      ))}
      {current.nextCursor && (
        <Pressable accessibilityRole="button" disabled={moreBusy} onPress={loadMore} style={[styles.more, moreBusy && { opacity: 0.5 }]}>
          <Text style={styles.moreText}>{moreBusy ? "Loading…" : "Load more reviews"}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, padding: 16 },
  title: { fontFamily: BRAND.fonts.heading, fontSize: 18, color: BRAND.colors.ink },
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 16, padding: 12, gap: 6 },
  name: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 14, color: BRAND.colors.ink },
  body: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.ink },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted },
  photo: { width: "100%", height: 160, borderRadius: 12 },
  reply: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.ink, backgroundColor: BRAND.colors.background, borderRadius: 8, padding: 8 },
  more: { alignSelf: "flex-start", borderWidth: 1, borderColor: BRAND.colors.primary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6 },
  moreText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.primaryTextSafe },
});
