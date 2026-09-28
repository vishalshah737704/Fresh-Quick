import { useEffect, useState } from "react";
import { supabase } from "./supabase";

// Mirrors repo root lib/use-delivery-fee.ts.
export function useDeliveryFee(storeId: string | null) {
  const [deliveryFeePaise, setDeliveryFeePaise] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!storeId) {
      setDeliveryFeePaise(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    async function loadFee() {
      const { data, error } = await supabase
        .from("stores")
        .select("delivery_fee_paise")
        .eq("id", storeId)
        .single();
      if (cancelled) return;
      if (error) {
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
  }, [storeId]);

  return { deliveryFeePaise, loading };
}
