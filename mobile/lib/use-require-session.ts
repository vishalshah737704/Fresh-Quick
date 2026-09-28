import { useEffect } from "react";
import { useRouter } from "expo-router";
import { supabase } from "./supabase";

// Screens under customer/ and delivery/ render data reachable via public
// RLS reads even with no session; without this guard a deep link or a
// cold-start route restore renders a page that looks logged-in until an
// authenticated action (checkout, claim, etc.) fails with a 401.
export function useRequireSession(loginRoute: "/login/customer" | "/login/delivery") {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        router.replace(loginRoute);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loginRoute, router]);
}
