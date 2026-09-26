"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVendorSession } from "@/components/vendor/useVendorSession";

type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  special_instructions: string | null;
  menu_items: { name: string } | null;
  order_item_options: { id: string; group_name: string; option_name: string }[];
};
type Order = {
  id: string;
  status: string;
  total: number;
  placed_at: string;
  delivery_note: string | null;
  order_items: OrderItem[];
};

const NEXT_LABEL: Record<string, string> = {
  placed: "Accept",
  accepted: "Start preparing",
  preparing: "Mark ready",
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorOrdersPage() {
  const { loading } = useVendorSession();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("oldest");

  async function loadOrders() {
    const res = await fetch("/api/vendor/orders", { headers: await authHeader() });
    const body = await res.json();
    if (res.ok) setOrders(body.orders);
  }

  useEffect(() => {
    if (!loading) loadOrders();
  }, [loading]);

  async function advance(orderId: string) {
    setError(null);
    const res = await fetch(`/api/vendor/orders/${orderId}/status`, {
      method: "POST",
      headers: await authHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to update order status");
      return;
    }
    await loadOrders();
  }

  if (loading) return <p>Loading…</p>;

  const statuses = ["all", ...Object.keys(NEXT_LABEL)];
  const filteredOrders = selectedStatus === "all"
    ? orders
    : orders.filter((order) => order.status === selectedStatus);
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const aTime = new Date(a.placed_at).getTime();
    const bTime = new Date(b.placed_at).getTime();
    return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
  });

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold text-brand-ink">Orders</h1>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="mb-4 flex gap-3">
        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
        >
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status === "all" ? "All statuses" : status}
            </option>
          ))}
        </select>
        <button
          onClick={() => setSortOrder(sortOrder === "oldest" ? "newest" : "oldest")}
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
        >
          {sortOrder === "oldest" ? "Oldest first" : "Newest first"}
        </button>
      </div>
      <ul className="flex flex-col gap-3">
        {sortedOrders.map((order) => (
          <li key={order.id} className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                Order #{order.id.slice(0, 8)} · {order.status}
              </p>
              {NEXT_LABEL[order.status] && (
                <button
                  onClick={() => advance(order.id)}
                  className="rounded-full bg-brand-primary px-2 py-1 text-xs text-white"
                >
                  {NEXT_LABEL[order.status]}
                </button>
              )}
            </div>
            <ul className="mt-2 text-sm text-brand-ink-muted">
              {order.order_items.map((item) => (
                <li key={item.id}>
                  {item.quantity}× {item.menu_items?.name ?? "Item"}
                  {item.order_item_options.length > 0 && (
                    <span className="text-brand-ink-muted">
                      {" "}
                      — {item.order_item_options.map((o) => o.option_name).join(", ")}
                    </span>
                  )}
                  {item.special_instructions && (
                    <span className="text-brand-ink-muted"> — &quot;{item.special_instructions}&quot;</span>
                  )}
                </li>
              ))}
            </ul>
            {order.delivery_note && (
              <p className="mt-1 text-sm text-brand-ink-muted">
                Order note: &quot;{order.delivery_note}&quot;
              </p>
            )}
            <p className="mt-1 text-sm font-medium">₹{order.total.toFixed(2)}</p>
          </li>
        ))}
        {sortedOrders.length === 0 && (
          <p className="text-sm text-brand-ink-muted">
            {orders.length === 0 ? "No orders yet." : "No orders with this status."}
          </p>
        )}
      </ul>
    </div>
  );
}
