import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
import { Poppins_300Light } from "@expo-google-fonts/poppins";
import { View, ActivityIndicator } from "react-native";
import { BRAND } from "../../theme";
import { CartProvider } from "../../lib/cart-store";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Poppins_300Light,
  });

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
        <Stack.Screen name="customer/home" options={{ title: "Home", headerBackVisible: false }} />
        <Stack.Screen name="customer/store/[id]" options={{ title: "Menu" }} />
        <Stack.Screen name="customer/cart" options={{ title: "Cart" }} />
        <Stack.Screen name="delivery/dashboard" options={{ title: "Dashboard", headerBackVisible: false }} />
      </Stack>
    </CartProvider>
  );
}
