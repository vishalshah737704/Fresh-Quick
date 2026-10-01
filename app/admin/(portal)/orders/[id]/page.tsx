"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { OrderDetailView } from "@/components/OrderDetailView";
import type { OrderDetail } from "@/lib/order-detail";

type PartnerRow = {
  user_id: string;
  is_online: boolean;
  users: { full_name: string } | null;
};

const REASSIGNABLE_STATUSES = ["assigned", "picked_up"];

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [partnerName, setPartnerName] = useState<string | null>(null);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/admin/orders/${orderId}`, { headers });
      const body = await res.json();
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        setError(body.error ?? "Failed to load order");
        return;
      }
      setOrder(body.order);
      setPartnerName(body.partnerName ?? null);
      setError(null);
      if (REASSIGNABLE_STATUSES.includes(body.order.status)) {
        const pRes = await fetch("/api/admin/delivery-partners", { headers });
        const pBody = await pRes.json();
        if (pRes.ok) setPartners(pBody.partners);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load order");
    }
  }

  useEffect(() => {
    void (async () => {
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function reassign() {
    if (!selected) return;
    setReassignError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/reassign`, {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryPartnerId: selected }),
      });
      const body = await res.json();
      if (!res.ok) {
        setReassignError(body.error ?? "Failed to reassign order");
        return;
      }
      setSelected("");
      await load();
    } catch (e) {
      setReassignError(e instanceof Error ? e.message : "Failed to reassign order");
    } finally {
      setBusy(false);
    }
  }

  const backLink = (
    <Link href="/admin/orders" className="mb-4 inline-block text-sm text-brand-primary-text-safe underline">
      Back to orders
    </Link>
  );

  if (notFound) {
    return (
      <div>
        {backLink}
        <p className="text-brand-ink-muted">Order not found.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        {backLink}
        <p className="break-words text-red-600">Couldn&apos;t load order: {error}</p>
      </div>
    );
  }

  if (!order) {
    return <p className="text-gray-500">Loading order…</p>;
  }

  const onlinePartners = partners.filter((p) => p.is_online);

  return (
    <div className="min-w-0">
      {backLink}
      <OrderDetailView order={order} />
      {REASSIGNABLE_STATUSES.includes(order.status) && (
        <section className="mt-6 min-w-0 rounded-[var(--radius-card)] border border-brand-ink-muted/10 p-4">
          <p className="mb-3 break-words text-sm text-brand-ink">
            Delivery partner: {partnerName ?? "Unassigned"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select delivery partner"
              className="min-w-0 max-w-full rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-sm"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select partner…</option>
              {onlinePartners.map((p) => (
                <option key={p.user_id} value={p.user_id}>
                  {p.users?.full_name ?? p.user_id}
                </option>
              ))}
            </select>
            <button
              onClick={reassign}
              disabled={!selected || busy}
              className="rounded-full bg-brand-primary-text-safe px-4 py-1 text-sm text-white disabled:opacity-50"
            >
              Reassign
            </button>
          </div>
          {reassignError && <p className="mt-2 break-words text-sm text-red-600">{reassignError}</p>}
        </section>
      )}
    </div>
  );
}
