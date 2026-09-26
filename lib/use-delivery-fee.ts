"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useDeliveryFee(restaurantId: string | null) {
  const [deliveryFeePaise, setDeliveryFeePaise] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!restaurantId) {
      setDeliveryFeePaise(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    async function loadFee() {
      const { data, error: fetchError } = await supabase
        .from("restaurants")
        .select("delivery_fee_paise")
        .eq("id", restaurantId)
        .single();
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }
      setDeliveryFeePaise(data ? data.delivery_fee_paise : null);
      setLoading(false);
    }

    loadFee();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  return { deliveryFeePaise, loading, error };
}
