"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { OrderDetail } from "@/lib/order-detail";
import { VendorOrderCard } from "@/components/vendor/VendorOrderCard";
import { VendorOrderModal } from "@/components/vendor/VendorOrderModal";

const KANBAN_STATUSES = ["placed", "accepted", "preparing", "ready"] as const;
type KanbanStatus = (typeof KANBAN_STATUSES)[number];

const COLUMN_LABEL: Record<KanbanStatus, string> = {
  placed: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
};

const COLUMN_HEADER_CLASS: Record<KanbanStatus, string> = {
  placed: "bg-brand-primary-text-safe text-white",
  accepted: "bg-brand-ink text-white",
  preparing: "bg-brand-accent-text-safe text-white",
  ready: "bg-gray-500 text-white",
};

const COLUMN_BODY_CLASS: Record<KanbanStatus, string> = {
  placed: "bg-brand-primary-tint",
  accepted: "bg-brand-ink-tint",
  preparing: "bg-brand-accent-tint",
  ready: "bg-gray-100",
};

const POLL_MS = 10000;

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorOrdersPage() {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const [busyOrderIds, setBusyOrderIds] = useState<Set<string>>(new Set());
  const inFlight = useRef<Set<string>>(new Set());

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/vendor/orders", { headers: await authHeader() });
      const body = await res.json().catch(() => null);
      if (res.ok && body) setOrders(body.orders);
    } catch {
      // Background poll: a network error just means we try again on the next tick.
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(loadOrders, 0);
    const interval = setInterval(loadOrders, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [loadOrders]);

  async function act(orderId: string, path: "status" | "reject", failure: string) {
    if (inFlight.current.has(orderId)) return;
    inFlight.current.add(orderId);
    setBusyOrderIds(new Set(inFlight.current));
    setError(null);
    try {
      const res = await fetch(`/api/vendor/orders/${orderId}/${path}`, {
        method: "POST",
        headers: await authHeader(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? failure);
        return;
      }
      await loadOrders();
    } catch {
      setError(failure);
    } finally {
      inFlight.current.delete(orderId);
      setBusyOrderIds(new Set(inFlight.current));
    }
  }

  const advance = (orderId: string) => act(orderId, "status", "Failed to update order status");
  const reject = (orderId: string) => act(orderId, "reject", "Failed to reject order");

  function ordersForColumn(status: KanbanStatus) {
    return orders
      .filter((order) => order.status === status)
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());
  }

  const openOrder = orders.find((order) => order.id === openOrderId) ?? null;

  return (
    <div>
      <h1 className="mb-4 font-heading text-3xl text-brand-ink">Orders</h1>
      {error && <p className="mb-3 text-base text-red-600">{error}</p>}
      {orders.length === 0 ? (
        <p className="text-base text-brand-ink-muted">No orders yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {KANBAN_STATUSES.map((status) => {
            const columnOrders = ordersForColumn(status);
            return (
              <div
                key={status}
                className={`flex flex-col gap-3 rounded-[var(--radius-card)] p-3 ${COLUMN_BODY_CLASS[status]}`}
              >
                <h2
                  className={`rounded-[var(--radius-pill)] px-3 py-2 text-center text-base font-semibold ${COLUMN_HEADER_CLASS[status]}`}
                >
                  {COLUMN_LABEL[status]} ({columnOrders.length})
                </h2>
                {columnOrders.length === 0 && (
                  <p className="rounded-lg border border-dashed border-brand-ink-muted/30 p-4 text-center text-base text-brand-ink-muted">
                    Nothing here yet
                  </p>
                )}
                {columnOrders.map((order) => (
                  <VendorOrderCard
                    key={order.id}
                    order={order}
                    busy={busyOrderIds.has(order.id)}
                    onOpen={() => setOpenOrderId(order.id)}
                    onAdvance={() => advance(order.id)}
                    onReject={() => reject(order.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
      {openOrder && (
        <VendorOrderModal
          order={openOrder}
          busy={busyOrderIds.has(openOrder.id)}
          onClose={() => setOpenOrderId(null)}
          onAdvance={() => advance(openOrder.id)}
          onReject={() => reject(openOrder.id)}
        />
      )}
    </div>
  );
}
