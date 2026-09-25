"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/components/admin/useAdminSession";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  restaurants: { name: string } | null;
};

const REASSIGNABLE_STATUSES = ["assigned", "picked_up"];

type RestaurantRow = {
  id: string;
  name: string;
  is_open: boolean;
  is_suspended: boolean;
};

type PartnerRow = {
  user_id: string;
  is_online: boolean;
  vehicle_type: string | null;
  users: { full_name: string } | null;
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AdminDashboardPage() {
  const { loading } = useAdminSession();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [reassignSelections, setReassignSelections] = useState<Record<string, string>>({});
  const [reassignError, setReassignError] = useState<string | null>(null);

  async function loadAll() {
    const headers = await authHeader();
    const [oRes, rRes, pRes] = await Promise.all([
      fetch("/api/admin/orders", { headers }),
      fetch("/api/admin/restaurants", { headers }),
      fetch("/api/admin/delivery-partners", { headers }),
    ]);
    const [oBody, rBody, pBody] = await Promise.all([oRes.json(), rRes.json(), pRes.json()]);
    if (oRes.ok) setOrders(oBody.orders);
    if (rRes.ok) setRestaurants(rBody.restaurants);
    if (pRes.ok) setPartners(pBody.partners);
  }

  useEffect(() => {
    if (!loading) loadAll();
  }, [loading]);

  async function toggleSuspend(r: RestaurantRow) {
    const path = r.is_suspended
      ? `/api/admin/restaurants/${r.id}/unsuspend`
      : `/api/admin/restaurants/${r.id}/suspend`;
    await fetch(path, { method: "POST", headers: await authHeader() });
    await loadAll();
  }

  async function reassign(orderId: string) {
    const deliveryPartnerId = reassignSelections[orderId];
    if (!deliveryPartnerId) return;
    setReassignError(null);
    const res = await fetch(`/api/admin/orders/${orderId}/reassign`, {
      method: "POST",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryPartnerId }),
    });
    const body = await res.json();
    if (!res.ok) {
      setReassignError(body.error ?? "Failed to reassign order");
      return;
    }
    await loadAll();
  }

  if (loading) return <p>Loading…</p>;

  const onlinePartners = partners.filter((p) => p.is_online);

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold">Admin dashboard</h1>

      <h2 className="mb-2 font-semibold">Orders ({orders.length})</h2>
      {reassignError && <p className="mb-2 text-sm text-red-600">{reassignError}</p>}
      <ul className="mb-6 flex flex-col gap-1 text-sm">
        {orders.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-2">
            <span>
              #{o.id.slice(0, 8)} · {o.restaurants?.name ?? "Restaurant"} · {o.status} · ₹{o.total}
            </span>
            {REASSIGNABLE_STATUSES.includes(o.status) && (
              <span className="flex items-center gap-1">
                <select
                  className="rounded border px-1 py-0.5 text-xs"
                  value={reassignSelections[o.id] ?? ""}
                  onChange={(e) =>
                    setReassignSelections((prev) => ({ ...prev, [o.id]: e.target.value }))
                  }
                >
                  <option value="">Select partner…</option>
                  {onlinePartners.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.users?.full_name ?? p.user_id}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => reassign(o.id)}
                  disabled={!reassignSelections[o.id]}
                  className="rounded bg-gray-100 px-2 py-1 text-xs disabled:opacity-50"
                >
                  Reassign
                </button>
              </span>
            )}
          </li>
        ))}
        {orders.length === 0 && <p className="text-gray-500">No orders yet.</p>}
      </ul>

      <h2 className="mb-2 font-semibold">Restaurants ({restaurants.length})</h2>
      <ul className="mb-6 flex flex-col gap-1 text-sm">
        {restaurants.map((r) => (
          <li key={r.id} className="flex items-center justify-between">
            <span>
              {r.name} · {r.is_suspended ? "Suspended" : r.is_open ? "Open" : "Closed"}
            </span>
            <button
              onClick={() => toggleSuspend(r)}
              className="rounded bg-gray-100 px-2 py-1 text-xs"
            >
              {r.is_suspended ? "Unsuspend" : "Suspend"}
            </button>
          </li>
        ))}
        {restaurants.length === 0 && <p className="text-gray-500">No restaurants yet.</p>}
      </ul>

      <h2 className="mb-2 font-semibold">Delivery partners ({partners.length})</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {partners.map((p) => (
          <li key={p.user_id}>
            {p.users?.full_name ?? "Partner"} · {p.is_online ? "Online" : "Offline"} ·{" "}
            {p.vehicle_type ?? "—"}
          </li>
        ))}
        {partners.length === 0 && <p className="text-gray-500">No delivery partners yet.</p>}
      </ul>
    </div>
  );
}
