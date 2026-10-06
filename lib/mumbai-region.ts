// Import-free on purpose (node's test runner cannot resolve value imports between lib files).
// The whole app serves Mumbai (stores and customers are geocoded there), so a delivery partner
// device reporting a location elsewhere (a developer testing from another country) must not
// move the partner off the map.
const MUMBAI_BOUNDS = { minLat: 18.85, maxLat: 19.45, minLng: 72.75, maxLng: 73.15 };

// Dadar, used when a partner has no Mumbai location stored yet so assignment can still find them.
export const DEFAULT_PARTNER_LOCATION = { lat: 19.0178, lng: 72.8478 };

export function isInMumbaiRegion(lat: number, lng: number): boolean {
  return (
    lat >= MUMBAI_BOUNDS.minLat &&
    lat <= MUMBAI_BOUNDS.maxLat &&
    lng >= MUMBAI_BOUNDS.minLng &&
    lng <= MUMBAI_BOUNDS.maxLng
  );
}

// Decides what a ping should store: the reported point if it is inside Mumbai, else the
// partner's existing Mumbai point, else the default (so a new partner is still assignable).
export function resolvePartnerLocation(
  reported: { lat: number; lng: number },
  stored: { lat: number | null; lng: number | null }
): { lat: number; lng: number } {
  if (isInMumbaiRegion(reported.lat, reported.lng)) return reported;
  if (
    typeof stored.lat === "number" &&
    typeof stored.lng === "number" &&
    isInMumbaiRegion(stored.lat, stored.lng)
  ) {
    return { lat: stored.lat, lng: stored.lng };
  }
  return DEFAULT_PARTNER_LOCATION;
}
