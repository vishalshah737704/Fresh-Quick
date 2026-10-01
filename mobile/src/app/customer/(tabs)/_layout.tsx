import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND } from "../../../../theme";

// Bottom tab bar: Home / Orders / Account. Store detail, cart, checkout, and
// order detail stay as stack screens pushed from the root Stack in
// _layout.tsx — they are NOT tabs (mobile UberEats redesign spec, Phase 1).
export default function CustomerTabsLayout() {
  // The tabs hide their native header, so nothing else pushes content below
  // the status bar / Dynamic Island — without this inset the screen titles
  // render underneath the iPhone clock.
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        sceneStyle: { paddingTop: insets.top },
        headerStyle: { backgroundColor: BRAND.colors.surface },
        headerTintColor: BRAND.colors.ink,
        headerTitleStyle: { fontFamily: BRAND.fonts.bodySemiBold },
        tabBarActiveTintColor: BRAND.colors.ink,
        tabBarInactiveTintColor: BRAND.colors.inkMuted,
        tabBarStyle: {
          backgroundColor: BRAND.colors.surface,
          borderTopColor: BRAND.colors.inkMuted + "22",
        },
        tabBarLabelStyle: {
          fontFamily: BRAND.fonts.bodyMedium,
          fontSize: 11,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "Orders",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="receipt-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
