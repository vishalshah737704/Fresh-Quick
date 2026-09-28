import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { BRAND } from "../../../theme";

// Placeholder home screen — Phase 1 scaffold only. Real customer home
// (search, address picker, category chips, carousels) lands in Phase 2.
export default function CustomerHomeScreen() {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Home - Customer</Text>
      <Pressable style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BRAND.colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  text: {
    fontFamily: BRAND.fonts.heading,
    fontSize: 22,
    color: BRAND.colors.ink,
  },
  button: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  buttonText: {
    fontFamily: BRAND.fonts.bodyMedium,
    color: BRAND.colors.ink,
  },
});
