"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type RestaurantRow = {
  id: string;
  name: string;
  is_open: boolean;
  is_suspended: boolean;
  created_at: string;
};

const DEFAULT_LAT = "12.9716";
const DEFAULT_LNG = "77.5946";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function vendorStatus(r: RestaurantRow): { label: string; className: string } {
  if (r.is_suspended) return { label: "Paused", className: "bg-brand-primary-text-safe text-white" };
  if (r.is_open) return { label: "Active", className: "bg-brand-accent-text-safe text-white" };
  return { label: "Pending", className: "bg-gray-400 text-white" };
}

const inputClass =
  "w-full min-w-0 rounded-lg border border-brand-ink-muted/20 bg-white px-3 py-2 text-sm text-brand-ink";

export default function AdminVendorsPage() {
  const [stores, setStores] = useState<RestaurantRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/restaurants", { headers: await authHeader() });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Failed to load vendors");
        } else {
          setStores(body.stores);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load vendors");
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function toggleSuspend(r: RestaurantRow) {
    setActionError(null);
    const path = r.is_suspended
      ? `/api/admin/restaurants/${r.id}/unsuspend`
      : `/api/admin/restaurants/${r.id}/suspend`;
    try {
      const res = await fetch(path, { method: "POST", headers: await authHeader() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setActionError(body.error ?? "Failed to update vendor");
        return;
      }
      setReloadKey((k) => k + 1);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update vendor");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/vendors", {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullName,
          storeName,
          lat: Number(lat),
          lng: Number(lng),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(body.error ?? "Failed to create vendor");
      } else {
        setStoreName("");
        setFullName("");
        setEmail("");
        setPassword("");
        setLat(DEFAULT_LAT);
        setLng(DEFAULT_LNG);
        setFormOpen(false);
        setSuccess("Vendor created");
        setReloadKey((k) => k + 1);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create vendor");
    }
    setSubmitting(false);
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] bg-brand-ink px-4 py-3">
        <h1 className="font-heading text-2xl text-white">Vendors</h1>
        <button
          type="button"
          onClick={() => {
            setFormOpen((o) => !o);
            setFormError(null);
          }}
          className="rounded-full bg-brand-primary-text-safe px-4 py-1.5 text-sm text-white"
        >
          {formOpen ? "Cancel" : "Add vendor"}
        </button>
      </div>

      {success && (
        <p role="status" className="mb-3 break-words text-sm text-brand-accent-text-safe">
          {success}
        </p>
      )}

      {formOpen && (
        <form
          onSubmit={handleSubmit}
          className="mb-4 grid min-w-0 grid-cols-1 gap-3 rounded-[var(--radius-card)] border border-brand-ink-muted/10 p-4 sm:grid-cols-2"
        >
          <div className="min-w-0">
            <label htmlFor="vendor-store-name" className="mb-1 block text-sm text-brand-ink">
              Store name
            </label>
            <input
              id="vendor-store-name"
              required
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="vendor-owner-name" className="mb-1 block text-sm text-brand-ink">
              Owner name
            </label>
            <input
              id="vendor-owner-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="vendor-email" className="mb-1 block text-sm text-brand-ink">
              Email
            </label>
            <input
              id="vendor-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="vendor-password" className="mb-1 block text-sm text-brand-ink">
              Temporary password
            </label>
            <input
              id="vendor-password"
              type="text"
              required
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 break-words text-xs text-brand-ink-muted">
              Share this with the vendor — they can change it from their profile
            </p>
          </div>
          <div className="min-w-0">
            <label htmlFor="vendor-lat" className="mb-1 block text-sm text-brand-ink">
              Latitude
            </label>
            <input
              id="vendor-lat"
              required
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="vendor-lng" className="mb-1 block text-sm text-brand-ink">
              Longitude
            </label>
            <input
              id="vendor-lng"
              required
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className={inputClass}
            />
          </div>
          {formError && (
            <p role="alert" className="break-words text-sm text-red-600 sm:col-span-2">
              {formError}
            </p>
          )}
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-full bg-brand-primary-text-safe px-4 py-2 text-sm text-white disabled:opacity-50 sm:w-auto"
            >
              {submitting ? "Creating…" : "Create vendor"}
            </button>
          </div>
        </form>
      )}

      {error && <p className="mb-3 break-words text-sm text-red-600">Couldn&apos;t load vendors: {error}</p>}
      {actionError && <p className="mb-3 break-words text-sm text-red-600">{actionError}</p>}

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-brand-ink-muted/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-ink text-white">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Status</th>
              <th className="p-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((r) => {
              const status = vendorStatus(r);
              return (
                <tr key={r.id} className="border-t border-brand-ink-muted/10">
                  <td className="break-words p-2">{r.name}</td>
                  <td className="p-2">
                    <span
                      className={`inline-flex items-center whitespace-nowrap rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => toggleSuspend(r)}
                      className="whitespace-nowrap rounded-full bg-brand-accent/20 px-3 py-1 text-xs text-brand-ink"
                    >
                      {r.is_suspended ? "Unsuspend" : "Suspend"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {loaded && stores.length === 0 && (
              <tr>
                <td colSpan={3} className="p-4 text-center text-brand-ink-muted">
                  No vendors yet.
                </td>
              </tr>
            )}
            {!loaded && (
              <tr>
                <td colSpan={3} className="p-4 text-center text-brand-ink-muted">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
