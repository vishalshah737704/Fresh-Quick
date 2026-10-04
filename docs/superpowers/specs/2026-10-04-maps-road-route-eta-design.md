# Maps: road route and ETA on the order tracking map

Date: 2026-10-04. Status: approved by the controller under Vishal's autonomous instruction (decisions listed below; cost if wrong is small rework). Scope: web Customer order page only. Phone maps and public-launch hardening stay parked.

## Intent

The tracking map draws a dashed straight line and says the distance is approximate. The customer wants to see the road the partner will take and "about N min away". Success: while an order is assigned or picked up and the partner has a ping, the map shows a solid road route from the partner to the delivery address and the text "About N min · X km by road"; a delivered order shows the road route from store to address; when the route cannot be fetched, the current dashed line and straight-line distance remain, with no error shown beyond today's behaviour.

## Decisions

1. **API:** the Maps JavaScript API `routes` library (`google.maps.routes.Route.computeRoutes`), which uses the Routes API with the existing browser key. The legacy Directions API is closed to new projects, so it is not used. No server route, no new npm package, no new env var.
2. **Vishal must enable "Routes API"** in Google Cloud and add it to the key's API restriction list. Until then every request fails and the map falls back to the straight line (fail-safe by design). Live verification waits for this.
3. **Travel mode:** `DRIVING`, `TRAFFIC_UNAWARE` (cheapest billing tier, ETA is typical-road time). Two-wheeler mode is a later tweak.
4. **Cost control:** request only when needed. Origin is the partner (live) or the store (delivered); destination is the delivery address. A new request is made when (a) there is none yet, or (b) the origin moved more than 150 m from the origin of the last request AND at least 30 s have passed, or (c) the destination changed. Failed requests back off 60 s. At most one request in flight. Delivered orders request once.
5. **Display:** solid polyline (brand ink, weight 4) from the route path. The dashed straight line is shown only when no road route is available. ETA text replaces "about X from your address" when a route exists; the "dashed line is straight" footnote shows only in the fallback case.
6. **Pure logic** lives in `lib/maps/route.ts` (no imports, node-testable): `shouldRequestRoute`, `routeKey`, `formatEta`, `formatRouteDistance`, `parseRoute` (validates the raw API result into `{path, durationSeconds, distanceMeters}` or null). Types for the library go in `lib/maps/types.ts`; the loader gains `loadRoutesLibrary()`.
7. **Privacy:** the destination coordinates already reach the customer's own browser and Google Maps already receives them for tiles and geocoding. The route request sends the same coordinates to Google from the customer's browser only. Delivery and vendor surfaces are untouched.

## Files

- Create `lib/maps/route.ts`, `tests/maps-route.test.mjs`.
- Modify `lib/maps/types.ts`, `lib/maps/loader.ts`, `components/maps/OrderTrackingMap.tsx`.
- Docs after verification: knowledge Q&A in `knowledge/customer/ordering-web.md` (fact-checked), web manual note, MEMORY/CLAUDE/README entries.

## Failure handling

Routes library missing, API not enabled, quota, network or malformed result: log once with `console.warn`, keep the straight line, retry after the 60 s back-off. Never break the page (existing error boundary and `fail` path stay).

## Testing

Unit: the pure helpers (thresholds, back-off, formatting such as 59 s, 1 min, 62 min, 1 h 5 min, malformed results). Types: `tsc` root. Live: spare instance on a port in the key's referrer list, real browser, an SQL-inserted test order (no n8n trigger, no Gmail), once Routes API is enabled; confirm the solid route, the ETA text, refresh when the partner moves, and the fallback with the API disabled or blocked.
