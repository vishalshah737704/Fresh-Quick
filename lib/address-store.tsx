"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type DeliveryDetails = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
};

type AddressContextValue = {
  lat: number;
  lng: number;
  label: string;
  setAddress: (lat: number, lng: number, label: string) => void;
  deliveryDetails: DeliveryDetails;
  setDeliveryDetails: (details: DeliveryDetails) => void;
};

const AddressContext = createContext<AddressContextValue | null>(null);

// Demo Kitchen's seeded location (Phase 1 seed data) — sensible default so
// the restaurant list isn't empty on first load before the customer picks.
const DEFAULT_LAT = 19.076;
const DEFAULT_LNG = 72.8777;
const DEFAULT_LABEL = "Mumbai (default)";
const DEFAULT_DELIVERY_DETAILS: DeliveryDetails = {
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
};

// Distinct, narrowly-scoped key — only the delivery-location pin (lat/lng/
// label) persists across reloads. Checkout name/email/address (deliveryDetails)
// must NOT be persisted; that removal was a deliberate privacy fix.
const LOCATION_STORAGE_KEY = "fresh-quick-delivery-location";

type StoredLocation = { lat: number; lng: number; label: string };

function readStoredLocation(): StoredLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.lat === "number" &&
      typeof parsed?.lng === "number" &&
      typeof parsed?.label === "string"
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function writeStoredLocation(loc: StoredLocation) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(loc));
  } catch {
    // Ignore storage failures (private browsing, quota, etc.) — falls back
    // to the in-memory default for this session.
  }
}

export function AddressProvider({ children }: { children: ReactNode }) {
  // Always start from the SSR-safe default (matches server render); the
  // stored location, if any, is applied after mount to avoid a hydration
  // mismatch (server has no localStorage, client would otherwise render
  // the stored value on first paint before hydration completes).
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [deliveryDetails, setDeliveryDetailsState] = useState<DeliveryDetails>(
    DEFAULT_DELIVERY_DETAILS
  );

  useEffect(() => {
    const stored = readStoredLocation();
    if (stored) {
      setLat(stored.lat);
      setLng(stored.lng);
      setLabel(stored.label);
    }
  }, []);

  function setAddress(newLat: number, newLng: number, newLabel: string) {
    setLat(newLat);
    setLng(newLng);
    setLabel(newLabel);
    writeStoredLocation({ lat: newLat, lng: newLng, label: newLabel });
  }

  function setDeliveryDetails(details: DeliveryDetails) {
    setDeliveryDetailsState(details);
  }

  return (
    <AddressContext.Provider
      value={{ lat, lng, label, setAddress, deliveryDetails, setDeliveryDetails }}
    >
      {children}
    </AddressContext.Provider>
  );
}

export function useAddress(): AddressContextValue {
  const ctx = useContext(AddressContext);
  if (!ctx) throw new Error("useAddress must be used within AddressProvider");
  return ctx;
}
