import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../../lib/supabase";
import { BRAND } from "../../../../theme";
import { useRequireSession } from "../../../../lib/use-require-session";

// Account tab: houses sign-out, wallet, and help as list rows, matching
// UberEats' Account tab pattern (mobile UberEats redesign spec, Phase 1).
// Wallet/Help stay as their own stack screens pushed from here.
export default function CustomerAccountScreen() {
  useRequireSession("/login/customer");
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/login/customer");
  }

  function confirmSignOut() {
    Alert.alert("Sign out?", "You'll need to log in again to place orders.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: handleSignOut },
    ]);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Account</Text>

      <View style={styles.list}>
        <Pressable style={styles.row} onPress={() => router.push("/customer/wallet")}>
          <Ionicons name="wallet-outline" size={20} color={BRAND.colors.ink} />
          <Text style={styles.rowLabel}>Wallet</Text>
          <Ionicons name="chevron-forward" size={18} color={BRAND.colors.inkMuted} />
        </Pressable>

        <Pressable style={styles.row} onPress={() => router.push("/customer/help")}>
          <Ionicons name="help-circle-outline" size={20} color={BRAND.colors.ink} />
          <Text style={styles.rowLabel}>Help</Text>
          <Ionicons name="chevron-forward" size={18} color={BRAND.colors.inkMuted} />
        </Pressable>

        <Pressable style={[styles.row, styles.rowLast]} onPress={confirmSignOut}>
          <Ionicons name="log-out-outline" size={20} color="#c0392b" />
          <Text style={[styles.rowLabel, styles.signOutLabel]}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16, backgroundColor: BRAND.colors.background },
  heading: { fontFamily: BRAND.fonts.heading, fontSize: 24, color: BRAND.colors.ink },
  list: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BRAND.colors.inkMuted + "15",
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    flex: 1,
    fontFamily: BRAND.fonts.bodyMedium,
    fontSize: 15,
    color: BRAND.colors.ink,
  },
  signOutLabel: {
    color: "#c0392b",
  },
});
