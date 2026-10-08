"use client";

import { useCallback, useEffect, useState } from "react";
import { StoreRatingSummary } from "@/components/StoreRatingSummary";
import { StarsDisplay } from "@/components/reviews/Stars";
import { ReportReviewButton } from "@/components/reviews/ReportReviewButton";
import { storeRatingPath, storeReviewsPath, type PublicReview } from "@/lib/reviews-model";

type Summary = { rating: number | null; count: number; histogram: number[] };
type Page = { reviews: PublicReview[]; nextCursor: string | null };
type Loaded = { storeId: string; summary: Summary; reviews: PublicReview[]; nextCursor: string | null };

// seedRating is the stores.rating shown before any real review exists.
export function StoreReviews({ storeId, seedRating }: { storeId: string; seedRating: number }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [summaryRes, pageRes] = await Promise.all([fetch(storeRatingPath(storeId)), fetch(storeReviewsPath(storeId))]);
        if (!summaryRes.ok || !pageRes.ok) throw new Error("load failed");
        const summary = (await summaryRes.json()) as Summary;
        const page = (await pageRes.json()) as Page;
        if (!cancelled) setLoaded({ storeId, summary, reviews: page.reviews, nextCursor: page.nextCursor });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const current = loaded && loaded.storeId === storeId ? loaded : null;

  const loadMore = useCallback(async () => {
    if (!current?.nextCursor) return;
    setMoreBusy(true);
    try {
      const res = await fetch(`${storeReviewsPath(storeId)}?before=${encodeURIComponent(current.nextCursor)}`);
      if (!res.ok) throw new Error("load failed");
      const page = (await res.json()) as Page;
      setLoaded({ ...current, reviews: [...current.reviews, ...page.reviews], nextCursor: page.nextCursor });
    } catch {
      setFailed(true);
    } finally {
      setMoreBusy(false);
    }
  }, [current, storeId]);

  const count = current?.summary.count ?? 0;
  const rating = count > 0 && current?.summary.rating != null ? current.summary.rating : seedRating;

  return (
    <>
      <StoreRatingSummary rating={rating} count={count} histogram={current?.summary.histogram} />
      {failed && <p className="mb-4 text-sm text-brand-ink-muted">Reviews are unavailable right now.</p>}
      {current && current.reviews.length > 0 && (
        <section className="mb-6 flex flex-col gap-3" aria-label="Customer reviews">
          <h2 className="font-heading text-lg text-brand-ink">Reviews</h2>
          {current.reviews.map((review) => (
            <article key={review.id} className="flex flex-col gap-1 rounded-[var(--radius-card)] bg-brand-surface p-3 shadow">
              <div className="flex items-center gap-2 text-sm">
                <strong className="text-brand-ink">{review.reviewerName}</strong>
                <StarsDisplay value={review.stars} />
                <span className="text-brand-ink-muted">{new Date(review.createdAt).toLocaleDateString()}</span>
              </div>
              {review.comment && <p className="whitespace-pre-wrap text-sm text-brand-ink">{review.comment}</p>}
              {review.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={review.photoUrl} alt="From a customer" loading="lazy" className="max-h-48 w-auto self-start rounded-[var(--radius-card)] object-cover" />
              )}
              {review.dishes.length > 0 && (
                <p className="text-xs text-brand-ink-muted">
                  {review.dishes.map((dish) => `${dish.name} ${dish.stars}★`).join(" · ")}
                </p>
              )}
              {review.vendorReply && (
                <p className="rounded-[var(--radius-card)] bg-brand-bg p-2 text-sm text-brand-ink">
                  <strong>Reply from the store:</strong> {review.vendorReply}
                </p>
              )}
              <ReportReviewButton reviewId={review.id} />
            </article>
          ))}
          {current.nextCursor && (
            <button
              type="button"
              disabled={moreBusy}
              onClick={loadMore}
              className="self-start rounded-[var(--radius-pill)] border border-brand-primary px-4 py-1 text-sm text-brand-primary-text-safe disabled:opacity-50"
            >
              {moreBusy ? "Loading…" : "Load more reviews"}
            </button>
          )}
        </section>
      )}
    </>
  );
}
