"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type PartnerRow = {
  user_id: string;
  is_online: boolean;
  vehicle_type: string | null;
  users: { full_name: string } | null;
};

const VEHICLES = ["bike", "scooter", "bicycle", "car"];

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

const inputClass =
  "w-full min-w-0 rounded-lg border border-brand-ink-muted/20 bg-white px-3 py-2 text-sm text-brand-ink";

export default function AdminDeliveryPartnersPage() {
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [formOpen, setFormOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [vehicleType, setVehicleType] = useState("bike");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/delivery-partners", { headers: await authHeader() });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Failed to load delivery partners");
        } else {
          setPartners(body.partners);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load delivery partners");
      }
      if (!cancelled) setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFormError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/delivery-partners", {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName, vehicleType }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(body.error ?? "Failed to create delivery partner");
      } else {
        setFullName("");
        setEmail("");
        setPassword("");
        setVehicleType("bike");
        setFormOpen(false);
        setSuccess("Delivery partner created");
        setReloadKey((k) => k + 1);
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create delivery partner");
    }
    setSubmitting(false);
  }

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-card)] bg-brand-ink px-4 py-3">
        <h1 className="font-heading text-2xl text-white">Delivery partners</h1>
        <button
          type="button"
          onClick={() => {
            setFormOpen((o) => !o);
            setFormError(null);
          }}
          className="rounded-full bg-brand-primary-text-safe px-4 py-1.5 text-sm text-white"
        >
          {formOpen ? "Cancel" : "Add delivery partner"}
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
            <label htmlFor="partner-full-name" className="mb-1 block text-sm text-brand-ink">
              Full name
            </label>
            <input
              id="partner-full-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="partner-email" className="mb-1 block text-sm text-brand-ink">
              Email
            </label>
            <input
              id="partner-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="min-w-0">
            <label htmlFor="partner-password" className="mb-1 block text-sm text-brand-ink">
              Temporary password
            </label>
            <input
              id="partner-password"
              type="text"
              required
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
            <p className="mt-1 break-words text-xs text-brand-ink-muted">
              Share this with the delivery partner — they can change it from their profile
            </p>
          </div>
          <div className="min-w-0">
            <label htmlFor="partner-vehicle" className="mb-1 block text-sm text-brand-ink">
              Vehicle
            </label>
            <select
              id="partner-vehicle"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className={inputClass}
            >
              {VEHICLES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
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
              {submitting ? "Creating…" : "Create delivery partner"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="mb-3 break-words text-sm text-red-600">Couldn&apos;t load delivery partners: {error}</p>
      )}

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-brand-ink-muted/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-brand-ink text-white">
            <tr>
              <th className="p-2">Name</th>
              <th className="p-2">Status</th>
              <th className="p-2">Vehicle</th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.user_id} className="border-t border-brand-ink-muted/10">
                <td className="break-words p-2">{p.users?.full_name ?? "Partner"}</td>
                <td className="p-2">
                  <span
                    className={`inline-flex items-center whitespace-nowrap rounded-[var(--radius-pill)] px-3 py-1 text-xs font-medium ${
                      p.is_online ? "bg-brand-accent-text-safe text-white" : "bg-gray-400 text-white"
                    }`}
                  >
                    {p.is_online ? "Online" : "Offline"}
                  </span>
                </td>
                <td className="break-words p-2">{p.vehicle_type ?? "—"}</td>
              </tr>
            ))}
            {loaded && partners.length === 0 && (
              <tr>
                <td colSpan={3} className="p-4 text-center text-brand-ink-muted">
                  No delivery partners yet.
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
