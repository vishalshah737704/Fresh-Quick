"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { StarsDisplay } from "@/components/reviews/Stars";
import { REVIEW_LIMITS, type VendorReview } from "@/lib/reviews-model";

type Filter = "all" | "no_reply" | "reported";
type Listing = { filter: Filter; reviews: VendorReview[]; nextCursor: string | null; needsReply: number };

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorReviewsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/vendor/reviews?status=${filter}`, { headers: await authHeader() });
      const body = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) {
        setError(body?.error ?? "Failed to load reviews");
        return;
      }
      setError(null);
      setListing({ filter, reviews: body.reviews, nextCursor: body.nextCursor, needsReply: body.needsReply });
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, reloadKey]);

  const current = listing && listing.filter === filter ? listing : null;

  const loadMore = useCallback(async () => {
    if (!current?.nextCursor) return;
    const res = await fetch(`/api/vendor/reviews?status=${filter}&before=${encodeURIComponent(current.nextCursor)}`, {
      headers: await authHeader(),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to load reviews");
      return;
    }
    setListing({ ...current, reviews: [...current.reviews, ...body.reviews], nextCursor: body.nextCursor });
  }, [current, filter]);

  async function act(id: string, request: () => Promise<Response>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await request();
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error ?? "That did not work");
      else setReloadKey((value) => value + 1);
    } finally {
      setBusyId(null);
    }
  }

  const saveReply = (id: string) =>
    act(id, async () =>
      fetch(`/api/vendor/reviews/${id}/reply`, {
        method: "PUT",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ reply: drafts[id] ?? "" }),
      })
    );
  const clearReply = (id: string) =>
    act(id, async () => fetch(`/api/vendor/reviews/${id}/reply`, { method: "DELETE", headers: await authHeader() }));
  const report = (id: string) =>
    act(id, async () =>
      fetch(`/api/vendor/reviews/${id}/report`, {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Reported by the store" }),
      })
    );

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
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-2xl text-brand-ink">Reviews</h1>
        {current && current.needsReply > 0 && (
          <span className="rounded-full bg-brand-primary-text-safe px-3 py-0.5 text-xs text-white">{current.needsReply} need a reply</span>
        )}
      </div>
      <div className="flex gap-2">
        {tab("all", "All")}
        {tab("no_reply", "Needs reply")}
        {tab("reported", "Reported")}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!current && !error && <p className="text-brand-ink-muted">Loading…</p>}
      {current && current.reviews.length === 0 && <p className="text-brand-ink-muted">No reviews here yet.</p>}
      {current?.reviews.map((review) =>
        review.hidden ? (
          <p key={review.id} className="rounded-[var(--radius-card)] bg-brand-surface p-3 text-sm text-brand-ink-muted">
            A review from {new Date(review.createdAt).toLocaleDateString()} was hidden by the Fresh &amp; Quick team.
          </p>
        ) : (
          <article key={review.id} className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <strong className="text-brand-ink">{review.reviewerName}</strong>
              <StarsDisplay value={review.stars} />
              <span className="text-brand-ink-muted">{new Date(review.createdAt).toLocaleDateString()}</span>
              {review.reported && <span className="rounded-full bg-brand-ink-tint px-2 py-0.5 text-xs">Reported to admin</span>}
            </div>
            {review.comment && <p className="whitespace-pre-wrap text-sm text-brand-ink">{review.comment}</p>}
            {review.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={review.photoUrl} alt="From a customer" className="max-h-40 w-auto rounded-[var(--radius-card)] object-cover" />
            )}
            {review.dishes.length > 0 && (
              <p className="text-xs text-brand-ink-muted">{review.dishes.map((dish) => `${dish.name} ${dish.stars}★`).join(" · ")}</p>
            )}
            {review.vendorReply ? (
              <div className="rounded-[var(--radius-card)] bg-brand-bg p-2 text-sm text-brand-ink">
                <strong>Your reply:</strong> {review.vendorReply}{" "}
                <button type="button" className="underline" disabled={busyId === review.id} onClick={() => clearReply(review.id)}>
                  Remove
                </button>
              </div>
            ) : null}
            <textarea
              rows={2}
              maxLength={REVIEW_LIMITS.reply}
              className="w-full rounded-[var(--radius-card)] border border-brand-ink-muted/30 p-2 text-sm"
              placeholder={review.vendorReply ? "Edit your reply" : "Reply to this review"}
              value={drafts[review.id] ?? ""}
              onChange={(event) => setDrafts((prev) => ({ ...prev, [review.id]: event.target.value }))}
            />
            <div className="flex gap-3">
              <button
                type="button"
                disabled={busyId === review.id || !(drafts[review.id] ?? "").trim()}
                onClick={() => saveReply(review.id)}
                className="rounded-[var(--radius-pill)] bg-brand-primary px-4 py-1 text-sm font-semibold text-white disabled:opacity-50"
              >
                {review.vendorReply ? "Update reply" : "Reply"}
              </button>
              {!review.reported && (
                <button type="button" disabled={busyId === review.id} onClick={() => report(review.id)} className="text-sm underline">
                  Report to admin
                </button>
              )}
            </div>
          </article>
        )
      )}
      {current?.nextCursor && (
        <button type="button" onClick={loadMore} className="self-start rounded-[var(--radius-pill)] border border-brand-primary px-4 py-1 text-sm">
          Load more
        </button>
      )}
    </div>
  );
}
