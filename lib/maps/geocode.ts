import { loadGoogleMaps } from "@/lib/maps/loader";
import type { GeocoderAddressComponent, LatLngLiteral } from "@/lib/maps/types";

export type ReverseGeocodeResult = {
  formattedAddress: string;
  components: GeocoderAddressComponent[];
};

// First geocoder result for a point, or null when Maps or the lookup fails.
export async function reverseGeocodePoint(
  point: LatLngLiteral
): Promise<ReverseGeocodeResult | null> {
  try {
    const google = await loadGoogleMaps();
    const { Geocoder } = await google.maps.importLibrary("geocoding");
    const { results } = await new Geocoder().geocode({ location: point });
    const first = results[0];
    if (!first) return null;
    return {
      formattedAddress: first.formatted_address,
      components: first.address_components,
    };
  } catch {
    return null;
  }
}
