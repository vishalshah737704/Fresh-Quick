"use client";

import { useEffect, useState } from "react";
import { bootstrapAction, failureKind, isRetryable, pickClass } from "./library";
import type {
  GLatLngBounds,
  GMarker,
  GPolyline,
  GoogleNs, MapsErrorKind, MapsStatus,
  MarkerOptions,
  PolylineOptions,
  RouteClass,
} from "./types";

export class MapsError extends Error {
  kind: MapsErrorKind;
  constructor(kind: MapsErrorKind) {
    super(`Google Maps: ${kind}`);
    this.name = "MapsError";
    this.kind = kind;
  }
}

declare global {
  interface Window {
    google?: GoogleNs;
    gm_authFailure?: () => void;
    __gmapsReady?: () => void;
  }
}

const SCRIPT_ID = "google-maps-bootstrap";
const LOAD_TIMEOUT_MS = 15000;

let cached: Promise<GoogleNs> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

function rejected(kind: MapsErrorKind): Promise<GoogleNs> {
  const promise = Promise.reject<GoogleNs>(new MapsError(kind));
  promise.catch(() => undefined);
  return promise;
}

function installAuthHook(): void {
  // Google calls this global when the key is rejected (referrer, API
  // restriction, billing); the script itself still loads in that case.
  window.gm_authFailure = () => {
    authFailed = true;
    cached = rejected("auth_failed");
    authListeners.forEach((listener) => listener());
  };
}

export function loadGoogleMaps(): Promise<GoogleNs> {
  if (typeof window === "undefined") return rejected("load_failed");
  if (cached) return cached;
  // Literal property access so Next inlines the value into the client bundle.
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    cached = rejected("missing_key");
    return cached;
  }
  installAuthHook();
  const attempt = new Promise<GoogleNs>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID);
    const action = bootstrapAction(Boolean(window.google?.maps?.importLibrary), existing !== null);
    if (action === "resolve" && window.google) {
      resolve(window.google);
      return;
    }
    // removeScript is false for a timeout: that script may still finish, and a
    // retry then waits on it (action "reuse") instead of injecting a second one.
    const fail = (removeScript: boolean) => {
      if (removeScript) document.getElementById(SCRIPT_ID)?.remove();
      reject(new MapsError(failureKind(authFailed)));
    };
    const timer = window.setTimeout(() => fail(false), LOAD_TIMEOUT_MS);
    // Always the latest attempt's callback, so a late load of an earlier
    // (timed out) attempt resolves the current one.
    window.__gmapsReady = () => {
      window.clearTimeout(timer);
      if (authFailed) reject(new MapsError("auth_failed"));
      else if (window.google?.maps?.importLibrary) resolve(window.google);
      else fail(true);
    };
    if (action === "reuse") return;
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&v=weekly&callback=__gmapsReady`;
    script.onerror = () => {
      window.clearTimeout(timer);
      fail(true);
    };
    document.head.appendChild(script);
  });
  const tracked = attempt.catch((error: unknown) => {
    // A transient network failure may be retried on the next call.
    if (error instanceof MapsError && isRetryable(error.kind) && cached === tracked) {
      cached = null;
    }
    throw error;
  });
  tracked.catch(() => undefined);
  cached = tracked;
  return tracked;
}

export type MapClasses = {
  Marker: new (opts?: MarkerOptions) => GMarker;
  Polyline: new (opts?: PolylineOptions) => GPolyline;
  LatLngBounds: new () => GLatLngBounds;
  circlePath: number;
};

// Loads "maps" (Polyline), "marker" (Marker) and "core" (LatLngBounds,
// SymbolPath), each class taken from its own library with the global
// google.maps.<Class> as a fallback. Rejects if Maps or a class is unavailable.
export async function loadMapClasses(): Promise<MapClasses> {
  const google = await loadGoogleMaps();
  const [maps, marker, core] = await Promise.all([
    google.maps.importLibrary("maps"),
    google.maps.importLibrary("marker"),
    google.maps.importLibrary("core"),
  ]);
  const symbols = core.SymbolPath ?? google.maps.SymbolPath;
  return {
    Marker: pickClass("Marker", marker.Marker, google.maps.Marker),
    Polyline: pickClass("Polyline", maps.Polyline, google.maps.Polyline),
    LatLngBounds: pickClass("LatLngBounds", core.LatLngBounds, google.maps.LatLngBounds),
    // SymbolPath.CIRCLE is 0 in the API.
    circlePath: typeof symbols?.CIRCLE === "number" ? symbols.CIRCLE : 0,
  };
}

// The Routes library (Route.computeRoutes). Rejects with a plain Error if the
// library or class is unavailable, so the caller keeps its straight-line fallback.
export async function loadRoutesLibrary(): Promise<RouteClass> {
  const google = await loadGoogleMaps();
  const routes = await google.maps.importLibrary("routes");
  return pickClass<RouteClass>("Route", routes.Route, google.maps.routes?.Route);
}

export function useGoogleMaps(): MapsStatus {
  const [state, setState] = useState<MapsStatus>({ status: "loading" });

  useEffect(() => {
    let active = true;
    const onAuth = () => {
      if (active) setState({ status: "error", error: "auth_failed" });
    };
    authListeners.add(onAuth);
    loadGoogleMaps().then(
      () => {
        if (!active) return;
        setState(authFailed ? { status: "error", error: "auth_failed" } : { status: "ready" });
      },
      (error: unknown) => {
        if (!active) return;
        setState({
          status: "error",
          error: error instanceof MapsError ? error.kind : "load_failed",
        });
      }
    );
    return () => {
      active = false;
      authListeners.delete(onAuth);
    };
  }, []);

  return state;
}

export function mapsErrorMessage(kind: MapsErrorKind): string {
  if (kind === "missing_key") return "The map is not set up on this app yet.";
  if (kind === "auth_failed") return "The map could not be shown because the map key was not accepted.";
  return "The map could not be loaded. Check your connection.";
}
