"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDeliverySessionContext } from "@/components/delivery/DeliverySessionContext";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  stores: { name: string } | null;
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
  const { isOnline, setIsOnline } = useDeliverySessionContext();
  const [available, setAvailable] = useState<OrderRow[]>([]);
  const [mine, setMine] = useState<OrderRow[]>([]);
  const [lat, setLat] = useState("12.9716");
  const [lng, setLng] = useState("77.5946");
  const [error, setError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Record<string, string>>({});

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
    loadOrders();
  }, []);

  useEffect(() => {
    if (!isOnline || typeof navigator === "undefined" || !navigator.geolocation) return;
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
  }, [isOnline]);

  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(async () => {
      await fetch("/api/delivery/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ lat: Number(lat), lng: Number(lng) }),
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [isOnline, lat, lng]);

  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [isOnline]);

  async function toggleOnline() {
    const res = await fetch("/api/delivery/toggle-online", {
      method: "POST",
      headers: await authHeader(),
    });
    const body = await res.json();
    if (res.ok) setIsOnline(body.isOnline);
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

  return (
    <div>
      <div className="mb-4 rounded-[var(--radius-card)] bg-brand-primary-text-safe px-4 py-3">
        <h1 className="font-heading text-2xl text-white">Dashboard</h1>
      </div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] bg-brand-ink p-3">
        <button
          onClick={toggleOnline}
          className={`rounded-[var(--radius-pill)] px-4 py-2 text-sm text-white ${
            isOnline ? "bg-brand-accent-text-safe" : "bg-white/20"
          }`}
        >
          {isOnline ? "Online" : "Offline"} — tap to toggle
        </button>
        {isOnline && (
          <div className="flex gap-2 text-xs">
            <input
              className="w-24 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-white"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
            <input
              className="w-24 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-white"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold text-brand-ink">Available orders</h2>
          <ul className="flex flex-col gap-2">
            {available.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between rounded-[var(--radius-card)] border-l-4 border-brand-primary bg-brand-surface p-3"
              >
                <span>
                  #{o.id.slice(0, 8)} · {o.stores?.name ?? "Restaurant"} · ₹{o.total.toFixed(2)}
                </span>
                <button
                  onClick={() => claim(o.id)}
                  className="rounded-[var(--radius-pill)] bg-brand-accent-text-safe px-3 py-1 text-xs text-white"
                >
                  Accept
                </button>
              </li>
            ))}
            {available.length === 0 && (
              <p className="text-sm text-brand-ink-muted">None right now.</p>
            )}
          </ul>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-brand-ink">Your deliveries</h2>
          <ul className="flex flex-col gap-2">
            {mine.map((o) => (
              <li
                key={o.id}
                className="flex flex-col gap-1 rounded-[var(--radius-card)] border-l-4 border-brand-primary bg-brand-surface p-3"
              >
                <div className="flex items-center justify-between">
                  <span>
                    #{o.id.slice(0, 8)} · {o.status} · ₹{o.total.toFixed(2)}
                  </span>
                  <div className="flex gap-2">
                    {(o.status === "assigned" || o.status === "picked_up") && (
                      <button
                        onClick={() => viewAddress(o.id)}
                        className="rounded-[var(--radius-pill)] border border-brand-ink-muted/20 px-3 py-1 text-xs"
                      >
                        View address
                      </button>
                    )}
                    {NEXT_LABEL[o.status] && (
                      <button
                        onClick={() => advance(o.id)}
                        className="rounded-[var(--radius-pill)] bg-brand-primary-text-safe px-3 py-1 text-xs text-white"
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
            {mine.length === 0 && (
              <p className="text-sm text-brand-ink-muted">No deliveries yet.</p>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
