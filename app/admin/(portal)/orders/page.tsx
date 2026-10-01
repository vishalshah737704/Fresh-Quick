"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { AdminOrderRow } from "@/lib/admin-order-view";
import { ORDER_STATUSES, STATUS_COLOR, STATUS_LABEL } from "@/lib/order-status";
import { formatPaise } from "@/lib/order-detail";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
        const res = await fetch(`/api/admin/orders${query}`, { headers: await authHeader() });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Failed to load orders");
        } else {
          setOrders(body.orders);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load orders");
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] bg-brand-ink px-4 py-3">
        <h1 className="font-heading text-2xl text-white">Orders</h1>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-brand-ink-muted/20 bg-white px-2 py-1 text-sm text-brand-ink"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="mb-3 break-words text-sm text-red-600">Couldn&apos;t load orders: {error}</p>}

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-brand-ink-muted/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-ink text-white">
            <tr>
              <th className="p-2">Order</th>
              <th className="p-2">Customer</th>
              <th className="p-2">Store</th>
              <th className="p-2">Status</th>
              <th className="p-2">Amount</th>
              <th className="p-2">Partner</th>
              <th className="p-2">Placed</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-brand-ink-muted/10">
                <td className="p-2">
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="font-medium text-brand-primary-text-safe underline"
                  >
                    #{o.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="break-words p-2">{o.customerName}</td>
                <td className="break-words p-2">{o.storeName}</td>
                <td className="p-2">
                  <span
                    className={`inline-flex items-center whitespace-nowrap rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium ${STATUS_COLOR[o.status]}`}
                  >
                    {STATUS_LABEL[o.status]}
                  </span>
                </td>
                <td className="whitespace-nowrap p-2">{formatPaise(Math.round(o.total * 100))}</td>
                <td className="break-words p-2">{o.partnerName ?? "—"}</td>
                <td className="whitespace-nowrap p-2">{new Date(o.placedAt).toLocaleString()}</td>
              </tr>
            ))}
            {loaded && orders.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-brand-ink-muted">
                  No orders yet.
                </td>
              </tr>
            )}
            {!loaded && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-brand-ink-muted">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
