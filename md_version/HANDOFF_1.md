# HANDOFF_1 — FoodHub Session Handoff (after Phase 3)

Written at the end of the session that built Phases 1-3. For a fresh
Claude Code session picking this project back up in a new context window.

## Read these first, in this order

1. [`CLAUDE.md`](../CLAUDE.md) — project rules, stack, project-specific
   lessons learned (money math, build verification, auth patterns, etc.)
2. [`MEMORY.md`](../MEMORY.md) — phase-by-phase status, decisions, deferred
   items
3. [`README.md`](../README.md) — how to run the app locally
4. [`docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md`](../docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md)
   — the full design spec, including the 8-phase build plan (§7)

## Where things stand

**Phases 1, 2, and 3 are complete and merged to `main`.** The app is a
working local-only food delivery platform: a customer can browse
restaurants, view a menu, build a single-restaurant cart, sign up/log in,
check out with a mock payment method, and see an order confirmation page.

**Phase 4 (Restaurant/vendor panel) has not been started.** That's the
next piece of work.

Each of the three completed phases followed the same cycle:
`brainstorming` (bounded/architectural questions) → `writing-plans`
(detailed task-by-task implementation plan saved to
`docs/superpowers/plans/`) → `subagent-driven-development` (fresh
implementer + reviewer subagent per task, in an isolated git worktree, a
final whole-branch review, then merge to `main`). Follow this same cycle
for Phase 4 unless the user says otherwise.

## Environment

- Local-only stack: Next.js + self-hosted Supabase (Docker), no cloud
  services, ever.
- `.env.local` is gitignored and NOT committed — it will need to be
  recreated in any fresh checkout/worktree. Get the values by running
  `npx supabase start` (or `npx supabase status` if already running) and
  copying `API_URL` → `NEXT_PUBLIC_SUPABASE_URL`, `ANON_KEY` →
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SERVICE_ROLE_KEY` →
  `SUPABASE_SERVICE_ROLE_KEY`. A `PEXELS_API_KEY` is also needed if
  re-running the menu-image fetch (optional — seed data already has image
  URLs baked in); the key is in the user's earlier chat history if needed
  again, or the user can regenerate one free at pexels.com/api.
- Docker Desktop must be running before `npx supabase start`.
- See README.md for full setup steps.

## Key architectural decisions already locked in (see spec §2 and CLAUDE.md)

- Self-hosted Supabase only, never a hosted/cloud project.
- Cart is single-restaurant only (enforced client-side via a conflict
  prompt).
- Cuisine taxonomy is a fixed predefined list, DB-trigger-enforced.
- Auth: one `role` column (customer/vendor/delivery/admin) drives
  behavior. Only customer auth exists so far (minimal email/password via
  Supabase Auth, built in Phase 3).
- Branding isolated to `lib/branding.ts` + Tailwind `@theme` tokens.
- No Google Maps API key yet — address picker is a manual lat/lng stub,
  deliberately built so it's swappable later without touching consumers.
- Mobile app (React Native + Expo) is in scope but sequenced as its own
  sub-project after all 8 web phases ship — not started.
- Checkout API derives customer identity from a verified
  `Authorization: Bearer <token>` header, never a client-supplied id —
  this pattern must be followed for any future authenticated API route
  (vendor/delivery/admin routes in Phase 4+).
- Any code touching money must use integer-cents/paise arithmetic, never
  plain JS floats (found the hard way in Phase 3 — Postgres's exact
  numeric CHECK constraints reject float rounding errors).
- Any redirect target taken from a URL query param must be validated via
  `new URL(raw, window.location.origin)` + origin comparison, returning
  `.href` (never reassembling `pathname + search + hash` — that
  reintroduces an open-redirect bypass). See `app/customer/login/page.tsx`
  for the reference implementation.
- Run `npm run build` (not just `tsc --noEmit`) before considering any
  new page/route task done — a missing Suspense boundary broke the build
  in Phase 3 and `tsc` alone didn't catch it.

## Known deferred items (carry into future phase plans as appropriate)

See MEMORY.md's "Known deferred items" section for the full current list.
Notable ones likely relevant to Phase 4 (vendor panel):

- No DB transaction across checkout's sequential inserts — a partial
  failure could orphan rows. Needs a Postgres RPC function eventually.
- `order_items` table still has the fully-permissive Phase 1 stub RLS
  policy (any authenticated user can read any order's line items) —
  `users`/`addresses`/`orders`/`payments` were tightened to owner-only in
  Phase 3, `order_items` wasn't in scope for that fix. Phase 4's vendor
  panel will need its OWN RLS policy added here (a vendor needs to read
  order_items for orders belonging to restaurants they own) — this is a
  good moment to close the `order_items` gap properly rather than
  re-opening it to "authenticated" broadly again.
- Closed restaurants are still directly orderable by menu-page URL (the
  browse list filters them, but the menu page itself doesn't re-check
  `is_open` before rendering Add buttons) — checkout API does correctly
  reject at order-creation time regardless, so no functional bug, just a
  confusing UX for a customer who reaches a closed restaurant's menu page
  directly.
- No automated test suite exists yet.

## Rulings made during this session worth knowing about

(Full detail lives in each phase's git history / PR-equivalent review
trail, but the headline decisions:)

- Phase 1: added FK indexes and cuisine-taxonomy RLS+trigger enforcement
  beyond the plan's literal SQL (both additive, not scope-breaking).
- Phase 2: fixed two real bugs the plan's own specified code contained
  (AddressPicker resetting to default on save, malformed-cart crash) —
  both were plan defects, not implementer deviations.
- Phase 3: mid-phase, changed the checkout API's auth contract from
  trusting a client-supplied `customerId` to deriving it from a verified
  Bearer token, after a review caught anyone could otherwise place orders
  as any user. This was carried through every dependent file correctly.
  Also: RLS tightened to owner-only reads on tables holding real customer
  PII for the first time, and an open-redirect finding took 3 fix rounds
  to fully close.

## How to resume

If continuing straight to Phase 4, see `KICKOFF_1.md` in this same folder
for the prompt to paste into a fresh session.
