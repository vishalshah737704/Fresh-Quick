import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { BRAND } from "../../theme";

export default function RolePickerScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{BRAND.name}</Text>
      <Text style={styles.subtitle}>Who's using the app?</Text>

      <Pressable
        style={[styles.button, styles.primaryButton]}
        onPress={() => router.push("/login/customer")}
      >
        <Text style={styles.primaryButtonText}>Customer</Text>
      </Pressable>

      <Pressable
        style={[styles.button, styles.secondaryButton]}
        onPress={() => router.push("/login/delivery")}
      >
        <Text style={styles.secondaryButtonText}>Delivery Partner</Text>
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
    paddingHorizontal: 24,
    gap: 12,
  },
  title: {
    fontFamily: BRAND.fonts.heading,
    fontSize: 34,
    color: BRAND.colors.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: BRAND.fonts.body,
    fontSize: 16,
    color: BRAND.colors.inkMuted,
    marginBottom: 24,
  },
  button: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 999,
    alignItems: "center",
  },
  primaryButton: {
    backgroundColor: BRAND.colors.primary,
  },
  primaryButtonText: {
    color: BRAND.colors.surface,
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 16,
  },
  secondaryButton: {
    backgroundColor: BRAND.colors.surface,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted,
  },
  secondaryButtonText: {
    color: BRAND.colors.ink,
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 16,
  },
});
