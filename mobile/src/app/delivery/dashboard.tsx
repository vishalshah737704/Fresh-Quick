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
import type { OrderDetail } from "../../../lib/order-detail";
import { DeliveryOrderCard } from "../../../components/DeliveryOrderCard";

// Mirrors app/delivery/(portal)/dashboard/page.tsx on the web: online/
// offline toggle, available-order self-claim list, "mine" list with the
// correct next-status action per status, redacted-by-scope order cards
// (recipient details only after claiming), a 15s location ping and a 10s list refresh while online.
//
// Scope limitation: foreground location only (expo-location's
// getCurrentPositionAsync while the app is open) — no background location
// permission/task, matching what this pass was asked to build.

export default function DeliveryDashboardScreen() {
  useRequireSession("/login/delivery");
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [available, setAvailable] = useState<OrderDetail[]>([]);
  const [mine, setMine] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;
      const { data } = await supabase.from("users").select("full_name").eq("id", userId).single();
      if (!cancelled) setProfileName(data?.full_name ?? null);
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  // Latest lat/lng from the device, used by the ping interval. A ref (not
  // state) so the 15s interval closure always reads the current value
  // without needing to be torn down/recreated on every location update.
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  async function loadOrders() {
    try {
      const body = await apiFetch<{ available: OrderDetail[]; mine: OrderDetail[] }>(
        "/api/delivery/active"
      );
      setAvailable(body.available);
      setMine(body.mine);
      setError(null);
    } catch (err) {
      // Keep the previous lists; a failed refresh must not blank the screen.
      setError(err instanceof ApiError && err.message ? err.message : "Failed to refresh orders");
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

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  async function handleResetPassword() {
    setResetStatus("sending");
    const { data: userData } = await supabase.auth.getUser();
    const email = userData?.user?.email;
    if (!email) {
      setResetStatus("error");
      return;
    }
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
    setResetStatus(resetError ? "error" : "sent");
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View>
          <View style={styles.titleRow}>
            <Text style={styles.heading}>Dashboard</Text>
            <Pressable onPress={() => router.push("/delivery/history")}>
              <Text style={styles.historyLink}>History</Text>
            </Pressable>
          </View>
          {profileName ? <Text style={styles.profileName}>{profileName}</Text> : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Pressable onPress={handleSignOut}>
            <Text style={styles.signOut}>Sign out</Text>
          </Pressable>
          <Pressable onPress={handleResetPassword} disabled={resetStatus === "sending"}>
            <Text style={styles.resetPasswordLink}>
              {resetStatus === "sent"
                ? "Reset email sent"
                : resetStatus === "error"
                  ? "Couldn't send"
                  : "Reset password"}
            </Text>
          </Pressable>
        </View>
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
                <Text style={styles.sectionHeading}>Your active deliveries</Text>
                {mine.length === 0 && (
                  <Text style={styles.mutedText}>No active deliveries.</Text>
                )}
                {mine.map((o) => (
                  <DeliveryOrderCard
                    key={o.id}
                    order={o}
                    scope="active"
                    busy={busyOrderId === o.id}
                    onAdvance={() => advance(o.id)}
                  />
                ))}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionHeading}>Available orders</Text>
                {!isOnline ? (
                  <Text style={styles.mutedText}>Go online to see available orders.</Text>
                ) : available.length === 0 ? (
                  <Text style={styles.mutedText}>None right now.</Text>
                ) : (
                  available.map((o) => (
                    <DeliveryOrderCard
                      key={o.id}
                      order={o}
                      scope="available"
                      busy={busyOrderId === o.id}
                      onClaim={() => claim(o.id)}
                    />
                  ))
                )}
              </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, backgroundColor: BRAND.colors.primaryTint },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  historyLink: {
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 14,
    color: BRAND.colors.primaryTextSafe,
    textDecorationLine: "underline",
  },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  signOut: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.inkMuted },
  profileName: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted },
  resetPasswordLink: {
    marginTop: 4,
    fontFamily: BRAND.fonts.body,
    fontSize: 12,
    color: BRAND.colors.accentTextSafe,
    textDecorationLine: "underline",
  },
  centered: { alignItems: "center", paddingVertical: 24 },
  mutedText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted, fontSize: 13 },
  errorText: { fontFamily: BRAND.fonts.body, color: BRAND.colors.danger },
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
});
