"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps, useGoogleMaps } from "@/lib/maps/loader";
import { isValidLatLng, type AddressComponent } from "@/lib/maps/place";

export type SelectedPlace = {
  point: { lat: number; lng: number };
  displayName: string | null;
  formattedAddress: string | null;
  components: AddressComponent[];
};

type Props = {
  onSelect: (place: SelectedPlace) => void;
  onError?: (message: string) => void;
  unavailableMessage?: string;
  className?: string;
};

// Hosts the Places autocomplete web component. Renders an empty host (and
// nothing is mounted) if Maps cannot load, so callers keep working without it.
export default function AddressSearch({ onSelect, onError, unavailableMessage, className }: Props) {
  const maps = useGoogleMaps();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const selectRef = useRef(onSelect);
  const errorRef = useRef(onError);
  const unavailableRef = useRef(unavailableMessage);
  useEffect(() => {
    selectRef.current = onSelect;
    errorRef.current = onError;
    unavailableRef.current = unavailableMessage;
  });

  useEffect(() => {
    if (maps.status !== "ready") return;
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let element: HTMLElement | null = null;
    (async () => {
      try {
        const google = await loadGoogleMaps();
        const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
        if (disposed) return;
        const autocomplete = new PlaceAutocompleteElement({
          includedRegionCodes: ["in"],
          placeholder: "Search for your address",
        });
        autocomplete.style.colorScheme = "light";
        autocomplete.style.width = "100%";
        autocomplete.setAttribute("aria-label", "Search for your address");
        autocomplete.addEventListener("gmp-select", async (event) => {
          try {
            const place = event.placePrediction.toPlace();
            await place.fetchFields({
              fields: ["displayName", "formattedAddress", "location", "addressComponents"],
            });
            if (disposed || !place.location) return;
            const point = { lat: place.location.lat(), lng: place.location.lng() };
            if (!isValidLatLng(point.lat, point.lng)) return;
            selectRef.current({
              point,
              displayName: place.displayName ?? null,
              formattedAddress: place.formattedAddress ?? null,
              components: (place.addressComponents ?? []) as AddressComponent[],
            });
          } catch {
            if (!disposed) errorRef.current?.("That place could not be loaded. Try another search.");
          }
        });
        autocomplete.addEventListener("gmp-error", () => {
          if (!disposed) {
            errorRef.current?.(unavailableRef.current ?? "Address search is unavailable right now.");
          }
        });
        element = autocomplete;
        host.replaceChildren(autocomplete);
      } catch (error) {
        console.error("Address search failed to start", error);
        // Places library unavailable; callers still work without search.
      }
    })();
    return () => {
      disposed = true;
      element?.remove();
      host.replaceChildren();
    };
  }, [maps.status]);

  return <div ref={hostRef} className={className} aria-label="Address search" />;
}
