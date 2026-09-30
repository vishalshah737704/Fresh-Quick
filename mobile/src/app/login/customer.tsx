import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { BRAND } from "../../../theme";

// Mirrors app/customer/login/page.tsx on the web: email/password sign-in
// against Supabase Auth. Customer role has no extra role-check on login
// there (any authenticated user can browse as a customer), so this screen
// matches that — same pattern kept for parity with the web behavior.
export default function CustomerLoginScreen() {
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
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace("/customer/home");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Customer Log In</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
