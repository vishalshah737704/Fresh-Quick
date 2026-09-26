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
  const [deliveryFeeRupees, setDeliveryFeeRupees] = useState("");
  const [promoText, setPromoText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadRestaurant() {
      if (!restaurantId) return;
      const { data } = await supabase
        .from("restaurants")
        .select("is_open, delivery_fee_paise, promo_text")
        .eq("id", restaurantId)
        .single();
      setIsOpen(data?.is_open ?? null);
      setDeliveryFeeRupees(data ? (data.delivery_fee_paise / 100).toString() : "");
      setPromoText(data?.promo_text ?? "");
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

  async function saveFeeAndPromo() {
    setActionError(null);
    setSavedMessage(null);
    if (deliveryFeeRupees.trim() === "") {
      setActionError("Delivery fee must be a non-negative number");
      return;
    }
    const fee = Number(deliveryFeeRupees);
    if (!Number.isFinite(fee) || fee < 0) {
      setActionError("Delivery fee must be a non-negative number");
      return;
    }
    const res = await fetch("/api/vendor/restaurant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ deliveryFeeRupees: fee, promoText: promoText.trim() || null }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setActionError(body?.error ?? "Failed to update restaurant");
      return;
    }
    setDeliveryFeeRupees((body.restaurant.delivery_fee_paise / 100).toString());
    setPromoText(body.restaurant.promo_text ?? "");
    setSavedMessage("Saved.");
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
      <h1 className="mb-4 text-xl font-bold text-brand-ink">Vendor dashboard</h1>
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3">
        <p className="text-sm">
          Restaurant is currently{" "}
          <span className="font-medium">{isOpen ? "open" : "closed"}</span>
        </p>
        <button
          onClick={toggleOpen}
          disabled={isOpen === null}
          className="rounded-full bg-brand-primary px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {isOpen ? "Close restaurant" : "Open restaurant"}
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3">
        <label className="text-sm font-medium text-brand-ink">Delivery fee (rupees)</label>
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
          value={deliveryFeeRupees}
          onChange={(e) => setDeliveryFeeRupees(e.target.value)}
        />
        <label className="text-sm font-medium text-brand-ink">Promo text (optional)</label>
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
          placeholder="e.g. 25% off ₹150+"
          value={promoText}
          onChange={(e) => setPromoText(e.target.value)}
        />
        <button
          onClick={saveFeeAndPromo}
          disabled={isOpen === null}
          className="self-start rounded-full bg-brand-primary px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Save
        </button>
        {savedMessage && <p className="text-sm text-brand-accent">{savedMessage}</p>}
      </div>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}
      <div className="flex gap-4">
        <Link href="/vendor/menu" className="rounded-lg bg-brand-accent/10 px-3 py-2 text-sm text-brand-ink">
          Manage menu
        </Link>
        <Link href="/vendor/orders" className="rounded-lg bg-brand-accent/10 px-3 py-2 text-sm text-brand-ink">
          Order queue
        </Link>
      </div>
    </div>
  );
}
