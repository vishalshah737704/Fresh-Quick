"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function useAdminSession() {
  const router = useRouter();
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        if (!cancelled) router.push("/admin/login");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();
      if (profile?.role !== "admin") {
        if (!cancelled) router.push("/admin/login");
        return;
      }
      if (cancelled) return;
      setAdminId(userId);
      setLoading(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { adminId, loading };
}
