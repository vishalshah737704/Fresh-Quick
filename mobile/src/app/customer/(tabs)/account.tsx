import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../../../../lib/supabase";
import { BRAND } from "../../../../theme";
import { useRequireSession } from "../../../../lib/use-require-session";
import { usePushRegistration, unregisterPush } from "../../../../lib/push";
import { useUnreadCount } from "../../../../lib/use-unread-count";
import { apiFetch } from "../../../../lib/api";

// Account tab: houses profile info, sign-out, wallet, and help as list rows,
// matching UberEats' Account tab pattern (mobile UberEats redesign spec,
// Phase 1). Wallet/Help stay as their own stack screens pushed from here.
export default function CustomerAccountScreen() {
  useRequireSession("/login/customer");
  const router = useRouter();
  usePushRegistration();
  const unread = useUnreadCount();
  const [profileName, setProfileName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [resetStatus, setResetStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    async function loadProfile() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) return;
      const [{ data: userRow }, { data: authData }] = await Promise.all([
        supabase.from("users").select("full_name").eq("id", userId).single(),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      setProfileName(userRow?.full_name ?? null);
      setEmail(authData?.user?.email ?? null);
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleResetPassword() {
    if (!email) return;
    setResetStatus("sending");
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setResetStatus(error ? "error" : "sent");
  }

  async function handleSignOut() {
    await unregisterPush(apiFetch);
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

      <View style={styles.profileCard}>
        <Text style={styles.profileName}>{profileName || "My Profile"}</Text>
        {email && <Text style={styles.profileEmail}>{email}</Text>}
        <Pressable onPress={handleResetPassword} disabled={!email || resetStatus === "sending"}>
          <Text style={styles.resetPasswordLink}>
            {resetStatus === "sent"
              ? "Reset email sent"
              : resetStatus === "error"
                ? "Couldn't send — try again"
                : resetStatus === "sending"
                  ? "Sending…"
                  : "Reset password"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        <Pressable style={styles.row} onPress={() => router.push("/customer/notifications" as never)}>
          <Ionicons name="notifications-outline" size={20} color={BRAND.colors.ink} />
          <Text style={styles.rowLabel}>Notifications</Text>
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? "99+" : unread}</Text>
            </View>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={BRAND.colors.inkMuted} />
        </Pressable>

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
  profileCard: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    padding: 16,
    gap: 4,
  },
  profileName: {
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 16,
    color: BRAND.colors.ink,
  },
  profileEmail: {
    fontFamily: BRAND.fonts.body,
    fontSize: 13,
    color: BRAND.colors.inkMuted,
  },
  resetPasswordLink: {
    marginTop: 4,
    fontFamily: BRAND.fonts.body,
    fontSize: 13,
    color: BRAND.colors.accentTextSafe,
    textDecorationLine: "underline",
  },
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
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: BRAND.colors.primaryTextSafe,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 11, color: "#FFFFFF" },
  signOutLabel: {
    color: "#c0392b",
  },
});
