"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type AddressContextValue = {
  lat: number;
  lng: number;
  label: string;
  setAddress: (lat: number, lng: number, label: string) => void;
};

const AddressContext = createContext<AddressContextValue | null>(null);

const STORAGE_KEY = "foodhub_address";

// Demo Kitchen's seeded location (Phase 1 seed data) — sensible default so
// the restaurant list isn't empty on first load before the customer picks.
const DEFAULT_LAT = 19.076;
const DEFAULT_LNG = 72.8777;
const DEFAULT_LABEL = "Mumbai (default)";

export function AddressProvider({ children }: { children: ReactNode }) {
  const [lat, setLat] = useState(DEFAULT_LAT);
  const [lng, setLng] = useState(DEFAULT_LNG);
  const [label, setLabel] = useState(DEFAULT_LABEL);

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
      }
    } catch {
      // ignore, defaults stand
    }
  }, []);

  function setAddress(newLat: number, newLng: number, newLabel: string) {
    setLat(newLat);
    setLng(newLng);
    setLabel(newLabel);
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ lat: newLat, lng: newLng, label: newLabel })
      );
    } catch {
      // localStorage unavailable — address just won't persist across reloads
    }
  }

  return (
    <AddressContext.Provider value={{ lat, lng, label, setAddress }}>
      {children}
    </AddressContext.Provider>
  );
}

export function useAddress(): AddressContextValue {
  const ctx = useContext(AddressContext);
  if (!ctx) throw new Error("useAddress must be used within AddressProvider");
  return ctx;
}
