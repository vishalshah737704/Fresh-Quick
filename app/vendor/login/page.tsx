"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function getSafeRedirect(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.href : "/vendor/dashboard";
  } catch {
    return "/vendor/dashboard";
  }
}

function VendorLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirectTo = searchParams.get("redirectTo") ?? "/vendor/dashboard";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [lat, setLat] = useState("12.9716");
  const [lng, setLng] = useState("77.5946");
  const [cuisineOptions, setCuisineOptions] = useState<{ slug: string; label: string }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("cuisine_taxonomy")
      .select("slug, label")
      .then(({ data }) => setCuisineOptions(data ?? []));
  }, []);

  function toggleTag(slug: string) {
    setSelectedTags((prev) =>
      prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug]
    );
  }

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
    if (profile?.role !== "vendor") {
      setError("This account is not a vendor account.");
      await supabase.auth.signOut();
      return;
    }
    router.push(getSafeRedirect(rawRedirectTo));
  }

  async function handleSignup() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/vendor-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        fullName,
        restaurantName,
        cuisineTags: selectedTags,
        lat: Number(lat),
        lng: Number(lng),
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setSubmitting(false);
      setError(body.error ?? "Signup failed");
      return;
    }
    await handleLogin();
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-bold text-brand-ink">
        {mode === "login" ? "Vendor log in" : "Vendor sign up"}
      </h1>
      <div className="flex flex-col gap-2">
        {mode === "signup" && (
          <>
            <input
              className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 focus:border-brand-primary focus:outline-none"
              placeholder="Your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <input
              className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 focus:border-brand-primary focus:outline-none"
              placeholder="Restaurant name"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {cuisineOptions.map((c) => (
                <button
                  type="button"
                  key={c.slug}
                  onClick={() => toggleTag(c.slug)}
                  className={`rounded px-2 py-1 text-xs ${
                    selectedTags.includes(c.slug)
                      ? "bg-brand-primary text-white"
                      : "bg-brand-accent/10 text-brand-ink"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="w-1/2 rounded-lg border border-brand-ink-muted/20 px-2 py-1 focus:border-brand-primary focus:outline-none"
                placeholder="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
              <input
                className="w-1/2 rounded-lg border border-brand-ink-muted/20 px-2 py-1 focus:border-brand-primary focus:outline-none"
                placeholder="Longitude"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </div>
          </>
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
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={submitting}
          onClick={mode === "login" ? handleLogin : handleSignup}
          className="rounded-full bg-brand-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="text-sm text-brand-ink-muted underline"
        >
          {mode === "login" ? "New restaurant? Sign up" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

export default function VendorLoginPage() {
  return (
    <Suspense fallback={null}>
      <VendorLoginForm />
    </Suspense>
  );
}
