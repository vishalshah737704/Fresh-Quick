import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { ORDERS_LIST_STATUS_LABEL } from "../../../../lib/order-status";
import { BRAND } from "../../../../theme";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  placed_at: string;
  stores: { name: string } | null;
};

export default function CustomerOrdersScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refetch every time this tab/screen regains focus, not just on first
  // mount, so orders placed since the last visit show up without a
  // manual app restart.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData.session?.user.id;
        if (!userId) {
          if (!cancelled) setError("Not signed in");
          return;
        }
        const { data, error: fetchError } = await supabase
          .from("orders")
          .select("id, status, total, placed_at, stores(name)")
          .eq("customer_id", userId)
          .order("placed_at", { ascending: false });
        if (cancelled) return;
        if (fetchError) {
          setError("Couldn't load your orders.");
          return;
        }
        setOrders((data as unknown as OrderRow[]) ?? []);
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
      {error && <Text style={styles.errorText}>{error}</Text>}
      {orders === null && !error && (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND.colors.primary} />
        </View>
      )}
      {orders !== null && orders.length === 0 && (
        <Text style={styles.mutedText}>You haven&apos;t placed any orders yet.</Text>
      )}
      <FlatList
        data={orders ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/customer/orders/${item.id}` as never)}
          >
            <View>
              <Text style={styles.storeName}>{item.stores?.name ?? "Unknown store"}</Text>
              <Text style={styles.mutedText}>
                {new Date(item.placed_at).toLocaleString()} ·{" "}
                {ORDERS_LIST_STATUS_LABEL[item.status] ?? item.status}
              </Text>
            </View>
            <Text style={styles.total}>₹{Number(item.total).toFixed(2)}</Text>
          </Pressable>
        )}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 16,
  },
  storeName: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.ink, marginBottom: 2 },
  total: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.ink },
});
