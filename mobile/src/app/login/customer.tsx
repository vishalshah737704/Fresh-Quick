import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { apiPostPublic, ApiError } from "../../../lib/api";
import { BRAND } from "../../../theme";

// Mirrors the server rule in lib/signup-validation.ts and supabase config.
const MIN_PASSWORD_LENGTH = 6;

// Mirrors app/customer/login/page.tsx on the web: email/password sign-in
// against Supabase Auth, plus a Sign up mode that posts to the public
// /api/auth/signup route and then signs the new user in. Customer role has
// no extra role-check on login there (any authenticated user can browse as
// a customer), so this screen matches that.
export default function CustomerLoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function switchMode() {
    setMode(mode === "login" ? "signup" : "login");
    setError(null);
  }

  async function signIn(trimmedEmail: string) {
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace("/customer/home");
  }

  async function handleSubmit() {
    if (submitting) return;
    const trimmedName = fullName.trim();
    const trimmedEmail = email.trim();
    if (mode === "signup") {
      if (!trimmedName) {
        setError("Please enter your full name");
        return;
      }
      if (!trimmedEmail || !trimmedEmail.includes("@")) {
        setError("Please enter a valid email address");
        return;
      }
      if (password.length < MIN_PASSWORD_LENGTH) {
        setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "signup") {
        try {
          await apiPostPublic("/api/auth/signup", {
            email: trimmedEmail,
            password,
            fullName: trimmedName,
          });
        } catch (signupError) {
          if (signupError instanceof ApiError) {
            setError(signupError.message || "Signup failed");
          } else {
            setError("Could not reach the server");
          }
          return;
        }
      }
      await signIn(mode === "signup" ? trimmedEmail : email);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>
        {mode === "signup" ? "Customer Sign Up" : "Customer Log In"}
      </Text>
      {mode === "signup" && (
        <TextInput
          style={styles.input}
          placeholder="Full name"
          placeholderTextColor={BRAND.colors.inkMuted}
          autoCapitalize="words"
          autoComplete="name"
          value={fullName}
          onChangeText={setFullName}
        />
      )}
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={BRAND.colors.inkMuted}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={BRAND.colors.inkMuted}
        secureTextEntry
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? (
          <ActivityIndicator color={BRAND.colors.surface} />
        ) : (
          <Text style={styles.buttonText}>{mode === "signup" ? "Sign Up" : "Log In"}</Text>
        )}
      </Pressable>
      <Pressable onPress={switchMode} disabled={submitting}>
        <Text style={styles.toggleText}>
          {mode === "signup" ? "Have an account? Log in" : "Need an account? Sign up"}
        </Text>
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
  toggleText: {
    color: BRAND.colors.inkMuted,
    fontFamily: BRAND.fonts.body,
    textDecorationLine: "underline",
    textAlign: "center",
    marginTop: 4,
  },
});
