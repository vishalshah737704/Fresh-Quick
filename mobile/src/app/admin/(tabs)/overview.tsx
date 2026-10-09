import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { supabase } from "../../../../lib/supabase";
import { apiFetch, ApiError } from "../../../../lib/api";
import { BRAND } from "../../../../theme";
import { useRequireSession } from "../../../../lib/use-require-session";
import { overviewStats, type AdminOrderRow } from "../../../../lib/admin-order-view";
import { formatPaise } from "../../../../lib/coupon-model";

// Mirrors app/admin/(portal)/dashboard/page.tsx on the web, read-only (no auto-acceptance toggle).
export default function AdminOverviewScreen() {
  useRequireSession("/login/admin");
  const router = useRouter();
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [vendorCount, setVendorCount] = useState(0);
  const [pending, setPending] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [orderBody, storeBody] = await Promise.all([
        apiFetch<{ orders: AdminOrderRow[] }>("/api/admin/orders"),
        apiFetch<{ stores: unknown[] }>("/api/admin/restaurants"),
      ]);
      if (seq !== loadSeq.current) return;
      setOrders(orderBody.orders);
      setVendorCount(storeBody.stores.length);
      setError(null);
      try {
        const summary = await apiFetch<{ pending: number }>("/api/admin/registrations/summary");
        if (seq === loadSeq.current) setPending(summary.pending);
      } catch {
        // The tile keeps its previous value if the summary cannot be read.
      }
    } catch (err) {
      if (seq !== loadSeq.current) return;
      setError(err instanceof ApiError && err.message ? err.message : "Failed to load overview");
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  const stats = overviewStats(orders, vendorCount);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Overview</Text>
        <Pressable onPress={() => void signOut()} accessibilityRole="button">
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {loading ? (
        <ActivityIndicator color={BRAND.colors.primary} />
      ) : (
        <View style={styles.tiles}>
          <Pressable
            accessibilityRole="button"
            style={[styles.tile, { backgroundColor: BRAND.colors.accentTextSafe }]}
            onPress={() => router.navigate("/admin/registrations")}
          >
            <Text style={styles.tileLabel}>Registrations awaiting approval</Text>
            <Text style={styles.tileValue}>{pending}</Text>
          </Pressable>
          <View style={[styles.tile, { backgroundColor: BRAND.colors.primaryTextSafe }]}>
            <Text style={styles.tileLabel}>Active orders</Text>
            <Text style={styles.tileValue}>{stats.activeOrders}</Text>
          </View>
          <View style={[styles.tile, { backgroundColor: BRAND.colors.ink }]}>
            <Text style={styles.tileLabel}>Vendors</Text>
            <Text style={styles.tileValue}>{stats.vendors}</Text>
          </View>
          <View style={[styles.tile, { backgroundColor: BRAND.colors.accentTextSafe }]}>
            <Text style={styles.tileLabel}>Revenue</Text>
            <Text style={styles.tileValue}>{formatPaise(stats.revenuePaise)}</Text>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 160, gap: 12, flexGrow: 1, backgroundColor: BRAND.colors.background },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  signOut: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.ink, textDecorationLine: "underline" },
  error: { color: BRAND.colors.dangerTextSafe, fontFamily: BRAND.fonts.body },
  tiles: { gap: 12 },
  tile: { borderRadius: 16, padding: 16 },
  tileLabel: { color: "#ffffffcc", fontFamily: BRAND.fonts.body, fontSize: 14 },
  tileValue: { color: "#ffffff", fontFamily: BRAND.fonts.heading, fontSize: 30 },
});
