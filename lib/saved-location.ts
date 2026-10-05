export type SavedLocation = { lat: number; lng: number; label: string };

export type SavedLocationResult =
  | { ok: true; value: SavedLocation }
  | { ok: false; error: string };

export function parseSavedLocation(body: unknown): SavedLocationResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid location payload" };
  }
  const { lat, lng, label } = body as Record<string, unknown>;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { ok: false, error: "lat must be a number between -90 and 90" };
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { ok: false, error: "lng must be a number between -180 and 180" };
  }
  if (typeof label !== "string") {
    return { ok: false, error: "label must be a string" };
  }
  const trimmed = label.trim();
  if (trimmed.length < 1 || trimmed.length > 200) {
    return { ok: false, error: "label must be 1 to 200 characters" };
  }
  return { ok: true, value: { lat, lng, label: trimmed } };
}
