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

const STORAGE_KEY = "foodhub_address";

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

export function AddressProvider({ children }: { children: ReactNode }) {
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [deliveryDetails, setDeliveryDetailsState] = useState<DeliveryDetails>(
    DEFAULT_DELIVERY_DETAILS
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (
          typeof parsed.lat === "number" &&
          typeof parsed.lng === "number" &&
          typeof parsed.label === "string"
        ) {
          setLat(parsed.lat);
          setLng(parsed.lng);
          setLabel(parsed.label);
        }
        if (parsed.deliveryDetails && typeof parsed.deliveryDetails === "object") {
          setDeliveryDetailsState({ ...DEFAULT_DELIVERY_DETAILS, ...parsed.deliveryDetails });
        }
      }
    } catch {
      // ignore, defaults stand
    }
  }, []);

  function persist(next: {
    lat: number;
    lng: number;
    label: string;
    deliveryDetails: DeliveryDetails;
  }) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable — address just won't persist across reloads
    }
  }

  function setAddress(newLat: number, newLng: number, newLabel: string) {
    setLat(newLat);
    setLng(newLng);
    setLabel(newLabel);
    persist({ lat: newLat, lng: newLng, label: newLabel, deliveryDetails });
  }

  function setDeliveryDetails(details: DeliveryDetails) {
    setDeliveryDetailsState(details);
    persist({ lat, lng, label, deliveryDetails: details });
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
