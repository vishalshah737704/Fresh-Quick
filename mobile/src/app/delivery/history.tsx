import { useCallback, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { apiFetch, ApiError } from "../../../lib/api";
import { BRAND } from "../../../theme";
import { useRequireSession } from "../../../lib/use-require-session";
import type { OrderDetail } from "../../../lib/order-detail";
import { DeliveryOrderCard } from "../../../components/DeliveryOrderCard";

// Mirrors app/delivery/(portal)/history/page.tsx on the web.
export default function DeliveryHistoryScreen() {
  useRequireSession("/login/delivery");
  const router = useRouter();
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSeq = useRef(0);

  async function load() {
    const seq = ++loadSeq.current;
    try {
      const body = await apiFetch<{ orders: OrderDetail[] }>("/api/delivery/history");
      if (seq !== loadSeq.current) return;
      setOrders(body.orders);
      setError(null);
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof ApiError && err.message ? err.message : "Failed to load history");
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [])
  );

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>History</Text>
      <View style={styles.noteRow}>
        <Text style={styles.noteText}>Showing your 50 most recent finished orders.</Text>
        <Pressable style={styles.refreshButton} onPress={() => void load()}>
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 12 }}>
          {orders.length === 0 && !error && (
            <Text style={styles.mutedText}>No completed deliveries yet.</Text>
          )}
          {orders.map((order) => (
            <DeliveryOrderCard key={order.id} order={order} scope="history" />
          ))}
          <Pressable onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/delivery/dashboard")
          }>
            <Text style={styles.backLink}>Back to dashboard</Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, backgroundColor: BRAND.colors.primaryTint },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  noteRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  noteText: { flex: 1, fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted },
  refreshButton: {
    backgroundColor: BRAND.colors.ink,
    borderRadius: BRAND.radiusPill,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  refreshText: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 13, color: BRAND.colors.surface },
  centered: { alignItems: "center", paddingVertical: 24 },
  mutedText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted, fontSize: 13 },
  errorText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.danger },
  backLink: {
    fontFamily: BRAND.fonts.bodyMedium,
    color: BRAND.colors.accentTextSafe,
    textDecorationLine: "underline",
    paddingVertical: 8,
  },
});
