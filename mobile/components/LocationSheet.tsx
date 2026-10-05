import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import MapView, { Marker, type MapPressEvent, type MarkerDragStartEndEvent } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BRAND } from "../theme";
import { useDeliveryLocation } from "../lib/location-store";
import { placeLabel } from "../lib/place";
import { reverseGeocode } from "../lib/places-api";
import { usePlaceSearch, SEARCH_UNAVAILABLE_MESSAGE } from "../lib/use-place-search";
import type { PlaceDetails } from "../lib/places-parse";
import { SearchInput, SuggestionRows } from "./AddressSearchBox";

const MUMBAI = { lat: 19.076, lng: 72.8777 };
const GPS_TIMEOUT_MS = 15000;

type Point = { lat: number; lng: number };

function coordsLabel(p: Point): string {
  return placeLabel({ lat: p.lat, lng: p.lng });
}

function gpsMessage(code: "denied" | "unavailable" | "timeout" | "other"): string {
  if (code === "denied") {
    return "Location access was denied. Allow it in your phone's settings, or search for your address or move the pin on the map instead.";
  }
  if (code === "unavailable") {
    return "Your location is not available right now. Search for your address or move the pin on the map instead.";
  }
  if (code === "timeout") {
    return "Finding your location took too long. Try again, or search for your address.";
  }
  return "Your location could not be found. Search for your address or move the pin on the map instead.";
}

// A native map failure must leave search and GPS usable.
class MapBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Location picker map failed", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type Props = { visible: boolean; onClose: () => void };

export function LocationSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { location, setLocation } = useDeliveryLocation();

  const [pin, setPin] = useState<Point | null>(null);
  const [pinLabel, setPinLabel] = useState("");
  const [dirty, setDirty] = useState(false); // pin moved by hand, needs Confirm
  const [reversing, setReversing] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);
  const reverseSeq = useRef(0);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Drop any unconfirmed pin and invalidate in-flight lookups so reopening starts clean.
  const resetState = useCallback(() => {
    reverseSeq.current += 1;
    setPin(null);
    setPinLabel("");
    setDirty(false);
    setReversing(false);
    setGpsBusy(false);
    setMessage(null);
  }, []);

  const handleClose = useCallback(() => {
    visibleRef.current = false;
    resetState();
    onClose();
  }, [resetState, onClose]);

  const applyAndClose = useCallback(
    (point: Point, label: string) => {
      setLocation({ lat: point.lat, lng: point.lng, label });
      handleClose();
    },
    [setLocation, handleClose]
  );

  const search = usePlaceSearch(
    useCallback(
      (place: PlaceDetails) => {
        const label = placeLabel(place) || coordsLabel(place);
        applyAndClose({ lat: place.lat, lng: place.lng }, label);
      },
      [applyAndClose]
    )
  );
  const { setQuery } = search;

  // Start from the saved location each time the sheet opens.
  useEffect(() => {
    if (!visible) {
      resetState();
      return;
    }
    reverseSeq.current += 1;
    setPin(location ? { lat: location.lat, lng: location.lng } : null);
    setPinLabel(location?.label ?? "");
    setDirty(false);
    setReversing(false);
    setGpsBusy(false);
    setMessage(null);
    setQuery("");
    // Only when opened: later changes to the saved location must not reset a pin being moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const movePin = useCallback(async (point: Point) => {
    const mine = ++reverseSeq.current;
    setPin(point);
    setPinLabel(coordsLabel(point));
    setDirty(true);
    setMessage(null);
    setReversing(true);
    try {
      const result = await reverseGeocode(point.lat, point.lng);
      if (mine !== reverseSeq.current) return;
      const label = placeLabel({ formattedAddress: result.formattedAddress, components: result.components });
      if (label) setPinLabel(label);
    } catch {
      // Reverse geocoding is Android-native only; the coordinates label stays.
    } finally {
      if (mine === reverseSeq.current) setReversing(false);
    }
  }, []);

  const useCurrentLocation = useCallback(async () => {
    const startSeq = reverseSeq.current;
    // A later pin move, pick or close makes this result stale.
    const stale = () => !visibleRef.current || reverseSeq.current !== startSeq;
    setMessage(null);
    setGpsBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (stale()) return;
      if (perm.status !== "granted") {
        setMessage(gpsMessage("denied"));
        return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("GPS_TIMEOUT")), GPS_TIMEOUT_MS);
      });
      let fix: Location.LocationObject;
      try {
        fix = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), timeout]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (stale()) return;
      const point = { lat: fix.coords.latitude, lng: fix.coords.longitude };
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
        setMessage(gpsMessage("other"));
        return;
      }
      const mine = ++reverseSeq.current;
      setPin(point);
      mapRef.current?.animateToRegion(
        { latitude: point.lat, longitude: point.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        300
      );
      let label = coordsLabel(point);
      try {
        const result = await reverseGeocode(point.lat, point.lng);
        label = placeLabel({ formattedAddress: result.formattedAddress, components: result.components }) || label;
      } catch {
        // Keep the coordinates label.
      }
      if (!visibleRef.current || mine !== reverseSeq.current) return;
      applyAndClose(point, label);
    } catch (err) {
      if (stale()) return;
      if (err instanceof Error && err.message === "GPS_TIMEOUT") {
        setMessage(gpsMessage("timeout"));
        return;
      }
      const code = String((err as { code?: unknown } | null)?.code ?? "");
      setMessage(gpsMessage(/PERMISSION/i.test(code) ? "denied" : "unavailable"));
    } finally {
      setGpsBusy(false);
    }
  }, [applyAndClose]);

  // Never start from an unconfirmed pin: the map opens on the saved location (or Mumbai).
  const start = location ?? MUMBAI;
  const hasOverlay = !search.unavailable && (search.suggestions.length > 0 || !!search.error || search.noResults);

  const mapFallback = (
    <View style={styles.mapFallback}>
      <Text style={styles.note}>The map is unavailable right now. Search for your address or use your current location.</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={[styles.screen, { paddingTop: insets.top }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Delivery location</Text>
          <Pressable onPress={handleClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={BRAND.colors.ink} />
          </Pressable>
        </View>

        <View style={styles.controls}>
          <SearchInput search={search} placeholder="Search for your address" />
          {search.unavailable && <Text style={styles.note}>{SEARCH_UNAVAILABLE_MESSAGE}</Text>}
          <Pressable
            style={[styles.gpsButton, gpsBusy && styles.disabled]}
            onPress={() => void useCurrentLocation()}
            disabled={gpsBusy}
            accessibilityRole="button"
          >
            {gpsBusy ? (
              <ActivityIndicator size="small" color={BRAND.colors.primary} />
            ) : (
              <Ionicons name="navigate" size={16} color={BRAND.colors.primary} />
            )}
            <Text style={styles.gpsText}>Use my current location</Text>
          </Pressable>
          {message && <Text style={styles.error}>{message}</Text>}
        </View>

        <View style={styles.mapArea}>
          <MapBoundary fallback={mapFallback}>
            <MapView
              ref={mapRef}
              style={StyleSheet.absoluteFill}
              initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
              onPress={(e: MapPressEvent) => {
                const c = e.nativeEvent.coordinate;
                void movePin({ lat: c.latitude, lng: c.longitude });
              }}
              toolbarEnabled={false}
              accessibilityLabel="Map. Tap or drag the pin to set your delivery location"
            >
              {pin && (
                <Marker
                  coordinate={{ latitude: pin.lat, longitude: pin.lng }}
                  draggable
                  onDragEnd={(e: MarkerDragStartEndEvent) => {
                    const c = e.nativeEvent.coordinate;
                    void movePin({ lat: c.latitude, lng: c.longitude });
                  }}
                />
              )}
            </MapView>
          </MapBoundary>
          {hasOverlay && (
            <ScrollView style={styles.overlay} keyboardShouldPersistTaps="handled">
              <SuggestionRows search={search} />
            </ScrollView>
          )}
        </View>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={styles.footerLabel} numberOfLines={2}>
            {pin ? pinLabel : "Search, use your location, or tap the map to place the pin."}
          </Text>
          {dirty && (
            <Pressable
              style={[styles.confirm, (!pin || reversing) && styles.disabled]}
              onPress={() => pin && applyAndClose(pin, pinLabel || coordsLabel(pin))}
              disabled={!pin || reversing}
              accessibilityRole="button"
            >
              <Text style={styles.confirmText}>{reversing ? "Finding address…" : "Confirm location"}</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BRAND.colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontFamily: BRAND.fonts.heading, fontSize: 20, color: BRAND.colors.ink },
  controls: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  gpsButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  gpsText: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 14, color: BRAND.colors.primaryTextSafe },
  disabled: { opacity: 0.5 },
  mapArea: { flex: 1, backgroundColor: BRAND.colors.primaryTint },
  mapFallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    maxHeight: "100%",
    backgroundColor: BRAND.colors.surface,
    paddingHorizontal: 16,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    backgroundColor: BRAND.colors.background,
    borderTopWidth: 1,
    borderTopColor: BRAND.colors.inkMuted + "22",
  },
  footerLabel: { fontFamily: BRAND.fonts.bodyMedium, fontSize: 14, color: BRAND.colors.ink },
  confirm: {
    backgroundColor: BRAND.colors.accentTextSafe,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.surface },
  note: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted },
  error: { fontFamily: BRAND.fonts.body, fontSize: 12, color: "#dc2626" },
});
