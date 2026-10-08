"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { StarsDisplay } from "@/components/reviews/Stars";
import { DELIVERY_RATING_PATH, PARTNER_SCORE_MIN_RATINGS, type PartnerRating } from "@/lib/reviews-model";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function DeliveryRatingPage() {
  const [rating, setRating] = useState<PartnerRating | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(DELIVERY_RATING_PATH, { headers: await authHeader() });
      const body = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) setError(body?.error ?? "Failed to load your rating");
      else setRating(body as PartnerRating);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  if (!rating) return <p className="text-brand-ink-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl text-brand-ink">My rating</h1>
      <section className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow">
        {rating.average === null ? (
          <p className="text-brand-ink-muted">No ratings yet. Customers can rate your delivery after an order is delivered.</p>
        ) : (
          <>
            <p className="text-3xl font-bold text-brand-ink">{rating.average.toFixed(1)}</p>
            <StarsDisplay value={rating.average} />
            <p className="text-sm text-brand-ink-muted">
              {rating.count} {rating.count === 1 ? "rating" : "ratings"}
              {rating.count < PARTNER_SCORE_MIN_RATINGS
                ? ` · customers see "New partner" until you have ${PARTNER_SCORE_MIN_RATINGS}`
                : ""}
            </p>
          </>
        )}
      </section>
      {rating.recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg text-brand-ink">Recent comments</h2>
          {rating.recent.map((row) => (
            <article key={row.createdAt + row.stars} className="rounded-[var(--radius-card)] bg-brand-surface p-3 shadow">
              <StarsDisplay value={row.stars} />{" "}
              <span className="text-xs text-brand-ink-muted">{new Date(row.createdAt).toLocaleDateString()}</span>
              {row.comment && <p className="mt-1 whitespace-pre-wrap text-sm text-brand-ink">{row.comment}</p>}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
