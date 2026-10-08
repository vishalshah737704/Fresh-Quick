"use client";

import { StarsDisplay } from "@/components/reviews/Stars";
import type { OwnReview } from "@/lib/reviews-model";

export function OwnReviewView({ review }: { review: OwnReview }) {
  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow">
      <h2 className="font-heading text-lg text-brand-ink">Your review</h2>
      {review.status === "hidden" && (
        <p className="text-sm text-brand-ink-muted">This review is currently hidden by the Fresh &amp; Quick team.</p>
      )}
      <StarsDisplay value={review.stars} />
      {review.comment && <p className="whitespace-pre-wrap text-sm text-brand-ink">{review.comment}</p>}
      {review.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={review.photoUrl} alt="Your review" className="max-h-48 w-auto self-start rounded-[var(--radius-card)] object-cover" />
      )}
      {review.dishes.map((dish) => (
        <p key={dish.name} className="text-sm text-brand-ink">
          {dish.name}: <StarsDisplay value={dish.stars} />
          {dish.comment ? ` · ${dish.comment}` : ""}
        </p>
      ))}
      {review.partner && (
        <p className="text-sm text-brand-ink">
          Delivery: <StarsDisplay value={review.partner.stars} />
          {review.partner.comment ? ` · ${review.partner.comment}` : ""}
        </p>
      )}
      {review.vendorReply && (
        <p className="rounded-[var(--radius-card)] bg-brand-bg p-2 text-sm text-brand-ink">
          <strong>Reply from the store:</strong> {review.vendorReply}
        </p>
      )}
    </section>
  );
}
