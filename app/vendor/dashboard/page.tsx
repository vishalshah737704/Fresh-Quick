"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVendorSession } from "@/components/vendor/useVendorSession";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorDashboardPage() {
  const { loading, restaurantId } = useVendorSession();
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRestaurant() {
      if (!restaurantId) return;
      const { data } = await supabase
        .from("restaurants")
        .select("is_open")
        .eq("id", restaurantId)
        .single();
      setIsOpen(data?.is_open ?? null);
    }
    if (!loading) loadRestaurant();
  }, [loading, restaurantId]);

  async function toggleOpen() {
    if (isOpen === null) return;
    setActionError(null);
    const res = await fetch("/api/vendor/restaurant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ isOpen: !isOpen }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setActionError(body?.error ?? "Failed to update restaurant");
      return;
    }
    setIsOpen(body.restaurant.is_open);
  }

  if (loading) return <p>Loading…</p>;
  if (!restaurantId) {
    return (
      <p className="text-sm text-red-600">
        No restaurant is linked to this account. Contact support.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold">Vendor dashboard</h1>
      <div className="mb-4 flex items-center gap-3 rounded border p-3">
        <p className="text-sm">
          Restaurant is currently{" "}
          <span className="font-medium">{isOpen ? "open" : "closed"}</span>
        </p>
        <button
          onClick={toggleOpen}
          disabled={isOpen === null}
          className="rounded bg-brand-primary px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {isOpen ? "Close restaurant" : "Open restaurant"}
        </button>
      </div>
      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}
      <div className="flex gap-4">
        <Link href="/vendor/menu" className="rounded bg-gray-100 px-3 py-2 text-sm">
          Manage menu
        </Link>
        <Link href="/vendor/orders" className="rounded bg-gray-100 px-3 py-2 text-sm">
          Order queue
        </Link>
      </div>
    </div>
  );
}
