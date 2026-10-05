import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { apiFetch } from "./api";
import { supabase } from "./supabase";
import { reconcile, sameLocation, type SavedLocation } from "./location-reconcile";

// The customer's delivery location: cached in AsyncStorage (so the Home bar is instant) and synced
// with the account through /api/customer/location. A local change not yet saved on the server (dirty)
// wins and is pushed; otherwise the server copy wins. If the server is unreachable the local choice
// is kept. The cache remembers which account owns it so a different
// account signing in on the same phone never sees it.

export type DeliveryLocation = SavedLocation;

type LocationContextValue = {
  location: DeliveryLocation | null;
  ready: boolean;
  setLocation: (next: DeliveryLocation) => void;
  clearLocation: () => void;
};

const LocationContext = createContext<LocationContextValue | null>(null);

const STORAGE_KEY = "freshquick.location.v1";

const MAX_LABEL_LENGTH = 200;

// dirty: a local change the server has not confirmed yet.
type Cached = { userId: string | null; location: DeliveryLocation; dirty: boolean };

function isLocation(v: unknown): v is DeliveryLocation {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.lat === "number" &&
    typeof o.lng === "number" &&
    Number.isFinite(o.lat) &&
    Number.isFinite(o.lng) &&
    typeof o.label === "string" &&
    o.label.trim() !== ""
  );
}

async function readCache(): Promise<Cached | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId?: unknown; location?: unknown; dirty?: unknown };
    if (!isLocation(parsed.location)) return null;
    return {
      userId: typeof parsed.userId === "string" ? parsed.userId : null,
      location: parsed.location,
      // Records written before this field existed are treated as unsynced so nothing is lost.
      dirty: typeof parsed.dirty === "boolean" ? parsed.dirty : true,
    };
  } catch {
    return null;
  }
}

function writeCache(cached: Cached | null) {
  const op = cached ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached)) : AsyncStorage.removeItem(STORAGE_KEY);
  op.catch(() => {
    // Best-effort; the in-memory choice still works this session.
  });
}

async function fetchServerLocation(): Promise<DeliveryLocation | null | undefined> {
  try {
    const res = await apiFetch<{ location: unknown }>("/api/customer/location");
    return isLocation(res.location) ? res.location : null;
  } catch {
    return undefined; // unreachable or not a customer: keep whatever is local
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocationState] = useState<DeliveryLocation | null>(null);
  const [ready, setReady] = useState(false);
  const cacheRef = useRef<Cached | null>(null);
  const userIdRef = useRef<string | null>(null);
  const loaded = useRef<Promise<void> | null>(null);
  // Bumped on every local change so a slower in-flight server sync never overwrites a newer choice.
  const version = useRef(0);
  // Server writes run one after another so an older write never lands after a newer one.
  const writeChain = useRef<Promise<void>>(Promise.resolve());
  const writeSeq = useRef(0);

  const applyLocal = useCallback((next: Cached | null) => {
    cacheRef.current = next;
    setLocationState(next ? next.location : null);
    writeCache(next);
  }, []);

  const enqueueServerWrite = useCallback(
    (kind: "put" | "delete", next: DeliveryLocation | null) => {
      const mine = ++writeSeq.current;
      writeChain.current = writeChain.current.then(async () => {
        try {
          if (kind === "put") await apiFetch("/api/customer/location", { method: "PUT", body: next });
          else await apiFetch("/api/customer/location", { method: "DELETE" });
        } catch {
          return; // Local choice stays (dirty); the next sign-in or change pushes it again.
        }
        const cache = cacheRef.current;
        if (kind === "put" && mine === writeSeq.current && cache && cache.dirty && sameLocation(cache.location, next)) {
          applyLocal({ ...cache, dirty: false });
        }
      });
    },
    [applyLocal]
  );

  const syncWithServer = useCallback(
    async (userId: string) => {
      await loaded.current;
      const startVersion = version.current;
      const server = await fetchServerLocation();
      if (server === undefined || version.current !== startVersion || userIdRef.current !== userId) return;
      const cache = cacheRef.current;
      const { use, pushToServer } = reconcile(cache ? cache.location : null, cache ? cache.dirty : false, server);
      applyLocal(use ? { userId, location: use, dirty: pushToServer } : null);
      if (pushToServer && use) enqueueServerWrite("put", use);
    },
    [applyLocal, enqueueServerWrite]
  );

  useEffect(() => {
    loaded.current = (async () => {
      const cached = await readCache();
      if (cached) {
        cacheRef.current = cached;
        setLocationState(cached.location);
      }
      setReady(true);
    })();

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user?.id ?? null;
      userIdRef.current = user;
      if (event === "SIGNED_OUT" || !user) {
        if (event === "SIGNED_OUT") {
          version.current += 1;
          applyLocal(null);
        }
        return;
      }
      // Only a real sign-in or the restored session syncs; token refreshes and the like do not.
      if (event !== "SIGNED_IN" && event !== "INITIAL_SESSION") return;
      // Defer: supabase-js forbids awaiting other auth calls inside this callback.
      setTimeout(() => {
        loaded.current?.then(() => {
          const cache = cacheRef.current;
          if (cache && cache.userId && cache.userId !== user) {
            version.current += 1;
            applyLocal(null);
          }
          void syncWithServer(user);
        });
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [applyLocal, syncWithServer]);

  const setLocation = useCallback(
    (input: DeliveryLocation) => {
      const label = input.label.trim().slice(0, MAX_LABEL_LENGTH).trim();
      if (!label) return;
      const next = { lat: input.lat, lng: input.lng, label };
      version.current += 1;
      applyLocal({ userId: userIdRef.current, location: next, dirty: true });
      if (userIdRef.current) enqueueServerWrite("put", next);
    },
    [applyLocal, enqueueServerWrite]
  );

  const clearLocation = useCallback(() => {
    version.current += 1;
    applyLocal(null);
    if (userIdRef.current) enqueueServerWrite("delete", null);
  }, [applyLocal, enqueueServerWrite]);

  const value = useMemo(
    () => ({ location, ready, setLocation, clearLocation }),
    [location, ready, setLocation, clearLocation]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useDeliveryLocation(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useDeliveryLocation must be used within LocationProvider");
  return ctx;
}
