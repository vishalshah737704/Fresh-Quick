"use client";

import { createContext, useContext } from "react";

export type AdminSessionValue = {
  loading: boolean;
  adminId: string | null;
};

export const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function useAdminSessionContext(): AdminSessionValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error("useAdminSessionContext must be used within AdminShell");
  }
  return ctx;
}
