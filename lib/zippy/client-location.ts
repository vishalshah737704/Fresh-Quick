// Must match LOCATION_STORAGE_KEY in lib/address-store.tsx (a test checks this).
export const LOCATION_STORAGE_KEY = "fresh-quick-delivery-location";

export function readStoredLocation(read: (key: string) => string | null): { lat: number; lng: number } | null {
  try {
    const raw = read(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { lat?: unknown; lng?: unknown };
    if (
      typeof parsed?.lat === "number" && Number.isFinite(parsed.lat) && parsed.lat >= -90 && parsed.lat <= 90 &&
      typeof parsed?.lng === "number" && Number.isFinite(parsed.lng) && parsed.lng >= -180 && parsed.lng <= 180
    ) {
      return { lat: parsed.lat, lng: parsed.lng };
    }
    return null;
  } catch {
    return null;
  }
}
