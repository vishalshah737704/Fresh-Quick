import { Image, StyleSheet, Text, View } from "react-native";
import { BRAND } from "../../theme";
import { absoluteUrl } from "../../lib/api";
import { StarDisplay } from "./StarRow";
import type { OwnReview } from "../../lib/reviews-model";

export function OwnReviewCard({ review }: { review: OwnReview }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Your review</Text>
      {review.status === "hidden" && <Text style={styles.muted}>This review is currently hidden by the Fresh &amp; Quick team.</Text>}
      <StarDisplay value={review.stars} />
      {review.comment && <Text style={styles.body}>{review.comment}</Text>}
      {review.photoUrl && <Image source={{ uri: absoluteUrl(review.photoUrl) }} style={styles.photo} accessibilityLabel="Your review photo" />}
      {review.dishes.map((dish) => (
        <Text key={dish.name} style={styles.body}>
          {dish.name}: {"★".repeat(dish.stars)}
          {dish.comment ? ` · ${dish.comment}` : ""}
        </Text>
      ))}
      {review.partner && (
        <Text style={styles.body}>
          Delivery: {"★".repeat(review.partner.stars)}
          {review.partner.comment ? ` · ${review.partner.comment}` : ""}
        </Text>
      )}
      {review.vendorReply && <Text style={styles.reply}>Reply from the store: {review.vendorReply}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 16, padding: 16, gap: 6 },
  title: { fontFamily: BRAND.fonts.heading, fontSize: 18, color: BRAND.colors.ink },
  body: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.ink },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted },
  photo: { width: "100%", height: 180, borderRadius: 12 },
  reply: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.ink, backgroundColor: BRAND.colors.background, borderRadius: 8, padding: 8 },
});
