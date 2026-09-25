# Phase 6 — Admin Dashboard — Design

Date: 2026-09-25
Status: Approved (autonomous-mode ruling — see below)

## Goal

Oversight views — all orders, all restaurants (approve/suspend), all
delivery partners, manual reassignment tool. Per spec §7 Phase 6.

## Ruling: admin account provisioning

The spec has no signup flow for `role='admin'` (correctly — admin
accounts shouldn't be self-service). Ruling: seed exactly one demo admin
account via a new migration (email/password known to the developer,
documented in README), matching how Phase 1 already seeded a demo
vendor/restaurant. No `/admin/signup` route is built. Cost if wrong: if a
real multi-admin story is needed later, adding an admin-invite flow is a
small additive change, not a rework.

## Decisions

- **Auth**: same pattern as Phases 3-5 — `users.role = 'admin'`, Supabase
  Auth, Bearer-token-derived identity on every write route. Login page at
  `/admin/login`, no signup mode.
- **Orders view**: `GET /api/admin/orders` — every order across all
  restaurants, with restaurant name, customer name, status, total;
  filterable by status via a query param. Read-only (no admin order
  mutation in v1 — matches spec's listed endpoints, which only list
  `/api/admin/orders` and `/api/admin/restaurants`, not an order-mutate
  endpoint).
- **Restaurants view**: `GET /api/admin/restaurants` (all restaurants,
  any `is_open` state) + `POST /api/admin/restaurants/[id]/suspend` and
  `POST /api/admin/restaurants/[id]/unsuspend`. "Suspend" reuses the
  existing `is_open` column set to `false` plus a new `is_suspended`
  boolean column (so a vendor-closed restaurant and an admin-suspended
  one are distinguishable — a vendor shouldn't be able to un-suspend
  themselves by toggling their own `is_open`, which Phase 4 already
  guards server-side via ownership-scoped routes, but the vendor's menu
  page has no is_open toggle yet per Phase 4's deferred item, so this is
  mostly forward-looking safety). Suspending sets `is_open=false` and
  `is_suspended=true`; the customer browse query (Phase 2) already
  filters on `is_open`, so a suspended restaurant disappears immediately
  without needing a customer-side code change.
- **Delivery partners view**: `GET /api/admin/delivery-partners` — all
  partners with online status and last ping.
- **Manual reassignment tool**: `POST /api/admin/orders/[id]/reassign` —
  admin sets `delivery_partner_id` directly, for the case a Phase 5
  self-claimed order needs to move to a different partner (e.g. the
  original partner went offline mid-delivery). Only allowed while status
  is `assigned` or `picked_up` (not before assignment, not after
  delivery).
- **RLS**: per the Phase 4/5 lesson, no RLS write policies for any table
  here — every admin write goes through a service-role route, ownership
  is "is this user an admin", verified server-side via
  `resolveAdmin(token)`, not via RLS. A read policy letting an admin read
  all rows of `orders`/`restaurants`/`delivery_partners` is added (and,
  per the new CLAUDE.md rule, this migration explicitly re-checks every
  table it touches for a leftover Phase-1 stub policy before writing new
  ones).

## Error handling

- Reassign API rejects if the target partner isn't currently online, or
  if the order isn't in `assigned`/`picked_up` status.
- Suspend API is idempotent (suspending an already-suspended restaurant
  is a no-op 200, not an error).

## Testing

- Manual: seed admin logs in, sees live order/restaurant/partner counts
  matching direct DB queries, suspends a Phase-4-style test restaurant,
  confirms it disappears from `/customer` browse, reassigns a Phase-5
  test order to a different online partner.
- `npm run build` before marking any new page/route task done.

## Touches

`app/admin/*`, `/api/admin/*`, new migration (admin read RLS +
`restaurants.is_suspended` column + seeded admin account), `supabase/migrations/*`.
