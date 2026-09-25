# CLAUDE.md — FoodHub Project

Project-level instructions for Claude Code working in this repo. Inherits
from `~/.claude/CLAUDE.md` and `c:\Vishal\Projects\CLAUDE.md`; this file adds
project-specific context those don't have.

## What this is

Swiggy-style food delivery web platform (functional clone, no brand assets).
Placeholder name "FoodHub". Full design: [docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md](docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md).
Build proceeds one phase at a time (8 phases total) — see spec §7 for the
full breakdown. Each phase gets its own brainstorm → spec-check → plan →
subagent-driven-development cycle, ends with a merge to `main`.

## Stack

- Next.js (App Router, TypeScript) + Tailwind CSS
- Supabase (Postgres + Auth + Storage + Realtime), **self-hosted locally via
  Docker** — no cloud/hosted Supabase project, ever (see spec §2)
- n8n for cross-actor automation (Phase 7, not wired yet)
- Google Maps JS SDK for address picking + live tracking (not wired yet —
  no API key available as of Phase 2; address picker is a manual lat/lng
  stub in the meantime, swappable later)
- React Native + Expo mobile app (customer + delivery-partner surfaces) is a
  planned follow-on sub-project after all 8 web phases ship — not started

## Local setup

See [README.md](README.md) for run instructions. Requires Docker Desktop
running before `npx supabase start`.

## Status

See [MEMORY.md](MEMORY.md) for phase-by-phase progress and decisions.

## Project-specific rules

- **No hosted Supabase, ever.** Local Docker stack only (Vishal's explicit
  cost/scale preference — see spec §2).
- **Cart is single-restaurant only.** Adding an item from a different
  restaurant must prompt to clear the cart, never silently mix.
- **Branding stays isolated** to `lib/branding.ts` + Tailwind `@theme`
  tokens — never hardcode the brand name/color in a component.
- **Build one phase at a time.** Don't start Phase N+1 work until Phase N is
  merged to `main`. Each phase gets its own git worktree + branch during
  execution, per `superpowers:subagent-driven-development`.
- **External API keys** (Google Maps, Pexels, etc.) go in `.env.local`
  (gitignored) with a placeholder line added to `.env.example` — never
  hardcoded, never committed.
- **Images fetched from external APIs** (e.g. Pexels) are fetched once and
  the resulting URLs are hardcoded into `supabase/seed.sql` / migrations —
  not called live at runtime, to keep API keys server-side only and avoid a
  network dependency on every `db reset`.
- **Any code that touches money (prices, subtotal, delivery fee, total)
  must use integer-cents/paise arithmetic**, never plain JS float
  multiplication — Postgres's exact-numeric CHECK constraints reject float
  rounding errors that whole-number seed data won't reveal until real
  decimal prices are used (found the hard way in Phase 3).
- **Run `npm run build` before marking any new page/route task done**, not
  just `tsc --noEmit` — a missing Suspense boundary around
  `useSearchParams()` broke the production build in Phase 3 and `tsc`
  alone didn't catch it.
- **Service-role Supabase key** (`SUPABASE_SERVICE_ROLE_KEY`) is only ever
  imported in server-side files guarded by the `server-only` package
  (see `lib/supabase-server.ts`) — never importable from a client
  component's bundle.
- **API routes that create data on a customer's behalf must derive the
  customer's identity from a verified session token** (`Authorization:
  Bearer <token>` checked via `supabaseServer.auth.getUser(token)`),
  never from a client-supplied id in the request body — a Phase 3 review
  caught a route that trusted a body-supplied `customerId`.
- **Any redirect target taken from a URL query param must be validated by
  parsing it with `new URL(raw, window.location.origin)` and comparing
  `.origin`, returning `.href` (never reassembling `pathname + search +
  hash`) if it matches** — reassembling parts reintroduces an open-redirect
  bypass via dot-segment/protocol-relative tricks (took 3 review rounds to
  close in Phase 3's login page).
- **Never add an RLS write policy (insert/update/delete) "for defense in
  depth" on a table that only ever gets written through a service-role API
  route.** An unused RLS write policy isn't dead code — it's a live,
  directly-reachable PostgREST bypass for anyone with their own anon-key
  session token, and it skips every check the API route enforces (status
  chains, ownership, field-level restrictions). Phase 4's final review
  caught three such policies (vendor order/restaurant updates, restaurant
  inserts) that let any authenticated user skip the vendor order-status
  chain or create their own orderable restaurant. Only add an RLS write
  policy for a table a client is actually meant to write to directly; read
  policies are fine since they're the intended defense layer for session-
  scoped browser reads.
- **When adding RLS policies to a table in a new migration, first list
  every EXISTING policy on that table (`select * from pg_policies where
  tablename = '...'`, or just grep every prior migration file for the
  table name) — don't just review the policies being added.** Phase 1's
  original permissive `stub_allow_authenticated_read` policies were meant
  to be replaced table-by-table as each table gained real data, but
  `delivery_partners` was missed by both the phase that should have
  caught it (there wasn't one, until Phase 5) and Phase 5's own first
  pass — live verification caught it only because a live cross-customer
  read test happened to be run, not because any code review inspected
  the table's full policy list. A new policy that looks correctly scoped
  in isolation can still sit next to an old one that quietly overrides
  it (RLS policies are OR'd together — the strictest new policy doesn't
  narrow an existing permissive one). `reviews` still has its original
  Phase 1 stub as of Phase 5 — deliberately left for whichever phase
  first gives that table real write traffic to close, see MEMORY.md.
