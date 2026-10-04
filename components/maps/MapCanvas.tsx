"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { mapsErrorMessage, useGoogleMaps } from "@/lib/maps/loader";
import type { GMap, GoogleNs, LatLngLiteral } from "@/lib/maps/types";

type Props = {
  center: LatLngLiteral;
  zoom?: number;
  className?: string;
  ariaLabel?: string;
  // Called once with the map and the Google namespace; return a cleanup that
  // removes markers and listeners created by the caller.
  onReady?: (map: GMap, google: GoogleNs) => void | (() => void);
  // Extra content shown under the message when the map cannot load.
  fallback?: ReactNode;
  // Called when the map cannot be created, so a consumer can switch to its own fallback.
  onError?: (error: unknown) => void;
};

export default function MapCanvas({
  center,
  zoom = 13,
  className = "h-64 w-full rounded-2xl",
  ariaLabel = "Map",
  onReady,
  fallback,
  onError,
}: Props) {
  const maps = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onReadyRef = useRef(onReady);
  const initialView = useRef({ center, zoom });
  const [created, setCreated] = useState(false);
  const [failed, setFailed] = useState(false);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onReady, onError]);

  useEffect(() => {
    if (maps.status !== "ready" || !containerRef.current) return;
    let disposed = false;
    let userCleanup: void | (() => void);
    const element = containerRef.current;
    (async () => {
      try {
        const google = window.google;
        if (!google) return;
        const { Map } = await google.maps.importLibrary("maps");
        if (disposed) return;
        const map = new Map(element, {
          center: initialView.current.center,
          zoom: initialView.current.zoom,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "cooperative",
        });
        setCreated(true);
        userCleanup = onReadyRef.current?.(map, google);
      } catch (error) {
        console.error("Map failed to start", error);
        if (!disposed) {
          setFailed(true);
          onErrorRef.current?.(error);
        }
      }
    })();
    return () => {
      disposed = true;
      if (typeof userCleanup === "function") userCleanup();
      element.replaceChildren();
    };
  }, [maps.status]);

  if (maps.status === "error" || failed) {
    return (
      <div
        role="status"
        className={`${className} flex flex-col items-center justify-center gap-1 bg-brand-surface p-4 text-center text-sm text-brand-ink-muted`}
      >
        <p>{maps.status === "error" ? mapsErrorMessage(maps.error) : "The map could not be shown right now."}</p>
        {fallback}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="region"
      aria-label={ariaLabel}
      aria-busy={!created}
      className={`${className} bg-brand-surface`}
    />
  );
}
