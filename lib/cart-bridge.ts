// Tiny external store (no React) so UI mounted outside CartProvider (the root-layout Zippy widget)
// can read the provider's live value. Compatible with React's useSyncExternalStore.
export type Bridge<T> = {
  get: () => T | null;
  set: (value: T | null) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createBridge<T>(): Bridge<T> {
  let current: T | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (value) => {
      if (Object.is(value, current)) return;
      current = value;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
