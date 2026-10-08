import type { PartnerScore } from "@/lib/reviews-model";

export function PartnerScoreLine({ score }: { score: PartnerScore }) {
  return (
    <p className="text-sm text-brand-ink-muted">
      {score.isNew ? "Your delivery partner · New partner" : `Your delivery partner · ★ ${score.average.toFixed(1)} (${score.count} ratings)`}
    </p>
  );
}
