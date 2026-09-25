"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function getSafeRedirect(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.href : "/admin/dashboard";
  } catch {
    return "/admin/dashboard";
  }
}

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirectTo = searchParams.get("redirectTo") ?? "/admin/dashboard";

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
    if (profile?.role !== "admin") {
      setError("This account is not an admin account.");
      await supabase.auth.signOut();
      return;
    }
    router.push(getSafeRedirect(rawRedirectTo));
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-bold">Admin log in</h1>
      <div className="flex flex-col gap-2">
        <input
          className="rounded border px-2 py-1"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="rounded border px-2 py-1"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={submitting}
          onClick={handleLogin}
          className="rounded bg-brand-primary px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {submitting ? "Please wait…" : "Log in"}
        </button>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
