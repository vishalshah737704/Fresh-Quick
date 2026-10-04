"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MapCanvas from "@/components/maps/MapCanvas";
import { BRAND } from "@/lib/branding";
import { haversineDistanceKm } from "@/lib/geo";
import { formatDistanceKm, interpolateLatLng } from "@/lib/maps/geo-math";
import { loadMapClasses, useGoogleMaps, type MapClasses } from "@/lib/maps/loader";
import {
  fitKey,
  formatUpdatedAt,
  toTrackPoint,
  trackingView,
  type TrackPoint,
  type TrackingView,
} from "@/lib/maps/tracking";
import type {
  GLatLngBounds,
  GMap,
  GMarker,
  GPolyline,
  GoogleNs,
  MarkerOptions,
} from "@/lib/maps/types";

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

type Scene = {
  map: GMap;
  google: GoogleNs;
  Marker: new (opts?: MarkerOptions) => GMarker;
  LatLngBounds: new () => GLatLngBounds;
  Polyline: MapClasses["Polyline"];
  circlePath: number;
  store: GMarker | null;
  destination: GMarker | null;
  partner: GMarker | null;
  line: GPolyline | null;
  lastFitKey: string | null;
  frame: number | null;
};

const ANIMATION_MS = 1000;

function circle(path: number, fill: string, scale: number) {
  // A symbol (path from core SymbolPath.CIRCLE) needs no google.maps.Size object.
  return {
    path,
    scale,
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: BRAND.theme.surface,
    strokeWeight: 2,
  };
}

function letter(text: string) {
  return { text, color: BRAND.theme.surface, fontWeight: "700" };
}

export default function OrderTrackingMap({ status, store, destination, partnerLocation }: Props) {
  const maps = useGoogleMaps();
  const partnerPoint = toTrackPoint(partnerLocation?.current_lat, partnerLocation?.current_lng);
  const view = trackingView({ status, store, destination, partner: partnerPoint });
  const viewRef = useRef<TrackingView>(view);
  viewRef.current = view;
  const sceneRef = useRef<Scene | null>(null);
  const [broken, setBroken] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Any failure while building the map switches to the text fallback.
  const fail = useCallback((error: unknown) => {
    console.error("Order tracking map failed", error);
    if (mountedRef.current) setBroken(true);
  }, []);

  const applyUnsafe = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const v = viewRef.current;

    const place = (
      existing: GMarker | null,
      point: TrackPoint | null,
      make: (p: TrackPoint) => GMarker
    ): GMarker | null => {
      if (!point) {
        existing?.setMap(null);
        return null;
      }
      if (!existing) return make(point);
      existing.setPosition(point);
      return existing;
    };

    scene.store = place(
      scene.store,
      v.store,
      (p) =>
        new scene.Marker({
          map: scene.map,
          position: p,
          title: "Store",
          label: letter("S"),
          icon: circle(scene.circlePath, BRAND.theme.primaryTextSafe, 13),
          zIndex: 1,
        })
    );
    scene.destination = place(
      scene.destination,
      v.destination,
      (p) =>
        new scene.Marker({
          map: scene.map,
          position: p,
          title: "Delivery address",
          label: letter("H"),
          icon: circle(scene.circlePath, BRAND.theme.accentTextSafe, 13),
          zIndex: 1,
        })
    );

    if (v.store && v.destination) {
      const path = [v.store, v.destination];
      if (scene.line) {
        scene.line.setPath(path);
      } else {
        scene.line = new scene.Polyline({
          map: scene.map,
          path,
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 0.7, strokeColor: BRAND.theme.ink, scale: 3 },
              offset: "0",
              repeat: "14px",
            },
          ],
        });
      }
    } else if (scene.line) {
      scene.line.setMap(null);
      scene.line = null;
    }

    // Partner: create at the first ping, then glide to later pings.
    if (!v.partner) {
      if (scene.frame !== null) cancelAnimationFrame(scene.frame);
      scene.frame = null;
      scene.partner?.setMap(null);
      scene.partner = null;
    } else if (!scene.partner) {
      scene.partner = new scene.Marker({
        map: scene.map,
        position: v.partner,
        title: "Delivery partner",
        label: letter("D"),
        icon: circle(scene.circlePath, BRAND.theme.ink, 15),
        zIndex: 3,
      });
    } else {
      const marker = scene.partner;
      const current = marker.getPosition();
      const target = v.partner;
      if (current && (current.lat() !== target.lat || current.lng() !== target.lng)) {
        const from = { lat: current.lat(), lng: current.lng() };
        if (scene.frame !== null) cancelAnimationFrame(scene.frame);
        const startedAt = performance.now();
        const step = (now: number) => {
          const t = (now - startedAt) / ANIMATION_MS;
          marker.setPosition(interpolateLatLng(from, target, t));
          scene.frame = t < 1 ? requestAnimationFrame(step) : null;
        };
        scene.frame = requestAnimationFrame(step);
      }
    }

    const key = fitKey(v);
    if (key !== scene.lastFitKey) {
      scene.lastFitKey = key;
      const bounds = new scene.LatLngBounds();
      const points = [v.store, v.destination, v.partner].filter((p): p is TrackPoint => p !== null);
      for (const p of points) bounds.extend(p);
      if (points.length === 1) {
        scene.map.setCenter(points[0]);
        scene.map.setZoom(15);
      } else if (points.length > 1) {
        scene.map.fitBounds(bounds, 48);
      }
    }
  }, [fail]);

  const apply = useCallback(() => {
    try {
      applyUnsafe();
    } catch (error) {
      fail(error);
    }
  }, [applyUnsafe, fail]);

  useEffect(() => {
    apply();
    // Coordinate values, not object identity: the order is re-fetched every 3 s and
    // yields new objects each time. viewRef always holds the latest view.
  }, [
    apply,
    view.store?.lat,
    view.store?.lng,
    view.destination?.lat,
    view.destination?.lng,
    view.partner?.lat,
    view.partner?.lng,
    view.waiting,
    view.final,
  ]);

  const onReady = useCallback(
    (map: GMap, google: GoogleNs) => {
      let disposed = false;
      void loadMapClasses()
        .then((classes) => {
          if (disposed) return;
          sceneRef.current = {
            map,
            google,
            ...classes,
            store: null,
            destination: null,
            partner: null,
            line: null,
            lastFitKey: null,
            frame: null,
          };
          apply();
        })
        .catch(fail);
      return () => {
        disposed = true;
        const scene = sceneRef.current;
        sceneRef.current = null;
        if (!scene) return;
        if (scene.frame !== null) cancelAnimationFrame(scene.frame);
        scene.store?.setMap(null);
        scene.destination?.setMap(null);
        scene.partner?.setMap(null);
        scene.line?.setMap(null);
      };
    },
    [apply, fail]
  );

  const first = view.store ?? view.destination ?? view.partner;
  const coordinateText =
    partnerPoint !== null ? `${partnerPoint.lat.toFixed(4)}, ${partnerPoint.lng.toFixed(4)}` : null;
  const updated = formatUpdatedAt(partnerLocation?.last_ping_at);
  const distance =
    view.partner && view.destination
      ? formatDistanceKm(
          haversineDistanceKm(view.partner.lat, view.partner.lng, view.destination.lat, view.destination.lng)
        )
      : "";
  const mapFailed = maps.status === "error" || broken;

  return (
    <section
      aria-label="Live delivery tracking"
      className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-brand-surface p-3 shadow-sm"
    >
      {first && !mapFailed && (
        <MapCanvas
          center={first}
          zoom={14}
          className="h-72 w-full rounded-2xl"
          ariaLabel="Map showing the store, your delivery address and the delivery partner"
          onReady={onReady}
          onError={fail}
        />
      )}
      {first && !mapFailed && (
        <p className="text-xs text-brand-ink-muted">
          <span className="font-semibold text-brand-primary-text-safe">S</span> Store ·{" "}
          <span className="font-semibold text-brand-accent-text-safe">H</span> Your address ·{" "}
          <span className="font-semibold text-brand-ink">D</span> Delivery partner
        </p>
      )}
      {mapFailed && (
        <p role="status" className="text-sm text-brand-ink-muted">
          The live map is unavailable right now, so the partner&apos;s coordinates are shown instead.
        </p>
      )}
      <div aria-live="polite" className="flex flex-col gap-1 text-sm text-brand-ink">
        {view.waiting && <p>Waiting for the delivery partner&apos;s location…</p>}
        {view.partner && (
          <p>
            {updated}
            {distance && ` · about ${distance} from your address`}
          </p>
        )}
        {view.final && <p>Final route from the store to your address.</p>}
        {!first && <p>Location details are not available for this order.</p>}
      </div>
      {!mapFailed && (view.partner || view.final) && (
        <p className="text-xs text-brand-ink-muted">
          The dashed line is a straight line and the distance is approximate, not the road route.
        </p>
      )}
      {coordinateText && (
        <details open={mapFailed} className="text-xs text-brand-ink-muted">
          <summary className="cursor-pointer">Partner coordinates</summary>
          <p className="mt-1 font-medium text-brand-ink">{coordinateText}</p>
        </details>
      )}
    </section>
  );
}
