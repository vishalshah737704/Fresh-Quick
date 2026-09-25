# MEMORY.md — FoodHub Build Status

Index of what's been built and decided. Not a memory file for Claude's
cross-session memory system — this is the project's own build log, read by
Claude at the start of work in this repo per project CLAUDE.md.

## Phase status (spec: docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md)

- **Phase 1 — Scaffold + DB schema**: ✅ Complete, merged to `main`.
  Next.js scaffold, self-hosted Supabase (Docker), 9-table schema + RLS +
  FK indexes, seeded cuisine taxonomy + demo vendor/restaurant/menu, README.
  Plan: docs/superpowers/plans/2026-09-24-phase1-scaffold-db-schema.md
- **Phase 2 — Customer browse + cart**: ✅ Complete, merged to `main`.
  Anonymous browse/cart flow, single-restaurant enforcement, address-picker
  stub, cart panel with persistence. Plus a follow-on add: real food photos
  from Pexels wired into menu items (seed data + `next/image`).
  Plan: docs/superpowers/plans/2026-09-24-phase2-customer-browse-cart.md
- **Phase 3 — Checkout + mock payment**: not started.
- **Phase 4 — Restaurant/vendor panel**: not started.
- **Phase 5 — Delivery partner app + live tracking**: not started.
- **Phase 6 — Admin dashboard**: not started.
- **Phase 7 — n8n automation wiring**: not started.
- **Phase 8 — Polish/testing**: not started.
- **Mobile app (React Native + Expo, sub-project)**: not started — begins
  after Phase 8.

## Key decisions carried forward (see spec §2 for full list)

- Self-hosted Supabase only, no cloud project.
- Cart is single-restaurant only.
- Cuisine taxonomy is a fixed predefined list (`cuisine_taxonomy` table +
  DB trigger enforcement, not just UI-level).
- Auth: one `role` column drives redirect (customer/vendor/delivery/admin).
- Branding: placeholder "FoodHub" name + orange/red theme, isolated to
  `lib/branding.ts` + Tailwind tokens.
- No Google Maps API key yet — address picker is a manual lat/lng stub.
- Mobile app is in scope but sequenced after the web platform ships.

## Known deferred items (carried from phase reviews, not yet addressed)

- No spatial/PostGIS indexing for restaurant lat/lng (Phase 1 review;
  revisit if Phase 2+'s query patterns show it's needed at scale).
- Closed restaurants are filtered from the browse list but still directly
  orderable by URL — needs a server-side re-check, and Phase 3's checkout
  API must independently re-validate restaurant-open/item-available/price
  from the database rather than trusting the client's cart (Phase 2 final
  review finding — carry into Phase 3 plan).
- Every customer-app navigation is a full page reload (`<a href>` instead
  of `next/link`) — plan-specified in Phase 2, worth revisiting.
- No automated test suite exists yet — all verification so far has been
  `tsc`/`build`/manual + Playwright walkthroughs documented per task.

## External API keys in use

- `PEXELS_API_KEY` — Pexels Search API, used once (not at runtime) to fetch
  menu item photo URLs baked into `supabase/seed.sql`. Key lives in
  `.env.local` only.
