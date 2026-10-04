"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ActionCard, CartApi } from "@/lib/zippy/action-types";
import { executeAction } from "@/lib/zippy/action-exec";

type CardState = { status: "idle" } | { status: "done" | "failed"; message: string } | { status: "dismissed" };

// One tap runs one card, once. `cart` is null outside /customer/* (the cart provider is not mounted there).
export function ActionCards({ cards, cart }: { cards: ActionCard[]; cart: CartApi | null }) {
  const [states, setStates] = useState<Record<string, CardState>>({});
  const executed = useRef<Set<string>>(new Set());

  const confirm = (card: ActionCard) => {
    if (!cart || executed.current.has(card.id) || (states[card.id] && states[card.id].status !== "idle")) return;
    executed.current.add(card.id);
    try {
      const result = executeAction(card, cart);
      setStates((current) => ({ ...current, [card.id]: { status: result.ok ? "done" : "failed", message: result.message } }));
    } catch {
      setStates((current) => ({ ...current, [card.id]: { status: "failed", message: "Something went wrong, try again." } }));
    }
  };
  const dismiss = (card: ActionCard) => setStates((current) => ({ ...current, [card.id]: { status: "dismissed" } }));

  return (
    <div className="flex max-w-[85%] flex-col gap-2">
      {cards.map((card) => {
        const state = states[card.id] ?? { status: "idle" as const };
        if (state.status === "dismissed") return null;
        return (
          <div key={card.id} className="rounded-2xl border border-brand-primary-text-safe/40 bg-white p-3 text-sm text-brand-ink">
            <p className="font-semibold">{card.title}</p>
            <p className="mt-1 break-words">{card.description}</p>
            {state.status === "idle" ? (
              cart ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => confirm(card)}
                    className="rounded-full bg-brand-primary-text-safe px-4 py-1.5 text-sm font-medium text-white"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(card)}
                    className="rounded-full border border-brand-ink-muted/40 px-4 py-1.5 text-sm text-brand-ink"
                  >
                    Dismiss
                  </button>
                </div>
              ) : (
                <Link href="/customer" className="mt-2 inline-block text-sm font-medium text-brand-primary-text-safe underline">
                  Open your cart to continue
                </Link>
              )
            ) : (
              <p role="status" className={`mt-2 text-sm ${state.status === "done" ? "text-green-700" : "text-red-700"}`}>
                {state.message}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
