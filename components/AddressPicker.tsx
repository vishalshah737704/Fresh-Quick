"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAddress } from "@/lib/address-store";
import MapCanvas from "@/components/maps/MapCanvas";
import MapErrorBoundary from "@/components/maps/MapErrorBoundary";
import { loadMapClasses } from "@/lib/maps/loader";
import AddressSearch, { type SelectedPlace } from "@/components/maps/AddressSearch";
import { useGoogleMaps } from "@/lib/maps/loader";
import { reverseGeocodePoint } from "@/lib/maps/geocode";
import { isValidLatLng, placeLabel } from "@/lib/maps/place";
import {
  formatCoordinate,
  geolocationErrorMessage,
  parseCoordinates,
} from "@/lib/maps/geolocation";
import type { GMap, GMarker, GoogleNs, LatLngLiteral } from "@/lib/maps/types";

const PANEL_WIDTH_PX = 352;
const VIEWPORT_MARGIN_PX = 8;

export function AddressPicker() {
  const { lat, lng, label, setAddress } = useAddress();
  const maps = useGoogleMaps();
  const [open, setOpen] = useState(false);
  const [draftLat, setDraftLat] = useState(String(lat));
  const [draftLng, setDraftLng] = useState(String(lng));
  const [draftLabel, setDraftLabel] = useState(label);
  const [manualOpen, setManualOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [locating, setLocating] = useState(false);
  const [shift, setShift] = useState(0);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const markerRef = useRef<GMarker | null>(null);
  const mountedRef = useRef(true);
  const geocodeSeq = useRef(0);
  // True once the user types in the label field; a map click then keeps their text.
  const labelEditedRef = useRef(false);
  const applyRef = useRef<(lat: number, lng: number, label: string) => void>(() => {});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const close = useCallback(() => {
    geocodeSeq.current += 1;
    setOpen(false);
  }, []);

  useEffect(() => {
    applyRef.current = (newLat, newLng, newLabel) => {
      setAddress(newLat, newLng, newLabel);
      close();
    };
  });

  // Keep the dropdown inside the viewport however narrow the header is.
  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const width = Math.min(PANEL_WIDTH_PX, window.innerWidth - VIEWPORT_MARGIN_PX * 2);
    const overflowRight = rect.left + width - (window.innerWidth - VIEWPORT_MARGIN_PX);
    const next = overflowRight > 0 ? -overflowRight : 0;
    setShift(Math.max(next, VIEWPORT_MARGIN_PX - rect.left));
  }, [open]);

  // Escape and outside click close the dropdown.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Escape inside the Places autocomplete dismisses its own suggestions only.
      const insideSearch = event.composedPath().some(
        (node) =>
          node instanceof Element &&
          (node.tagName.toLowerCase() === "gmp-place-autocomplete" ||
            node.getAttribute("aria-label") === "Address search")
      );
      if (!insideSearch) close();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current && !rootRef.current.contains(target)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  const movePin = useCallback((point: LatLngLiteral) => {
    setDraftLat(formatCoordinate(point.lat));
    setDraftLng(formatCoordinate(point.lng));
    markerRef.current?.setPosition(point);
    mapRef.current?.panTo(point);
  }, []);

  // Resolves a label for a point; falls back to the coordinates.
  const reverseGeocode = useCallback(async (point: LatLngLiteral): Promise<string> => {
    const fallback = placeLabel({ lat: point.lat, lng: point.lng });
    const found = await reverseGeocodePoint(point);
    if (!found) return fallback;
    return (
      placeLabel({
        formatted_address: found.formattedAddress,
        components: found.components,
      }) || fallback
    );
  }, []);

  const pinFromMap = useCallback(
    async (point: LatLngLiteral) => {
      movePin(point);
      const seq = ++geocodeSeq.current;
      if (!labelEditedRef.current) setDraftLabel("");
      const found = await reverseGeocode(point);
      if (!mountedRef.current || seq !== geocodeSeq.current) return;
      if (!labelEditedRef.current) setDraftLabel(found);
    },
    [movePin, reverseGeocode]
  );

  const onMapReady = useCallback(
    (map: GMap, google: GoogleNs) => {
      mapRef.current = map;
      let cleanup: (() => void) | undefined;
      (async () => {
        try {
          const { Marker } = await loadMapClasses();
          if (!mapRef.current) return;
          const start = parseCoordinates(draftLatRef.current, draftLngRef.current) ?? {
            lat,
            lng,
          };
          const marker = new Marker({
            map,
            position: start,
            draggable: true,
            title: "Delivery location. Drag to move.",
          });
          markerRef.current = marker;
          const onDragEnd = marker.addListener("dragend", () => {
            const pos = marker.getPosition();
            if (pos) void pinFromMap({ lat: pos.lat(), lng: pos.lng() });
          });
          const onClick = map.addListener("click", (event: { latLng?: { lat(): number; lng(): number } }) => {
            if (event.latLng) void pinFromMap({ lat: event.latLng.lat(), lng: event.latLng.lng() });
          });
          cleanup = () => {
            onDragEnd.remove();
            onClick.remove();
            marker.setMap(null);
          };
          if (!mapRef.current) cleanup();
        } catch (error) {
          // Marker setup failed; the manual fields still work.
          console.error("Map pin setup failed", error);
          cleanup?.();
          cleanup = undefined;
        }
      })();
      return () => {
        cleanup?.();
        markerRef.current = null;
        mapRef.current = null;
      };
    },
    [lat, lng, pinFromMap]
  );

  // Latest draft values for the marker's initial position (read once at creation).
  const draftLatRef = useRef(draftLat);
  const draftLngRef = useRef(draftLng);
  useEffect(() => {
    draftLatRef.current = draftLat;
    draftLngRef.current = draftLng;
  }, [draftLat, draftLng]);

  const onPlaceSelected = useCallback((place: SelectedPlace) => {
    const chosen =
      placeLabel({
        displayName: place.displayName,
        formattedAddress: place.formattedAddress,
        lat: place.point.lat,
        lng: place.point.lng,
      }) || "Custom location";
    applyRef.current(place.point.lat, place.point.lng, chosen);
  }, []);

  function toggle() {
    if (!open) {
      setDraftLat(formatCoordinate(lat));
      setDraftLng(formatCoordinate(lng));
      setDraftLabel(label);
      labelEditedRef.current = false;
      setMessage("");
      setManualOpen(false);
      setOpen(true);
    } else {
      close();
    }
  }

  function useCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMessage(geolocationErrorMessage(2));
      return;
    }
    setMessage("");
    setLocating(true);
    // Taken at click time: closing the picker, picking a place or dropping a
    // pin before the position arrives invalidates this request.
    const seq = ++geocodeSeq.current;
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (!mountedRef.current) return;
        if (seq !== geocodeSeq.current) {
          setLocating(false);
          return;
        }
        const point = { lat: position.coords.latitude, lng: position.coords.longitude };
        if (!isValidLatLng(point.lat, point.lng)) {
          setLocating(false);
          setMessage(geolocationErrorMessage(2));
          return;
        }
        movePin(point);
        const found = await reverseGeocode(point);
        if (!mountedRef.current) return;
        setLocating(false);
        if (seq !== geocodeSeq.current) return;
        applyRef.current(point.lat, point.lng, found || "Current location");
      },
      (error) => {
        if (!mountedRef.current) return;
        setLocating(false);
        setMessage(geolocationErrorMessage(error.code));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function handleSave() {
    const point = parseCoordinates(draftLat, draftLng);
    if (!point) {
      setMessage("Enter a valid latitude (-90 to 90) and longitude (-180 to 180).");
      return;
    }
    setAddress(point.lat, point.lng, draftLabel.trim() || "Custom location");
    close();
  }

  function onManualChange(nextLat: string, nextLng: string) {
    setDraftLat(nextLat);
    setDraftLng(nextLng);
    const point = parseCoordinates(nextLat, nextLng);
    if (point) {
      markerRef.current?.setPosition(point);
      mapRef.current?.panTo(point);
    }
  }

  const mapAvailable = maps.status !== "error";
  const inputClass =
    "w-full rounded-xl border border-brand-ink-muted bg-brand-surface px-3 py-2 text-sm text-brand-ink";
  const startPoint = parseCoordinates(draftLat, draftLng) ?? { lat, lng };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="max-w-full truncate text-left text-sm font-medium text-brand-ink"
      >
        📍 {label} ({lat.toFixed(4)}, {lng.toFixed(4)})
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Choose delivery location"
          style={{ left: shift }}
          className="absolute top-full z-50 mt-2 flex w-[22rem] max-w-[calc(100vw-1rem)] flex-col gap-3 rounded-2xl border border-brand-ink-muted bg-brand-surface p-3 text-brand-ink shadow-lg"
        >
          {mapAvailable && (
            <MapErrorBoundary>
            <AddressSearch
              className="min-h-10"
              onSelect={onPlaceSelected}
              onError={setMessage}
              unavailableMessage="Address search is unavailable right now. Drop a pin on the map instead."
            />
            </MapErrorBoundary>
          )}
          {mapAvailable && (
            <MapErrorBoundary>
            <MapCanvas
              center={startPoint}
              zoom={15}
              className="h-48 w-full rounded-xl"
              ariaLabel="Map. Click or drag the pin to set your delivery location."
              onReady={onMapReady}
            />
            </MapErrorBoundary>
          )}
          {!mapAvailable && maps.status === "error" && (
            <MapCanvas center={startPoint} className="w-full rounded-xl" />
          )}
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            className="rounded-full border border-brand-primary-text-safe px-3 py-2 text-sm font-medium text-brand-primary-text-safe disabled:opacity-60"
          >
            {locating ? "Finding your location…" : "Use my current location"}
          </button>
          {message && (
            <p role="alert" className="text-xs text-brand-danger-text-safe">
              {message}
            </p>
          )}
          <details
            open={manualOpen || maps.status === "error"}
            onToggle={(e) => setManualOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer text-sm font-medium text-brand-ink">
              Enter coordinates manually
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              <input
                aria-label="Location label"
                className={inputClass}
                placeholder="Label (e.g. Home)"
                value={draftLabel}
                onChange={(e) => {
                  labelEditedRef.current = true;
                  setDraftLabel(e.target.value);
                }}
              />
              <input
                aria-label="Latitude"
                inputMode="decimal"
                className={inputClass}
                placeholder="Latitude"
                value={draftLat}
                onChange={(e) => onManualChange(e.target.value, draftLng)}
              />
              <input
                aria-label="Longitude"
                inputMode="decimal"
                className={inputClass}
                placeholder="Longitude"
                value={draftLng}
                onChange={(e) => onManualChange(draftLat, e.target.value)}
              />
            </div>
          </details>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-full bg-brand-primary-text-safe px-3 py-2 text-sm font-medium text-white"
          >
            Save location
          </button>
        </div>
      )}
    </div>
  );
}
