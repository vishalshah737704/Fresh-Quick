import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { BRAND } from "../../../theme";
import { resolveLoginErrorText } from "../../../lib/registration-model";

// Mirrors app/admin/login/page.tsx on the web: sign in, then verify users.role === "admin"; sign back out
// with an error on a mismatch. The role check is a courtesy: every admin API route re-checks the role.
export default function AdminLoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError(resolveLoginErrorText(signInError.message, null));
        return;
      }
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      const { data: profile } = await supabase.from("users").select("role").eq("id", userId).single();
      if (profile?.role !== "admin") {
        setError("This account is not an admin account.");
        await supabase.auth.signOut();
        return;
      }
      router.replace("/admin/overview");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Admin Log In</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={BRAND.colors.inkMuted}
          autoCapitalize="none"
          autoCorrect={false}
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
          {submitting ? <ActivityIndicator color={BRAND.colors.surface} /> : <Text style={styles.buttonText}>Log In</Text>}
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
    color: BRAND.colors.dangerTextSafe,
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
