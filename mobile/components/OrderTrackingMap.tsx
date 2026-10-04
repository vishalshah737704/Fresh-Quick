import { Component, memo, useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { BRAND } from "../theme";
import { haversineDistanceKm } from "../lib/geo";
import { formatDistanceKm } from "../lib/geo-math";
import { fitKey, formatUpdatedAt, toTrackPoint, trackingView, type TrackPoint } from "../lib/tracking";

type PartnerLocation = {
  current_lat: number | null;
  current_lng: number | null;
  last_ping_at: string | null;
};

type Props = {
  status: string;
  store: TrackPoint | null;
  destination: TrackPoint | null;
  partnerLocation: PartnerLocation | null;
};

const EDGE_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

function coordinateText(point: TrackPoint | null): string | null {
  return point ? `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}` : null;
}

function Pin({ letter, color, size }: { letter: string; color: string; size: number }) {
  return (
    <View style={[styles.pin, { backgroundColor: color, width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.pinLetter}>{letter}</Text>
    </View>
  );
}

// Custom marker views are snapshotted; keep re-snapshotting on only briefly after
// mount (Android needs the first frames), then stop so pings do not redraw them.
function useBriefTracking() {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setTracking(false), 800);
    return () => clearTimeout(timer);
  }, []);
  return tracking;
}

const samePoint = (a: TrackPoint | null, b: TrackPoint | null) => a?.lat === b?.lat && a?.lng === b?.lng;

const MapBody = memo(function MapBody({ store, destination, partner, final }: {
  store: TrackPoint | null;
  destination: TrackPoint | null;
  partner: TrackPoint | null;
  final: boolean;
}) {
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const tracking = useBriefTracking();
  const view = { store, destination, partner, waiting: false, final };
  const key = fitKey(view);
  const latest = useRef(view);
  latest.current = view;

  // Refit only when the point set changes, not on every partner ping.
  useEffect(() => {
    if (!ready) return;
    const v = latest.current;
    const points = [v.store, v.destination, v.partner].filter((p): p is TrackPoint => p !== null);
    if (points.length === 0) return;
    if (points.length === 1) {
      mapRef.current?.animateToRegion(
        { latitude: points[0].lat, longitude: points[0].lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        0
      );
    } else {
      mapRef.current?.fitToCoordinates(
        points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
        { edgePadding: EDGE_PADDING, animated: false }
      );
    }
  }, [key, ready]);

  const first = store ?? destination ?? partner;
  if (!first) return null;

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={{ latitude: first.lat, longitude: first.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      onMapReady={() => setReady(true)}
      toolbarEnabled={false}
      accessibilityLabel="Map showing the store, your delivery address and the delivery partner"
    >
      {store && destination && (
        <Polyline
          coordinates={[
            { latitude: store.lat, longitude: store.lng },
            { latitude: destination.lat, longitude: destination.lng },
          ]}
          strokeColor={BRAND.colors.ink + "B3"}
          strokeWidth={3}
          lineDashPattern={[8, 8]}
        />
      )}
      {store && (
        <Marker coordinate={{ latitude: store.lat, longitude: store.lng }} title="Store" tracksViewChanges={tracking}>
          <Pin letter="S" color={BRAND.colors.primaryTextSafe} size={26} />
        </Marker>
      )}
      {destination && (
        <Marker
          coordinate={{ latitude: destination.lat, longitude: destination.lng }}
          title="Delivery address"
          tracksViewChanges={tracking}
        >
          <Pin letter="H" color={BRAND.colors.accentTextSafe} size={26} />
        </Marker>
      )}
      {partner && (
        <Marker
          coordinate={{ latitude: partner.lat, longitude: partner.lng }}
          title="Delivery partner"
          tracksViewChanges={tracking}
          zIndex={3}
        >
          <Pin letter="D" color={BRAND.colors.ink} size={30} />
        </Marker>
      )}
    </MapView>
  );
},
(prev, next) =>
  prev.final === next.final &&
  samePoint(prev.store, next.store) &&
  samePoint(prev.destination, next.destination) &&
  samePoint(prev.partner, next.partner)
);

// A native map failure must never take the order screen down.
class MapBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("Order tracking map failed", error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function OrderTrackingMap({ status, store, destination, partnerLocation }: Props) {
  const partnerPoint = toTrackPoint(partnerLocation?.current_lat, partnerLocation?.current_lng);
  const view = trackingView({ status, store, destination, partner: partnerPoint });
  const first = view.store ?? view.destination ?? view.partner;
  const updated = formatUpdatedAt(partnerLocation?.last_ping_at);
  const distance =
    view.partner && view.destination
      ? formatDistanceKm(
          haversineDistanceKm(view.partner.lat, view.partner.lng, view.destination.lat, view.destination.lng)
        )
      : "";
  const coords = coordinateText(partnerPoint);

  const failedNote = (
    <Text style={styles.muted}>
      The live map is unavailable right now, so the partner&apos;s coordinates are shown instead.
    </Text>
  );

  return (
    <View style={styles.card} accessibilityLabel="Live delivery tracking">
      {first && (
        <MapBoundary
          fallback={
            <>
              {failedNote}
              {coords && <Text style={styles.value}>{coords}</Text>}
            </>
          }
        >
          <MapBody store={view.store} destination={view.destination} partner={view.partner} final={view.final} />
          <Text style={styles.small}>
            <Text style={{ color: BRAND.colors.primaryTextSafe, fontFamily: BRAND.fonts.bodySemiBold }}>S</Text> Store ·{" "}
            <Text style={{ color: BRAND.colors.accentTextSafe, fontFamily: BRAND.fonts.bodySemiBold }}>H</Text> Your
            address ·{" "}
            <Text style={{ color: BRAND.colors.ink, fontFamily: BRAND.fonts.bodySemiBold }}>D</Text> Delivery partner
          </Text>
          {(view.partner || view.final) && (
            <Text style={styles.small}>
              The dashed line is a straight line and the distance is approximate, not the road route.
            </Text>
          )}
        </MapBoundary>
      )}
      <View style={styles.texts}>
        {view.waiting && <Text style={styles.value}>Waiting for the delivery partner&apos;s location…</Text>}
        {view.partner && (
          <Text style={styles.value}>
            {updated}
            {distance ? ` · about ${distance} from your address` : ""}
          </Text>
        )}
        {view.final && <Text style={styles.value}>Final route from the store to your address.</Text>}
        {!first && <Text style={styles.value}>Location details are not available for this order.</Text>}
      </View>
      {coords && !first && <Text style={styles.small}>Partner coordinates: {coords}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: BRAND.colors.inkMuted + "22",
    backgroundColor: BRAND.colors.surface,
    borderRadius: BRAND.radius,
    padding: 12,
    gap: 8,
  },
  map: { height: 260, width: "100%", borderRadius: BRAND.radius },
  pin: { alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: BRAND.colors.surface },
  pinLetter: { color: BRAND.colors.surface, fontFamily: BRAND.fonts.bodySemiBold, fontSize: 13 },
  texts: { gap: 4 },
  value: { fontFamily: BRAND.fonts.bodyMedium, color: BRAND.colors.ink },
  muted: { fontFamily: BRAND.fonts.body, color: BRAND.colors.inkMuted },
  small: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted },
});
