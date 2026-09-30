"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/auth";
import { ItemThumb } from "@/components/ItemThumb";
import {
  ORDER_LIST_SELECT,
  formatPaise,
  normalizeOrderListRow,
  type OrderListRow,
  type RawOrderListRow,
} from "@/lib/order-detail";
import { STATUS_LABEL } from "@/lib/order-status";

const MAX_THUMBS = 4;

export default function CustomerOrdersPage() {
  const router = useRouter();
  const { userId, loading: sessionLoading } = useSession();
  const [orders, setOrders] = useState<OrderListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading || !userId) return;
    let cancelled = false;
    async function load() {
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select(ORDER_LIST_SELECT)
        .eq("customer_id", userId)
        .order("placed_at", { ascending: false });
      if (cancelled) return;
      if (fetchError) {
        setError("Couldn't load your orders.");
        return;
      }
      setOrders(((data as unknown as RawOrderListRow[]) ?? []).map(normalizeOrderListRow));
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
            className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface p-4 hover:bg-brand-accent/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-brand-ink">{order.storeName}</p>
                <p className="text-xs text-brand-ink-muted">
                  #{order.id.slice(0, 8)} · {new Date(order.placedAt).toLocaleString()}
                </p>
              </div>
              <span className="shrink-0 rounded-[var(--radius-pill)] bg-brand-primary-tint px-3 py-1 text-xs font-semibold text-brand-primary-text-safe">
                {STATUS_LABEL[order.status]}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {order.items.slice(0, MAX_THUMBS).map((item) => (
                  <ItemThumb key={item.id} url={item.imageUrl} name={item.name} size={44} />
                ))}
                {order.items.length > MAX_THUMBS && (
                  <span className="text-sm text-brand-ink-muted">
                    +{order.items.length - MAX_THUMBS}
                  </span>
                )}
                <span className="text-sm text-brand-ink-muted">
                  {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="font-semibold text-brand-ink">
                {formatPaise(Math.round(order.total * 100))}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
