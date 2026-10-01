"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { DeliveryOrderCard } from "@/components/delivery/DeliveryOrderCard";
import type { OrderDetail } from "@/lib/order-detail";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function DeliveryHistoryPage() {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/delivery/history", { headers: await authHeader() });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Failed to load history");
      } else {
        setError(null);
        setOrders(body.orders);
      }
    } catch {
      setError("Failed to load history");
    }
    setLoading(false);
  }

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, []);

  return (
    <div className="min-w-0">
      <div className="mb-4 rounded-[var(--radius-card)] bg-brand-primary-text-safe px-4 py-3">
        <h1 className="font-heading text-2xl text-white">History</h1>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 break-words text-sm text-brand-ink-muted">
          Showing your 50 most recent finished orders.
        </p>
        <button
          onClick={() => void load()}
          className="rounded-[var(--radius-pill)] bg-brand-ink px-4 py-2 text-sm text-white"
        >
          Refresh
        </button>
      </div>
      {error && <p className="mb-2 break-words text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-base text-brand-ink-muted">Loading…</p>
      ) : orders.length === 0 && !error ? (
        <p className="text-base text-brand-ink-muted">No completed deliveries yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {orders.map((order) => (
            <DeliveryOrderCard key={order.id} order={order} scope="history" />
          ))}
        </div>
      )}
    </div>
  );
}
