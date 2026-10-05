// Pure request builders and response parsers for Google Places API (New) and the
// Geocoding REST API. Only a type import (erased), so node's test runner can load this file.
import type { AddressComponent } from "./place";

export type PlacesErrorKind = "unavailable" | "network" | "denied" | "no_results" | "bad_response";

export type PlaceSuggestion = { placeId: string; text: string; secondaryText: string };

export type PlaceDetails = {
  lat: number;
  lng: number;
  displayName: string;
  formattedAddress: string;
  components: AddressComponent[];
};

export type ReverseResult = { formattedAddress: string; components: AddressComponent[] };

export type ParseResult<T> = { ok: true; value: T } | { ok: false; kind: PlacesErrorKind };

export const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
export const AUTOCOMPLETE_FIELD_MASK =
  "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat";
export const DETAILS_FIELD_MASK = "displayName,formattedAddress,location,addressComponents";

export function buildAutocompleteBody(input: string, sessionToken: string) {
  return { input, sessionToken, includedRegionCodes: ["in"] };
}

export function buildPlaceDetailsUrl(placeId: string): string {
  return `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
}

// The key is appended by the caller so this pure function never sees it.
export function buildReverseGeocodeUrl(lat: number, lng: number): string {
  return `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${lat},${lng}`)}`;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function toComponents(v: unknown): AddressComponent[] {
  if (!Array.isArray(v)) return [];
  const out: AddressComponent[] = [];
  for (const raw of v) {
    const c = rec(raw);
    if (!c || !Array.isArray(c.types)) continue;
    const comp: AddressComponent = { types: c.types.filter((t): t is string => typeof t === "string") };
    if (typeof c.long_name === "string") comp.long_name = c.long_name;
    if (typeof c.longText === "string") comp.longText = c.longText;
    if (typeof c.short_name === "string") comp.short_name = c.short_name;
    if (typeof c.shortText === "string") comp.shortText = c.shortText;
    out.push(comp);
  }
  return out;
}

export function parseAutocomplete(json: unknown): ParseResult<PlaceSuggestion[]> {
  const root = rec(json);
  if (!root) return { ok: false, kind: "bad_response" };
  // An empty result is `{}` with no suggestions key.
  if (root.suggestions === undefined) return { ok: true, value: [] };
  if (!Array.isArray(root.suggestions)) return { ok: false, kind: "bad_response" };
  const value: PlaceSuggestion[] = [];
  for (const item of root.suggestions) {
    const pred = rec(rec(item)?.placePrediction);
    if (!pred) continue; // queryPrediction entries are ignored
    const placeId = str(pred.placeId);
    const structured = rec(pred.structuredFormat);
    const main = str(rec(structured?.mainText)?.text);
    const full = str(rec(pred.text)?.text);
    const text = main || full;
    if (!placeId || !text) continue;
    value.push({ placeId, text, secondaryText: str(rec(structured?.secondaryText)?.text) });
  }
  return { ok: true, value };
}

export function parsePlaceDetails(json: unknown): ParseResult<PlaceDetails> {
  const root = rec(json);
  const loc = rec(root?.location);
  if (!root || !loc) return { ok: false, kind: "bad_response" };
  const lat = loc.latitude;
  const lng = loc.longitude;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, kind: "bad_response" };
  }
  return {
    ok: true,
    value: {
      lat,
      lng,
      displayName: str(rec(root.displayName)?.text),
      formattedAddress: str(root.formattedAddress),
      components: toComponents(root.addressComponents),
    },
  };
}

export function parseReverseGeocode(json: unknown): ParseResult<ReverseResult> {
  const root = rec(json);
  if (!root) return { ok: false, kind: "bad_response" };
  const status = str(root.status);
  if (status === "ZERO_RESULTS") return { ok: false, kind: "no_results" };
  if (status === "REQUEST_DENIED" || status === "OVER_QUERY_LIMIT" || status === "OVER_DAILY_LIMIT") {
    return { ok: false, kind: "denied" };
  }
  if (status !== "OK") return { ok: false, kind: "bad_response" };
  const first = Array.isArray(root.results) ? rec(root.results[0]) : null;
  if (!first) return { ok: false, kind: "no_results" };
  return {
    ok: true,
    value: { formattedAddress: str(first.formatted_address), components: toComponents(first.address_components) },
  };
}

export function normalizeCertSha1(raw: string): string {
  return raw.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}
