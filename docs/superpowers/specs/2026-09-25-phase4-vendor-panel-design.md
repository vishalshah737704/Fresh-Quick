# Phase 4 — Restaurant/Vendor Panel — Design

Date: 2026-09-25
Status: Approved (autonomous-mode decisions confirmed by Vishal)

## Goal

Vendor login, menu CRUD, incoming order queue, accept/prepare/ready status
controls. Per spec §7 Phase 4.

## Decisions

- **Auth**: reuse the Phase 3 customer auth pattern exactly. `public.users.role`
  already supports `'vendor'`. Login checks `role = 'vendor'` after
  authenticating, redirects to `/vendor/*`. Same Bearer-token-derived-identity
  rule applies to every vendor API route (never trust a client-supplied id).
- **Vendor-restaurant association**: `restaurants.owner_id` already exists
  (FK to `users.id`) — no schema change needed. A vendor's restaurant is
  looked up by `owner_id = auth user id`.
- **Vendor signup**: included this phase. Signup form collects
  email/password + restaurant name, cuisine tags (multi-select from the
  existing `cuisine_taxonomy` table), and a manual lat/lng (reusing Phase 2's
  address-picker stub pattern) for the restaurant's location. On submit:
  create the `auth.users` row (Supabase Auth signup), create the matching
  `public.users` row with `role='vendor'`, then create one `public.restaurants`
  row with `owner_id` = the new user, `is_open=false` until the vendor adds
  at least one menu item (avoids empty restaurants appearing orderable).
  One vendor = one restaurant for v1 (matches schema: no join table).
- **Menu item images**: URL text field only, same as seed data. No Storage
  bucket, no upload UI this phase.
- **Menu CRUD**: create/edit/delete `menu_items` scoped to the vendor's own
  restaurant only (RLS-enforced, not just UI-hidden). Toggle `is_available`.
- **Order queue**: list `orders` for the vendor's restaurant, joined to
  `order_items`/`menu_items` for line-item display, filterable/sorted by
  status. Vendor advances status along the fixed chain:
  `placed → accepted → preparing → ready`. No skipping, no reverse. Statuses
  past `ready` (`assigned`, `picked_up`, `delivered`) belong to Phase 5/6 and
  are not vendor-editable.
- **`order_items` RLS gap**: close it now instead of re-opening broadly.
  New policy: a vendor (via `users.role='vendor'`) may `select` `order_items`
  rows whose `order_id` belongs to an order whose `restaurant_id` is owned by
  that vendor. Customers keep their existing owner-only read from Phase 3.
  Drop the old permissive "any authenticated user" stub policy on
  `order_items`.
- **`orders`/`restaurants` RLS**: add vendor-scoped policies analogous to the
  above — a vendor may `select`/`update` (status only, via API not raw
  client writes) orders for restaurants they own; a vendor may
  `select`/`insert`/`update` their own `restaurants` and `menu_items` rows.

## Data flow

1. Vendor logs in (`/vendor/login`) → Supabase Auth → check `role='vendor'`
   in `public.users` → redirect `/vendor/dashboard`.
2. Dashboard loads the vendor's restaurant (`owner_id = session user`), its
   menu items, and open orders — all via RLS-scoped queries using the
   session's own Supabase client (no service-role needed for reads).
3. Menu CRUD and order-status-advance go through `/api/vendor/menu-items/*`
   and `/api/vendor/orders/[id]/status` routes that verify the Bearer token,
   resolve the vendor's `restaurant_id` server-side, and re-validate that the
   target row belongs to that restaurant before writing (defense in depth
   beyond RLS, matching the Phase 3 checkout pattern).

## Error handling

- Vendor signup: duplicate email surfaces Supabase Auth's existing error.
- Status-advance API rejects any transition outside the fixed forward chain
  (400, not a silent no-op).
- Menu CRUD API rejects negative/zero prices client- and server-side
  (money-math rule: integer paise, same as Phase 3).

## Testing

- Manual: sign up a new vendor, add a menu item, place a Phase-3-style test
  order as a customer against that restaurant, confirm it appears in the
  vendor queue, advance it through accepted → preparing → ready, confirm
  customer's order-status polling page reflects each change.
- `npm run build` before marking any page/route task done.

## Touches

`app/vendor/*`, `/api/vendor/*`, new migration for RLS policies
(`order_items`, `orders`, `restaurants`, `menu_items` vendor scoping),
`supabase/migrations/*`.
