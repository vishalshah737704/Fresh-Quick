"use client";

import { createContext, useContext } from "react";

export type DeliverySessionValue = {
  loading: boolean;
  partnerId: string | null;
  isOnline: boolean;
  setIsOnline: (value: boolean) => void;
};

export const DeliverySessionContext = createContext<DeliverySessionValue | null>(null);

export function useDeliverySessionContext(): DeliverySessionValue {
  const ctx = useContext(DeliverySessionContext);
  if (!ctx) {
    throw new Error("useDeliverySessionContext must be used within DeliveryShell");
  }
  return ctx;
}
