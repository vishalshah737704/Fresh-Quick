import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BRAND } from "../../theme";
import { StarInput } from "./StarRow";
import * as ImagePicker from "expo-image-picker";
import { REVIEW_LIMITS, REVIEW_PHOTO_TYPES, type OrderReviewState, type ReviewInput } from "../../lib/reviews-model";
import type { ReviewPhoto } from "../../lib/use-order-review";

export function ReviewForm({
  state,
  submitting,
  error,
  onSubmit,
}: {
  state: OrderReviewState;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: ReviewInput, photo: ReviewPhoto | null) => Promise<boolean>;
}) {
  const [storeStars, setStoreStars] = useState(0);
  const [storeComment, setStoreComment] = useState("");
  const [dishStars, setDishStars] = useState<Record<string, number>>({});
  const [dishComments, setDishComments] = useState<Record<string, string>>({});
  const [partnerStars, setPartnerStars] = useState(0);
  const [partnerComment, setPartnerComment] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<ReviewPhoto | null>(null);

  async function pickPhoto() {
    setLocalError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: false, base64: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      setLocalError("Could not read that photo, try another one");
      return;
    }
    // With quality set the picker may re-encode (a PNG comes back as JPEG bytes under a .png name), so the bytes decide the type.
    const type = asset.base64.startsWith("/9j/")
      ? "image/jpeg"
      : asset.base64.startsWith("iVBORw0KGgo")
        ? "image/png"
        : asset.base64.startsWith("UklGR")
          ? "image/webp"
          : (asset.mimeType ?? "unknown");
    if (!(REVIEW_PHOTO_TYPES as readonly string[]).includes(type)) {
      setLocalError("The photo must be a JPEG, PNG or WebP image");
      return;
    }
    if (asset.fileSize !== undefined && asset.fileSize > REVIEW_LIMITS.photoBytes) {
      setLocalError("The photo must be 3 MB or smaller");
      return;
    }
    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const baseName = (asset.fileName ?? "review").replace(/\.[^.]*$/, "");
    setPhoto({ base64: asset.base64, uri: asset.uri, name: `${baseName}.${ext}`, type });
  }

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
    }, photo);
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
      {photo ? (
        <View style={styles.photoRow}>
          <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>{photo.name}</Text>
          <Pressable accessibilityRole="button" onPress={() => setPhoto(null)}>
            <Text style={styles.link}>Remove</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={pickPhoto} style={styles.photoButton}>
          <Text style={styles.link}>Add a photo</Text>
        </Pressable>
      )}

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
    textAlignVertical: "top",
  },
  photoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  photoButton: { alignSelf: "flex-start", paddingVertical: 4 },
  link: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 14, color: BRAND.colors.primaryTextSafe },
  error: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.dangerTextSafe },
  button: { alignSelf: "flex-start", backgroundColor: BRAND.colors.primaryTextSafe, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  buttonText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.surface },
});
