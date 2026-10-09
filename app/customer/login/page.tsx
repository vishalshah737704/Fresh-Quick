"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { validateRecipientPhone } from "@/lib/phone";
import { validateSignupAddress, MIN_PASSWORD_LENGTH } from "@/lib/signup-validation";
import {
  REGISTRATION_PENDING_POPUP,
  isBannedLoginError,
  parseStatusAnswer,
  resolveLoginErrorText,
} from "@/lib/registration-model";

function getSafeRedirect(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.href : "/customer";
  } catch {
    return "/customer";
  }
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirectTo = searchParams.get("redirectTo") ?? "/customer";

  const [mode, setMode] = useState<"login" | "signup">(searchParams.get("ref") ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [referralCode, setReferralCode] = useState((searchParams.get("ref") ?? "").toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPendingPopup, setShowPendingPopup] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      let answer = null;
      if (isBannedLoginError(signInError.message)) {
        const res = await fetch("/api/auth/registration-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch(() => null);
        answer = parseStatusAnswer(res && res.ok ? await res.json().catch(() => null) : null);
      }
      setError(resolveLoginErrorText(signInError.message, answer));
      return;
    }
    router.push(getSafeRedirect(rawRedirectTo));
  }

  async function handleSignup() {
    setError(null);
    if (!fullName.trim()) return setError("Please enter your full name");
    if (!email.trim() || !email.includes("@")) return setError("Please enter a valid email address");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const phoneError = validateRecipientPhone(phone);
    if (phoneError) return setError(phoneError);
    const address = { line1, line2, city, state, pincode };
    const addressResult = validateSignupAddress(address);
    if (!addressResult.ok) return setError(addressResult.error);
    setSubmitting(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        fullName,
        phone,
        address,
        referralCode: referralCode.trim() === "" ? undefined : referralCode.trim(),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSubmitting(false);
      setError(body.error ?? "Signup failed");
      return;
    }
    setSubmitting(false);
    setShowPendingPopup(true);
  }

  function closePendingPopup() {
    setShowPendingPopup(false);
    setPassword("");
    setFullName("");
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

  return (
    <div className="mx-auto max-w-sm rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-6">
      {showPendingPopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Registration submitted"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-brand-surface p-6 text-center shadow-xl">
            <p className="mb-4 text-brand-ink">{REGISTRATION_PENDING_POPUP}</p>
            <button
              type="button"
              onClick={closePendingPopup}
              className="rounded-[var(--radius-pill)] bg-brand-primary-text-safe px-5 py-2 font-semibold text-white"
            >
              OK
            </button>
          </div>
        </div>
      )}
      <h1 className="mb-4 text-xl font-bold text-brand-ink">
        {mode === "login" ? "Log in" : "Sign up"}
      </h1>
      <div className="flex flex-col gap-2">
        {mode === "signup" && (
          <input
            className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 focus:border-brand-primary focus:outline-none"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 focus:border-brand-primary focus:outline-none"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 focus:border-brand-primary focus:outline-none"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "signup" &&
          [
            { placeholder: "Phone (10-digit mobile)", value: phone, set: setPhone, type: "tel" },
            { placeholder: "Address line 1", value: line1, set: setLine1, type: "text" },
            { placeholder: "Address line 2 (optional)", value: line2, set: setLine2, type: "text" },
            { placeholder: "City", value: city, set: setCity, type: "text" },
            { placeholder: "State", value: state, set: setState, type: "text" },
            { placeholder: "Pincode (6 digits)", value: pincode, set: setPincode, type: "text" },
            { placeholder: "Referral code (optional)", value: referralCode, set: setReferralCode, type: "text" },
          ].map((field) => (
            <input
              key={field.placeholder}
              className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 focus:border-brand-primary focus:outline-none"
              placeholder={field.placeholder}
              type={field.type}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
            />
          ))}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={submitting}
          onClick={mode === "login" ? handleLogin : handleSignup}
          className="rounded-full bg-brand-primary-text-safe px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="text-sm text-brand-ink-muted underline"
        >
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
