export function StoreRatingSummary({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <section className="mb-6 rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface p-4">
      <h2 className="mb-3 font-heading text-lg text-brand-ink">Rating</h2>
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold text-brand-ink">{rating.toFixed(1)}</span>
        <span aria-hidden className="text-xl">
          {"⭐".repeat(filled)}
          {"☆".repeat(5 - filled)}
        </span>
      </div>
    </section>
  );
}
