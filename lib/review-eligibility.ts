// Decides whether n8n should send the "how was your order?" email. Imports nothing so `node --test` can load it.
export type ReviewRequestDecision = { eligible: true } | { eligible: false; reason: string };

export function reviewRequestDecision(input: {
  status: string;
  customerId: string | null;
  deliveredAt: string | null;
  recipientEmail: string | null;
  hasReview: boolean;
  nowMs: number;
  minAgeMinutes: number;
}): ReviewRequestDecision {
  if (input.status !== "delivered") return { eligible: false, reason: "not delivered" };
  if (!input.customerId) return { eligible: false, reason: "customer account deleted" };
  if (!input.deliveredAt || input.nowMs - Date.parse(input.deliveredAt) < input.minAgeMinutes * 60_000) {
    return { eligible: false, reason: "too early" };
  }
  if (!input.recipientEmail?.trim()) return { eligible: false, reason: "no email" };
  if (input.hasReview) return { eligible: false, reason: "already reviewed" };
  return { eligible: true };
}
