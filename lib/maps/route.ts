// Pure helpers for the road route and ETA on the order tracking map. No imports
// so node's test runner can load this file directly.

export type RoutePoint = { lat: number; lng: number };

export type RouteResult = {
  path: RoutePoint[];
  durationSeconds: number;
  distanceMeters: number;
};

// Points from the Routes library are LatLng objects (lat()/lng() methods) or
// LatLngAltitude objects (numeric lat/lng properties); accept both.
function readPoint(raw: unknown): RoutePoint | null {
  if (typeof raw !== "object" || raw === null) return null;
  const item = raw as { lat?: unknown; lng?: unknown };
  try {
    const lat = typeof item.lat === "function" ? (item.lat as () => unknown)() : item.lat;
    const lng = typeof item.lng === "function" ? (item.lng as () => unknown)() : item.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

function nonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function parseRoute(raw: unknown): RouteResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const route = raw as { path?: unknown; durationMillis?: unknown; distanceMeters?: unknown };
  if (!Array.isArray(route.path)) return null;
  if (!nonNegative(route.durationMillis) || !nonNegative(route.distanceMeters)) return null;
  const path: RoutePoint[] = [];
  for (const item of route.path) {
    const point = readPoint(item);
    if (point) path.push(point);
  }
  if (path.length < 2) return null;
  return {
    path,
    durationSeconds: route.durationMillis / 1000,
    distanceMeters: route.distanceMeters,
  };
}

export type RouteRequestState = {
  origin: RoutePoint;
  destination: RoutePoint;
  // The last request made. failedAt (ms) is set when that request failed.
  last: { origin: RoutePoint; destination: RoutePoint; at: number; failedAt?: number } | null;
  inFlight: boolean;
  // False once the route is final (delivered): request once, then never again.
  repeat: boolean;
};

const MOVE_THRESHOLD_METERS = 150;
const REFRESH_AFTER_MS = 30_000;
const FAILURE_BACKOFF_MS = 60_000;

function metersBetween(a: RoutePoint, b: RoutePoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function shouldRequestRoute(state: RouteRequestState, now: number): boolean {
  if (state.inFlight) return false;
  const last = state.last;
  if (!last) return true;
  // A failed request is retried only after the back-off, whatever changed.
  if (last.failedAt !== undefined) return now - last.failedAt >= FAILURE_BACKOFF_MS;
  if (metersBetween(last.destination, state.destination) > 0) return true;
  if (!state.repeat) return false;
  return (
    metersBetween(last.origin, state.origin) > MOVE_THRESHOLD_METERS &&
    now - last.at >= REFRESH_AFTER_MS
  );
}

export function formatEta(seconds: number): string {
  if (!(seconds >= 60)) return "less than 1 min";
  const total = Math.round(seconds / 60);
  if (total < 60) return `${total} min`;
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function formatRouteDistance(meters: number): string {
  const rounded = Math.round(meters / 10) * 10;
  if (rounded < 1000) return `${rounded} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
