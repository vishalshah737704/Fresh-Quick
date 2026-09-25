# Fresh & Quick — Food Delivery Platform

Local-only development stack. No cloud services required. See
[MEMORY.md](MEMORY.md) for what's built so far and
[docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md](docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md)
for the full design.

## Prerequisites
- Node.js 20+
- Docker Desktop (running)

## Setup

1. `npm install`
2. `npx supabase start` — starts local Postgres/Auth/Storage/Realtime in Docker
3. Copy the API URL and anon key printed by step 2 into `.env.local`
   (see `.env.example` for the required variable names). Also add a
   `PEXELS_API_KEY` if you plan to re-run the menu-image fetch (optional —
   the seeded demo data already has image URLs baked in). `N8N_INTERNAL_SECRET`
   only matters if you're wiring up the n8n reference workflows (see below);
   any non-empty value works for local testing of the `/api/internal/*`
   routes directly.
4. `npm run app:seed` — applies migrations and seed data (wraps `npx supabase db reset`)
5. `npm run dev` — starts the Next.js app at http://localhost:3000, redirects to `/customer`

For a production build/start instead of the dev server, or for a full
deployment walkthrough, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and
the `scripts/` folder (`npm run app:build` / `app:start` / `app:stop` /
`app:seed`, with `.ps1` convenience wrappers for PowerShell).

## Trying the customer flow

Browse restaurants at `/customer` (no login needed). The home page has a
DoorDash-style layout: a left sidebar (Home/Restaurants/Orders/Account),
a header with the address picker, a visual-only Delivery/Pickup toggle
(Pickup is disabled — no pickup flow exists), and cuisine-grouped
horizontal carousel rows (falls back to a flat grid if a cuisine chip is
selected, or if any restaurant doesn't fit a known cuisine row). Search
restaurants or cuisines by name or label in the header search box. Adding
an item to cart and clicking Checkout will prompt you to sign up / log in
first (`/customer/login`, a re-skinned card — same email/password flow,
account created locally). Checkout is a single-page, two-column layout
(address + payment method as selectable cards on the left, a sticky
order-summary card with the place-order button on the right). Complete
checkout with any mock payment method ("Cash on Delivery" always
succeeds; card/UPI resolve randomly ~80% success) to land on the order
confirmation page, which now shows a 4-step status timeline
(Placed/Preparing/On the way/Delivered) instead of a plain text line,
plus a bordered coordinate box in place of a live map once a delivery
partner is assigned (no Google Maps key yet).

## Trying the vendor flow

Sign up a restaurant at `/vendor/login` (toggle to "New restaurant? Sign
up") — collects email/password, restaurant name, cuisine tags, and a
lat/lng stub for location. The new restaurant starts closed (`is_open =
false`); add at least one available menu item at `/vendor/menu`, then use
the "Open restaurant" toggle on `/vendor/dashboard` (it refuses to open
with zero available menu items). Place a customer order
against that restaurant (once opened) to see it appear in `/vendor/orders`
and advance it through accepted → preparing → ready.

## Trying the delivery partner flow

Sign up at `/delivery/login` (toggle to "New partner? Sign up") — collects
email/password, full name, and vehicle type. Toggle online on the
dashboard (`/delivery/dashboard`); a `ready` order with no partner
assigned yet will appear under "Available orders" for any online partner
to claim (no admin-assignment step — see MEMORY.md's Phase 5 entry for
why). After claiming, advance the order picked_up → delivered from the
same dashboard. While online, the dashboard pings a lat/lng every 15 seconds (prefilled
from the browser's own geolocation when permission is granted, falling
back to manual entry); the customer's order-confirmation page shows that
location as a plain coordinate readout once the order reaches `assigned`
(access expires once the order is `delivered`). Once an order is
`assigned` or `picked_up`, the "View address" action on the partner's own
delivery card shows the customer's delivery address.

## Trying the admin flow

Log in at `/admin/login` with the seeded demo account —
`admin@foodhub.local` / `admin-demo-password` (no signup; admin accounts
are seeded, not self-service). The dashboard (`/admin/dashboard`) shows
every order, restaurant, and delivery partner. Suspend/unsuspend a
restaurant to see it disappear from/reappear on `/customer` browse. For
an order in `assigned` or `picked_up` status, use the reassign dropdown
(lists currently-online delivery partners) to move it to a different
partner.

## n8n automation (verified end-to-end 2026-09-25)

`/api/internal/*` routes exist for n8n to call (shared-secret
`X-Internal-Secret` header, `N8N_INTERNAL_SECRET` in `.env.local`) and
`n8n/workflows/*.json` has one exported workflow per spec's automation
list. As of 2026-09-25 all 5 have been imported into a real local n8n
instance, wired to the local Supabase stack via
`supabase/migrations/00000000000015_n8n_webhooks.sql`, and driven
end-to-end through the real app UI — see `docs/n8n-webhook-setup.md`
section 6 for per-workflow results and section 1 for the confirmed-
working docker run command (two env-var gotchas fixed there:
`SUPABASE_URL` needs `host.docker.internal`, and
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` is required). Everything else in
this README (checkout, vendor, delivery, admin flows) still works today
without n8n running — those synchronous paths stay as the tested demo
behavior regardless of whether n8n is connected.

## Status

All 8 phases of the web platform (spec §7) are built: customer browse/
cart/checkout, vendor panel, delivery partner app, admin dashboard, an
n8n-facing internal API and 5 n8n workflows (all verified end-to-end
against a real local n8n instance as of 2026-09-25 — see the n8n section
above), and a Phase 8 polish pass
(loading/error/empty states audited across all four surfaces at a 390px
mobile viewport, no console errors found on any of the eight pages
checked). A post-Phase-8 deferred-items triage then closed most of the
remaining "Known deferred items" — vendor restaurant open/close toggle,
checkout atomicity (Postgres RPC), delivery address visibility,
geolocation-assisted location ping, closed-restaurant menu-page guard,
and several smaller polish items. A second redesign pass (the
DoorDash-layout rebuild) then restructured the customer surface's layout
— sidebar nav, fuller header, cuisine-grouped carousel rows — on top of
the earlier color/brand redesign. See [MEMORY.md](MEMORY.md) for the
phase-by-phase build log, including every bug found and fixed along the
way, and its "Known deferred items" section for what's still
intentionally left for later. The React Native mobile app is a planned
follow-on, not started.

## Local service URLs
- App: http://localhost:3000
- Supabase Studio: http://localhost:54323
- Supabase API: http://localhost:54321

## Stopping
`npm run app:stop` stops the Next.js server and the local Supabase Docker
containers together (`npm run app:stop -- --keep-supabase` to leave the
database running). Or just `npx supabase stop` to stop the database alone.
