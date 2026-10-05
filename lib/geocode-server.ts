import "server-only";
import { geocodeWith, type GeocodeAddress, type GeocodeResult } from "./geocode-parse";

// Server-side Geocoding key (Geocoding API only). Never NEXT_PUBLIC, never logged or returned.
export function geocodeAddress(address: GeocodeAddress): Promise<GeocodeResult> {
  return geocodeWith(
    (url) => fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" }),
    process.env.GOOGLE_MAPS_SERVER_API_KEY,
    address
  );
}
