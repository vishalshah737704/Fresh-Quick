import { useState } from "react";
import { View, Text, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BRAND } from "../theme";

export type StoreCardData = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  banner_url: string | null;
  delivery_fee_paise: number;
  promo_text: string | null;
};

// UberEats-style restaurant card: 16:9 image, rounded corners, favorite
// heart overlay (local-only toggle, no backend — favorites aren't a real
// feature yet, per spec's honest-scope note), name + single grey metadata
// line "★rating · time · fee".
export function StoreCard({ store, onPress }: { store: StoreCardData; onPress: () => void }) {
  const [favorited, setFavorited] = useState(false);
  const feeLabel = store.delivery_fee_paise === 0 ? "Free delivery" : `₹${(store.delivery_fee_paise / 100).toFixed(0)} delivery`;

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.imageWrap}>
        {store.banner_url ? (
          <Image source={{ uri: store.banner_url }} style={styles.image} />
        ) : (
          <View style={[styles.image, styles.imageFallback]}>
            <Text style={{ fontSize: 32 }}>🍽️</Text>
          </View>
        )}
        <Pressable
          style={styles.heartChip}
          hitSlop={8}
          onPress={(e) => {
            e.stopPropagation();
            setFavorited((f) => !f);
          }}
        >
          <Ionicons
            name={favorited ? "heart" : "heart-outline"}
            size={16}
            color={favorited ? "#e0245e" : BRAND.colors.ink}
          />
        </Pressable>
        {store.promo_text && (
          <View style={styles.promoBadge}>
            <Text style={styles.promoBadgeText} numberOfLines={1}>
              {store.promo_text}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {store.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          ★{store.rating.toFixed(1)} · {store.avg_prep_minutes} min · {feeLabel}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: 16,
    overflow: "hidden",
  },
  imageWrap: {
    width: "100%",
    aspectRatio: 16 / 9,
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.colors.accent + "20",
  },
  heartChip: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: BRAND.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  promoBadge: {
    position: "absolute",
    left: 8,
    bottom: 8,
    backgroundColor: BRAND.colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    maxWidth: "80%",
  },
  promoBadgeText: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 11,
    color: BRAND.colors.surface,
  },
  body: {
    paddingTop: 8,
    gap: 2,
  },
  title: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 15,
    color: BRAND.colors.ink,
  },
  meta: {
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
});
