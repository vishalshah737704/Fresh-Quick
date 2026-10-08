import { useCallback, useState } from "react";
import { View, Text, FlatList, Pressable, Switch, StyleSheet, ActivityIndicator, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { apiFetch, ApiError } from "../lib/api";
import { BRAND } from "../theme";
import {
  DEFAULT_PREFERENCES,
  describeAge,
  type InboxNotification,
  type NotificationPreferences,
} from "../lib/notify-model";

type ListResponse = { notifications: InboxNotification[]; unreadCount: number; nextCursor: string | null };

const TOGGLES: { key: "orderUpdates" | "walletUpdates" | "promotions" | "push"; label: string; customerOnly?: boolean }[] = [
  { key: "orderUpdates", label: "Order updates" },
  { key: "walletUpdates", label: "Wallet updates", customerOnly: true },
  { key: "promotions", label: "Promotions", customerOnly: true },
  { key: "push", label: "Push notifications" },
];

// Shared by the customer and delivery inbox screens. Only customers have an order-detail route to open.
export function NotificationsView({ role }: { role: "customer" | "delivery" }) {
  const router = useRouter();
  const [items, setItems] = useState<InboxNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [cursor, setCursor] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, settings] = await Promise.all([
        apiFetch<ListResponse>("/api/notifications"),
        apiFetch<{ preferences: NotificationPreferences }>("/api/notifications/preferences"),
      ]);
      setItems(list.notifications);
      setUnread(list.unreadCount);
      setCursor(list.nextCursor);
      setPrefs(settings.preferences);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load notifications");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await apiFetch<ListResponse>(`/api/notifications?before=${encodeURIComponent(cursor)}`);
      setItems((prev) => [...prev, ...res.notifications.filter((n) => !prev.some((p) => p.id === n.id))]);
      setCursor(res.nextCursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load more");
    } finally {
      setLoadingMore(false);
    }
  }

  async function markAllRead() {
    try {
      await apiFetch("/api/notifications/read", { method: "POST", body: { all: true } });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not mark as read");
    }
  }

  function openItem(item: InboxNotification) {
    if (!item.read) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      setUnread((count) => Math.max(0, count - 1));
      apiFetch("/api/notifications/read", { method: "POST", body: { ids: [item.id] } }).catch(() => {});
    }
    if (role === "customer" && item.orderId) router.push(`/customer/orders/${item.orderId}` as never);
  }

  async function toggle(key: keyof NotificationPreferences, value: boolean) {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      const res = await apiFetch<{ preferences: NotificationPreferences }>("/api/notifications/preferences", {
        method: "PUT",
        body: { [key]: value },
      });
      setPrefs(res.preferences);
    } catch (err) {
      setPrefs(previous);
      setError(err instanceof ApiError ? err.message : "Could not save setting");
    }
  }

  const header = (
    <View style={styles.settings}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Recent</Text>
        <Pressable onPress={markAllRead} disabled={unread === 0}>
          <Text style={[styles.link, unread === 0 && styles.linkDisabled]}>Mark all read</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  const footer = (
    <View style={{ gap: 12 }}>
      {cursor ? (
        <Pressable style={styles.loadMore} onPress={loadMore} disabled={loadingMore}>
          <Text style={styles.link}>{loadingMore ? "Loading…" : "Load more"}</Text>
        </Pressable>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Settings</Text>
        {TOGGLES.filter((t) => role === "customer" || !t.customerOnly).map((t) => (
          <View key={t.key} style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t.label}</Text>
            <Switch
              value={prefs[t.key]}
              onValueChange={(v) => toggle(t.key, v)}
              trackColor={{ true: BRAND.colors.accent, false: BRAND.colors.inkMuted + "55" }}
            />
          </View>
        ))}
        {(["SMS", "WhatsApp"] as const).map((label) => (
          <View key={label} style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, styles.disabledText]}>{label}</Text>
              <Text style={styles.hint}>Not available yet</Text>
            </View>
            <Switch value={false} disabled />
          </View>
        ))}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={BRAND.colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={{ padding: 16, gap: 8 }}
      data={items}
      keyExtractor={(n) => n.id}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => openItem(item)}>
          <View style={styles.itemRow}>
            <View style={[styles.dot, item.read && styles.dotRead]} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.title, !item.read && styles.titleUnread]}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
              <Text style={styles.age}>{describeAge(item.createdAt)}</Text>
            </View>
          </View>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.colors.background },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: BRAND.colors.background },
  settings: { gap: 8, marginBottom: 4 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 16, color: BRAND.colors.ink },
  link: { fontFamily: BRAND.fonts.bodyMedium, fontSize: 14, color: BRAND.colors.accentTextSafe },
  linkDisabled: { color: BRAND.colors.inkMuted },
  loadMore: { alignItems: "center", paddingVertical: 12 },
  error: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.dangerTextSafe },
  empty: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.inkMuted, paddingVertical: 24, textAlign: "center" },
  card: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    padding: 14,
    gap: 8,
  },
  itemRow: { flexDirection: "row", gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: BRAND.colors.primary },
  dotRead: { backgroundColor: "transparent" },
  title: { fontFamily: BRAND.fonts.bodyMedium, fontSize: 15, color: BRAND.colors.ink },
  titleUnread: { fontFamily: BRAND.fonts.bodySemiBold },
  body: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.ink },
  age: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted },
  settingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  settingLabel: { fontFamily: BRAND.fonts.bodyMedium, fontSize: 15, color: BRAND.colors.ink },
  disabledText: { color: BRAND.colors.inkMuted },
  hint: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted },
});
