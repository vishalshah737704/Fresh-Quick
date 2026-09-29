"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVendorSessionContext } from "@/components/vendor/VendorSessionContext";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorDashboardPage() {
  const { storeId, isOpen, refreshIsOpen } = useVendorSessionContext();
  const [deliveryFeeRupees, setDeliveryFeeRupees] = useState("");
  const [promoText, setPromoText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadStore() {
      if (!storeId) return;
      const { data } = await supabase
        .from("stores")
        .select("delivery_fee_paise, promo_text")
        .eq("id", storeId)
        .single();
      setDeliveryFeeRupees(data ? (data.delivery_fee_paise / 100).toString() : "");
      setPromoText(data?.promo_text ?? "");
    }
    loadStore();
  }, [storeId]);

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
    await refreshIsOpen();
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
    setDeliveryFeeRupees((body.store.delivery_fee_paise / 100).toString());
    setPromoText(body.store.promo_text ?? "");
    setSavedMessage("Saved.");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 font-heading text-2xl text-brand-ink">Dashboard</h1>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col justify-between rounded-lg bg-brand-primary p-4 text-white">
          <p className="text-sm text-white/80">Restaurant status</p>
          <p className="mb-3 text-lg font-medium text-white">
            {isOpen ? "Open" : "Closed"}
          </p>
          <button
            onClick={toggleOpen}
            disabled={isOpen === null}
            className="self-start rounded-full bg-white px-4 py-2 text-sm text-brand-primary disabled:opacity-50"
          >
            {isOpen ? "Close restaurant" : "Open restaurant"}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
        <h2 className="mb-1 text-sm font-medium text-brand-ink">Delivery settings</h2>
        <label className="text-sm text-brand-ink-muted">Delivery fee (rupees)</label>
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
          value={deliveryFeeRupees}
          onChange={(e) => setDeliveryFeeRupees(e.target.value)}
        />
        <label className="text-sm text-brand-ink-muted">Promo text (optional)</label>
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
          placeholder="e.g. 25% off ₹150+"
          value={promoText}
          onChange={(e) => setPromoText(e.target.value)}
        />
        <button
          onClick={saveFeeAndPromo}
          className="self-start rounded-full bg-brand-primary px-4 py-2 text-sm text-white"
        >
          Save
        </button>
        {savedMessage && <p className="text-sm text-brand-accent">{savedMessage}</p>}
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}
    </div>
  );
}
