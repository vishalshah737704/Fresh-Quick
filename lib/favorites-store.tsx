"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "@/lib/auth";
import { customerFetch } from "@/lib/customer-api";
import { FAVORITES_PATH } from "@/lib/favorites-model";

type FavoritesValue = {
  ids: Set<string>;
  loaded: boolean;
  isFavorite: (storeId: string) => boolean;
  toggle: (storeId: string) => Promise<"login" | "ok" | "failed">;
};

const EMPTY_IDS: Set<string> = new Set();
const FavoritesContext = createContext<FavoritesValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { userId, loading } = useSession();
  // Results are tagged with the account that fetched them, so a sign-out or account
  // switch can never show the previous account's hearts (no reset-in-effect needed).
  const [state, setState] = useState<{ owner: string | null; ids: Set<string> }>({ owner: null, ids: new Set() });
  const ids = userId && state.owner === userId ? state.ids : EMPTY_IDS;
  const loaded = !loading && (!userId || state.owner === userId);
  const inFlightRef = useRef<Set<string>>(new Set());
  const idsRef = useRef(ids);
  useEffect(() => {
    idsRef.current = ids;
  }, [ids]);

  useEffect(() => {
    if (loading || !userId) return;
    let cancelled = false;
    customerFetch<{ storeIds: string[] }>(FAVORITES_PATH)
      .then((res) => {
        if (!cancelled) setState({ owner: userId, ids: new Set(res.storeIds) });
      })
      .catch(() => {
        if (!cancelled) setState({ owner: userId, ids: new Set() });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loading]);

  const toggle = useCallback(
    async (storeId: string): Promise<"login" | "ok" | "failed"> => {
      if (!userId) return "login";
      // A second tap while this store's request is pending is ignored, so taps cannot interleave.
      if (inFlightRef.current.has(storeId)) return "ok";
      inFlightRef.current.add(storeId);
      const wasFavorite = idsRef.current.has(storeId);
      const apply = (on: boolean, rollback: boolean) =>
        setState((prev) => {
          // A rollback must not touch state that now belongs to a different account.
          if (rollback && prev.owner !== userId) return prev;
          const next = new Set(prev.owner === userId ? prev.ids : []);
          if (on) next.add(storeId);
          else next.delete(storeId);
          return { owner: userId, ids: next };
        });
      apply(!wasFavorite, false);
      try {
        await customerFetch(`${FAVORITES_PATH}/${storeId}`, { method: wasFavorite ? "DELETE" : "PUT" });
        return "ok";
      } catch {
        apply(wasFavorite, true);
        return "failed";
      } finally {
        inFlightRef.current.delete(storeId);
      }
    },
    [userId]
  );

  return (
    <FavoritesContext.Provider value={{ ids, loaded, isFavorite: (id) => ids.has(id), toggle }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesValue {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("useFavorites must be used inside FavoritesProvider");
  return value;
}
