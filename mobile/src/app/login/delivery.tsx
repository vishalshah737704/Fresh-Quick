import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { BRAND } from "../../../theme";

// Mirrors app/delivery/login/page.tsx on the web: sign in, then verify
// users.role === "delivery" before proceeding — sign back out and show an
// error on mismatch, same as the web behavior.
export default function DeliveryLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setSubmitting(false);
      setError(signInError.message);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();

    setSubmitting(false);

    if (profile?.role !== "delivery") {
      setError("This account is not a delivery partner account.");
      await supabase.auth.signOut();
      return;
    }

    router.replace("/delivery/dashboard");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Delivery Partner Log In</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={BRAND.colors.inkMuted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={BRAND.colors.inkMuted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={handleLogin} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color={BRAND.colors.surface} />
        ) : (
          <Text style={styles.buttonText}>Log In</Text>
        )}
      </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BRAND.colors.background },
  container: {
    flexGrow: 1,
    backgroundColor: BRAND.colors.background,
    padding: 24,
    gap: 12,
    justifyContent: "center",
  },
  heading: {
    fontFamily: BRAND.fonts.heading,
    fontSize: 24,
    color: BRAND.colors.ink,
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted,
    borderRadius: BRAND.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: BRAND.fonts.body,
    color: BRAND.colors.ink,
    backgroundColor: BRAND.colors.surface,
  },
  error: {
    color: "#c0392b",
    fontFamily: BRAND.fonts.body,
  },
  button: {
    backgroundColor: BRAND.colors.primaryTextSafe,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    color: BRAND.colors.surface,
    fontFamily: BRAND.fonts.bodySemiBold,
    fontSize: 16,
  },
});
