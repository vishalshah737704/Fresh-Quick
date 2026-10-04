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
};

export default function MapCanvas({
  center,
  zoom = 13,
  className = "h-64 w-full rounded-2xl",
  ariaLabel = "Map",
  onReady,
  fallback,
}: Props) {
  const maps = useGoogleMaps();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onReadyRef = useRef(onReady);
  const initialView = useRef({ center, zoom });
  const [created, setCreated] = useState(false);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

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
        // The library import failed after the script loaded; leave the empty box.
      }
    })();
    return () => {
      disposed = true;
      if (typeof userCleanup === "function") userCleanup();
      element.replaceChildren();
    };
  }, [maps.status]);

  if (maps.status === "error") {
    return (
      <div
        role="status"
        className={`${className} flex flex-col items-center justify-center gap-1 bg-brand-surface p-4 text-center text-sm text-brand-ink-muted`}
      >
        <p>{mapsErrorMessage(maps.error)}</p>
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
