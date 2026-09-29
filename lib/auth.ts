"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUserId(data.session?.user.id ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserId(session?.user.id ?? null);
      }
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { userId, loading };
}

// Verifies the signed-in session's `users.role` matches the role a page
// expects, not just that a session exists. useSession() alone can't catch
// a same-origin session collision (e.g. logging into the vendor portal in
// another tab silently swaps the session for every localhost:3000 tab) --
// a customer page would then query as the vendor and get a confusing
// partial-RLS failure instead of a clean redirect. Signs out and redirects
// to `loginPath` on any mismatch, mirroring the role check every login
// page (app/delivery/login, app/vendor/login, app/admin/login) already
// does at sign-in time.
export function useRoleGuard(expectedRole: string, loginPath: string) {
  const { userId, loading: sessionLoading } = useSession();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (sessionLoading) return;

    if (!userId) {
      window.location.href = loginPath;
      return;
    }

    supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single()
      .then(({ data: profile }) => {
        if (cancelled) return;
        if (profile?.role !== expectedRole) {
          supabase.auth.signOut().finally(() => {
            window.location.href = loginPath;
          });
          return;
        }
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, sessionLoading, expectedRole, loginPath]);

  return { ready };
}
