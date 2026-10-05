// Import-free on purpose (node's test runner cannot resolve value imports between lib files).
// Never log or return the key, the address, the coordinates or provider error text from here.
export type GeocodeAddress = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
};

export type GeocodeResult =
  | { kind: "found"; lat: number; lng: number }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export const GEOCODE_NOT_FOUND_MESSAGE =
  "We could not find that address. Check the details and try again.";
export const GEOCODE_UNAVAILABLE_MESSAGE =
  "Address lookup is unavailable right now. Try again later.";

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export function buildGeocodeQuery(a: GeocodeAddress): string {
  return [a.line1, a.line2, a.city, a.state, a.pincode, "India"]
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(", ");
}

// Short text for users.saved_label (max 200).
export function buildSavedLabel(a: GeocodeAddress): string {
  return `${a.line1.trim()}, ${a.city.trim()}`.slice(0, 200);
}

const PRECISE_TYPES = new Set([
  "street_address",
  "route",
  "premise",
  "subpremise",
  "establishment",
  "point_of_interest",
  "intersection",
  "neighborhood",
  "sublocality",
  "sublocality_level_1",
  "sublocality_level_2",
  "sublocality_level_3",
  "plus_code",
  "park",
  "shopping_mall",
  "transit_station",
]);

type Component ={ types?: unknown; short_name?: unknown };

export function parseGeocodeResponse(json: unknown): GeocodeResult {
  if (!json || typeof json !== "object") return { kind: "unavailable" };
  const body = json as { status?: unknown; results?: unknown };
  if (body.status === "ZERO_RESULTS") return { kind: "not_found" };
  if (body.status !== "OK") return { kind: "unavailable" };
  if (!Array.isArray(body.results) || body.results.length === 0) return { kind: "not_found" };
  const first = body.results[0] as {
    address_components?: unknown;
    types?: unknown;
    partial_match?: unknown;
    geometry?: { location?: { lat?: unknown; lng?: unknown }; location_type?: unknown };
  } | null;
  // Gibberish street names still geocode to the pincode/city centroid as an approximate,
  // partial or area-only result; accept only precise matches.
  const resultTypes: unknown[] = Array.isArray(first?.types) ? first.types : [];
  if (
    first?.partial_match === true ||
    first?.geometry?.location_type === "APPROXIMATE" ||
    !resultTypes.some((t) => typeof t === "string" && PRECISE_TYPES.has(t))
  ) {
    return { kind: "not_found" };
  }
  const components: Component[] = Array.isArray(first?.address_components)
    ? (first.address_components as Component[])
    : [];
  const inIndia = components.some(
    (c) => Array.isArray(c?.types) && c.types.includes("country") && c.short_name === "IN"
  );
  const lat = first?.geometry?.location?.lat;
  const lng = first?.geometry?.location?.lng;
  if (
    !inIndia ||
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return { kind: "not_found" };
  }
  return { kind: "found", lat, lng };
}

export type FetchLike = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

// Network, HTTP, missing-key and provider-status failures all collapse to "unavailable".
export async function geocodeWith(
  fetchImpl: FetchLike,
  apiKey: string | undefined,
  address: GeocodeAddress
): Promise<GeocodeResult> {
  if (!apiKey) return { kind: "unavailable" };
  try {
    const url =
      `${GEOCODE_URL}?address=${encodeURIComponent(buildGeocodeQuery(address))}` +
      `&components=country:IN&region=in&key=${encodeURIComponent(apiKey)}`;
    const res = await fetchImpl(url);
    if (!res.ok) return { kind: "unavailable" };
    return parseGeocodeResponse(await res.json());
  } catch {
    return { kind: "unavailable" };
  }
}
