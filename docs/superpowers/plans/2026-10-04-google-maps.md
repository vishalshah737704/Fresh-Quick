# Google Maps Implementation Plan

> Spec (binding): `docs/superpowers/specs/2026-10-04-google-maps-design.md`. Execute with `superpowers:subagent-driven-development`.

**Global constraints:** no new npm packages (no `@googlemaps/*`, no `@types/google.maps`); node-testable modules cannot value-import siblings (node needs `.ts` extensions, tsconfig forbids them): keep pure helpers in files without sibling imports and test them in `tests/`; the Maps key is read only from `process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (never read `.env*` files; never hard-code or log the key; `.env.example` gets a placeholder only); the Zippy/branding/privacy rules in CLAUDE.md apply (checkout address fields are never persisted; branding colors come from tokens in `app/globals.css`/`lib/branding.ts`, no hard-coded brand colors); every client component using the map must clean up on unmount and must fall back gracefully (missing key, load failure, `gm_authFailure`); every `"use client"` page with a dynamic `[id]` needs its sibling `loading.tsx` (already present for orders); do not start servers, call the model or touch the database; never stage `tsconfig.json`, `.superpowers`, `md_version`; commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; run `node --test tests/*.test.mjs`, `npx tsc --noEmit` and `cd mobile && npx tsc --noEmit` before each commit. Next.js in this repo differs from older versions: read the relevant guide in `node_modules/next/dist/docs/` before writing client/server component code.

## Task 1: Maps infrastructure and pure helpers

Files: new `lib/maps/loader.ts` (client-only: `loadGoogleMaps(): Promise<GoogleNs>` that injects the bootstrap script once, resolves when `google.maps.importLibrary` exists, caches the promise, rejects with a typed error (`missing_key | load_failed | auth_failed`), installs `window.gm_authFailure` to flag auth failures and notify subscribers; `useGoogleMaps()` hook returning `{status: 'loading'|'ready'|'error', error?: kind}`), new `lib/maps/types.ts` (minimal local declarations for the used pieces of the Google namespace), new `lib/maps/place.ts` (pure, no imports: `parseAddressComponents(components)` -> `{line1, city, state, pincode}` handling street_number + route, premise/subpremise, sublocality(_level_1/2) and locality, administrative_area_level_1, postal_code, India variants and missing parts; `placeLabel(place)` short label; `isValidLatLng`), new `lib/maps/geo-math.ts` (pure, no imports: `interpolateLatLng(from, to, t)`, `boundsOf(points)`, `formatDistanceKm`), new `components/maps/MapCanvas.tsx` (a thin client component: creates one `google.maps.Map` in a div ref, exposes the map instance via a render prop or ref callback, shows a fallback message when status is error, cleans up), `.env.example` placeholder `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=`, tests `tests/maps-place.test.mjs`, `tests/maps-geo-math.test.mjs`.

## Task 2: Address picker

Files: `components/AddressPicker.tsx` (rebuild per spec decision 5), `lib/address-store.tsx` only if needed (keep persistence unchanged), small pure helpers in `lib/maps/` if needed.
- Dropdown: Places search (`PlaceAutocompleteElement`, region India), map with draggable marker, "Use my current location", manual lat/lng form kept as collapsed fallback; reverse geocoding via `google.maps.Geocoder`; sets the pin via `setAddress(lat, lng, label)`; Escape/outside click closes; keyboard accessible labels; mobile-width friendly. Fallback when the map cannot load.

## Task 3: Checkout address autofill

Files: `app/customer/checkout/page.tsx` (+ a small component if cleaner, e.g. `components/maps/AddressSearch.tsx`).
- Search box above Delivery address that fills `line1`, `line2` (blank), `city`, `state`, `pincode` from the place and moves the pin; "Use my pinned location" reverse-geocodes the pin into those fields; fields stay editable and unpersisted; validation unchanged; graceful fallback.

## Task 4: Live tracking map on the order page

Files: `app/customer/orders/[id]/page.tsx`, `lib/order-detail.ts` (add delivery address lat/lng and store lat/lng to the select/normalised model; keep existing consumers working), new `components/maps/OrderTrackingMap.tsx`.
- Per spec decision 7: store marker, delivery marker, partner marker (animated interpolation between pings), dashed straight line, bounds fit, 'Updated hh:mm:ss', approximate distance, waiting message before the first ping, final route when delivered, existing coordinate text kept as a collapsed detail. Reuse the existing 3 s poll (no extra requests). Check RLS visibility (stores public read, delivery address owner read, partner row only while assigned/picked_up) and handle null coordinates. Do not change the delivery animation dialog.

## Task 5: Knowledge, docs and manuals

- `knowledge/customer/*.md`: how to set your delivery location (search, pin, current location, manual) and how to see your delivery partner on the map; fact-check against the code; two eval cases whose `expectTitleIncludes` equals the exact new `##` headings. `docs/DEPLOYMENT.md`: a short 'Google Maps key' note (referrer restrictions, API restrictions, quotas/budget alert, the key is public by design). Web manual: Customer chapter sections on the location picker, checkout search and the tracking map (edit in place with python-docx or a throwaway node script; PDFs via LibreOffice; versions web v3.7; TOC only if pages change). README.md, CLAUDE.md, MEMORY.md entries (what was built, no new packages, fallbacks, key location, open items: re-ingest knowledge, optional mobile maps later).

## Task 6: Live verification (controller)

Per the spec's Testing section on a spare instance on an origin the key allows (Vishal adds `http://localhost:3010/*` and `http://localhost:3011/*` to the key's referrers); throwaway customer; SQL-inserted order with `session_replication_role = replica` and status assigned plus a partner ping updated by SQL; restore everything and re-count to the baseline.

## Task 7: Final review and PR

Final whole-branch review on the most capable model, one fix wave, scoped re-review, push, PR; merge only on Vishal's "you merge it".
