// Pure nearest-first ordering. Import-free so node's test runner can load it; the distance
// function is passed in (haversineDistanceKm from ./geo).
export type HasPoint = { lat?: number | string | null; lng?: number | string | null };

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Returns a new array: items with coordinates nearest first, items without coordinates last
// (original order kept for ties and for the no-coordinate group).
export function sortNearestFirst<T extends HasPoint>(
  items: T[],
  origin: { lat: number; lng: number } | null,
  distanceKm: (lat1: number, lng1: number, lat2: number, lng2: number) => number
): T[] {
  if (!origin) return items.slice();
  const keyed = items.map((item, index) => {
    const lat = toNumber(item.lat);
    const lng = toNumber(item.lng);
    const distance = lat === null || lng === null ? Infinity : distanceKm(origin.lat, origin.lng, lat, lng);
    return { item, index, distance };
  });
  keyed.sort((a, b) => {
    if (a.distance === b.distance) return a.index - b.index;
    return a.distance - b.distance;
  });
  return keyed.map((k) => k.item);
}
