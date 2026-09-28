import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  Image,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { BRAND } from "../../../../theme";
import { FloatingCartPill } from "../../../../components/FloatingCartPill";
import { useRequireSession } from "../../../../lib/use-require-session";

type Store = {
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

type Cuisine = { slug: string; label: string };

// Product name lookup only — used to make search match menu items too, per
// the mobile home-screen requirement (web's HeaderSearchBox only matches
// store name/cuisine tags; this adds product-name matching on top of that).
type ProductLite = { store_id: string; name: string };

export default function CustomerHomeScreen() {
  useRequireSession("/login/customer");
  const router = useRouter();
  const [stores, setStores] = useState<Store[] | null>(null);
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [storesRes, cuisinesRes, productsRes] = await Promise.all([
        supabase
          .from("stores")
          .select(
            "id, name, cuisine_tags, rating, avg_prep_minutes, is_open, banner_url, delivery_fee_paise, promo_text"
          )
          .eq("is_open", true)
          .eq("is_suspended", false),
        supabase.from("cuisine_taxonomy").select("slug, label").order("label"),
        supabase.from("products").select("store_id, name"),
      ]);
      if (cancelled) return;
      if (storesRes.error) {
        setError(storesRes.error.message);
        return;
      }
      setStores(storesRes.data ?? []);
      setCuisines(cuisinesRes.data ?? []);
      setProducts(productsRes.data ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

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
  const filtered = (stores ?? []).filter((s) => {
    if (selectedCuisine !== null && !s.cuisine_tags.includes(selectedCuisine)) return false;
    if (query === "") return true;
    if (s.name.toLowerCase().includes(query)) return true;
    if (s.cuisine_tags.some((t) => t.toLowerCase().includes(query))) return true;
    const productNames = productNamesByStore.get(s.id) ?? [];
    return productNames.some((n) => n.toLowerCase().includes(query));
  });

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Couldn&apos;t load restaurants: {error}</Text>
      </View>
    );
  }

  if (stores === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={BRAND.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search restaurants or dishes"
          placeholderTextColor={BRAND.colors.inkMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {cuisines.length > 0 && (
        <FlatList
          horizontal
          data={cuisines}
          keyExtractor={(c) => c.slug}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => {
            const active = selectedCuisine === item.slug;
            return (
              <Pressable
                onPress={() => setSelectedCuisine(active ? null : item.slug)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      {filtered.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.mutedText}>
            {query !== "" ? `No restaurants or dishes match "${searchQuery}".` : "No open restaurants near you right now."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/customer/store/${item.id}`)}
            >
              {item.banner_url ? (
                <Image source={{ uri: item.banner_url }} style={styles.cardImage} />
              ) : (
                <View style={[styles.cardImage, styles.cardImageFallback]}>
                  <Text style={{ fontSize: 28 }}>🍽️</Text>
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.cardMeta} numberOfLines={1}>
                  {item.cuisine_tags.join(", ")} · ⭐ {item.rating.toFixed(1)} · {item.avg_prep_minutes} min
                </Text>
                {item.promo_text && <Text style={styles.cardPromo}>{item.promo_text}</Text>}
              </View>
            </Pressable>
          )}
        />
      )}

      <FloatingCartPill />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.background,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    fontFamily: BRAND.fonts.body,
    color: "#c0392b",
    textAlign: "center",
  },
  mutedText: {
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.inkMuted,
    textAlign: "center",
  },
  searchWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "40",
    borderRadius: BRAND.radius,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.surface,
  },
  chipRow: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "40",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: BRAND.colors.surface,
  },
  chipActive: {
    backgroundColor: BRAND.colors.primary,
    borderColor: BRAND.colors.primary,
  },
  chipText: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 13,
    color: BRAND.colors.ink,
  },
  chipTextActive: {
    color: BRAND.colors.surface,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
    gap: 12,
  },
  card: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "15",
  },
  cardImage: {
    width: "100%",
    height: 120,
  },
  cardImageFallback: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.colors.accent + "20",
  },
  cardBody: {
    padding: 12,
    gap: 2,
  },
  cardTitle: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 15,
    color: BRAND.colors.ink,
  },
  cardMeta: {
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: BRAND.colors.inkMuted,
  },
  cardPromo: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 12,
    color: BRAND.colors.primary,
    marginTop: 2,
  },
});
