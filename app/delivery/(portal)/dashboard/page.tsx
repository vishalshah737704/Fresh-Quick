"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDeliverySessionContext } from "@/components/delivery/DeliverySessionContext";
import { DeliveryOrderCard } from "@/components/delivery/DeliveryOrderCard";
import type { OrderDetail } from "@/lib/order-detail";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function DeliveryDashboardPage() {
  const { isOnline, setIsOnline } = useDeliverySessionContext();
  const [available, setAvailable] = useState<OrderDetail[]>([]);
  const [mine, setMine] = useState<OrderDetail[]>([]);
  const [lat, setLat] = useState("12.9716");
  const [lng, setLng] = useState("77.5946");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadOrders() {
    try {
      const res = await fetch("/api/delivery/active", { headers: await authHeader() });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Failed to refresh orders");
        return;
      }
      setError(null);
      setAvailable(body.available);
      setMine(body.mine);
    } catch {
      setError("Failed to refresh orders");
    }
  }

  useEffect(() => {
    void (async () => {
      await loadOrders();
    })();
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
    if (busyId) return;
    setBusyId(orderId);
    try {
      await claimOrder(orderId);
    } finally {
      setBusyId(null);
    }
  }

  async function advance(orderId: string) {
    if (busyId) return;
    setBusyId(orderId);
    try {
      await advanceOrder(orderId);
    } finally {
      setBusyId(null);
    }
  }

  async function claimOrder(orderId: string) {
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

  async function advanceOrder(orderId: string) {
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

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-semibold text-brand-ink">Your active deliveries</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {mine.map((order) => (
            <DeliveryOrderCard
              key={order.id}
              order={order}
              scope="active"
              busy={busyId === order.id}
              onAdvance={() => advance(order.id)}
            />
          ))}
        </div>
        {mine.length === 0 && (
          <p className="text-base text-brand-ink-muted">No active deliveries.</p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-brand-ink">Available orders</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {available.map((order) => (
            <DeliveryOrderCard
              key={order.id}
              order={order}
              scope="available"
              busy={busyId === order.id}
              onClaim={() => claim(order.id)}
            />
          ))}
        </div>
        {available.length === 0 && (
          <p className="text-base text-brand-ink-muted">
            {isOnline ? "None right now." : "Go online to see available orders."}
          </p>
        )}
      </section>
    </div>
  );
}
