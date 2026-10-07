import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import {
  ORDER_LIST_SELECT,
  normalizeOrderListRow,
  formatPaise,
  type RawOrderListRow,
  type OrderListRow,
} from "../../../../lib/order-detail";
import { BRAND } from "../../../../theme";
import { useRequireSession } from "../../../../lib/use-require-session";
import { OrderStatusPill } from "../../../../components/OrderStatusPill";
import { ItemThumb } from "../../../../components/ItemThumb";
import { useReorder } from "../../../../lib/use-reorder";

const MAX_THUMBS = 3;

export default function CustomerOrdersScreen() {
  useRequireSession("/login/customer");
  const router = useRouter();
  const [orders, setOrders] = useState<OrderListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busyOrderId, notice, error: reorderError, reorder } = useReorder();

  // Refetch every time this tab/screen regains focus, not just on first
  // mount, so orders placed since the last visit show up without a
  // manual app restart.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          const userId = sessionData.session?.user.id;
          if (!userId) {
            if (!cancelled) setError("Not signed in");
            return;
          }
          const { data, error: fetchError } = await supabase
            .from("orders")
            .select(ORDER_LIST_SELECT)
            .eq("customer_id", userId)
            .order("placed_at", { ascending: false });
          if (cancelled) return;
          if (fetchError) {
            setError("Couldn't load your orders.");
            return;
          }
          setError(null);
          setOrders(((data as unknown as RawOrderListRow[]) ?? []).map(normalizeOrderListRow));
        } catch {
          if (!cancelled) setError("Couldn't load your orders.");
        }
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Your orders</Text>
      {notice && <Text style={styles.mutedText}>{notice}</Text>}
      {reorderError && <Text style={styles.errorText}>{reorderError}</Text>}
      {error && <Text style={styles.errorText}>{error}</Text>}
      {orders === null && !error && (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND.colors.primary} />
        </View>
      )}
      {orders !== null && orders.length === 0 && <Text style={styles.mutedText}>No orders yet.</Text>}
      <FlatList
        data={orders ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }) => {
          const extra = item.items.length - MAX_THUMBS;
          return (
            <Pressable style={styles.card} onPress={() => router.push(`/customer/orders/${item.id}` as never)}>
              <View style={styles.topRow}>
                <View style={styles.titleColumn}>
                  <Text style={styles.storeName}>{item.storeName}</Text>
                  <Text style={styles.mutedText}>{new Date(item.placedAt).toLocaleString()}</Text>
                </View>
                <OrderStatusPill status={item.status} />
              </View>
              <View style={styles.bottomRow}>
                <View style={styles.thumbs}>
                  {item.items.slice(0, MAX_THUMBS).map((line) => (
                    <ItemThumb key={line.id} url={line.imageUrl} name={line.name} size={40} />
                  ))}
                  {extra > 0 && <Text style={styles.mutedText}>+{extra}</Text>}
                  <Text style={styles.mutedText}>{item.itemCount} {item.itemCount === 1 ? "item" : "items"}</Text>
                </View>
                <Text style={styles.total}>{formatPaise(Math.round(item.total * 100))}</Text>
              </View>
              {item.status !== "cancelled" && item.status !== "rejected" && (
                <Pressable
                  style={[styles.reorderButton, busyOrderId !== null && { opacity: 0.5 }]}
                  disabled={busyOrderId !== null}
                  onPress={() => reorder(item.id)}
                >
                  <Text style={styles.reorderButtonText}>{busyOrderId === item.id ? "Adding…" : "Reorder"}</Text>
                </Pressable>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, backgroundColor: BRAND.colors.background },
  centered: { alignItems: "center", paddingVertical: 24 },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  mutedText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted },
  errorText: { fontFamily: BRAND.fonts.body, color: "#dc2626" },
  card: {
    gap: 12,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 16,
  },
  topRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  titleColumn: { flex: 1, gap: 2 },
  bottomRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  thumbs: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 },
  storeName: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.ink },
  total: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.ink },
  reorderButton: { alignSelf: "flex-start", borderWidth: 1, borderColor: BRAND.colors.primary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6 },
  reorderButtonText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.primaryTextSafe },
});
