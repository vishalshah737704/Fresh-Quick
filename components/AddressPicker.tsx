"use client";

import { useState } from "react";
import { useAddress } from "@/lib/address-store";

export function AddressPicker() {
  const { lat, lng, label, setAddress } = useAddress();
  const [open, setOpen] = useState(false);
  const [draftLat, setDraftLat] = useState(String(lat));
  const [draftLng, setDraftLng] = useState(String(lng));
  const [draftLabel, setDraftLabel] = useState(label);

  function handleSave() {
    const parsedLat = parseFloat(draftLat);
    const parsedLng = parseFloat(draftLng);
    if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) return;
    setAddress(parsedLat, parsedLng, draftLabel || "Custom location");
    setOpen(false);
  }

  return (
    <div className="border-b border-gray-200 p-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-gray-700"
      >
        📍 {label} ({lat.toFixed(4)}, {lng.toFixed(4)})
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-2 rounded border border-gray-200 p-3">
          <p className="text-xs text-gray-500">
            Manual location entry (map picker coming once a Google Maps API
            key is configured).
          </p>
          <input
            className="rounded border px-2 py-1 text-sm"
            placeholder="Label (e.g. Home)"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
          />
          <input
            className="rounded border px-2 py-1 text-sm"
            placeholder="Latitude"
            value={draftLat}
            onChange={(e) => setDraftLat(e.target.value)}
          />
          <input
            className="rounded border px-2 py-1 text-sm"
            placeholder="Longitude"
            value={draftLng}
            onChange={(e) => setDraftLng(e.target.value)}
          />
          <button
            onClick={handleSave}
            className="rounded bg-brand-primary px-3 py-1 text-sm text-white"
          >
            Save location
          </button>
        </div>
      )}
    </div>
  );
}
