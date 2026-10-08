"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { StarsDisplay } from "@/components/reviews/Stars";
import type { AdminReview } from "@/lib/reviews-model";

type Filter = "reported" | "hidden" | "all";
type Listing = { filter: Filter; reviews: AdminReview[]; nextCursor: string | null };

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AdminReviewsPage() {
  const [filter, setFilter] = useState<Filter>("reported");
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/reviews?filter=${filter}`, { headers: await authHeader() });
      const body = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) {
        setError(body?.error ?? "Failed to load reviews");
        return;
      }
      setError(null);
      setListing({ filter, reviews: body.reviews, nextCursor: body.nextCursor });
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, reloadKey]);

  const current = listing && listing.filter === filter ? listing : null;

  const loadMore = useCallback(async () => {
    if (!current?.nextCursor) return;
    const res = await fetch(`/api/admin/reviews?filter=${filter}&before=${encodeURIComponent(current.nextCursor)}`, {
      headers: await authHeader(),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to load reviews");
      return;
    }
    setListing({ ...current, reviews: [...current.reviews, ...body.reviews], nextCursor: body.nextCursor });
  }, [current, filter]);

  async function moderate(id: string, action: "hide" | "unhide" | "dismiss-report") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${id}/${action}`, {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: action === "hide" ? JSON.stringify({ reason: reasons[id] ?? "" }) : undefined,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error ?? "That did not work");
      else setReloadKey((value) => value + 1);
    } finally {
      setBusyId(null);
    }
  }

  const tab = (value: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`rounded-full px-4 py-1 text-sm ${filter === value ? "bg-brand-ink text-white" : "bg-brand-surface text-brand-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl text-brand-ink">Reviews</h1>
      <div className="flex gap-2">
        {tab("reported", "Reported")}
        {tab("hidden", "Hidden")}
        {tab("all", "All")}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!current && !error && <p className="text-brand-ink-muted">Loading…</p>}
      {current && current.reviews.length === 0 && <p className="text-brand-ink-muted">Nothing here.</p>}
      {current?.reviews.map((review) => (
        <article key={review.id} className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong className="text-brand-ink">{review.storeName}</strong>
            <span className="text-brand-ink-muted">by {review.customerName}</span>
            <StarsDisplay value={review.stars} />
            <span className="text-brand-ink-muted">{new Date(review.createdAt).toLocaleString()}</span>
            {review.status === "hidden" && <span className="rounded-full bg-brand-ink px-2 py-0.5 text-xs text-white">Hidden</span>}
          </div>
          {review.comment && <p className="whitespace-pre-wrap text-sm text-brand-ink">{review.comment}</p>}
          {review.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={review.photoUrl} alt="Review photo" className="max-h-40 w-auto rounded-[var(--radius-card)] object-cover" />
          )}
          {review.dishes.length > 0 && (
            <p className="text-xs text-brand-ink-muted">
              {review.dishes.map((dish) => `${dish.name} ${dish.stars}★${dish.comment ? ` "${dish.comment}"` : ""}`).join(" · ")}
            </p>
          )}
          {review.partner && (
            <p className="text-xs text-brand-ink-muted">
              Delivery: {review.partner.stars}★{review.partner.comment ? ` "${review.partner.comment}"` : ""}
            </p>
          )}
          {review.vendorReply && <p className="text-sm text-brand-ink"><strong>Store reply:</strong> {review.vendorReply}</p>}
          {review.reportReason && (
            <p className="text-sm text-brand-ink-muted">
              Reported by {review.reportedBy ?? "someone"}: {review.reportReason}
              {review.reportedAt ? "" : " (resolved)"}
            </p>
          )}
          {review.status === "hidden" && review.hiddenReason && (
            <p className="text-sm text-brand-ink-muted">Hidden because: {review.hiddenReason}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {review.status === "visible" ? (
              <>
                <input
                  className="min-w-[12rem] flex-1 rounded-lg border border-brand-ink-muted/30 px-2 py-1 text-sm"
                  placeholder="Reason for hiding (required)"
                  maxLength={300}
                  value={reasons[review.id] ?? ""}
                  onChange={(event) => setReasons((prev) => ({ ...prev, [review.id]: event.target.value }))}
                />
                <button
                  type="button"
                  disabled={busyId === review.id || !(reasons[review.id] ?? "").trim()}
                  onClick={() => moderate(review.id, "hide")}
                  className="rounded-[var(--radius-pill)] bg-brand-ink px-4 py-1 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Hide
                </button>
                {review.reportedAt && (
                  <button type="button" disabled={busyId === review.id} onClick={() => moderate(review.id, "dismiss-report")} className="text-sm underline">
                    Dismiss report
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                disabled={busyId === review.id}
                onClick={() => moderate(review.id, "unhide")}
                className="rounded-[var(--radius-pill)] bg-brand-primary px-4 py-1 text-sm font-semibold text-white disabled:opacity-50"
              >
                Unhide
              </button>
            )}
          </div>
        </article>
      ))}
      {current?.nextCursor && (
        <button type="button" onClick={loadMore} className="self-start rounded-[var(--radius-pill)] border border-brand-primary px-4 py-1 text-sm">
          Load more
        </button>
      )}
    </div>
  );
}
