"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function useDeliverySession() {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        if (!cancelled) router.push("/delivery/login");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();
      if (profile?.role !== "delivery") {
        if (!cancelled) router.push("/delivery/login");
        return;
      }
      const { data: partner } = await supabase
        .from("delivery_partners")
        .select("is_online")
        .eq("user_id", userId)
        .single();
      if (cancelled) return;
      setPartnerId(userId);
      setIsOnline(partner?.is_online ?? false);
      setLoading(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { partnerId, isOnline, loading };
}
