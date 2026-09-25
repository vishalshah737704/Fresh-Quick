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
   the seeded demo data already has image URLs baked in).
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

## Local service URLs
- App: http://localhost:3000
- Supabase Studio: http://localhost:54323
- Supabase API: http://localhost:54321

## Stopping
`npx supabase stop` to shut down the local Supabase Docker containers.
