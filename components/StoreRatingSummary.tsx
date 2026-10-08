export function StoreRatingSummary({
  rating,
  count = 0,
  histogram,
}: {
  rating: number;
  count?: number;
  histogram?: number[];
}) {
  const filled = Math.round(rating);
  const max = Math.max(1, ...(histogram ?? [0]));
  return (
    <section className="mb-6 rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-primary-tint p-4">
      <h2 className="mb-3 font-heading text-lg text-brand-ink">Rating</h2>
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold text-brand-ink">{rating.toFixed(1)}</span>
        <span aria-hidden className="text-xl">
          {"⭐".repeat(filled)}
          {"☆".repeat(5 - filled)}
        </span>
        {count > 0 && <span className="text-sm text-brand-ink-muted">({count} {count === 1 ? "review" : "reviews"})</span>}
      </div>
      {histogram && count > 0 && (
        <div className="mt-3 flex flex-col gap-1" aria-label="Rating breakdown">
          {[5, 4, 3, 2, 1].map((stars) => (
            <div key={stars} className="flex items-center gap-2 text-xs text-brand-ink-muted">
              <span className="w-6">{stars}★</span>
              <div className="h-2 flex-1 rounded-full bg-brand-ink-muted/15">
                <div
                  className="h-2 rounded-full bg-brand-primary"
                  style={{ width: `${(histogram[stars - 1] / max) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right">{histogram[stars - 1]}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
