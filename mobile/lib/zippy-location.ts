import * as Location from "expo-location";

export type Point = { lat: number; lng: number };

// Only questions about distance prompt for location access, so a help question
// never triggers a permission dialog.
const NEARBY_PATTERN = /\b(near|nearby|nearest|closest|close to|around me|close by|distance|far)\b/i;

export function asksAboutNearby(question: string): boolean {
  return NEARBY_PATTERN.test(question);
}

// Foreground device location for one chat message, or null. Never stored or
// logged; the server uses it only to rank stores for that question. Any
// failure (denied, services off, timeout) returns null so chat still works.
export async function getChatLocation(question: string): Promise<Point | null> {
  try {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") {
      if (!asksAboutNearby(question)) return null;
      ({ status } = await Location.requestForegroundPermissionsAsync());
      if (status !== "granted") return null;
    }
    const last = await Location.getLastKnownPositionAsync();
    const position =
      last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    const { latitude, longitude } = position.coords;
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { lat: latitude, lng: longitude } : null;
  } catch {
    return null;
  }
}
