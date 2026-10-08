"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { describeCoupon, formatPaise } from "@/lib/coupon-model";
import type { CouponRow } from "@/lib/coupons-server";

const API = "/api/vendor/coupons";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function toPaise(rupees: string): number | null {
  const trimmed = rupees.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? Math.round(value * 100) : NaN;
}

function toWholeNumber(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : Number(trimmed);
}

const EMPTY_FORM = {
  code: "",
  kind: "percent" as "percent" | "fixed",
  value: "",
  maxDiscount: "",
  minOrder: "",
  validUntil: "",
  totalLimit: "",
  perCustomerLimit: "1",
  firstOrderOnly: false,
  description: "",
  storeId: "",
};

const inputClass = "w-full rounded-[var(--radius-card)] border border-brand-ink-muted/30 bg-white p-2 text-sm";

export default function VendorCouponsPage() {
  const [coupons, setCoupons] = useState<CouponRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(API, { headers: await authHeader() });
      const body = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) {
        setError(body?.error ?? "Failed to load coupons");
        return;
      }
      setError(null);
      setCoupons(body.coupons);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function setActive(id: string, isActive: boolean) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`${API}/${id}`, {
        method: "PATCH",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error ?? "That did not work");
      else setReloadKey((n) => n + 1);
    } finally {
      setBusyId(null);
    }
  }

  async function createCoupon(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const value = form.kind === "fixed" ? toPaise(form.value) : toWholeNumber(form.value);
    const maxDiscountPaise = form.kind === "percent" ? toPaise(form.maxDiscount) : null;
    const minOrderPaise = toPaise(form.minOrder);
    if (value === null || Number.isNaN(value) || Number.isNaN(maxDiscountPaise) || Number.isNaN(minOrderPaise)) {
      setError("Enter valid numbers for the amounts");
      return;
    }
    const payload: Record<string, unknown> = {
      code: form.code,
      kind: form.kind,
      value,
      maxDiscountPaise,
      minOrderPaise: minOrderPaise ?? 0,
      validUntil: form.validUntil ? new Date(`${form.validUntil}T23:59:59`).toISOString() : null,
      totalLimit: toWholeNumber(form.totalLimit),
      perCustomerLimit: toWholeNumber(form.perCustomerLimit) ?? 1,
      firstOrderOnly: form.firstOrderOnly,
      description: form.description.trim() || null,
    };

    setSaving(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.error ?? "Failed to create coupon");
        return;
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setReloadKey((n) => n + 1);
    } finally {
      setSaving(false);
    }
  }

  const update = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-heading text-2xl text-brand-ink">Coupons</h1>
        <button
          type="button"
          onClick={() => setShowForm((open) => !open)}
          className="rounded-[var(--radius-pill)] bg-brand-primary px-4 py-1 text-sm font-semibold text-white"
        >
          {showForm ? "Close" : "New coupon"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {showForm && (
        <form onSubmit={createCoupon} className="grid gap-3 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow sm:grid-cols-2">
          <label className="text-sm text-brand-ink">
            Code
            <input className={inputClass} value={form.code} maxLength={20} required onChange={(e) => update("code", e.target.value.toUpperCase())} />
            <span className="text-xs text-brand-ink-muted">3 to 20 letters, digits, dashes or underscores.</span>
          </label>
          <label className="text-sm text-brand-ink">
            Type
            <select className={inputClass} value={form.kind} onChange={(e) => update("kind", e.target.value as "percent" | "fixed")}>
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount off</option>
            </select>
          </label>
          <label className="text-sm text-brand-ink">
            {form.kind === "percent" ? "Percent off" : "Amount off (₹)"}
            <input className={inputClass} type="number" min="0" step={form.kind === "percent" ? "1" : "0.01"} required value={form.value} onChange={(e) => update("value", e.target.value)} />
            <span className="text-xs text-brand-ink-muted">Store coupons: at most 50% off, or at most ₹500 off.</span>
          </label>
          {form.kind === "percent" && (
            <label className="text-sm text-brand-ink">
              Maximum discount (₹, optional)
              <input className={inputClass} type="number" min="0" step="0.01" value={form.maxDiscount} onChange={(e) => update("maxDiscount", e.target.value)} />
            </label>
          )}
          <label className="text-sm text-brand-ink">
            Minimum order (₹)
            <input className={inputClass} type="number" min="0" step="0.01" value={form.minOrder} onChange={(e) => update("minOrder", e.target.value)} />
          </label>
          <label className="text-sm text-brand-ink">
            End date (optional)
            <input className={inputClass} type="date" value={form.validUntil} onChange={(e) => update("validUntil", e.target.value)} />
          </label>
          <label className="text-sm text-brand-ink">
            Total uses limit (optional)
            <input className={inputClass} type="number" min="1" step="1" value={form.totalLimit} onChange={(e) => update("totalLimit", e.target.value)} />
          </label>
          <label className="text-sm text-brand-ink">
            Uses per customer
            <input className={inputClass} type="number" min="1" max="100" step="1" value={form.perCustomerLimit} onChange={(e) => update("perCustomerLimit", e.target.value)} />
          </label>

          <label className="flex items-center gap-2 text-sm text-brand-ink">
            <input type="checkbox" checked={form.firstOrderOnly} onChange={(e) => update("firstOrderOnly", e.target.checked)} />
            First order only
          </label>
          <label className="text-sm text-brand-ink sm:col-span-2">
            Description (optional, up to 200 characters)
            <input className={inputClass} value={form.description} maxLength={200} onChange={(e) => update("description", e.target.value)} />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={saving} className="rounded-[var(--radius-pill)] bg-brand-primary px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? "Saving…" : "Create coupon"}
            </button>
          </div>
        </form>
      )}

      {!coupons && !error && <p className="text-brand-ink-muted">Loading…</p>}
      {coupons && coupons.length === 0 && <p className="text-brand-ink-muted">No coupons yet.</p>}
      {coupons && coupons.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--radius-card)] bg-brand-surface shadow">
          <table className="w-full text-left text-sm text-brand-ink">
            <thead>
              <tr className="border-b border-brand-ink-muted/20">
                <th className="p-3">Code</th>
                <th className="p-3">Offer</th>
                <th className="p-3">Status</th>
                <th className="p-3">Used</th>
                <th className="p-3">Discount given</th>
                <th className="p-3">Validity and limits</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {coupons.map((coupon) => (
                <tr key={coupon.id} className="border-b border-brand-ink-muted/10 align-top">
                  <td className="p-3 font-semibold">{coupon.code}</td>
                  <td className="p-3">
                    {describeCoupon(coupon)}
                    {coupon.description && <div className="text-xs text-brand-ink-muted">{coupon.description}</div>}
                  </td>
                  <td className="p-3">{coupon.isActive ? "Active" : "Paused"}</td>
                  <td className="p-3">
                    {coupon.redemptions}
                    {coupon.totalLimit ? ` / ${coupon.totalLimit}` : ""}
                  </td>
                  <td className="p-3">{formatPaise(coupon.discountGivenPaise)}</td>
                  <td className="p-3 text-xs text-brand-ink-muted">
                    <div>
                      From {new Date(coupon.validFrom).toLocaleDateString()}
                      {coupon.validUntil ? ` to ${new Date(coupon.validUntil).toLocaleDateString()}` : ", no end date"}
                    </div>
                    <div>{coupon.perCustomerLimit} per customer{coupon.firstOrderOnly ? ", first order only" : ""}</div>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      disabled={busyId === coupon.id}
                      onClick={() => setActive(coupon.id, !coupon.isActive)}
                      className="rounded-[var(--radius-pill)] border border-brand-primary px-3 py-1 text-xs disabled:opacity-50"
                    >
                      {coupon.isActive ? "Pause" : "Resume"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
