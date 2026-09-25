"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVendorSession } from "@/components/vendor/useVendorSession";

type OrderItem = { id: string; quantity: number; unit_price: number; menu_items: { name: string } | null };
type Order = {
  id: string;
  status: string;
  total: number;
  placed_at: string;
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

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold">Orders</h1>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <ul className="flex flex-col gap-3">
        {orders.map((order) => (
          <li key={order.id} className="rounded border p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                Order #{order.id.slice(0, 8)} · {order.status}
              </p>
              {NEXT_LABEL[order.status] && (
                <button
                  onClick={() => advance(order.id)}
                  className="rounded bg-brand-primary px-2 py-1 text-xs text-white"
                >
                  {NEXT_LABEL[order.status]}
                </button>
              )}
            </div>
            <ul className="mt-2 text-sm text-gray-600">
              {order.order_items.map((item) => (
                <li key={item.id}>
                  {item.quantity}× {item.menu_items?.name ?? "Item"}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-sm font-medium">₹{order.total}</p>
          </li>
        ))}
        {orders.length === 0 && <p className="text-sm text-gray-500">No orders yet.</p>}
      </ul>
    </div>
  );
}
