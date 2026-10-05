// Pure decision logic for syncing the cached delivery location with the account's saved one.
export type SavedLocation = { lat: number; lng: number; label: string };

export type Reconciliation = { use: SavedLocation | null; pushToServer: boolean };

export function sameLocation(a: SavedLocation | null, b: SavedLocation | null): boolean {
  if (!a || !b) return a === b;
  return a.lat === b.lat && a.lng === b.lng && a.label === b.label;
}

// A cache holding a local change not yet synced (dirty) wins and is pushed when the server differs.
// A clean cache is only a copy of the server, so the server wins (including an empty server, which
// clears the cache). An empty cache takes the server value.
export function reconcile(cache: SavedLocation | null, cacheDirty: boolean, server: SavedLocation | null): Reconciliation {
  if (!cache) return { use: server, pushToServer: false };
  if (cacheDirty) return { use: cache, pushToServer: !sameLocation(cache, server) };
  return { use: server, pushToServer: false };
}
