"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/auth";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  placed_at: string;
  stores: { name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  placed: "Placed",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Out for delivery",
  picked_up: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export default function CustomerOrdersPage() {
  const router = useRouter();
  const { userId, loading: sessionLoading } = useSession();
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading || !userId) return;
    let cancelled = false;
    async function load() {
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select("id, status, total, placed_at, stores(name)")
        .eq("customer_id", userId)
        .order("placed_at", { ascending: false });
      if (cancelled) return;
      if (fetchError) {
        setError("Couldn't load your orders.");
        return;
      }
      setOrders((data as unknown as OrderRow[]) ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, sessionLoading]);

  if (sessionLoading) {
    return <p className="text-gray-500">Loading…</p>;
  }
  if (!userId) {
    router.push("/customer/login?redirectTo=/customer/orders");
    return null;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-ink">Your orders</h1>
      {error && <p className="text-red-600">{error}</p>}
      {orders === null && !error && <p className="text-gray-500">Loading…</p>}
      {orders !== null && orders.length === 0 && (
        <p className="text-brand-ink-muted">You haven&apos;t placed any orders yet.</p>
      )}
      <div className="flex flex-col gap-3">
        {orders?.map((order) => (
          <Link
            key={order.id}
            href={`/customer/orders/${order.id}`}
            className="flex items-center justify-between rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4 hover:bg-brand-accent/5"
          >
            <div>
              <p className="font-medium text-brand-ink">{order.stores?.name ?? "Unknown store"}</p>
              <p className="text-xs text-brand-ink-muted">
                {new Date(order.placed_at).toLocaleString()} · {STATUS_LABEL[order.status] ?? order.status}
              </p>
            </div>
            <p className="font-semibold text-brand-ink">₹{Number(order.total).toFixed(2)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
