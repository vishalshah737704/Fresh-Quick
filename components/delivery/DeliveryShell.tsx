"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDeliverySession } from "@/components/delivery/useDeliverySession";
import { DeliverySessionContext } from "@/components/delivery/DeliverySessionContext";

export default function DeliveryShell({ children }: { children: React.ReactNode }) {
  const { loading, partnerId, isOnline: initialOnline } = useDeliverySession();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (!loading) setIsOnline(initialOnline);
  }, [loading, initialOnline]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/delivery/login");
  }

  if (loading) return <p className="p-4">Loading…</p>;

  return (
    <DeliverySessionContext.Provider value={{ loading, partnerId, isOnline, setIsOnline }}>
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between border-b border-brand-ink-muted/10 bg-brand-surface p-3">
          <span className="font-heading text-lg text-brand-ink">Delivery</span>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-brand-accent/20 px-3 py-1 text-xs font-medium text-brand-ink">
              {isOnline ? "Online" : "Offline"}
            </span>
            <button
              onClick={signOut}
              className="rounded-full px-3 py-1 text-sm text-brand-ink-muted hover:bg-brand-accent/10"
            >
              Sign out
            </button>
          </div>
        </div>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </DeliverySessionContext.Provider>
  );
}
