"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActionCard, CardState, CartApi } from "@/lib/zippy/action-types";
import { executeAction } from "@/lib/zippy/action-exec";

// One tap runs one card, once. `cart` comes from the cart bridge (lib/cart-bridge.ts); it is null outside /customer/* because the provider unmounts there.
// `states` and `executed` live in the widget (not here) so closing the chat, which unmounts this list, never makes a done card tappable again.
// A thrown confirm is the only retryable failure; a failed RESULT (e.g. "Your cart changed") stays final text.
const RETRY_MESSAGE = "Something went wrong, try again.";

export function ActionCards({
  cards,
  cart,
  onNavigate,
  states,
  setStates,
  executed,
}: {
  cards: ActionCard[];
  cart: CartApi | null;
  onNavigate?: () => void;
  states: Record<string, CardState>;
  setStates: Dispatch<SetStateAction<Record<string, CardState>>>;
  executed: MutableRefObject<Set<string>>;
}) {
  const router = useRouter();

  const confirm = (card: ActionCard, isRetry = false) => {
    const isCheckout = card.kind === "go_to_checkout";
    if (!cart && !isCheckout) return;
    // A retry is only offered on the thrown-error state, so it may pass the guards that block a second run.
    if (!isRetry && (executed.current.has(card.id) || (states[card.id] && states[card.id].status !== "idle"))) return;
    executed.current.add(card.id);
    try {
      // Checkout is navigation only: with no cart provider (outside /customer) the store check is skipped.
      const result = cart ? executeAction(card, cart) : { ok: true, message: "Opening checkout." };
      if (isCheckout && !result.ok) {
        executed.current.delete(card.id);
        setStates((current) => ({ ...current, [card.id]: { status: "failed", message: result.message } }));
        return;
      }
      if (isCheckout) {
        setStates((current) => ({ ...current, [card.id]: { status: "done", message: result.message } }));
        router.push("/customer/checkout");
        onNavigate?.();
        return;
      }
      setStates((current) => ({ ...current, [card.id]: { status: result.ok ? "done" : "failed", message: result.message } }));
    } catch {
      setStates((current) => ({ ...current, [card.id]: { status: "failed", message: RETRY_MESSAGE } }));
    }
  };
  // Releases the executed-id guard and the failed state, then runs the same confirm again.
  const retry = (card: ActionCard) => {
    executed.current.delete(card.id);
    confirm(card, true);
  };
  const dismiss = (card: ActionCard) => setStates((current) => ({ ...current, [card.id]: { status: "dismissed" } }));

  return (
    <div className="flex max-w-[85%] flex-col gap-2">
      {cards.map((card) => {
        const state = states[card.id] ?? { status: "idle" as const };
        if (state.status === "dismissed") return null;
        return (
          <div key={card.id} className="rounded-2xl border border-brand-primary-text-safe/40 bg-brand-surface p-3 text-sm text-brand-ink">
            <p className="break-words font-semibold">{card.title}</p>
            <p className="mt-1 break-words">{card.description}</p>
            {state.status === "idle" ? (
              cart || card.kind === "go_to_checkout" ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => confirm(card)}
                    className="min-h-10 rounded-full bg-brand-primary-text-safe px-5 py-2 text-sm font-medium text-white"
                  >
                    {card.kind === "go_to_checkout" ? "Go to checkout" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(card)}
                    className="min-h-10 rounded-full border border-brand-ink-muted/40 px-5 py-2 text-sm text-brand-ink"
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <Link href="/customer" className="mt-2 inline-flex min-h-10 items-center text-sm font-medium text-brand-primary-text-safe underline">
                  Open your cart to continue
                </Link>
              )
            ) : (
              <div role="status" className="mt-2">
                <p className={`text-sm ${state.status === "done" ? "text-brand-accent-text-safe" : "text-brand-danger-text-safe"}`}>{state.message}</p>
                {state.status === "failed" && state.message === RETRY_MESSAGE && (
                  <button
                    type="button"
                    onClick={() => retry(card)}
                    className="mt-2 min-h-10 rounded-full bg-brand-primary-text-safe px-5 py-2 text-sm font-medium text-white"
                  >
                    Try again
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
