import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as Location from "expo-location";
import { supabase } from "../../../lib/supabase";
import { apiFetch, ApiError } from "../../../lib/api";
import { BRAND } from "../../../theme";
import { useRequireSession } from "../../../lib/use-require-session";

// Mirrors app/delivery/(portal)/dashboard/page.tsx on the web: online/
// offline toggle, available-orders self-claim list, "mine" list with the
// correct next-status action per status, address reveal for the active
// order, a 15s location ping and a 10s list refresh while online.
//
// Scope limitation: foreground location only (expo-location's
// getCurrentPositionAsync while the app is open) — no background location
// permission/task, matching what this pass was asked to build.

type OrderRow = {
  id: string;
  status: string;
  total: number;
  stores: { name: string } | null;
};

const NEXT_LABEL: Record<string, string> = {
  assigned: "Mark picked up",
  picked_up: "Mark delivered",
};

export default function DeliveryDashboardScreen() {
  useRequireSession("/login/delivery");
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [available, setAvailable] = useState<OrderRow[]>([]);
  const [mine, setMine] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Record<string, string>>({});
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  // Latest lat/lng from the device, used by the ping interval. A ref (not
  // state) so the 15s interval closure always reads the current value
  // without needing to be torn down/recreated on every location update.
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  async function loadOrders() {
    try {
      const [availBody, mineBody] = await Promise.all([
        apiFetch<{ orders: OrderRow[] }>("/api/delivery/available-orders"),
        apiFetch<{ orders: OrderRow[] }>("/api/delivery/orders"),
      ]);
      setAvailable(availBody.orders);
      setMine(mineBody.orders);
      const activeIds = new Set(
        mineBody.orders
          .filter((o) => o.status === "assigned" || o.status === "picked_up")
          .map((o) => o.id)
      );
      setAddresses((prev) => {
        const next: Record<string, string> = {};
        for (const [id, addr] of Object.entries(prev)) {
          if (activeIds.has(id)) next[id] = addr;
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  // Refetch whenever the screen regains focus, same reasoning as the
  // customer orders list — matches Phase 3 convention in this app.
  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [])
  );

  // Foreground location while online: ask permission once per online
  // session, keep coordsRef updated so the ping interval below always
  // sends something current.
  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted" || cancelled) return;
      try {
        const position = await Location.getCurrentPositionAsync({});
        if (!cancelled) {
          coordsRef.current = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
        }
      } catch {
        // Location unavailable — ping interval below skips silently until
        // a value is available.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  // Ping every 15s while online, matching the web dashboard's cadence.
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(async () => {
      const coords = coordsRef.current;
      if (!coords) return;
      try {
        await apiFetch("/api/delivery/ping", {
          method: "POST",
          body: { lat: coords.lat, lng: coords.lng },
        });
      } catch {
        // Best-effort — a missed ping isn't worth surfacing an error for.
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [isOnline]);

  // Refresh available/mine lists every 10s while online, matching the web
  // dashboard's polling cadence.
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [isOnline]);

  async function toggleOnline() {
    setToggling(true);
    setError(null);
    try {
      const body = await apiFetch<{ isOnline: boolean }>("/api/delivery/toggle-online", {
        method: "POST",
      });
      setIsOnline(body.isOnline);
      await loadOrders();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to toggle online status");
    } finally {
      setToggling(false);
    }
  }

  async function claim(orderId: string) {
    setError(null);
    setBusyOrderId(orderId);
    try {
      await apiFetch(`/api/delivery/orders/${orderId}/claim`, { method: "POST" });
      await loadOrders();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to claim order");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function advance(orderId: string) {
    setError(null);
    setBusyOrderId(orderId);
    try {
      await apiFetch(`/api/delivery/orders/${orderId}/status`, { method: "POST" });
      await loadOrders();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update order status");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function viewAddress(orderId: string) {
    setError(null);
    try {
      const body = await apiFetch<{ address: { line1: string } }>(
        `/api/delivery/orders/${orderId}/address`
      );
      setAddresses((prev) => ({ ...prev, [orderId]: body.address.line1 }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load address");
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>Dashboard</Text>
        <Pressable onPress={handleSignOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable
        style={styles.earningsBar}
        onPress={toggleOnline}
        disabled={toggling}
      >
        {toggling ? (
          <ActivityIndicator color={BRAND.colors.surface} />
        ) : (
          <Text style={styles.toggleText}>
            {isOnline ? "Online" : "Offline"} — tap to toggle
          </Text>
        )}
      </Pressable>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 20 }}>
          <View style={{ gap: 20 }}>
              <View style={styles.section}>
                <Text style={styles.sectionHeading}>Available orders</Text>
                {available.length === 0 && (
                  <Text style={styles.mutedText}>None right now.</Text>
                )}
                {available.map((o) => (
                  <View key={o.id} style={styles.card}>
                    <Text style={styles.cardText}>
                      #{o.id.slice(0, 8)} · {o.stores?.name ?? "Restaurant"} · ₹
                      {Number(o.total).toFixed(2)}
                    </Text>
                    <Pressable
                      style={styles.acceptButton}
                      onPress={() => claim(o.id)}
                      disabled={busyOrderId === o.id}
                    >
                      {busyOrderId === o.id ? (
                        <ActivityIndicator color={BRAND.colors.surface} size="small" />
                      ) : (
                        <Text style={styles.smallButtonText}>Accept</Text>
                      )}
                    </Pressable>
                  </View>
                ))}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionHeading}>Your deliveries</Text>
                {mine.length === 0 && (
                  <Text style={styles.mutedText}>No deliveries yet.</Text>
                )}
                {mine.map((o) => (
                  <View key={o.id} style={styles.mineCard}>
                    <View style={styles.mineCardRow}>
                      <Text style={styles.cardText}>
                        #{o.id.slice(0, 8)} · {o.status} · ₹{Number(o.total).toFixed(2)}
                      </Text>
                      <View style={styles.actionRow}>
                        {(o.status === "assigned" || o.status === "picked_up") && (
                          <Pressable
                            style={styles.outlineButton}
                            onPress={() => viewAddress(o.id)}
                          >
                            <Text style={styles.outlineButtonText}>View address</Text>
                          </Pressable>
                        )}
                        {NEXT_LABEL[o.status] && (
                          <Pressable
                            style={styles.smallButton}
                            onPress={() => advance(o.id)}
                            disabled={busyOrderId === o.id}
                          >
                            {busyOrderId === o.id ? (
                              <ActivityIndicator color={BRAND.colors.surface} size="small" />
                            ) : (
                              <Text style={styles.smallButtonText}>{NEXT_LABEL[o.status]}</Text>
                            )}
                          </Pressable>
                        )}
                      </View>
                    </View>
                    {addresses[o.id] && (
                      <Text style={styles.mutedText}>{addresses[o.id]}</Text>
                    )}
                  </View>
                ))}
              </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, backgroundColor: BRAND.colors.background },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  signOut: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.inkMuted },
  centered: { alignItems: "center", paddingVertical: 24 },
  mutedText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted, fontSize: 13 },
  errorText: { fontFamily: BRAND.fonts.body, color: "#dc2626" },
  earningsBar: {
    borderRadius: BRAND.radiusPill,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: BRAND.colors.ink,
  },
  toggleText: {
    fontFamily: BRAND.fonts.bodySemiBold,
    color: BRAND.colors.surface,
    fontSize: 15,
  },
  section: { gap: 8 },
  sectionHeading: {
    fontFamily: BRAND.fonts.bodySemiBold,
    color: BRAND.colors.ink,
    fontSize: 16,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  mineCard: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: 16,
    padding: 12,
    gap: 6,
  },
  mineCardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  cardText: {
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.ink,
    fontSize: 13,
    flexShrink: 1,
  },
  actionRow: { flexDirection: "row", gap: 8 },
  smallButton: {
    backgroundColor: BRAND.colors.primary,
    borderRadius: BRAND.radiusPill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptButton: {
    backgroundColor: BRAND.colors.accent,
    borderRadius: BRAND.radiusPill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonText: {
    fontFamily: BRAND.fonts.bodySemiBold,
    color: BRAND.colors.surface,
    fontSize: 12,
  },
  outlineButton: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "40",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  outlineButtonText: {
    fontFamily: BRAND.fonts.bodyMedium,
    color: BRAND.colors.ink,
    fontSize: 12,
  },
});
