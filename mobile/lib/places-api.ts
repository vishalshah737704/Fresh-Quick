import Constants from "expo-constants";
import {
  AUTOCOMPLETE_FIELD_MASK,
  AUTOCOMPLETE_URL,
  DETAILS_FIELD_MASK,
  buildAutocompleteBody,
  buildPlaceDetailsUrl,
  buildReverseGeocodeUrl,
  normalizeCertSha1,
  parseAutocomplete,
  parsePlaceDetails,
  parseReverseGeocode,
  type ParseResult,
  type PlaceDetails,
  type PlacesErrorKind,
  type PlaceSuggestion,
  type ReverseResult,
} from "./places-parse";

// Calls Google directly with the Android key (restricted to package + SHA-1). This only works in
// the native Android build; Expo Go is rejected by Google, which surfaces as a "denied" error and
// the UI falls back to manual entry. The key is never put in an error message or log.

const ANDROID_PACKAGE = "com.freshquick.app";
const TIMEOUT_MS = 8000;

const FRIENDLY: Record<PlacesErrorKind, string> = {
  unavailable: "Address search is not available in this build.",
  network: "Could not reach the address search. Check your connection and try again.",
  denied: "Address search is not available in this build.",
  no_results: "No matching address found.",
  bad_response: "Address search returned an unexpected answer. Try again.",
};

export class PlacesError extends Error {
  kind: PlacesErrorKind;
  constructor(kind: PlacesErrorKind) {
    super(FRIENDLY[kind]);
    this.kind = kind;
  }
}

type PlacesConfig = { key: string; cert: string };

function config(): PlacesConfig | null {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const key = typeof extra?.googleMapsAndroidKey === "string" ? extra.googleMapsAndroidKey : "";
  const cert =
    typeof extra?.googleMapsAndroidCertSha1 === "string" ? normalizeCertSha1(extra.googleMapsAndroidCertSha1) : "";
  return key && cert ? { key, cert } : null;
}

export function isPlacesAvailable(): boolean {
  return config() !== null;
}

async function request(url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    if (signal?.aborted) controller.abort();
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.status === 401 || res.status === 403) throw new PlacesError("denied");
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      throw new PlacesError(res.ok ? "bad_response" : "network");
    }
    if (!res.ok) throw new PlacesError(res.status === 400 || res.status === 404 ? "bad_response" : "network");
    return json;
  } catch (err) {
    if (err instanceof PlacesError) throw err;
    // A caller abort (stale search) is rethrown as is so the UI can ignore it.
    if (signal?.aborted) throw err;
    throw new PlacesError("network");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

function unwrap<T>(result: ParseResult<T>): T {
  if (!result.ok) throw new PlacesError(result.kind);
  return result.value;
}

function headers(cfg: PlacesConfig, fieldMask?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": cfg.key,
    "X-Android-Package": ANDROID_PACKAGE,
    "X-Android-Cert": cfg.cert,
  };
  if (fieldMask) h["X-Goog-FieldMask"] = fieldMask;
  return h;
}

export async function autocomplete(
  input: string,
  sessionToken: string,
  signal?: AbortSignal
): Promise<PlaceSuggestion[]> {
  const cfg = config();
  if (!cfg) throw new PlacesError("unavailable");
  const json = await request(
    AUTOCOMPLETE_URL,
    {
      method: "POST",
      headers: headers(cfg, AUTOCOMPLETE_FIELD_MASK),
      body: JSON.stringify(buildAutocompleteBody(input, sessionToken)),
    },
    signal
  );
  return unwrap(parseAutocomplete(json));
}

export async function getPlaceDetails(
  placeId: string,
  sessionToken: string,
  signal?: AbortSignal
): Promise<PlaceDetails> {
  const cfg = config();
  if (!cfg) throw new PlacesError("unavailable");
  const url = `${buildPlaceDetailsUrl(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}`;
  const json = await request(url, { method: "GET", headers: headers(cfg, DETAILS_FIELD_MASK) }, signal);
  return unwrap(parsePlaceDetails(json));
}

export async function reverseGeocode(lat: number, lng: number, signal?: AbortSignal): Promise<ReverseResult> {
  const cfg = config();
  if (!cfg) throw new PlacesError("unavailable");
  // Geocoding REST takes the key as a query parameter; the Android restriction headers ride along.
  const url = `${buildReverseGeocodeUrl(lat, lng)}&key=${encodeURIComponent(cfg.key)}`;
  const h = headers(cfg);
  delete h["Content-Type"];
  const json = await request(url, { method: "GET", headers: h }, signal);
  return unwrap(parseReverseGeocode(json));
}
