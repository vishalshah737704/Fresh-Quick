# Google Maps: address picker and live order tracking (web)

Date: 2026-10-04. Vishal asked for the address picker and live tracking after adding `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` ("Build the address picker and live tracking"); he asked to run autonomously, so the decisions below were taken by the controller and are listed so they can be corrected.

## Intent

Replace two stand-ins with real maps on the customer website:
1. The header **address picker** is a manual latitude/longitude form ("map picker coming once a Google Maps API key is configured"). Customers should search an address, see it on a map, drag the pin, or use their current location.
2. The customer's **order page** shows the delivery partner's coordinates as plain text. It should show a map with the store, the delivery address and the partner moving as new pings arrive.

Success: with a valid key a customer sets their delivery location from a map in a few taps, checkout address fields fill from the chosen place, and a customer with an assigned order watches the partner's marker move on a map; with no key, a blocked key or no network, every screen falls back to today's behaviour with a short explanatory message (nothing breaks).

## What already exists (verified in the code)

- `components/AddressPicker.tsx` (header, `app/customer/layout.tsx`) edits the global pin `lat/lng/label` in `lib/address-store.tsx` (persisted in localStorage under `fresh-quick-delivery-location`, used for nearby-store sorting and sent as `deliveryAddress.lat/lng` at checkout). Checkout has separate structured fields (`line1`, `line2`, `city`, `state`, `pincode`) that are deliberately NOT persisted (privacy fix) and are sent with the pin.
- Delivery partners already send pings (`POST /api/delivery/ping` writes `delivery_partners.current_lat/current_lng/last_ping_at`; the partner dashboard has manual lat/lng inputs plus browser geolocation). The customer order page (`app/customer/orders/[id]/page.tsx`) polls every 3 s and reads the partner row (RLS `customer_can_read_assigned_partner_location`, status assigned or picked_up) and prints the coordinates.
- `stores` has `lat`/`lng` (public read); the order's delivery address row has `lat`/`lng` and is readable by its owner.

## Decisions

1. **Web only.** The phone app keeps its current location flow; maps in the Expo app need native map SDK keys and a development build, which is a separate project.
2. **No new packages.** A small loader injects the official Maps JavaScript bootstrap (`https://maps.googleapis.com/maps/api/js?key=...&loading=async&v=weekly`) and uses `google.maps.importLibrary(...)` for `maps`, `marker`, `places` and `geocoding`. Types are a minimal local declaration for what is used (no `@types/google.maps`).
3. **APIs used** (the three already enabled on the key): Maps JavaScript API (map, markers, polyline), Places API (New) (the `PlaceAutocompleteElement` web component for search), Geocoding API (reverse geocode of a dragged pin or the current location). No Directions API: the route is drawn as a straight line between store and destination, labelled as approximate.
4. **Key handling:** read only `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in the browser; never hard-code it; `.env.example` gets a placeholder; the key is referrer-restricted by Vishal. The loader detects a missing key, a load failure and the Maps auth-failure callback (`window.gm_authFailure`), and each consumer shows its fallback plus a one-line message instead of throwing. Quotas and the budget alert are Vishal's to set in the Google console.
5. **Address picker (header):** a dropdown with (a) the Places search box, (b) a map with a draggable pin, (c) a "Use my current location" button (browser geolocation, with a clear denied message), (d) the existing manual lat/lng form kept under "Enter coordinates manually" as the always-available fallback. Choosing a place, dragging the pin or using the current location sets the global pin via `setAddress(lat, lng, label)`; the label is the place's short name or the reverse-geocoded locality. Bias suggestions to India (region code `in`). The saved pin keeps persisting exactly as today.
6. **Checkout:** a search box above "Delivery address" (Places autocomplete) that fills `line1`, `line2` (blank), `city`, `state`, `pincode` from the selected place's address components and moves the pin to the place; plus a "Use my pinned location" button that reverse-geocodes the current pin into those fields. These fields stay unpersisted. Fields remain editable; validation is unchanged; if the lookup fails the form works as before.
7. **Live tracking:** on the customer order page, a map card (shown when the order is assigned or picked_up and the partner row is readable) with: store marker, delivery-address marker, partner marker at `current_lat/current_lng`, a dashed straight line from the store to the delivery address, bounds fitted to all points. The partner marker position updates from the existing 3 s poll (no extra requests), moves smoothly (animated interpolation over about one second), and the card shows "Updated hh:mm:ss" and the approximate straight-line distance to the destination (existing haversine helper). Before a first ping or when the partner row is null, show store and address only with "Waiting for the delivery partner's location". When the order is delivered or in a terminal state, the card shows the final route without the partner marker. The existing coordinate text is kept as a collapsed detail line. The 15 s delivery animation dialog is unchanged.
8. **Privacy:** only the signed-in customer's own order shows the partner marker (RLS already limits it to assigned/picked_up); no new tables, policies or API routes. The delivery address coordinates come from the order's own address row.
9. **Quality:** a single map instance per component, markers removed on unmount, no setState after unmount, `loading=async`, the script injected once across components, dark/light theme not needed.

## Out of scope

Directions or ETA from Google, geofencing, the vendor and delivery partner portals (the partner dashboard keeps its manual ping inputs), the phone app, address book (saved addresses), server-side geocoding.

## Testing

Unit tests (node) for the pure helpers: address component parsing (street number and route, sublocality or locality, administrative_area_level_1, postal_code, India-style variants, missing parts), label building, interpolation and bounds math, key and error classification. Live in a real browser (Playwright) with the real key on an allowed origin: picker search and pin drag update the label and global pin; geolocation denied path; checkout autofill from a selected place; the order page map with store, address and partner markers, plus a simulated partner ping (update `delivery_partners.current_lat/lng` for a test order's partner with SQL, never placing an order) that moves the marker; fallback screens with an invalid key (temporary env override on the spare instance only) and with the key unset. The key's referrer restriction must allow the origin used for the test (Vishal's key allows localhost:3000 to 3003; the spare test instance uses 3010, so it needs a referrer added).
