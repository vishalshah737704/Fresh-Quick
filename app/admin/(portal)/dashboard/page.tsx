"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  stores: { name: string } | null;
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

type Tab = "orders" | "restaurants" | "partners";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("orders");
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
    if (rRes.ok) setRestaurants(rBody.stores);
    if (pRes.ok) setPartners(pBody.partners);
  }

  useEffect(() => {
    loadAll();
  }, []);

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

  const onlinePartners = partners.filter((p) => p.is_online);

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "orders", label: "Orders", count: orders.length },
    { key: "restaurants", label: "Restaurants", count: restaurants.length },
    { key: "partners", label: "Delivery partners", count: partners.length },
  ];

  return (
    <div>
      <h1 className="mb-4 font-heading text-2xl text-brand-ink">Dashboard</h1>
      <div className="mb-4 flex gap-2 border-b border-brand-ink-muted/10">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-2 text-sm ${
              activeTab === tab.key
                ? "bg-brand-primary text-white"
                : "text-brand-ink hover:bg-brand-accent/10"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {activeTab === "orders" && (
        <div className="overflow-x-auto rounded-lg border border-brand-ink-muted/10">
          {reassignError && <p className="p-2 text-sm text-red-600">{reassignError}</p>}
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-accent/10 text-brand-ink-muted">
              <tr>
                <th className="p-2">Order</th>
                <th className="p-2">Restaurant</th>
                <th className="p-2">Status</th>
                <th className="p-2">Total</th>
                <th className="p-2">Reassign</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-brand-ink-muted/10">
                  <td className="p-2">#{o.id.slice(0, 8)}</td>
                  <td className="p-2">{o.stores?.name ?? "Restaurant"}</td>
                  <td className="p-2">{o.status}</td>
                  <td className="p-2">₹{o.total.toFixed(2)}</td>
                  <td className="p-2">
                    {REASSIGNABLE_STATUSES.includes(o.status) ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-xs"
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
                          className="rounded-full bg-brand-primary px-3 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Reassign
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-brand-ink-muted">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "restaurants" && (
        <div className="overflow-x-auto rounded-lg border border-brand-ink-muted/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-accent/10 text-brand-ink-muted">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Status</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {restaurants.map((r) => (
                <tr key={r.id} className="border-t border-brand-ink-muted/10">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">
                    {r.is_suspended ? "Suspended" : r.is_open ? "Open" : "Closed"}
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => toggleSuspend(r)}
                      className="rounded-full bg-brand-accent/20 px-3 py-1 text-xs text-brand-ink"
                    >
                      {r.is_suspended ? "Unsuspend" : "Suspend"}
                    </button>
                  </td>
                </tr>
              ))}
              {restaurants.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-brand-ink-muted">
                    No restaurants yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "partners" && (
        <div className="overflow-x-auto rounded-lg border border-brand-ink-muted/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-accent/10 text-brand-ink-muted">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Status</th>
                <th className="p-2">Vehicle</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.user_id} className="border-t border-brand-ink-muted/10">
                  <td className="p-2">{p.users?.full_name ?? "Partner"}</td>
                  <td className="p-2">{p.is_online ? "Online" : "Offline"}</td>
                  <td className="p-2">{p.vehicle_type ?? "—"}</td>
                </tr>
              ))}
              {partners.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-brand-ink-muted">
                    No delivery partners yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
