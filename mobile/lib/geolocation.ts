// Pure helpers for the address picker. No imports so node's test runner can
// load this file directly.

// GeolocationPositionError codes: 1 denied, 2 unavailable, 3 timeout.
export function geolocationErrorMessage(code: number | undefined): string {
  if (code === 1) {
    return "Location access was denied. Allow it in your browser settings, or search or drop a pin on the map instead.";
  }
  if (code === 2) {
    return "Your location is not available right now. Search for your address or drop a pin on the map instead.";
  }
  if (code === 3) {
    return "Finding your location took too long. Try again, or search for your address.";
  }
  return "Your location could not be found. Search for your address or drop a pin on the map instead.";
}

// Parses the manual lat/lng text fields. Returns null unless both are numbers
// inside the valid ranges (so "12abc" and "" are rejected, unlike parseFloat).
export function parseCoordinates(
  latText: string,
  lngText: string
): { lat: number; lng: number } | null {
  const latTrim = latText.trim();
  const lngTrim = lngText.trim();
  if (latTrim === "" || lngTrim === "") return null;
  const lat = Number(latTrim);
  const lng = Number(lngTrim);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function formatCoordinate(value: number): string {
  return String(Number(value.toFixed(6)));
}
