// Pure map math. No imports so node's test runner can load this file directly.

export type Point = { lat: number; lng: number };
export type Bounds = { south: number; west: number; north: number; east: number };

export function interpolateLatLng(from: Point, to: Point, t: number): Point {
  const k = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
  return {
    lat: from.lat + (to.lat - from.lat) * k,
    lng: from.lng + (to.lng - from.lng) * k,
  };
}

// Returns null for no points. Ignores non-finite points.
export function boundsOf(points: Point[]): Bounds | null {
  let bounds: Bounds | null = null;
  for (const p of points) {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
    if (!bounds) {
      bounds = { south: p.lat, west: p.lng, north: p.lat, east: p.lng };
    } else {
      bounds.south = Math.min(bounds.south, p.lat);
      bounds.north = Math.max(bounds.north, p.lat);
      bounds.west = Math.min(bounds.west, p.lng);
      bounds.east = Math.max(bounds.east, p.lng);
    }
  }
  return bounds;
}

export function formatDistanceKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return "";
  if (km < 1) return `${Math.round((km * 1000) / 10) * 10} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
