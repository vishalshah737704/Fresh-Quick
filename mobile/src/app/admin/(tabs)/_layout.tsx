import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND } from "../../../../theme";

// Admin bottom tabs. The native header is hidden, so the scene needs the top inset itself
// (same reason as the customer tabs layout).
export default function AdminTabsLayout() {
  const insets = useSafeAreaInsets();
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
    </Tabs>
  );
}
