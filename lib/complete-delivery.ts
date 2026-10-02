// Pure decision for "may this order become delivered right now?". Used by the
// customer route (after its 15 s animation) and the internal n8n fallback route.
// No imports on purpose: runs under `node --test`.
export type CompletionInput = {
  status: string;
  pickedUpAt: string | null;
  nowMs: number;
  mode: "customer" | "internal";
  animationMs: number;
  toleranceMs: number;
};

export type CompletionDecision =
  | { kind: "deliver" }
  | { kind: "already" }
  | { kind: "reject"; httpStatus: 409 | 425; error: string; retryAfterMs?: number };

export function decideCompletion(input: CompletionInput): CompletionDecision {
  if (input.status === "delivered") return { kind: "already" };
  if (input.status !== "picked_up") {
    return {
      kind: "reject",
      httpStatus: 409,
      error: `Order in status "${input.status}" cannot be completed`,
    };
  }
  if (input.mode === "internal") return { kind: "deliver" };

  // Legacy rows with no picked_up_at (pre migration 27) get no time rule rather
  // than hanging forever; the trigger always stamps it for new pickups.
  const started = input.pickedUpAt ? Date.parse(input.pickedUpAt) : Number.NaN;
  if (Number.isNaN(started)) return { kind: "deliver" };

  const required = input.animationMs - input.toleranceMs;
  const elapsed = input.nowMs - started;
  if (elapsed < required) {
    return {
      kind: "reject",
      httpStatus: 425,
      error: "Delivery animation has not finished yet",
      retryAfterMs: required - elapsed,
    };
  }
  return { kind: "deliver" };
}
