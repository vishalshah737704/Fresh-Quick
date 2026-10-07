import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  Image,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../../lib/supabase";
import { BRAND } from "../../../../theme";
import { FloatingCartPill } from "../../../../components/FloatingCartPill";
import { StoreCard, type StoreCardData } from "../../../../components/StoreCard";
import { SkeletonCard, SkeletonRow } from "../../../../components/SkeletonCard";
import { useRequireSession } from "../../../../lib/use-require-session";
import { LocationSheet } from "../../../../components/LocationSheet";
import { useDeliveryLocation } from "../../../../lib/location-store";
import { haversineDistanceKm } from "../../../../lib/geo";
import { sortNearestFirst } from "../../../../lib/nearest";
import { apiFetch } from "../../../../lib/api";
import { REORDER_OPTIONS_PATH, type ReorderOption } from "../../../../lib/favorites-model";
import { useFavorites } from "../../../../lib/favorites-store";
import { useReorder } from "../../../../lib/use-reorder";

type Store = StoreCardData;

type Cuisine = { slug: string; label: string };

// Product name lookup only — used to make search match menu items too, per
// the mobile home-screen requirement (web's HeaderSearchBox only matches
// store name/cuisine tags; this adds product-name matching on top of that).
type ProductLite = { store_id: string; name: string };

// Category chips reuse cuisine icon names where a sensible Ionicons match
// exists; falls back to a generic restaurant icon otherwise.
const CUISINE_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  pizza: "pizza-outline",
  burger: "fast-food-outline",
  fast_food: "fast-food-outline",
  indian: "restaurant-outline",
  chinese: "restaurant-outline",
  dessert: "ice-cream-outline",
  coffee: "cafe-outline",
  drinks: "beer-outline",
  healthy: "leaf-outline",
  seafood: "fish-outline",
};

export default function CustomerHomeScreen() {
  useRequireSession("/login/customer");
  const router = useRouter();
  const [stores, setStores] = useState<Store[] | null>(null);
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [reorderStores, setReorderStores] = useState<ReorderOption[] | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { ids: favoriteIds } = useFavorites();
  const { busyOrderId, notice, error: reorderError, reorder } = useReorder();
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const { location } = useDeliveryLocation();

  const load = useCallback(async () => {
    const [storesRes, cuisinesRes, productsRes, sessionRes] = await Promise.all([
      supabase
        .from("stores")
        .select(
          "id, name, cuisine_tags, rating, avg_prep_minutes, is_open, banner_url, delivery_fee_paise, promo_text, lat, lng"
        )
        .eq("is_open", true)
        .eq("is_suspended", false),
      supabase.from("cuisine_taxonomy").select("slug, label").order("label"),
      supabase.from("products").select("store_id, name"),
      supabase.auth.getSession(),
    ]);
    if (storesRes.error) {
      setError(storesRes.error.message);
      return;
    }
    setStores(storesRes.data ?? []);
    setCuisines(cuisinesRes.data ?? []);
    setProducts(productsRes.data ?? []);

    if (sessionRes.data.session) {
      try {
        const res = await apiFetch<{ options: ReorderOption[] }>(REORDER_OPTIONS_PATH);
        setReorderStores(res.options);
      } catch {
        setReorderStores([]);
      }
    } else {
      setReorderStores([]);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await load();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const productNamesByStore = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of products) {
      const bucket = map.get(p.store_id);
      if (bucket) bucket.push(p.name);
      else map.set(p.store_id, [p.name]);
    }
    return map;
  }, [products]);

  const query = searchQuery.trim().toLowerCase();
  const matching = (stores ?? []).filter((s) => {
    if (selectedCuisine !== null && !s.cuisine_tags.includes(selectedCuisine)) return false;
    if (favoritesOnly && !favoriteIds.has(s.id)) return false;
    if (query === "") return true;
    if (s.name.toLowerCase().includes(query)) return true;
    if (s.cuisine_tags.some((t) => t.toLowerCase().includes(query))) return true;
    const productNames = productNamesByStore.get(s.id) ?? [];
    return productNames.some((n) => n.toLowerCase().includes(query));
  });
  const filtered = useMemo(
    () => sortNearestFirst(matching, location, haversineDistanceKm),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stores, selectedCuisine, query, productNamesByStore, location, favoritesOnly, favoriteIds]
  );

  const promoStores = useMemo(
    () => (stores ?? []).filter((s) => !!s.promo_text).slice(0, 6),
    [stores]
  );

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Couldn&apos;t load restaurants: {error}</Text>
      </View>
    );
  }

  const loading = stores === null;

  return (
    <View style={styles.container}>
      <ScrollView
        stickyHeaderIndices={undefined}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={BRAND.colors.primary}
          />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroSection}>
          <Pressable
            style={styles.addressPill}
            onPress={() => setLocationOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Set delivery location"
          >
            <Ionicons name="location-sharp" size={16} color={BRAND.colors.primary} />
            <Text style={styles.addressPillText} numberOfLines={1}>
              {location ? location.label : "Set delivery location"}
            </Text>
            <Ionicons name="chevron-down" size={14} color={BRAND.colors.inkMuted} />
          </Pressable>

          <View style={styles.searchWrap}>
            <View style={styles.searchInputWrap}>
              <Ionicons name="search" size={18} color={BRAND.colors.inkMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search restaurants or dishes"
                placeholderTextColor={BRAND.colors.inkMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>
        </View>

        <Pressable
          onPress={() => setFavoritesOnly((v) => !v)}
          style={[styles.favoritesChip, favoritesOnly && styles.favoritesChipActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: favoritesOnly }}
        >
          <Ionicons name={favoritesOnly ? "heart" : "heart-outline"} size={14} color={favoritesOnly ? BRAND.colors.surface : BRAND.colors.ink} />
          <Text style={[styles.favoritesChipLabel, favoritesOnly && styles.favoritesChipLabelActive]}>Favorites</Text>
        </Pressable>

        {loading ? (
          <View style={styles.chipRow}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={styles.chipSkeleton} />
            ))}
          </View>
        ) : (
          cuisines.length > 0 && (
            <FlatList
              horizontal
              data={cuisines}
              keyExtractor={(c) => c.slug}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
              renderItem={({ item }) => {
                const active = selectedCuisine === item.slug;
                const iconName = CUISINE_ICONS[item.slug] ?? "restaurant-outline";
                return (
                  <Pressable
                    onPress={() => setSelectedCuisine(active ? null : item.slug)}
                    style={styles.chipColumn}
                  >
                    <View style={[styles.chipCircle, active && styles.chipCircleActive]}>
                      <Ionicons
                        name={iconName}
                        size={20}
                        color={active ? BRAND.colors.surface : BRAND.colors.ink}
                      />
                    </View>
                    <Text style={[styles.chipLabel, active && styles.chipLabelActive]} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )
        )}

        {loading ? (
          <View style={styles.promoRow}>
            {[0, 1].map((i) => (
              <View key={i} style={styles.promoSkeleton} />
            ))}
          </View>
        ) : (
          promoStores.length > 0 && (
            <FlatList
              horizontal
              data={promoStores}
              keyExtractor={(s) => `promo-${s.id}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.promoRow}
              snapToInterval={280 + 12}
              decelerationRate="fast"
              renderItem={({ item }) => (
                <Pressable
                  style={styles.promoCard}
                  onPress={() => router.push(`/customer/store/${item.id}`)}
                >
                  {item.banner_url ? (
                    <Image source={{ uri: item.banner_url }} style={styles.promoImage} />
                  ) : (
                    <View style={[styles.promoImage, styles.promoImageFallback]} />
                  )}
                  <View style={styles.promoOverlay}>
                    <Text style={styles.promoTitle} numberOfLines={2}>
                      {item.promo_text ?? "Free delivery"}
                    </Text>
                    <Text style={styles.promoSubtitle} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                </Pressable>
              )}
            />
          )
        )}

        {reorderStores === null ? (
          <View style={styles.reorderSkeletonRow}>
            {[0, 1, 2].map((i) => (
              <SkeletonRow key={i} />
            ))}
          </View>
        ) : (
          reorderStores.length > 0 && (
            <View>
              <Text style={styles.sectionHeading}>Order again</Text>
              {notice && <Text style={styles.reorderNotice}>{notice}</Text>}
              {reorderError && <Text style={[styles.errorText, styles.reorderNotice]}>{reorderError}</Text>}
              <FlatList
                horizontal
                data={reorderStores}
                keyExtractor={(s) => `reorder-${s.storeId}`}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.reorderRow}
                renderItem={({ item }) => (
                  <View style={styles.reorderCard}>
                    <Pressable onPress={() => router.push(`/customer/store/${item.storeId}`)}>
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.reorderImage} />
                      ) : (
                        <View style={[styles.reorderImage, styles.promoImageFallback]} />
                      )}
                      <Text style={styles.reorderName} numberOfLines={1}>
                        {item.storeName}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.reorderButton, (busyOrderId !== null || !item.isOpen) && { opacity: 0.5 }]}
                      disabled={busyOrderId !== null || !item.isOpen}
                      onPress={() => reorder(item.lastOrderId)}
                    >
                      <Text style={styles.reorderButtonText}>
                        {busyOrderId === item.lastOrderId ? "Adding…" : item.isOpen ? "Reorder" : "Closed"}
                      </Text>
                    </Pressable>
                  </View>
                )}
              />
            </View>
          )
        )}

        <Text style={styles.sectionHeading}>Restaurants near you</Text>

        {loading ? (
          <View style={styles.listContent}>
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.mutedText}>
              {favoritesOnly
                ? "No favorite stores here yet. Tap the heart on a store."
                : query !== ""
                  ? `No restaurants or dishes match "${searchQuery}".`
                  : "No open restaurants near you right now."}
            </Text>
          </View>
        ) : (
          <View style={styles.listContent}>
            {filtered.map((item) => (
              <StoreCard
                key={item.id}
                store={item}
                onPress={() => router.push(`/customer/store/${item.id}`)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <FloatingCartPill />
      <LocationSheet visible={locationOpen} onClose={() => setLocationOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.background,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  heroSection: {
    backgroundColor: BRAND.colors.primaryTint,
    paddingBottom: 8,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.danger,
    textAlign: "center",
  },
  mutedText: {
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.inkMuted,
    textAlign: "center",
  },
  addressPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: BRAND.colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  addressPillText: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 13,
    color: BRAND.colors.ink,
    maxWidth: 220,
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  searchInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: BRAND.colors.surface,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "20",
  },
  searchInput: {
    flex: 1,
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.ink,
  },
  chipRow: {
    paddingHorizontal: 16,
    gap: 16,
    paddingVertical: 12,
  },
  chipColumn: {
    alignItems: "center",
    gap: 4,
    width: 64,
  },
  chipCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.colors.surface,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "20",
  },
  chipCircleActive: {
    backgroundColor: BRAND.colors.primaryTextSafe,
    borderColor: BRAND.colors.primary,
  },
  chipLabel: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 11,
    color: BRAND.colors.ink,
    textAlign: "center",
  },
  chipLabelActive: {
    color: BRAND.colors.primary,
  },
  chipSkeleton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: BRAND.colors.inkMuted + "20",
  },
  promoRow: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 16,
  },
  promoCard: {
    width: 280,
    height: 140,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: BRAND.colors.surface,
  },
  promoImage: {
    width: "100%",
    height: "100%",
  },
  promoImageFallback: {
    backgroundColor: BRAND.colors.accent + "30",
  },
  promoOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: BRAND.colors.ink + "8c",
  },
  promoTitle: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 15,
    color: BRAND.colors.surface,
  },
  promoSubtitle: {
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: BRAND.colors.surface,
    marginTop: 2,
  },
  promoSkeleton: {
    width: 280,
    height: 140,
    borderRadius: 18,
    backgroundColor: BRAND.colors.inkMuted + "20",
  },
  sectionHeading: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 16,
    color: BRAND.colors.ink,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  reorderRow: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 8,
  },
  reorderSkeletonRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  reorderCard: {
    width: 120,
  },
  reorderImage: {
    width: 120,
    height: 90,
    borderRadius: 12,
  },
  reorderName: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 12,
    color: BRAND.colors.ink,
    marginTop: 6,
  },
  reorderButton: {
    marginTop: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: BRAND.colors.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  reorderButtonText: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 11,
    color: BRAND.colors.primary,
  },
  reorderNotice: {
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  favoritesChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "33",
    backgroundColor: BRAND.colors.surface,
  },
  favoritesChipActive: {
    backgroundColor: BRAND.colors.primaryTextSafe,
    borderColor: BRAND.colors.primary,
  },
  favoritesChipLabel: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 12,
    color: BRAND.colors.ink,
  },
  favoritesChipLabelActive: {
    color: BRAND.colors.surface,
  },
  listContent: {
    paddingHorizontal: 16,
    gap: 16,
  },
});
