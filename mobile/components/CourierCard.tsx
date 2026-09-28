import { View, Text, Pressable, Alert, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BRAND } from "../theme";

// UberEats-style "your courier" card shown once a delivery partner is
// assigned. Call/message are demo stubs — no telephony/chat backend exists
// (see md_version/MOBILE_UBEREATS_REDESIGN_SPEC.md's "explicitly NOT in
// scope" list), so both buttons just surface an honest alert instead of
// silently doing nothing.
export function CourierCard({ name }: { name: string | null }) {
  const displayName = name && name.trim().length > 0 ? name.trim() : "Delivery partner";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function stub(action: string) {
    Alert.alert("Not available in this demo", `${action} isn't wired up to a real backend yet.`);
  }

  return (
    <View style={styles.card}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials || "DP"}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.subtitle}>Your delivery partner</Text>
      </View>
      <View style={styles.actions}>
        <Pressable style={styles.iconButton} onPress={() => stub("Calling")}>
          <Ionicons name="call-outline" size={18} color={BRAND.colors.ink} />
        </Pressable>
        <Pressable style={styles.iconButton} onPress={() => stub("Messaging")}>
          <Ionicons name="chatbubble-outline" size={18} color={BRAND.colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: BRAND.colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 14, color: BRAND.colors.primary },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 14, color: BRAND.colors.ink },
  subtitle: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted },
  actions: { flexDirection: "row", gap: 8 },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: BRAND.colors.inkMuted + "15",
  },
});
