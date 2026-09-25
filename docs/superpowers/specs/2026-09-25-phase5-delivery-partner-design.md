# Phase 5 — Delivery Partner App + Live Tracking — Design

Date: 2026-09-25
Status: Approved (autonomous-mode ruling — see below)

## Goal

Delivery partner login, online/offline toggle, assigned-order view, status
updates, live location ping, customer-side live map. Per spec §7 Phase 5.

## Ruling: assignment without an admin dashboard yet

The spec's Phase 5 verify step says "manual assignment via admin for
testing" but the admin dashboard is Phase 6 — not built yet. Building
Phase 6 first would violate "build one phase at a time" in dependency
order the spec itself set (5 before 6). Ruling: Phase 5 ships a
**self-claim** model instead of admin-assignment — any online delivery
partner sees a list of unassigned `ready` orders and can claim one
(`delivery_partner_id` set, order moves to `assigned`). This is a strict
subset of the eventual n8n auto-assignment behavior (Phase 7 just
automates the claim instead of a human tapping a button) and needs no
admin surface. Cost if wrong: Phase 6/7 may want to change this to
admin/algorithm-driven assignment — cheap to swap since it's isolated to
one API route.

## Decisions

- **Auth**: same pattern as Phase 3/4 — `users.role = 'delivery'`,
  Supabase Auth, Bearer-token-derived identity on every write route.
  `delivery_partners` table (already in schema: `user_id` PK,
  `is_online`, `current_lat/lng`, `last_ping_at`, `vehicle_type`) holds
  partner-specific state.
- **Delivery partner signup**: included, mirroring Phase 4's vendor
  signup — email/password + full name + vehicle type. Creates the
  `public.users` row (`role='delivery'`) and a `delivery_partners` row
  (`is_online=false`).
- **Online/offline toggle**: a button in the delivery dashboard flips
  `delivery_partners.is_online`. Only online partners appear in the
  claimable-order list (server-enforced, not just UI-hidden).
- **Order claim**: `POST /api/delivery/orders/[id]/claim` — an online
  delivery partner claims one `ready`, unassigned order. Sets
  `delivery_partner_id`, moves status `ready -> assigned`. Rejects if the
  order isn't `ready`, already has a partner, or the caller isn't online.
- **Status updates**: delivery-partner-drivable chain
  `assigned -> picked_up -> delivered`, mirroring Phase 4's vendor
  transition-map pattern (`DELIVERY_STATUS_TRANSITIONS`), enforced
  server-side, ownership-scoped to `delivery_partner_id = caller`.
- **Location ping**: `POST /api/delivery/ping` updates the caller's own
  `current_lat/lng/last_ping_at` on their `delivery_partners` row.
  Client-side, the delivery dashboard calls this on an interval (e.g.
  every 15s) using the browser's `navigator.geolocation` API if
  available, falling back to the same manual lat/lng stub input pattern
  used everywhere else in this app (no Google Maps key yet, per
  CLAUDE.md).
- **Customer-side live map**: per spec §8's already-confirmed default,
  fanout is direct Supabase Realtime (skip n8n), not built via n8n.
  Given no Google Maps key, "live map" here means the same lat/lng stub
  approach — the customer's order-confirmation page (Phase 3, already
  polls order status) subscribes via Supabase Realtime to the assigned
  partner's `delivery_partners` row and displays raw lat/lng (a numeric
  readout, not an actual map pin) once status reaches `assigned` or
  later. A real map pin swaps in later when a Maps key exists — same
  swappable-stub pattern as the address picker.
- **RLS**: delivery partner may read/update only their own
  `delivery_partners` row; may read orders where
  `delivery_partner_id = auth.uid()` and update those orders' status
  (ownership + transition-map guarded, service-role API routes only —
  per Phase 4's final-review lesson, no RLS write policy is added for
  a table that's only ever written through a service-role route). A
  new read-only RLS policy lets a customer read their own order's
  assigned delivery partner's live location (needed for the Realtime
  subscription to work under the customer's own anon-key session) —
  scoped by `exists (select 1 from orders where orders.delivery_partner_id
  = delivery_partners.user_id and orders.customer_id = auth.uid())`.

## Error handling

- Claim race: two partners claiming the same order simultaneously — the
  claim update is guarded by `.eq("status", "ready").is("delivery_partner_id", null)`
  so only the first write wins; the loser gets a 409.
- Status-advance API rejects any transition outside the fixed forward
  chain, same pattern as Phase 4.
- Ping API rejects non-finite lat/lng.

## Testing

- Manual: sign up a delivery partner, go online, claim a Phase-4-ready
  test order, advance picked_up -> delivered, send a location ping,
  confirm the customer's order page reflects the partner's location via
  Realtime and the final `delivered` status.
- `npm run build` before marking any new page/route task done.

## Touches

`app/delivery/*`, `/api/delivery/*`, new migration for delivery RLS +
`DELIVERY_STATUS_TRANSITIONS` constant, `app/customer/orders/[id]/page.tsx`
(Realtime subscription addition).
