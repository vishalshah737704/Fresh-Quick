# FoodHub — Food Delivery Platform

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
4. `npx supabase db reset` — applies migrations and seed data
5. `npm run dev` — starts the Next.js app at http://localhost:3000, redirects to `/customer`

## Trying the customer flow

Browse restaurants at `/customer` (no login needed). Adding an item to
cart and clicking Checkout will prompt you to sign up / log in first
(`/customer/login`) — use any email/password, the account is created
locally. Complete checkout with any mock payment method ("Cash on
Delivery" always succeeds; card/UPI resolve randomly ~80% success) to see
the order confirmation page.

## Trying the vendor flow

Sign up a restaurant at `/vendor/login` (toggle to "New restaurant? Sign
up") — collects email/password, restaurant name, cuisine tags, and a
lat/lng stub for location. The new restaurant starts closed (`is_open =
false`); there is no in-product "open restaurant" toggle yet (Phase 4
follow-up — flip it via Supabase Studio's `restaurants` table for now).
Add at least one menu item at `/vendor/menu`, then place a customer order
against that restaurant (once opened) to see it appear in `/vendor/orders`
and advance it through accepted → preparing → ready.

## Trying the delivery partner flow

Sign up at `/delivery/login` (toggle to "New partner? Sign up") — collects
email/password, full name, and vehicle type. Toggle online on the
dashboard (`/delivery/dashboard`); a `ready` order with no partner
assigned yet will appear under "Available orders" for any online partner
to claim (no admin-assignment step — see MEMORY.md's Phase 5 entry for
why). After claiming, advance the order picked_up → delivered from the
same dashboard. While online, the dashboard pings a manual lat/lng every
15 seconds; the customer's order-confirmation page shows that location as
a plain coordinate readout once the order reaches `assigned` (access
expires once the order is `delivered`).

## Trying the admin flow

Log in at `/admin/login` with the seeded demo account —
`admin@foodhub.local` / `admin-demo-password` (no signup; admin accounts
are seeded, not self-service). The dashboard (`/admin/dashboard`) shows
every order, restaurant, and delivery partner. Suspend/unsuspend a
restaurant to see it disappear from/reappear on `/customer` browse. For
an order in `assigned` or `picked_up` status, use the reassign dropdown
(lists currently-online delivery partners) to move it to a different
partner.

## n8n automation (reference only, not wired up)

`/api/internal/*` routes exist for n8n to call (shared-secret
`X-Internal-Secret` header, `N8N_INTERNAL_SECRET` in `.env.local`) and
`n8n/workflows/*.json` has one exported workflow per spec's automation
list — but no n8n instance was available while building this, so the
workflow JSON has never been imported into or run against a real n8n.
See `docs/n8n-webhook-setup.md` before attempting to wire it up for real.
Everything else in this README (checkout, vendor, delivery, admin flows)
works today without n8n — those synchronous paths stay as the tested
demo behavior regardless of whether n8n is ever connected.

## Status

All 8 phases of the web platform (spec §7) are built: customer browse/
cart/checkout, vendor panel, delivery partner app, admin dashboard, an
n8n-facing internal API (workflows themselves unverified — no n8n
instance was available while building them), and a Phase 8 polish pass
(loading/error/empty states audited across all four surfaces at a 390px
mobile viewport, no console errors found on any of the eight pages
checked). See [MEMORY.md](MEMORY.md) for the phase-by-phase build log,
including every bug found and fixed along the way, and its "Known
deferred items" section for what's intentionally left for later (e.g.
vendor restaurants still need a Supabase Studio flip to open, since
there's no in-product toggle yet). The React Native mobile app is a
planned follow-on, not started.

## Local service URLs
- App: http://localhost:3000
- Supabase Studio: http://localhost:54323
- Supabase API: http://localhost:54321

## Stopping
`npx supabase stop` to shut down the local Supabase Docker containers.
# Fresh-Quick
