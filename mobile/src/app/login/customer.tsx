import { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, View, ScrollView, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "../../../lib/supabase";
import { apiPostPublic, ApiError } from "../../../lib/api";
import { validateRecipientPhone } from "../../../lib/phone";
import { MIN_PASSWORD_LENGTH, validateSignupAddress } from "../../../lib/signup-validation";
import { REGISTRATION_PENDING_POPUP, isBannedLoginError, resolveLoginErrorText } from "../../../lib/registration-model";
import { fetchRegistrationStatus } from "../../../lib/registration-status";
import { BRAND } from "../../../theme";

// Mirrors app/customer/login/page.tsx on the web: email/password sign-in against Supabase Auth, plus a
// Sign up mode that posts to the public /api/auth/signup route. Sign-up does not sign the customer in:
// the account waits for admin approval, so a popup says so (same wording as the web). A refused login
// asks /api/auth/registration-status why and shows the shared pending / rejected message.
export default function CustomerLoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPendingPopup, setShowPendingPopup] = useState(false);

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
      const answer = isBannedLoginError(signInError.message) ? await fetchRegistrationStatus(trimmedEmail) : null;
      setError(resolveLoginErrorText(signInError.message, answer));
      return;
    }
    router.replace("/customer/home");
  }

  function dismissPendingPopup() {
    setShowPendingPopup(false);
    setFullName("");
    setEmail("");
    setPassword("");
    setPhone("");
    setLine1("");
    setLine2("");
    setCity("");
    setState("");
    setPincode("");
    setReferralCode("");
    setError(null);
    setMode("login");
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
      const phoneError = validateRecipientPhone(phone);
      if (phoneError) {
        setError(phoneError);
        return;
      }
      const addressCheck = validateSignupAddress({ line1, line2, city, state, pincode });
      if (!addressCheck.ok) {
        setError(addressCheck.error);
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
            phone: phone.trim(),
            referralCode: referralCode.trim() === "" ? undefined : referralCode.trim(),
            address: {
              line1: line1.trim(),
              line2: line2.trim(),
              city: city.trim(),
              state: state.trim(),
              pincode: pincode.trim(),
            },
          });
        } catch (signupError) {
          if (signupError instanceof ApiError) {
            setError(signupError.message || "Signup failed");
          } else {
            setError("Could not reach the server");
          }
          return;
        }
        // The account is pending admin approval: no session, so do not sign in.
        setShowPendingPopup(true);
        return;
      }
      await signIn(email.trim());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
      <Modal visible={showPendingPopup} transparent animationType="fade" statusBarTranslucent onRequestClose={dismissPendingPopup}>
        <View style={styles.backdrop}>
          <View style={styles.popup}>
            <Text style={styles.popupText}>{REGISTRATION_PENDING_POPUP}</Text>
            <Pressable style={styles.button} onPress={dismissPendingPopup} accessibilityRole="button">
              <Text style={styles.buttonText}>OK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
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
      {mode === "signup" && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Phone (10-digit mobile)"
            placeholderTextColor={BRAND.colors.inkMuted}
            keyboardType="phone-pad"
            autoComplete="tel"
            value={phone}
            onChangeText={setPhone}
          />
          <TextInput
            style={styles.input}
            placeholder="Address line 1"
            placeholderTextColor={BRAND.colors.inkMuted}
            autoComplete="address-line1"
            value={line1}
            onChangeText={setLine1}
          />
          <TextInput
            style={styles.input}
            placeholder="Address line 2 (optional)"
            placeholderTextColor={BRAND.colors.inkMuted}
            autoComplete="address-line2"
            value={line2}
            onChangeText={setLine2}
          />
          <TextInput
            style={styles.input}
            placeholder="City"
            placeholderTextColor={BRAND.colors.inkMuted}
            value={city}
            onChangeText={setCity}
          />
          <TextInput
            style={styles.input}
            placeholder="State"
            placeholderTextColor={BRAND.colors.inkMuted}
            value={state}
            onChangeText={setState}
          />
          <TextInput
            style={styles.input}
            placeholder="Pincode (6 digits)"
            placeholderTextColor={BRAND.colors.inkMuted}
            keyboardType="number-pad"
            maxLength={6}
            autoComplete="postal-code"
            value={pincode}
            onChangeText={setPincode}
          />
          <TextInput
            style={styles.input}
            placeholder="Referral code (optional)"
            placeholderTextColor={BRAND.colors.inkMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            value={referralCode}
            onChangeText={setReferralCode}
          />
        </>
      )}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  popup: {
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 20,
    gap: 12,
  },
  popupText: {
    color: BRAND.colors.ink,
    fontFamily: BRAND.fonts.body,
    fontSize: 16,
  },
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
  toggleText: {
    color: BRAND.colors.inkMuted,
    fontFamily: BRAND.fonts.body,
    textDecorationLine: "underline",
    textAlign: "center",
    marginTop: 4,
  },
});
