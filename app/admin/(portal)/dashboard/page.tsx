"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { overviewStats, type AdminOrderRow } from "@/lib/admin-order-view";
import { formatPaise } from "@/lib/order-detail";
import AutoOrderCard from "@/components/AutoOrderCard";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AdminOverviewPage() {
  const [orders, setOrders] = useState<AdminOrderRow[]>([]);
  const [vendorCount, setVendorCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const headers = await authHeader();
      const [oRes, rRes] = await Promise.all([
        fetch("/api/admin/orders", { headers }),
        fetch("/api/admin/restaurants", { headers }),
      ]);
      const [oBody, rBody] = await Promise.all([oRes.json(), rRes.json()]);
      if (!oRes.ok || !rRes.ok) {
        setError((!oRes.ok ? oBody.error : rBody.error) ?? "Failed to load overview");
        return;
      }
      setOrders(oBody.orders);
      setVendorCount(rBody.stores.length);
      setError(null);
    } catch {
      setError("Failed to load overview");
    }
  }

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, []);

  const stats = overviewStats(orders, vendorCount);

  return (
    <div>
      <div className="mb-4 rounded-[var(--radius-card)] bg-brand-ink px-4 py-3">
        <h1 className="font-heading text-2xl text-white">Overview</h1>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <AutoOrderCard />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-[var(--radius-card)] bg-brand-primary-text-safe p-4">
          <p className="text-sm text-white/80">Active orders</p>
          <p className="font-heading text-3xl text-white">{stats.activeOrders}</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-brand-ink p-4">
          <p className="text-sm text-white/80">Vendors</p>
          <p className="font-heading text-3xl text-white">{stats.vendors}</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-brand-accent-text-safe p-4">
          <p className="text-sm text-white/80">Revenue</p>
          <p className="font-heading text-3xl text-white">{formatPaise(stats.revenuePaise)}</p>
        </div>
      </div>
    </div>
  );
}
