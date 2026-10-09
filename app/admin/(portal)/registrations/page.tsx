"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { REJECTION_REASON_MAX } from "@/lib/registration-model";

type Row = {
  id: string; email: string; fullName: string | null; phone: string | null; line1: string | null;
  city: string | null; pincode: string | null; createdAt: string | null; status: string;
  reason: string | null; reviewedAt: string | null;
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "");

export default function RegistrationsPage() {
  const [view, setView] = useState<"pending" | "history">("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const busyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const mine = ++requestRef.current;
    try {
      const res = await fetch(`/api/admin/registrations?view=${view}`, { headers: await authHeader() });
      const body = await res.json();
      if (mine !== requestRef.current) return;
      if (!res.ok) {
        setError(body.error ?? "Failed to load registrations");
        setLoaded(true);
        return;
      }
      setRows(body.requests);
      setError(null);
      setLoaded(true);
    } catch {
      if (mine !== requestRef.current) return;
      setError("Failed to load registrations");
      setLoaded(true);
    }
  }, [view]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [load]);

  async function approve(row: Row) {
    if (busyRef.current) return;
    busyRef.current = row.id;
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/registrations/${row.id}/approve`, { method: "POST", headers: await authHeader() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? "Failed to approve");
    } finally {
      busyRef.current = null;
      setBusyId(null);
      window.dispatchEvent(new Event("registrations-changed"));
      await load();
    }
  }

  async function confirmReject() {
    if (!rejecting || busyRef.current) return;
    const text = reason.trim();
    if (text === "") return setReasonError("A reason is required");
    busyRef.current = rejecting.id;
    setBusyId(rejecting.id);
    setReasonError(null);
    try {
      const res = await fetch(`/api/admin/registrations/${rejecting.id}/reject`, {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: text }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setReasonError(body.error ?? "Failed to reject");
      setRejecting(null);
      setReason("");
    } finally {
      busyRef.current = null;
      setBusyId(null);
      window.dispatchEvent(new Event("registrations-changed"));
      await load();
    }
  }

  return (
    <div>
      <div className="mb-4 rounded-[var(--radius-card)] bg-brand-ink px-4 py-3">
        <h1 className="font-heading text-2xl text-white">Registrations</h1>
      </div>
      <div className="mb-4 flex gap-2">
        {(["pending", "history"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              if (tab === view) return;
              setRows([]);
              setLoaded(false);
              setView(tab);
            }}
            className={`rounded-[var(--radius-pill)] px-4 py-1 text-sm ${view === tab ? "bg-brand-primary-text-safe text-white" : "border border-brand-ink-muted/20 text-brand-ink"}`}
          >
            {tab === "pending" ? "Pending" : "History"}
          </button>
        ))}
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!loaded ? (
        <p className="text-brand-ink-muted">Loading registrations…</p>
      ) : rows.length === 0 ? (
        <p className="text-brand-ink-muted">{view === "pending" ? "No registrations are waiting for approval." : "No decisions yet."}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-brand-ink-muted/15 bg-brand-surface">
          <table className="w-full text-left text-sm">
            <thead className="text-brand-ink-muted">
              <tr>
                <th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Phone</th>
                <th className="p-3">Address</th><th className="p-3">{view === "pending" ? "Requested" : "Decision"}</th>
                {view === "pending" && <th className="p-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-brand-ink-muted/10 align-top">
                  <td className="p-3">{row.fullName}</td>
                  <td className="p-3 break-all">{row.email}</td>
                  <td className="p-3">{row.phone}</td>
                  <td className="p-3">{[row.line1, row.city, row.pincode].filter(Boolean).join(", ")}</td>
                  <td className="p-3">
                    {view === "pending" ? when(row.createdAt) : (
                      <span>
                        <b className="capitalize">{row.status}</b> {when(row.reviewedAt)}
                        {row.reason && <span className="block text-brand-ink-muted">{row.reason}</span>}
                      </span>
                    )}
                  </td>
                  {view === "pending" && (
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button type="button" disabled={busyId === row.id} onClick={() => void approve(row)}
                          className="rounded-[var(--radius-pill)] bg-brand-primary-text-safe px-3 py-1 text-white disabled:opacity-50">Approve</button>
                        <button type="button" disabled={busyId === row.id} onClick={() => { setRejecting(row); setReason(""); setReasonError(null); }}
                          className="rounded-[var(--radius-pill)] border border-red-600 px-3 py-1 text-red-700 disabled:opacity-50">Reject</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rejecting && (
        <div role="dialog" aria-modal="true" aria-label="Reject registration" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-card)] bg-brand-surface p-5 shadow-xl">
            <h2 className="mb-1 font-heading text-lg text-brand-ink">Reject {rejecting.fullName ?? rejecting.email}</h2>
            <p className="mb-3 text-sm text-brand-ink-muted">The reason is emailed to the applicant.</p>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={REJECTION_REASON_MAX}
              rows={4}
              className="w-full rounded-lg border border-brand-ink-muted/30 p-2 text-brand-ink"
              aria-label="Reason for rejection"
            />
            <p className="mt-1 text-right text-xs text-brand-ink-muted">{reason.length}/{REJECTION_REASON_MAX}</p>
            {reasonError && <p className="mb-2 text-sm text-red-600">{reasonError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" disabled={busyId === rejecting.id} onClick={() => setRejecting(null)} className="rounded-[var(--radius-pill)] border border-brand-ink-muted/30 px-4 py-1">Cancel</button>
              <button type="button" disabled={busyId === rejecting.id} onClick={() => void confirmReject()}
                className="rounded-[var(--radius-pill)] bg-red-700 px-4 py-1 text-white disabled:opacity-50">Reject</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
