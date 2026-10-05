# Phone app: delivery location picker and live address search (design)

Date: 2026-10-05. Branch `mobile-location-picker`. Decisions by Vishal (2026-10-05): the phone calls Google directly with the Android key; a draggable map pin is in version 1; the saved location is stored on the account; autonomous mode (branch, PR, merge only on "you merge it").

## Goal

The Customer app on the phone gets what the website already has: live Google address suggestions while typing, "Use my current location", a map with a draggable pin, a saved delivery location shown on the Home bar, and address search at checkout that fills the address fields.

## Known limits of the "direct with Android key" choice

1. The Android key is restricted to package `com.freshquick.app` plus the build's SHA-1. Requests from the phone must send `X-Android-Package` and `X-Android-Cert` headers. This works in the NATIVE Android build only. In Expo Go (iPhone, and the emulator's Expo Go) Google rejects the calls, so the search box shows "Address search is not available in this build" and the manual fields still work. A fallback is mandatory and must never crash.
2. The key is embedded in the app bundle (extractable). It is restricted by package + SHA-1 and by API, which limits abuse.
3. Vishal must enable **Places API (New)** and **Geocoding API** on the Android key (API restrictions list) in Google Cloud Console. The SHA-1 for the debug build is the Expo debug certificate already on the key.
4. Pin dragging and "use my location" need only the Maps SDK and GPS, so they also work on iPhone Expo Go (Apple Maps), but reverse geocoding the pin to a text address uses Geocoding REST and is Android-native only; on failure the label falls back to the coordinates.

## Architecture

### Server (account storage)
- Migration `00000000000033_user_saved_location.sql`: nullable columns on `public.users`: `saved_lat numeric`, `saved_lng numeric`, `saved_label text`, with a check that lat is in -90..90, lng in -180..180, and that all three are set or all null. No new RLS policy: `users` already has owner read; writes go through a service-role route (project rule: no client write policies).
- `app/api/customer/location/route.ts`: `GET` returns `{location: {lat, lng, label} | null}`; `PUT` body `{lat, lng, label}` validates (finite numbers in range, label non-empty string up to 200 chars after trim) and saves; `DELETE` clears. Identity only from the verified Bearer token; the caller must be role `customer` (else 403). Coordinates are never logged. Pure validation in `lib/saved-location.ts` (unit tested; the route imports it).

### Mobile (`mobile/`)
- Byte-identical copies of web helpers, guarded in `tests/mobile-parity.test.mjs`: `mobile/lib/place.ts` <- `lib/maps/place.ts`, `mobile/lib/geolocation.ts` <- `lib/maps/geolocation.ts`.
- `mobile/lib/places-api.ts`: pure request builders and response parsers for Places API (New) `places:autocomplete` (region `in`, session token), place details (`GET /v1/places/{id}` with field mask `displayName,formattedAddress,location,addressComponents`) and Geocoding reverse (`maps.googleapis.com/maps/api/geocode/json?latlng=`), plus thin `fetch` wrappers with a timeout, headers `X-Goog-Api-Key`, `X-Android-Package: com.freshquick.app`, `X-Android-Cert: <sha1 hex, no colons>`. Key and cert come from `Constants.expoConfig.extra` (set in `mobile/app.config.js` from `GOOGLE_MAPS_ANDROID_API_KEY` and a new non-secret `GOOGLE_MAPS_ANDROID_CERT_SHA1` with the Expo debug SHA-1 as default). Missing key => `isPlacesAvailable()` false. Errors map to a typed `PlacesError`, never thrown raw into UI.
- `mobile/lib/location-store.tsx`: `LocationProvider` + `useDeliveryLocation()` returning `{location, setLocation, clearLocation, ready}`. Shape `{lat, lng, label}`. Cached in AsyncStorage key `freshquick.location.v1` (so the Home bar is instant), synced with the account via `apiFetch("/api/customer/location")` (GET on sign-in/mount; PUT on change; server value wins on first load when the cache is empty, otherwise the newest local choice is pushed). Sign-out/account switch must not leak: cache key is cleared when the session user changes (follow how the cart store handles it). Failure to reach the server keeps the local choice.
- `mobile/components/LocationSheet.tsx`: full-screen modal opened from the Home pill: search box with live suggestions (debounced 300 ms, ignore stale responses), "Use my current location" (expo-location foreground permission, `getCurrentPositionAsync` Balanced, then reverse geocode), a `react-native-maps` MapView with a draggable marker and tap-to-move (reverse geocode on drop, coordinates label on failure), a "Confirm location" button that saves. Wrapped in an error boundary; map failure leaves search/GPS usable. Search/GPS choices apply and close at once only after the map step is not required: picking a suggestion or GPS moves the pin and selects it (same as web: applies at once and closes); dragging the pin needs Confirm.
- Home (`home.tsx`): the pill shows the saved label (or "Set delivery location"), opens the sheet instead of the "Coming soon" alert; stores get `lat, lng` selected and the list is sorted nearest-first using `haversineDistanceKm` when a location exists (stores without coordinates last). Heading stays "Restaurants near you".
- Checkout (`checkout.tsx`): an "Search for your address" box (shared `AddressSearchBox` component, same suggestions logic) that fills Address 1, City, State, Pincode and remembers the picked lat/lng for the order; a "Use my saved location" button prefilling from the saved pin via `toAddressFormFields` and reverse geocoding when available. The submitted `deliveryAddress.lat/lng` use the picked point, else the saved location, else 0/0 as today (server requires finite numbers). The checkout fields remain unsaved (privacy rule); only the delivery location pin is saved.
- Zippy: `mobile/lib/zippy-location.ts` prefers the saved location over a GPS fix when the question asks about nearby stores (no permission prompt if a saved pin exists).
- `expo-location` config plugin / permissions: add to `mobile/app.json` plugins only if the native build lacks `ACCESS_FINE_LOCATION` (a native rebuild is then required); check `mobile/android/app/src/main/AndroidManifest.xml` first.

## Out of scope
Server proxy for Places (iPhone Expo Go search stays manual), saving multiple addresses, Directions on the phone, web changes.

## Verification (mandatory)
- Unit tests: validation, parsers, request builders, store logic (pure parts), parity.
- curl: `PUT/GET/DELETE /api/customer/location` with a fresh fake customer (`@example.invalid`), 401 without token, 403 for a non-customer, bad values rejected.
- Native Android build on the emulator: live suggestions while typing, choose one, GPS via `adb emu geo fix`, drag pin, saved label survives app restart and shows after clearing the AsyncStorage cache (server sync), checkout search fills fields and the order payload carries non-zero lat/lng (do NOT place an order; Gmail is live; check payload by reading the screen state / network only up to the Place order button), failure fallback (airplane mode or missing key) without a crash.
- iPhone Expo Go: Vishal's check (manual fallback message, GPS and pin).
- Review: Opus whole-branch review; redaction/ownership review of the new route.

## Docs afterwards
Mobile manual (new section, emulator figures), knowledge Q&As (`knowledge/customer/ordering-mobile.md`; fact-check against code), `docs/ANDROID_TESTING.md` (enable Places API (New) + Geocoding on the Android key), CLAUDE.md, MEMORY.md, README.md; re-ingest and eval re-run by Vishal.
