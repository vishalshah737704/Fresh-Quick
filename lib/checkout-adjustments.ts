"use client";

import { useSyncExternalStore } from "react";

// The checkout page owns the promo/credit state; the basket panel (mounted in the layout, outside the
// page) only needs the resulting amounts, so the page publishes them here and the panel subscribes.
export type CheckoutAdjustments = { discountPaise: number; creditPaise: number; couponCode: string | null };

const NONE: CheckoutAdjustments = { discountPaise: 0, creditPaise: 0, couponCode: null };
let current: CheckoutAdjustments = NONE;
const listeners = new Set<() => void>();

export function setCheckoutAdjustments(next: CheckoutAdjustments | null) {
  const value = next ?? NONE;
  if (
    value.discountPaise === current.discountPaise &&
    value.creditPaise === current.creditPaise &&
    value.couponCode === current.couponCode
  ) {
    return;
  }
  current = value;
  listeners.forEach((listener) => listener());
}

export function useCheckoutAdjustments(): CheckoutAdjustments {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => NONE
  );
}
