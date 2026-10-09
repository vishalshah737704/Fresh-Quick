import { useEffect, useState } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND } from "../../../../theme";
import { apiFetch } from "../../../../lib/api";
import { onAdminPendingChanged } from "../../../../lib/admin-pending";

// Admin bottom tabs. The native header is hidden, so the scene needs the top inset itself
// (same reason as the customer tabs layout). The Registrations tab shows the pending count.
export default function AdminTabsLayout() {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const summary = await apiFetch<{ pending: number }>("/api/admin/registrations/summary");
        if (!cancelled) setPending(summary.pending);
      } catch {
        // Not signed in as an admin (or offline): the badge simply stays as it was.
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const off = onAdminPendingChanged(() => void refresh());
    return () => {
      cancelled = true;
      clearInterval(timer);
      off();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { paddingTop: insets.top },
        tabBarActiveTintColor: BRAND.colors.ink,
        tabBarInactiveTintColor: BRAND.colors.inkMuted,
        tabBarStyle: {
          backgroundColor: BRAND.colors.surface,
          borderTopColor: BRAND.colors.inkMuted + "22",
        },
        tabBarLabelStyle: { fontFamily: BRAND.fonts.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="overview"
        options={{
          title: "Overview",
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="registrations"
        options={{
          title: "Registrations",
          headerShown: false,
          tabBarBadge: pending > 0 ? pending : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
