"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function useVendorSession() {
  const router = useRouter();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        if (!cancelled) router.push("/vendor/login");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();
      if (profile?.role !== "vendor") {
        if (!cancelled) router.push("/vendor/login");
        return;
      }
      const { data: restaurant } = await supabase
        .from("restaurants")
        .select("id")
        .eq("owner_id", userId)
        .single();
      if (cancelled) return;
      setVendorId(userId);
      setRestaurantId(restaurant?.id ?? null);
      setLoading(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { vendorId, restaurantId, loading };
}
