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
  const [error, setError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Record<string, string>>({});

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
    if (mineRes.ok) {
      const mineOrders: OrderRow[] = mineBody.orders;
      setMine(mineOrders);
      const activeIds = new Set(
        mineOrders
          .filter((o) => o.status === "assigned" || o.status === "picked_up")
          .map((o) => o.id)
      );
      setAddresses((prev) => {
        const next: Record<string, string> = {};
        for (const [id, addr] of Object.entries(prev)) {
          if (activeIds.has(id)) next[id] = addr;
        }
        return next;
      });
    }
  }

  useEffect(() => {
    if (!loading) loadOrders();
  }, [loading]);

  useEffect(() => {
    if (!online || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(String(position.coords.latitude));
        setLng(String(position.coords.longitude));
      },
      () => {
        // permission denied or unavailable — keep existing manual values
      },
      { timeout: 5000 }
    );
  }, [online]);

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

  useEffect(() => {
    if (!online) return;
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [online]);

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
    setError(null);
    const res = await fetch(`/api/delivery/orders/${orderId}/claim`, {
      method: "POST",
      headers: await authHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to claim order");
      return;
    }
    await loadOrders();
  }

  async function advance(orderId: string) {
    setError(null);
    const res = await fetch(`/api/delivery/orders/${orderId}/status`, {
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

  async function viewAddress(orderId: string) {
    setError(null);
    const res = await fetch(`/api/delivery/orders/${orderId}/address`, {
      headers: await authHeader(),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to load address");
      return;
    }
    setAddresses((prev) => ({ ...prev, [orderId]: body.address.line1 }));
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold text-brand-ink">Delivery dashboard</h1>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={toggleOnline}
          className={`rounded px-3 py-2 text-sm text-white ${
            online ? "bg-green-600" : "bg-brand-ink-muted/40"
          }`}
        >
          {online ? "Online" : "Offline"} — tap to toggle
        </button>
        {online && (
          <div className="flex gap-1 text-xs">
            <input
              className="w-20 rounded-lg border border-brand-ink-muted/20 px-1"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
            <input
              className="w-20 rounded-lg border border-brand-ink-muted/20 px-1"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
        )}
      </div>

      <h2 className="mb-2 font-semibold text-brand-ink">Available orders</h2>
      <ul className="mb-6 flex flex-col gap-2">
        {available.map((o) => (
          <li key={o.id} className="flex items-center justify-between rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-2">
            <span>
              #{o.id.slice(0, 8)} · {o.restaurants?.name ?? "Restaurant"} · ₹{o.total.toFixed(2)}
            </span>
            <button
              onClick={() => claim(o.id)}
              className="rounded-full bg-brand-primary px-2 py-1 text-xs text-white"
            >
              Claim
            </button>
          </li>
        ))}
        {available.length === 0 && <p className="text-sm text-brand-ink-muted">None right now.</p>}
      </ul>

      <h2 className="mb-2 font-semibold text-brand-ink">Your deliveries</h2>
      <ul className="flex flex-col gap-2">
        {mine.map((o) => (
          <li key={o.id} className="flex flex-col gap-1 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-2">
            <div className="flex items-center justify-between">
              <span>
                #{o.id.slice(0, 8)} · {o.status} · ₹{o.total.toFixed(2)}
              </span>
              <div className="flex gap-2">
                {(o.status === "assigned" || o.status === "picked_up") && (
                  <button
                    onClick={() => viewAddress(o.id)}
                    className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-xs"
                  >
                    View address
                  </button>
                )}
                {NEXT_LABEL[o.status] && (
                  <button
                    onClick={() => advance(o.id)}
                    className="rounded-full bg-brand-primary px-2 py-1 text-xs text-white"
                  >
                    {NEXT_LABEL[o.status]}
                  </button>
                )}
              </div>
            </div>
            {addresses[o.id] && (
              <p className="text-xs text-brand-ink-muted">{addresses[o.id]}</p>
            )}
          </li>
        ))}
        {mine.length === 0 && <p className="text-sm text-brand-ink-muted">No deliveries yet.</p>}
      </ul>
    </div>
  );
}
