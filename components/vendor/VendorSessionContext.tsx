"use client";

import { createContext, useContext } from "react";

export type VendorSessionValue = {
  loading: boolean;
  storeId: string | null;
  isOpen: boolean | null;
  refreshIsOpen: () => Promise<void>;
};

export const VendorSessionContext = createContext<VendorSessionValue | null>(null);

export function useVendorSessionContext(): VendorSessionValue {
  const ctx = useContext(VendorSessionContext);
  if (!ctx) {
    throw new Error("useVendorSessionContext must be used within VendorShell");
  }
  return ctx;
}
