import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { orderReviewPath, type OrderReviewState, type ReviewInput } from "./reviews-model";

const STATUSES_WITH_STATE = ["assigned", "picked_up", "delivered"];

type Tagged = { key: string; state: OrderReviewState };

// Same shape as the web hook (lib/use-order-review.ts), without photos: the loaded state is tagged with its
// order and status, and the visible value is derived instead of being reset in an effect.
export function useOrderReview(orderId: string, status: string | null) {
  const [tagged, setTagged] = useState<Tagged | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const key = `${orderId}:${status}`;
  const enabled = status !== null && STATUSES_WITH_STATE.includes(status);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const state = await apiFetch<OrderReviewState>(orderReviewPath(orderId));
        if (!cancelled) {
          setTagged({ key, state });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the review");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, key, enabled]);

  const submit = useCallback(
    async (input: ReviewInput): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      try {
        await apiFetch(orderReviewPath(orderId), { method: "POST", body: input });
        const state = await apiFetch<OrderReviewState>(orderReviewPath(orderId));
        setTagged({ key, state });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save your review");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [orderId, key]
  );

  const state = tagged && tagged.key === key ? tagged.state : null;
  return { state, loading: enabled && state === null && error === null, error, submitting, submit };
}
