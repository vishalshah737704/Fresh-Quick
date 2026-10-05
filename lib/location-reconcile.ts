// Pure decision for a signed-in web customer's delivery location (import-free for node's test runner).
export type SavedLocation = { lat: number; lng: number; label: string };

export type WebReconciliation = { use: SavedLocation | null; pushToServer: SavedLocation | null };

// The account's saved location (e.g. the sign-up address) wins over the browser pin. Only when the
// server has none is the local pin pushed up. serverKnown=false (request failed) changes nothing.
export function reconcileWebLocation(
  local: SavedLocation | null,
  server: SavedLocation | null,
  serverKnown: boolean
): WebReconciliation {
  if (!serverKnown) return { use: null, pushToServer: null };
  if (server) return { use: server, pushToServer: null };
  return { use: null, pushToServer: local };
}
