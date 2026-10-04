// Pure helpers for Google place / geocoder results. No imports so node's test
// runner can load this file directly.

export type AddressComponent = {
  long_name?: string;
  longText?: string;
  short_name?: string;
  shortText?: string;
  types: string[];
};

export type ParsedAddress = {
  line1: string;
  city: string;
  state: string;
  pincode: string;
};

export type LatLng = { lat: number; lng: number };

// Geocoder results use long_name/short_name; Places (New) uses longText/shortText.
function longOf(c: AddressComponent): string {
  return (c.long_name ?? c.longText ?? "").trim();
}

function find(components: AddressComponent[], type: string): string {
  const hit = components.find((c) => c.types.includes(type) && longOf(c) !== "");
  return hit ? longOf(hit) : "";
}

function firstOf(components: AddressComponent[], types: string[]): string {
  for (const type of types) {
    const value = find(components, type);
    if (value) return value;
  }
  return "";
}

export function parseAddressComponents(
  components: AddressComponent[] | null | undefined
): ParsedAddress {
  const list = Array.isArray(components) ? components : [];
  const streetNumber = find(list, "street_number");
  const route = find(list, "route");
  const premise = firstOf(list, ["premise", "subpremise"]);
  const subpremise = find(list, "subpremise");
  const neighborhood = firstOf(list, [
    "sublocality_level_2",
    "sublocality_level_1",
    "sublocality",
    "neighborhood",
  ]);

  const street = [streetNumber, route].filter(Boolean).join(" ");
  const parts: string[] = [];
  if (subpremise && subpremise !== premise) parts.push(subpremise);
  if (premise) parts.push(premise);
  if (street) parts.push(street);
  // Indian addresses are often only a locality, so fall back to it for line 1.
  if (parts.length === 0 && neighborhood) parts.push(neighborhood);
  else if (street === "" && premise && neighborhood) parts.push(neighborhood);

  // India: city is usually locality, sometimes only a district; sublocality is not a city.
  const city = firstOf(list, [
    "locality",
    "postal_town",
    "administrative_area_level_3",
    "administrative_area_level_2",
  ]);

  return {
    line1: parts.join(", "),
    city,
    state: find(list, "administrative_area_level_1"),
    pincode: find(list, "postal_code"),
  };
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

// Short label for the header: place name, else first part of the formatted
// address, else the parsed locality, else the coordinates.
export function placeLabel(place: {
  name?: string | null;
  displayName?: string | null;
  formattedAddress?: string | null;
  formatted_address?: string | null;
  lat?: number;
  lng?: number;
  components?: AddressComponent[] | null;
} | null | undefined): string {
  if (!place) return "";
  const name = (place.displayName ?? place.name ?? "").trim();
  const formatted = (place.formattedAddress ?? place.formatted_address ?? "").trim();
  const parsed = parseAddressComponents(place.components);
  if (name) {
    const area = parsed.city || parsed.state;
    return area && !name.includes(area) ? `${name}, ${area}` : name;
  }
  if (formatted) {
    return formatted.split(",").slice(0, 2).map((p) => p.trim()).filter(Boolean).join(", ");
  }
  const area = [parsed.line1, parsed.city].filter(Boolean).join(", ");
  if (area) return area;
  if (typeof place.lat === "number" && typeof place.lng === "number" && isValidLatLng(place.lat, place.lng)) {
    return `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`;
  }
  return "";
}

// Checkout form shape (same keys as DeliveryDetails in lib/address-store.tsx,
// declared here so this file stays import-free). line2 is always blank: a
// geocoder cannot know a flat number or landmark. A missing part stays "".
export type AddressFormFields = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
};

export function toAddressFormFields(
  components: AddressComponent[] | null | undefined,
  fallbackLine1?: string | null
): AddressFormFields {
  const parsed = parseAddressComponents(components);
  return {
    line1: parsed.line1 || (fallbackLine1 ?? "").trim(),
    line2: "",
    city: parsed.city,
    state: parsed.state,
    pincode: parsed.pincode,
  };
}
