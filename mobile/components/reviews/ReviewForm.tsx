import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BRAND } from "../../theme";
import { StarInput } from "./StarRow";
import { REVIEW_LIMITS, type OrderReviewState, type ReviewInput } from "../../lib/reviews-model";

export function ReviewForm({
  state,
  submitting,
  error,
  onSubmit,
}: {
  state: OrderReviewState;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: ReviewInput) => Promise<boolean>;
}) {
  const [storeStars, setStoreStars] = useState(0);
  const [storeComment, setStoreComment] = useState("");
  const [dishStars, setDishStars] = useState<Record<string, number>>({});
  const [dishComments, setDishComments] = useState<Record<string, string>>({});
  const [partnerStars, setPartnerStars] = useState(0);
  const [partnerComment, setPartnerComment] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit() {
    if (storeStars === 0) {
      setLocalError("Rate the store from 1 to 5 stars");
      return;
    }
    setLocalError(null);
    await onSubmit({
      storeStars,
      storeComment: storeComment.trim() || null,
      dishes: state.dishes
        .filter((dish) => (dishStars[dish.productId] ?? 0) > 0)
        .map((dish) => ({
          productId: dish.productId,
          stars: dishStars[dish.productId],
          comment: (dishComments[dish.productId] ?? "").trim() || null,
        })),
      partner: partnerStars > 0 ? { stars: partnerStars, comment: partnerComment.trim() || null } : null,
    });
  }

  const shownError = localError ?? error;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Rate your order</Text>

      <Text style={styles.label}>The store</Text>
      <StarInput label="Store rating" value={storeStars} onChange={setStoreStars} />
      <TextInput
        style={styles.input}
        multiline
        maxLength={REVIEW_LIMITS.storeComment}
        placeholder="Tell others about the food and the packaging (optional)"
        value={storeComment}
        onChangeText={setStoreComment}
      />

      {state.dishes.length > 0 && <Text style={styles.label}>The dishes (optional)</Text>}
      {state.dishes.map((dish) => (
        <View key={dish.productId} style={styles.block}>
          <Text style={styles.body}>{dish.name}</Text>
          <StarInput
            label={`Rating for ${dish.name}`}
            value={dishStars[dish.productId] ?? 0}
            onChange={(stars) => setDishStars((prev) => ({ ...prev, [dish.productId]: stars }))}
          />
          {(dishStars[dish.productId] ?? 0) > 0 && (
            <TextInput
              style={styles.input}
              maxLength={REVIEW_LIMITS.dishComment}
              placeholder="A word about this dish (optional)"
              value={dishComments[dish.productId] ?? ""}
              onChangeText={(text) => setDishComments((prev) => ({ ...prev, [dish.productId]: text }))}
            />
          )}
        </View>
      ))}

      {state.hasPartner && (
        <View style={styles.block}>
          <Text style={styles.label}>The delivery (optional)</Text>
          <Text style={styles.muted}>How was the delivery? Rate the rider&apos;s handling and courtesy, not the restaurant&apos;s wait.</Text>
          <StarInput label="Delivery partner rating" value={partnerStars} onChange={setPartnerStars} />
          {partnerStars > 0 && (
            <TextInput
              style={styles.input}
              maxLength={REVIEW_LIMITS.partnerComment}
              placeholder="A word about the delivery (optional)"
              value={partnerComment}
              onChangeText={setPartnerComment}
            />
          )}
        </View>
      )}

      {shownError && <Text style={styles.error}>{shownError}</Text>}
      <Pressable
        accessibilityRole="button"
        disabled={submitting}
        onPress={submit}
        style={[styles.button, submitting && { opacity: 0.5 }]}
      >
        <Text style={styles.buttonText}>{submitting ? "Sending…" : "Submit review"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 16, padding: 16, gap: 10 },
  title: { fontFamily: BRAND.fonts.heading, fontSize: 18, color: BRAND.colors.ink },
  label: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 15, color: BRAND.colors.ink },
  body: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.ink },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted },
  block: { gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 10,
    fontFamily: BRAND.fonts.body,
    fontSize: 14,
    color: BRAND.colors.ink,
    minHeight: 40,
  },
  error: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.dangerTextSafe },
  button: { alignSelf: "flex-start", backgroundColor: BRAND.colors.primaryTextSafe, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  buttonText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.surface },
});
