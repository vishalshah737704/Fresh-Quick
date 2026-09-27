"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  special_instructions: string | null;
  products: { name: string } | null;
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

const KANBAN_STATUSES = ["placed", "accepted", "preparing", "ready"] as const;

const COLUMN_LABEL: Record<(typeof KANBAN_STATUSES)[number], string> = {
  placed: "Placed",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
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
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    const res = await fetch("/api/vendor/orders", { headers: await authHeader() });
    const body = await res.json();
    if (res.ok) setOrders(body.orders);
  }

  useEffect(() => {
    loadOrders();
  }, []);

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

  async function reject(orderId: string) {
    setError(null);
    const res = await fetch(`/api/vendor/orders/${orderId}/reject`, {
      method: "POST",
      headers: await authHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to reject order");
      return;
    }
    await loadOrders();
  }

  function ordersForColumn(status: (typeof KANBAN_STATUSES)[number]) {
    return orders
      .filter((order) => order.status === status)
      .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime());
  }

  return (
    <div>
      <h1 className="mb-4 font-heading text-2xl text-brand-ink">Orders</h1>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {orders.length === 0 ? (
        <p className="text-sm text-brand-ink-muted">No orders yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          {KANBAN_STATUSES.map((status) => {
            const columnOrders = ordersForColumn(status);
            return (
              <div key={status} className="flex flex-col gap-3">
                <h2 className="text-sm font-medium text-brand-ink-muted">
                  {COLUMN_LABEL[status]} ({columnOrders.length})
                </h2>
                {columnOrders.length === 0 && (
                  <p className="text-sm text-brand-ink-muted">No orders.</p>
                )}
                {columnOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3"
                  >
                    <p className="mb-2 font-medium text-brand-ink">
                      #{order.id.slice(0, 8)}
                    </p>
                    <ul className="mb-2 text-sm text-brand-ink-muted">
                      {order.order_items.map((item) => (
                        <li key={item.id}>
                          {item.quantity}× {item.products?.name ?? "Item"}
                          {item.order_item_options.length > 0 && (
                            <span>
                              {" "}
                              — {item.order_item_options.map((o) => o.option_name).join(", ")}
                            </span>
                          )}
                          {item.special_instructions && (
                            <span> — &quot;{item.special_instructions}&quot;</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {order.delivery_note && (
                      <p className="mb-2 text-sm text-brand-ink-muted">
                        Note: &quot;{order.delivery_note}&quot;
                      </p>
                    )}
                    <p className="mb-2 text-sm font-medium text-brand-ink">
                      ₹{order.total.toFixed(2)}
                    </p>
                    <div className="flex gap-2">
                      {order.status === "placed" && (
                        <button
                          onClick={() => reject(order.id)}
                          className="rounded-full border border-red-600 px-2 py-1 text-xs text-red-600"
                        >
                          Reject
                        </button>
                      )}
                      {NEXT_LABEL[order.status] && (
                        <button
                          onClick={() => advance(order.id)}
                          className="rounded-full bg-brand-primary px-2 py-1 text-xs text-white"
                        >
                          {NEXT_LABEL[order.status]}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
