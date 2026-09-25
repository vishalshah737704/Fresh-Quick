# Food Delivery Platform — Design Spec

Date: 2026-09-24
Status: Draft, pending approval

## 1. Goal

Swiggy-style food delivery platform (functional clone, no brand assets). This
spec covers the web platform: four surfaces in one Next.js project — customer
app, restaurant/vendor panel, delivery partner app, admin dashboard. Supabase
(Postgres + Auth + Storage), self-hosted locally via Docker, as datastore/auth.
n8n owns automation/orchestration (notifications, status propagation, delivery
assignment). Payments are mocked (swappable for real gateway later, no schema
change needed). Google Maps for address picking + live delivery tracking.
A React Native + Expo mobile app (customer + delivery partner surfaces) is
planned as a follow-on sub-project after this web platform ships — see
section 2, "Mobile app".

## 2. Decisions locked in during brainstorming

- **Cart**: single-restaurant only. Adding an item from a different restaurant
  prompts "clear cart?" before switching.
- **Delivery assignment**: straight-line (Haversine) nearest available partner.
  No live routing/traffic in v1.
- **Cuisine/category taxonomy**: fixed predefined list, seeded in DB, vendor
  picks from dropdown.
- **Auth**: one Supabase Auth table, `role` column (customer / vendor / delivery /
  admin) drives redirect after login. One signup form, role chosen or assigned.
- **Database hosting**: self-hosted Supabase via Docker Compose, running fully
  on local machine — Postgres + Auth + Storage + Realtime + DB webhooks, same
  API surface as spec sections 3-6, zero cloud cost, no row/storage cap beyond
  local disk. No hosted Supabase project.
- **Mobile app**: IN SCOPE overall, but sequenced as its own sub-project
  after this web spec's 8 phases complete. Platform: React Native + Expo
  (shares Supabase client/API routes/auth with web, separate codebase).
  Surfaces: customer app (browse/cart/checkout/track) + delivery partner
  app (assigned orders, status updates, GPS location ping) — vendor and
  admin stay web-only, same as real Swiggy's split. Web app itself stays
  responsive for phone-browser use in the meantime. Mobile gets its own
  brainstorm → spec → plan cycle once web Phase 8 is done; this document
  does not include mobile phase breakdown.
- **Branding**: placeholder name ("FoodHub") + generic warm orange/red theme,
  no logo. Swappable later without rework — name/colors isolated to a
  `lib/branding.ts` constants file and Tailwind theme tokens, not hardcoded
  through components.

## 3. Architecture Overview

```
                              ┌─────────────────────┐
                              │      Next.js App     │
                              │  (single deployment)  │
                              ├──────────┬───────────┤
        /customer/*           /vendor/*    /delivery/*   /admin/*
     (browse, cart, order)  (menu, orders) (assigned runs) (oversight)
                              └──────────┬───────────┘
                                         │ Supabase JS client (RLS-scoped)
                                         ▼
                          ┌──────────────────────────────┐
                          │           Supabase             │
                          │  Postgres  |  Auth  |  Storage  │
                          │  (RLS policies per role)         │
                          └───────────────┬──────────────┘
                                          │ DB webhooks / triggers
                                          ▼
                          ┌──────────────────────────────┐
                          │              n8n                │
                          │  order-placed, status-change,   │
                          │  payment-mock, assignment,       │
                          │  notifications                   │
                          └───────────────┬──────────────┘
                                          │ REST calls back to Next.js API routes
                                          ▼
                          ┌──────────────────────────────┐
                          │   Next.js API routes (/api/*)  │
                          │  thin: validate + write to DB   │
                          └──────────────────────────────┘

              Google Maps JS SDK: address picker (customer), live
              partner-location map (delivery app + customer tracking view)
```

**Why this split**: application code (Next.js + Supabase) owns CRUD, auth, and
UI state — things that must respond instantly to a user action. n8n owns
*cross-actor* workflows — things that happen because of an event and must
notify/coordinate other actors (restaurant, delivery partner, customer) without
the frontend needing to know about all of them. This keeps the Next.js codebase
simple (no notification/matching logic baked into route handlers) and keeps
automation changes (e.g. tweaking assignment logic) out of app deploys.

## 4. Data Model (Postgres / Supabase)

Core tables, key fields only (types simplified; all tables get `id uuid pk
default gen_random_uuid()`, `created_at timestamptz default now()`).

**users** (mirrors `auth.users`, extended profile)
- `id uuid pk` (= auth.users.id)
- `role text` — customer | vendor | delivery | admin
- `full_name text`, `phone text`, `avatar_url text`

**addresses**
- `id`, `user_id fk users`, `label text` (home/work/other), `line1 text`,
  `lat numeric`, `lng numeric`, `is_default boolean`

**restaurants**
- `id`, `owner_id fk users` (role=vendor), `name text`, `cuisine_tags text[]`
  (from fixed taxonomy), `address_id fk addresses`, `lat numeric`, `lng
  numeric`, `is_open boolean`, `avg_prep_minutes int`, `rating numeric`,
  `banner_url text`

**menu_items**
- `id`, `restaurant_id fk restaurants`, `name text`, `description text`,
  `price numeric`, `category text`, `is_veg boolean`, `is_available boolean`,
  `image_url text`

**orders**
- `id`, `customer_id fk users`, `restaurant_id fk restaurants`,
  `delivery_partner_id fk users nullable`, `delivery_address_id fk addresses`,
  `status text` — placed | accepted | preparing | ready | assigned |
  picked_up | delivered | cancelled, `subtotal numeric`, `delivery_fee
  numeric`, `total numeric`, `placed_at timestamptz`

**order_items**
- `id`, `order_id fk orders`, `menu_item_id fk menu_items`, `quantity int`,
  `unit_price numeric` (snapshot at order time)

**delivery_partners** (extends users where role=delivery)
- `user_id pk fk users`, `is_online boolean`, `current_lat numeric`,
  `current_lng numeric`, `last_ping_at timestamptz`, `vehicle_type text`

**payments**
- `id`, `order_id fk orders`, `method text` (mock_card/mock_upi/mock_cod),
  `status text` — pending | success | failed, `amount numeric`,
  `mock_reference text`, `paid_at timestamptz`
  *(designed so a real gateway just adds `gateway_reference`/`gateway_name`
  columns later — no structural change)*

**reviews**
- `id`, `order_id fk orders`, `customer_id fk users`, `restaurant_id fk
  restaurants`, `rating int`, `comment text`

Relationships: users 1—N addresses; users(vendor) 1—N restaurants;
restaurants 1—N menu_items; users(customer) 1—N orders; orders 1—N
order_items; orders 1—1 payments; users(delivery) 1—N orders (as assigned
partner); orders 1—1 review (optional).

## 5. n8n Automation Workflows

n8n is triggered by **Supabase Database Webhooks** (row insert/update on
`orders`, `payments`) calling n8n's webhook URLs. n8n then calls back into
Next.js **internal API routes** (`/api/internal/*`, service-role protected)
to write results, and calls Supabase directly for reads where convenient.

1. **Order Placed** — trigger: insert on `orders` (status=placed).
   Action: notify restaurant (in-app + email via Supabase), lock in
   `payments` row as pending.
2. **Payment Mock Confirmation** — trigger: insert/update on `payments`.
   Action: simulate gateway delay, set `status=success|failed` (weighted
   random or explicit "fail" test party), on success call
   `/api/internal/orders/:id/confirm` to flip order to `accepted`-eligible
   and generate a receipt (stored in Supabase Storage as text/HTML), on
   failure notify customer.
3. **Restaurant Accepts / Status Change** — trigger: update on `orders.status`
   (restaurant panel writes `accepted`/`preparing`/`ready`). Action: push
   realtime update to customer (Supabase Realtime channel) + notification.
4. **Delivery Partner Assignment** — trigger: `orders.status = ready`.
   Action: query online delivery_partners, compute Haversine distance from
   restaurant lat/lng, pick nearest, write `orders.delivery_partner_id`,
   set status=assigned, notify that partner (and next-nearest as fallback
   if no accept within timeout — v1: single attempt, admin can manually
   reassign).
5. **Delivery Status Propagation** — trigger: update on
   `orders.status` (picked_up, delivered) written by delivery app.
   Action: push realtime update to customer, on `delivered` mark
   payment finalized and prompt review.
6. **Delivery Partner Location Ping Fanout** (optional/lightweight) —
   trigger: update on `delivery_partners.current_lat/lng`. Action:
   forward to a Supabase Realtime channel the customer tracking view
   subscribes to (may bypass n8n entirely via Supabase Realtime directly —
   see Open Question below, default: skip n8n, use Realtime directly for
   perf).

**What stays in application code**: all CRUD (menu edit, cart, address
book), auth/session handling, Google Maps rendering, Realtime subscriptions
themselves. **What n8n owns**: anything that must coordinate across actors
or run a multi-step decision (assignment logic, notification fanout, mock
payment simulation, receipt generation).

## 6. API Contract (selected key endpoints)

| Method | Path | Caller | Purpose |
|---|---|---|---|
| GET | /api/restaurants?lat&lng | customer app | list restaurants near address |
| GET | /api/restaurants/:id/menu | customer app | menu items for restaurant |
| POST | /api/cart/checkout | customer app | create order + order_items + payment(pending) |
| POST | /api/internal/payments/:id/result | n8n | write mock payment result |
| PATCH | /api/orders/:id/status | vendor app | restaurant updates order status |
| GET | /api/vendor/orders | vendor app | restaurant's incoming orders |
| PATCH | /api/menu-items/:id | vendor app | edit item availability/price |
| POST | /api/internal/orders/:id/assign | n8n | write matched delivery_partner_id |
| PATCH | /api/delivery/orders/:id/status | delivery app | picked_up/delivered updates |
| PATCH | /api/delivery/location | delivery app | update current_lat/lng (throttled) |
| GET | /api/admin/orders | admin dashboard | all orders, filters |
| GET | /api/admin/restaurants | admin dashboard | vendor oversight, approve/suspend |
| POST | /api/reviews | customer app | submit review post-delivery |
| Supabase DB Webhook | orders insert/update | → n8n | trigger workflows 1,3,4,5 |
| Supabase DB Webhook | payments insert/update | → n8n | trigger workflow 2 |

Auth on all `/api/*` via Supabase session (RLS enforces row ownership by
role); `/api/internal/*` guarded by service-role secret header, called only
by n8n.

## 7. Phased Build Plan

**Phase 1 — Scaffold + DB schema**
Goal: Next.js project set up, self-hosted Supabase running locally via
Docker Compose (`supabase start` CLI or docker-compose.yml), all tables
above migrated, RLS policies stubbed, seed script for cuisine taxonomy +
demo data, `lib/branding.ts` placeholder constants + Tailwind theme tokens.
Touches: `package.json`, `docker-compose.yml` (or `supabase/config.toml`),
`supabase/migrations/*`, `lib/supabase.ts`, `lib/branding.ts`, `.env`
Verify: `docker compose up` (or `supabase start`) brings up local stack;
`npm run dev` loads blank home page; local Supabase Studio (http://localhost)
shows all 9 tables; seed script runs without error.

**Phase 2 — Customer browse + cart**
Goal: location-based restaurant list, menu view, single-restaurant cart
(client state), Google Maps address picker.
Touches: `app/customer/*`, `components/RestaurantCard`, `components/Cart`,
`lib/cart-store.ts`
Verify: manually browse restaurants seeded in Phase 1, add items to cart,
switch restaurant triggers clear-cart prompt.

**Phase 3 — Checkout + mock payment**
Goal: order placement flow, mock payment method selection, order
confirmation screen with live status polling/realtime.
Touches: `app/customer/checkout/*`, `/api/cart/checkout`,
`/api/internal/payments/*`
Verify: place test order, see payment resolve to success/failed, order
appears with correct status in DB.

**Phase 4 — Restaurant/vendor panel**
Goal: vendor login, menu CRUD, incoming order queue, accept/prepare/ready
status controls.
Touches: `app/vendor/*`, `/api/vendor/*`, `/api/menu-items/*`
Verify: log in as seeded vendor, edit a menu item, see Phase-3 test order
in queue, advance its status.

**Phase 5 — Delivery partner app + live tracking**
Goal: delivery partner login, online/offline toggle, assigned-order view,
status updates, live location ping, customer-side live map.
Touches: `app/delivery/*`, `/api/delivery/*`, Google Maps live marker
component
Verify: mark test partner online, trigger n8n assignment (Phase 7 wiring
needed for full auto-assign — until then, manual assignment via admin for
testing), update status through pickup/delivered, confirm customer map
view updates.

**Phase 6 — Admin dashboard**
Goal: oversight views — all orders, all restaurants (approve/suspend), all
delivery partners, manual reassignment tool.
Touches: `app/admin/*`, `/api/admin/*`
Verify: admin login shows live counts matching DB state; suspend a
restaurant and confirm it disappears from customer browse.

**Phase 7 — n8n automation wiring**
Goal: all 5 (6) workflows built in n8n, Supabase DB webhooks configured,
end-to-end flow (place order → payment → restaurant notified → ready →
auto-assigned → delivered) works without manual admin steps.
Touches: n8n workflow exports (`n8n/workflows/*.json` checked into repo for
reference), Supabase webhook config, `/api/internal/*` routes
Verify: place one real order through customer UI and watch it move through
every status automatically, ending in `delivered`, with correct partner
assignment by distance.

**Phase 8 — Polish/testing**
Goal: error states, loading states, empty states, basic responsive pass,
smoke test each of the 4 surfaces.
Touches: various, plus `README.md` run instructions
Verify: click through all 4 surfaces on mobile viewport width, no console
errors, README instructions reproduce a clean local run.

## 8. Open questions carried forward (non-blocking, resolve during phase 7)

- Delivery ping fanout: confirmed default is direct Supabase Realtime
  (skip n8n hop) for perf — revisit only if n8n needs to react to location
  (e.g. geofence arrival detection) later.
- Assignment fallback/timeout behavior beyond "admin manual reassign" is
  out of scope for v1.
