"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Profile = {
  fullName: string | null;
  email: string | null;
};

// Shared by every portal's side-nav "My Profile" section (customer,
// vendor, delivery, admin) — fetches the logged-in user's display name
// (public.users.full_name) and auth email (needed for password reset).
export function useProfile(userId: string | null): Profile {
  const [profile, setProfile] = useState<Profile>({ fullName: null, email: null });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    async function load() {
      const [{ data: userRow }, { data: authData }] = await Promise.all([
        supabase.from("users").select("full_name").eq("id", userId as string).single(),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      setProfile({
        fullName: userRow?.full_name ?? null,
        email: authData?.user?.email ?? null,
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return profile;
}
