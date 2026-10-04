"use client";

import { useEffect, useState } from "react";
import { pickClass } from "./library";
import type { GMarker, GoogleNs, MapsErrorKind, MapsStatus, MarkerOptions } from "./types";

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
    if (window.google?.maps?.importLibrary) {
      resolve(window.google);
      return;
    }
    const fail = () => {
      document.getElementById(SCRIPT_ID)?.remove();
      reject(new MapsError(authFailed ? "auth_failed" : "load_failed"));
    };
    const timer = window.setTimeout(fail, LOAD_TIMEOUT_MS);
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&v=weekly&callback=__gmapsReady`;
    window.__gmapsReady = () => {
      window.clearTimeout(timer);
      if (authFailed) reject(new MapsError("auth_failed"));
      else if (window.google?.maps?.importLibrary) resolve(window.google);
      else fail();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      fail();
    };
    document.head.appendChild(script);
  });
  const tracked = attempt.catch((error: unknown) => {
    // A transient network failure may be retried on the next call.
    if (error instanceof MapsError && error.kind === "load_failed" && cached === tracked) {
      cached = null;
    }
    throw error;
  });
  tracked.catch(() => undefined);
  cached = tracked;
  return tracked;
}

// The one place that obtains the classic Marker constructor (the "marker"
// library, with the global as a fallback). Rejects if Maps cannot load.
export async function loadMarkerClass(): Promise<new (opts?: MarkerOptions) => GMarker> {
  const google = await loadGoogleMaps();
  const lib = await google.maps.importLibrary("marker");
  return pickClass<new (opts?: MarkerOptions) => GMarker>("Marker", lib.Marker, google.maps.Marker);
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
