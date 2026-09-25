"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDeliverySession } from "@/components/delivery/useDeliverySession";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  restaurants: { name: string } | null;
};

const NEXT_LABEL: Record<string, string> = {
  assigned: "Mark picked up",
  picked_up: "Mark delivered",
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function DeliveryDashboardPage() {
  const { loading, isOnline: initialOnline } = useDeliverySession();
  const [online, setOnline] = useState(false);
  const [available, setAvailable] = useState<OrderRow[]>([]);
  const [mine, setMine] = useState<OrderRow[]>([]);
  const [lat, setLat] = useState("12.9716");
  const [lng, setLng] = useState("77.5946");

  useEffect(() => {
    if (!loading) setOnline(initialOnline);
  }, [loading, initialOnline]);

  async function loadOrders() {
    const headers = await authHeader();
    const [availRes, mineRes] = await Promise.all([
      fetch("/api/delivery/available-orders", { headers }),
      fetch("/api/delivery/orders", { headers }),
    ]);
    const availBody = await availRes.json();
    const mineBody = await mineRes.json();
    if (availRes.ok) setAvailable(availBody.orders);
    if (mineRes.ok) setMine(mineBody.orders);
  }

  useEffect(() => {
    if (!loading) loadOrders();
  }, [loading]);

  useEffect(() => {
    if (!online) return;
    const interval = setInterval(async () => {
      await fetch("/api/delivery/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ lat: Number(lat), lng: Number(lng) }),
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [online, lat, lng]);

  async function toggleOnline() {
    const res = await fetch("/api/delivery/toggle-online", {
      method: "POST",
      headers: await authHeader(),
    });
    const body = await res.json();
    if (res.ok) setOnline(body.isOnline);
    await loadOrders();
  }

  async function claim(orderId: string) {
    await fetch(`/api/delivery/orders/${orderId}/claim`, {
      method: "POST",
      headers: await authHeader(),
    });
    await loadOrders();
  }

  async function advance(orderId: string) {
    await fetch(`/api/delivery/orders/${orderId}/status`, {
      method: "POST",
      headers: await authHeader(),
    });
    await loadOrders();
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold">Delivery dashboard</h1>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={toggleOnline}
          className={`rounded px-3 py-2 text-sm text-white ${
            online ? "bg-green-600" : "bg-gray-400"
          }`}
        >
          {online ? "Online" : "Offline"} — tap to toggle
        </button>
        {online && (
          <div className="flex gap-1 text-xs">
            <input
              className="w-20 rounded border px-1"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
            <input
              className="w-20 rounded border px-1"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
        )}
      </div>

      <h2 className="mb-2 font-semibold">Available orders</h2>
      <ul className="mb-6 flex flex-col gap-2">
        {available.map((o) => (
          <li key={o.id} className="flex items-center justify-between rounded border p-2">
            <span>
              #{o.id.slice(0, 8)} · {o.restaurants?.name ?? "Restaurant"} · ₹{o.total}
            </span>
            <button
              onClick={() => claim(o.id)}
              className="rounded bg-brand-primary px-2 py-1 text-xs text-white"
            >
              Claim
            </button>
          </li>
        ))}
        {available.length === 0 && <p className="text-sm text-gray-500">None right now.</p>}
      </ul>

      <h2 className="mb-2 font-semibold">Your deliveries</h2>
      <ul className="flex flex-col gap-2">
        {mine.map((o) => (
          <li key={o.id} className="flex items-center justify-between rounded border p-2">
            <span>
              #{o.id.slice(0, 8)} · {o.status} · ₹{o.total}
            </span>
            {NEXT_LABEL[o.status] && (
              <button
                onClick={() => advance(o.id)}
                className="rounded bg-brand-primary px-2 py-1 text-xs text-white"
              >
                {NEXT_LABEL[o.status]}
              </button>
            )}
          </li>
        ))}
        {mine.length === 0 && <p className="text-sm text-gray-500">No deliveries yet.</p>}
      </ul>
    </div>
  );
}
