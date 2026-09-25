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

  if (loading) return <p>Loading…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold">Admin dashboard</h1>

      <h2 className="mb-2 font-semibold">Orders ({orders.length})</h2>
      <ul className="mb-6 flex flex-col gap-1 text-sm">
        {orders.map((o) => (
          <li key={o.id}>
            #{o.id.slice(0, 8)} · {o.restaurants?.name ?? "Restaurant"} · {o.status} · ₹{o.total}
          </li>
        ))}
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
      </ul>

      <h2 className="mb-2 font-semibold">Delivery partners ({partners.length})</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {partners.map((p) => (
          <li key={p.user_id}>
            {p.users?.full_name ?? "Partner"} · {p.is_online ? "Online" : "Offline"} ·{" "}
            {p.vehicle_type ?? "—"}
          </li>
        ))}
      </ul>
    </div>
  );
}
