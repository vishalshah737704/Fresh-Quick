import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { Poppins_700Bold } from "@expo-google-fonts/poppins";
import { View, ActivityIndicator } from "react-native";
import { BRAND } from "../../theme";
import { CartProvider } from "../../lib/cart-store";
import { supabase } from "../../lib/supabase";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Poppins_700Bold,
  });

  // Root layout mounts exactly once per cold launch (process start) and is
  // never remounted by backgrounding/foregrounding the app, so an
  // unconditional sign-out here on first mount forces a logged-out state on
  // every fresh launch while leaving a live session alone for the rest of
  // that process's lifetime (in-app navigation, background/foreground).
  // Limitation: does not distinguish "cold launch after force-quit" from
  // "first launch ever" — both behave the same (signed out), which is the
  // desired behavior either way.
  useEffect(() => {
    supabase.auth.signOut();
  }, []);

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: BRAND.colors.background,
        }}
      >
        <ActivityIndicator color={BRAND.colors.primary} />
      </View>
    );
  }

  return (
    <CartProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: BRAND.colors.surface },
          headerTintColor: BRAND.colors.ink,
          headerTitleStyle: { fontFamily: BRAND.fonts.bodySemiBold },
          contentStyle: { backgroundColor: BRAND.colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: BRAND.name, headerShown: false }} />
        <Stack.Screen name="login/customer" options={{ title: "Customer Log In" }} />
        <Stack.Screen name="login/delivery" options={{ title: "Delivery Partner Log In" }} />
        <Stack.Screen name="customer/(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="customer/store/[id]" options={{ title: "Menu" }} />
        <Stack.Screen name="customer/cart" options={{ title: "Cart" }} />
        <Stack.Screen name="delivery/dashboard" options={{ title: "Dashboard", headerBackVisible: false }} />
      </Stack>
    </CartProvider>
  );
}
