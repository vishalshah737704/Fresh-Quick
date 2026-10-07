import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { apiFetch } from "./api";
import { FAVORITES_PATH } from "./favorites-model";

type FavoritesValue = {
  ids: Set<string>;
  isFavorite: (storeId: string) => boolean;
  toggle: (storeId: string) => Promise<"ok" | "failed">;
};

const EMPTY_IDS: Set<string> = new Set();
const FavoritesContext = createContext<FavoritesValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  // Results are tagged with the account that fetched them, so a sign-out or account
  // switch can never show the previous account's hearts.
  const [state, setState] = useState<{ owner: string | null; ids: Set<string> }>({ owner: null, ids: new Set() });
  const ids = userId && state.owner === userId ? state.ids : EMPTY_IDS;
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    apiFetch<{ storeIds: string[] }>(FAVORITES_PATH)
      .then((res) => {
        if (!cancelled) setState({ owner: userId, ids: new Set(res.storeIds) });
      })
      .catch(() => {
        if (!cancelled) setState({ owner: userId, ids: new Set() });
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = useCallback(
    async (storeId: string): Promise<"ok" | "failed"> => {
      if (!userId) return "failed";
      const wasFavorite = idsRef.current.has(storeId);
      const apply = (on: boolean) =>
        setState((prev) => {
          const next = new Set(prev.owner === userId ? prev.ids : []);
          if (on) next.add(storeId);
          else next.delete(storeId);
          return { owner: userId, ids: next };
        });
      apply(!wasFavorite);
      try {
        await apiFetch(`${FAVORITES_PATH}/${storeId}`, { method: wasFavorite ? "DELETE" : "PUT" });
        return "ok";
      } catch {
        apply(wasFavorite);
        return "failed";
      }
    },
    [userId]
  );

  return (
    <FavoritesContext.Provider value={{ ids, isFavorite: (id) => ids.has(id), toggle }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesValue {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("useFavorites must be used inside FavoritesProvider");
  return value;
}
