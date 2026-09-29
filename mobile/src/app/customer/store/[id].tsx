import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { BRAND } from "../../../../theme";
import { useCart } from "../../../../lib/cart-store";
import { FloatingCartPill } from "../../../../components/FloatingCartPill";
import { ItemCustomizationModal } from "../../../../components/ItemCustomizationModal";
import { useRequireSession } from "../../../../lib/use-require-session";

type Option = { id: string; name: string; price_delta_paise: number; sort_order: number };
type OptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  menu_item_options: Option[];
};

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  product_attributes: { is_veg?: boolean } | null;
  is_available: boolean;
  image_url: string | null;
  category: string | null;
  menu_item_option_groups: OptionGroup[];
};

type Store = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  is_suspended: boolean;
  banner_url: string | null;
};

type MenuGroup = { key: string; label: string; items: MenuItem[] };

// Groups by category in first-seen order; blank/null category falls into a
// trailing "Other" bucket — mirrors app/customer/stores/[id]/page.tsx's
// buildGroups (simplified: no anchor-nav scroll-spy for this first mobile
// pass, plain scrollable sections instead).
function buildGroups(items: MenuItem[]): MenuGroup[] {
  const byCategory = new Map<string, MenuItem[]>();
  const uncategorized: MenuItem[] = [];
  for (const item of items) {
    const label = item.category?.trim();
    if (!label) {
      uncategorized.push(item);
      continue;
    }
    const bucket = byCategory.get(label);
    if (bucket) bucket.push(item);
    else byCategory.set(label, [item]);
  }
  const groups: MenuGroup[] = Array.from(byCategory.entries()).map(([label, groupItems], i) => ({
    key: `cat-${i}`,
    label,
    items: groupItems,
  }));
  if (uncategorized.length > 0) {
    groups.push({ key: "cat-other", label: "Other", items: uncategorized });
  }
  return groups;
}

function sortedGroups(item: MenuItem): OptionGroup[] {
  return [...item.menu_item_option_groups]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((g) => ({
      ...g,
      menu_item_options: [...g.menu_item_options].sort((a, b) => a.sort_order - b.sort_order),
    }));
}

export default function StoreDetailScreen() {
  useRequireSession("/login/customer");
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { addItem, pendingConflict, confirmClearAndAdd, cancelPendingAdd } = useCart();
  const [store, setStore] = useState<Store | null>(null);
  const [menuItems, setMenuItems] = useState<MenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalItem, setModalItem] = useState<MenuItem | null>(null);
  const [isFavorite, setIsFavorite] = useState(false); // local UI-only toggle, no backend
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsets = useRef<Record<string, number>>({});
  // onLayout's y is relative to the IMMEDIATE PARENT, not the ScrollView's
  // content view — since group offsets are captured inside menuListContainer
  // (added for the background tint), this offset must be added back on to
  // make sectionOffsets values ScrollView-content-relative again.
  const menuListContainerOffset = useRef(0);
  const [activeGroupKey, setActiveGroupKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [storeRes, itemsRes] = await Promise.all([
        supabase
          .from("stores")
          .select("id, name, cuisine_tags, rating, avg_prep_minutes, is_open, is_suspended, banner_url")
          .eq("id", id)
          .single(),
        supabase
          .from("products")
          .select(
            "id, name, description, price, product_attributes, is_available, image_url, category, menu_item_option_groups(id, name, min_select, max_select, sort_order, menu_item_options(id, name, price_delta_paise, sort_order))"
          )
          .eq("store_id", id),
      ]);
      if (cancelled) return;
      if (storeRes.error || itemsRes.error) {
        setError((storeRes.error ?? itemsRes.error)?.message ?? "Failed to load");
        return;
      }
      setStore(storeRes.data);
      setMenuItems(itemsRes.data ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Surface the cart's cross-store conflict via a native confirm, mirroring
  // the web's inline conflict banner in a mobile-appropriate form.
  useEffect(() => {
    if (!pendingConflict) return;
    Alert.alert(
      "Start a new cart?",
      `Your cart has items from another restaurant. Adding from ${pendingConflict.storeName} will clear it.`,
      [
        { text: "Cancel", style: "cancel", onPress: cancelPendingAdd },
        { text: "Clear cart & add", style: "destructive", onPress: confirmClearAndAdd },
      ]
    );
  }, [pendingConflict, confirmClearAndAdd, cancelPendingAdd]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Couldn&apos;t load menu: {error}</Text>
      </View>
    );
  }

  if (!store || menuItems === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={BRAND.colors.primary} />
      </View>
    );
  }

  const isUnavailable = !store.is_open || store.is_suspended;
  const groups = buildGroups(menuItems);

  function handleItemPress(item: MenuItem) {
    const groups = sortedGroups(item);
    if (groups.length === 0) {
      addItem(store!.id, store!.name, {
        menuItemId: item.id,
        name: item.name,
        price: item.price,
        quantity: 1,
        imageUrl: item.image_url,
        selectedOptions: [],
        specialInstructions: null,
      });
      return;
    }
    setModalItem(item);
  }

  function scrollToGroup(key: string) {
    setActiveGroupKey(key);
    const y = sectionOffsets.current[key];
    if (y !== undefined) {
      const absoluteY = y + menuListContainerOffset.current;
      scrollRef.current?.scrollTo({ y: Math.max(0, absoluteY - 8), animated: true });
    }
  }

  // True sticky pill nav via ScrollView's stickyHeaderIndices, which pins
  // whichever direct child index it's given once scrolled past — the pill
  // row is index 1 (after the hero+info block at index 0). Menu content and
  // tap-to-scroll into the right group is a functional fallback for full
  // scroll-spy highlighting, which is not implemented (see report).
  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} stickyHeaderIndices={[1]} contentContainerStyle={styles.scrollContent}>
        <View>
          <View style={styles.banner}>
            {store.banner_url ? (
              <Image source={{ uri: store.banner_url }} style={styles.bannerImage} />
            ) : (
              <Text style={{ fontSize: 40 }}>🍽️</Text>
            )}
            <Pressable style={[styles.chip, styles.chipBack]} onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.chipIcon}>‹</Text>
            </Pressable>
            <Pressable
              style={[styles.chip, styles.chipFavorite]}
              onPress={() => setIsFavorite((v) => !v)}
              hitSlop={8}
            >
              <Text style={styles.chipIcon}>{isFavorite ? "♥" : "♡"}</Text>
            </Pressable>
          </View>
          <View style={styles.infoBlock}>
            <Text style={styles.storeName}>{store.name}</Text>
            <Text style={styles.storeMeta}>
              {store.cuisine_tags.join(", ")} · ⭐ {store.rating.toFixed(1)} · {store.avg_prep_minutes} min
            </Text>
            {isUnavailable && (
              <View style={styles.unavailableBanner}>
                <Text style={styles.unavailableText}>
                  {store.is_suspended ? "This restaurant is currently unavailable." : "This restaurant is currently closed."}
                </Text>
              </View>
            )}
          </View>
        </View>

        {groups.length > 0 && (
          <View style={styles.pillNav}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillNavContent}>
              {groups.map((group) => (
                <Pressable
                  key={group.key}
                  onPress={() => scrollToGroup(group.key)}
                  style={[styles.pill, activeGroupKey === group.key && styles.pillActive]}
                >
                  <Text style={[styles.pillText, activeGroupKey === group.key && styles.pillTextActive]}>
                    {group.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {menuItems.length === 0 ? (
          <Text style={[styles.mutedText, { paddingHorizontal: 16 }]}>{store.name} has no menu items yet.</Text>
        ) : (
          <View
            style={styles.menuListContainer}
            onLayout={(e) => {
              menuListContainerOffset.current = e.nativeEvent.layout.y;
            }}
          >
            {groups.map((group) => (
              <View
                key={group.key}
                style={styles.group}
                onLayout={(e) => {
                  sectionOffsets.current[group.key] = e.nativeEvent.layout.y;
                }}
              >
                <Text style={styles.groupTitle}>{group.label}</Text>
                {group.items.map((item) => {
                  const canAdd = !isUnavailable && item.is_available;
                  return (
                    <Pressable
                      key={item.id}
                      disabled={!canAdd}
                      onPress={() => handleItemPress(item)}
                      style={[styles.item, !canAdd && styles.itemDisabled]}
                    >
                      <View style={styles.itemBody}>
                        <Text style={styles.itemName}>
                          {item.product_attributes?.is_veg ? "🟢" : "🔴"} {item.name}
                        </Text>
                        {item.description && (
                          <Text style={styles.itemDescription} numberOfLines={2}>
                            {item.description}
                          </Text>
                        )}
                        <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
                        {!canAdd && (
                          <Text style={styles.itemUnavailable}>
                            {isUnavailable ? "Restaurant unavailable" : "Currently unavailable"}
                          </Text>
                        )}
                      </View>
                      <View style={styles.itemImageWrap}>
                        {item.image_url ? (
                          <Image source={{ uri: item.image_url }} style={styles.itemImage} />
                        ) : (
                          <View style={[styles.itemImage, styles.itemImageFallback]} />
                        )}
                        <View style={[styles.addBadge, !canAdd && styles.addBadgeDisabled]}>
                          <Text style={styles.addBadgeText}>+</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {modalItem && (
        <ItemCustomizationModal
          visible={!!modalItem}
          item={modalItem}
          optionGroups={sortedGroups(modalItem)}
          storeId={store.id}
          storeName={store.name}
          onClose={() => setModalItem(null)}
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
    color: BRAND.colors.danger,
    textAlign: "center",
  },
  mutedText: {
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.inkMuted,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  banner: {
    height: 200,
    borderRadius: BRAND.radius,
    backgroundColor: BRAND.colors.ink,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 12,
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  chip: {
    position: "absolute",
    top: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chipBack: { left: 12 },
  chipFavorite: { right: 12 },
  chipIcon: {
    fontSize: 18,
    color: BRAND.colors.ink,
  },
  infoBlock: {
    marginBottom: 0,
  },
  pillNav: {
    backgroundColor: BRAND.colors.background,
    paddingVertical: 10,
    marginBottom: 4,
  },
  pillNavContent: {
    gap: 8,
    paddingRight: 8,
  },
  pill: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "30",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: BRAND.colors.surface,
  },
  pillActive: {
    backgroundColor: BRAND.colors.primary,
    borderColor: BRAND.colors.primary,
  },
  pillText: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 13,
    color: BRAND.colors.ink,
  },
  pillTextActive: {
    color: BRAND.colors.surface,
  },
  storeName: {
    fontFamily: BRAND.fonts.heading,
    fontSize: 22,
    color: BRAND.colors.ink,
  },
  storeMeta: {
    fontFamily: BRAND.fonts.body,
    fontSize: 13,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
    marginBottom: 12,
  },
  unavailableBanner: {
    backgroundColor: BRAND.colors.danger + "18",
    borderWidth: 1,
    borderColor: BRAND.colors.danger + "40",
    borderRadius: BRAND.radius,
    padding: 10,
    marginBottom: 12,
  },
  unavailableText: {
    fontFamily: BRAND.fonts.body,
    fontSize: 13,
    color: BRAND.colors.danger,
  },
  menuListContainer: {
    backgroundColor: BRAND.colors.accentTint,
    marginHorizontal: -16,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  group: {
    marginBottom: 16,
  },
  groupTitle: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 16,
    color: BRAND.colors.ink,
    marginBottom: 8,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: BRAND.colors.surface,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "15",
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  itemDisabled: {
    opacity: 0.6,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
  },
  itemName: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 14,
    color: BRAND.colors.ink,
  },
  itemDescription: {
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
  },
  itemPrice: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 13,
    color: BRAND.colors.ink,
    marginTop: 4,
  },
  itemUnavailable: {
    fontFamily: BRAND.fonts.body,
    fontSize: 11,
    color: BRAND.colors.inkMuted,
    marginTop: 2,
  },
  itemImageWrap: {
    width: 76,
    height: 76,
  },
  itemImage: {
    width: 76,
    height: 76,
    borderRadius: 12,
  },
  itemImageFallback: {
    backgroundColor: BRAND.colors.accent + "20",
  },
  addBadge: {
    position: "absolute",
    bottom: -6,
    right: -6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: BRAND.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  addBadgeDisabled: {
    backgroundColor: BRAND.colors.inkMuted + "40",
  },
  addBadgeText: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 15,
    color: BRAND.colors.ink,
    lineHeight: 16,
  },
});
