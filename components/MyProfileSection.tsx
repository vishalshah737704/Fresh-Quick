"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/use-profile";

// "My Profile" block for every portal's side nav (customer AccountMenu,
// Vendor/Delivery/AdminShell) — shows the logged-in user's name and lets
// them trigger a password-reset email via Supabase Auth's
// resetPasswordForEmail, matching the only auth pattern already used in
// this app (signInWithPassword) rather than adding a new re-auth flow.
export function MyProfileSection({
  profile,
  variant = "light",
}: {
  profile: Profile;
  variant?: "light" | "dark";
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function handleResetPassword() {
    if (!profile.email) return;
    setStatus("sending");
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo:
        typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined,
    });
    setStatus(error ? "error" : "sent");
  }

  const isDark = variant === "dark";
  const nameClass = isDark ? "text-white" : "text-brand-ink";
  const emailClass = isDark ? "text-white/60" : "text-brand-ink-muted";
  const linkClass = isDark
    ? "text-white/80 underline hover:text-white"
    : "text-brand-accent-text-safe underline hover:opacity-80";

  return (
    <div className="flex flex-col gap-1">
      <p className={`text-xs uppercase tracking-wide ${isDark ? "text-white/50" : "text-brand-ink-muted"}`}>
        My Profile
      </p>
      <p className={`text-sm font-semibold ${nameClass}`}>{profile.fullName || "Account"}</p>
      {profile.email && <p className={`text-xs ${emailClass}`}>{profile.email}</p>}
      <button
        type="button"
        onClick={handleResetPassword}
        disabled={!profile.email || status === "sending"}
        className={`mt-1 text-left text-xs ${linkClass} disabled:opacity-50`}
      >
        {status === "sent"
          ? "Reset email sent"
          : status === "error"
            ? "Couldn't send — try again"
            : status === "sending"
              ? "Sending…"
              : "Reset password"}
      </button>
    </div>
  );
}
