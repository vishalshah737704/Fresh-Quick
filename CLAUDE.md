# CLAUDE.md — Fresh & Quick Project

Project-level instructions for Claude Code working in this repo. Inherits
from `~/.claude/CLAUDE.md` and `c:\Vishal\Projects\CLAUDE.md`; this file adds
project-specific context those don't have.

## What this is

DoorDash-inspired food delivery web platform (functional clone, no brand
assets — own name, colors, and Pexels-licensed photography, not DoorDash's).
Branded "Fresh & Quick" (`lib/branding.ts`). Full design: [docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md](docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md)
and [docs/superpowers/specs/2026-09-25-fresh-and-quick-redesign-design.md](docs/superpowers/specs/2026-09-25-fresh-and-quick-redesign-design.md)
for the visual redesign.
Build proceeds one phase at a time (8 phases total) — see spec §7 for the
full breakdown. Each phase gets its own brainstorm → spec-check → plan →
subagent-driven-development cycle, ends with a merge to `main`.

**Uber Eats-style redesign (post-8-phase, in progress):** a separate
6-piece redesign bringing the customer surface toward Uber Eats' web
ordering flow — design tokens (piece 1, done) → home/feed rebuild →
restaurant page rebuild → item customization (new DB schema) → cart
redesign (slide-out panel) → checkout polish. Each piece gets its own
spec/plan/build/merge cycle, same as the 8 phases. See MEMORY.md for
per-piece status and `docs/superpowers/specs/2026-09-25-uber-eats-design-refresh-design.md`
for piece 1's full design (colors, fonts, shape rules every later piece
inherits).

## Stack

- Next.js (App Router, TypeScript) + Tailwind CSS
- Supabase (Postgres + Auth + Storage + Realtime), **self-hosted locally via
  Docker** — no cloud/hosted Supabase project, ever (see spec §2)
- n8n for cross-actor automation — `/api/internal/*` routes and
  `n8n/workflows/*.json` exist (Phase 7), verified end-to-end against a
  real local n8n instance as of 2026-09-25 (see MEMORY.md's Phase 7
  addendum and `docs/n8n-webhook-setup.md` for the confirmed-working
  docker run command and per-workflow results).
- Google Maps JS SDK for address picking + live tracking (not wired yet —
  no API key available as of Phase 2; address picker is a manual lat/lng
  stub in the meantime, swappable later)
- React Native + Expo mobile app (customer + delivery-partner surfaces) is a
  planned follow-on sub-project after all 8 web phases ship — not started

## Local setup

See [README.md](README.md) for run instructions and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for a full deployment walkthrough
(local/self-hosted only — no cloud target). Requires Docker Desktop
running before `npx supabase start`. `scripts/` has build/start/stop/seed
entry points (`npm run app:build` / `app:start` / `app:stop` / `app:seed`,
Node `.mjs` canonical + PowerShell `.ps1` wrappers).

## Status

See [MEMORY.md](MEMORY.md) for phase-by-phase progress and decisions.

## Project-specific rules

- **No hosted Supabase, ever.** Local Docker stack only (Vishal's explicit
  cost/scale preference — see spec §2).
- **Cart is single-restaurant only.** Adding an item from a different
  restaurant must prompt to clear the cart, never silently mix.
- **Branding stays isolated** to `lib/branding.ts` + Tailwind `@theme`
  tokens (`app/globals.css`) — never hardcode the brand name/color in a
  component. Six color tokens as of the redesign: `brand-primary`,
  `brand-accent`, `brand-bg`, `brand-surface`, `brand-ink`,
  `brand-ink-muted`.
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
- **Never write an RLS policy on `users` (or any table) whose own USING
  clause queries that same table** (`exists (select 1 from public.users
  where ...)` inside a policy ON `public.users`) — Postgres cannot
  evaluate this and throws "infinite recursion detected in policy",
  breaking every browser-side read of that table (and transitively any
  table whose policies join through it) for every role, not just the
  one the broken policy was meant to gate. Phase 6 shipped exactly this
  (an "admin can read all users" policy that checked the caller's own
  admin-ness by querying `users` from within a `users` policy) and it
  broke login-time role checks for customer/vendor/delivery/admin alike,
  caught only by a final-review live audit that actually drove the login
  UI in a browser — curl tests against service-role-backed API routes
  never touch RLS at all and cannot catch this class of bug. If a table
  needs a self-referential admin check, either query a different table
  that already carries the caller's role, or use a `security definer`
  helper function (`create function is_admin() ... security definer set
  search_path = ''`) rather than a same-table subquery.
- **A phase's live verification pass must include actually driving the
  browser-facing UI for every login surface the migration could affect**
  — not just curl/REST calls against service-role-backed API routes,
  which bypass RLS entirely and cannot catch an RLS bug at all. Phase 6's
  own Task 6 verification ran entirely via curl and missed a
  login-breaking RLS recursion bug that the final whole-branch review
  only caught by loading `/admin/login` in an actual browser.
- **A "no `<a href>` tags exist" claim in MEMORY.md/CLAUDE.md is a
  snapshot, not a standing guarantee — re-grep before trusting it.** The
  post-Phase-8 triage recorded that claim after investigating a stale
  doc entry, but `RestaurantCard.tsx` had a raw `<a href>` the whole time
  (missed because that file wasn't touched by the triage's own search
  scope); found and fixed during the DoorDash-layout-rebuild plan simply
  because that plan happened to touch the file. `npm run build`/`tsc`
  never catches this class of bug — only a deliberate grep does.
- **A UI restructuring that changes *how* existing data is grouped or
  filtered (e.g. flat list → grouped-by-category rows) can silently drop
  rows the old flat view always showed, even with zero logic touched on
  the data-fetching side.** The DoorDash-layout-rebuild's cuisine-grouped
  carousel view initially had no fallback for a restaurant with no
  matching taxonomy tag (e.g. a freshly-signed-up vendor's
  `cuisine_tags: []` default) or an empty/failed `cuisine_taxonomy`
  fetch — both cases silently showed nothing where the old flat grid
  always rendered every open restaurant. Caught only by the final
  whole-branch review reading the diff against the data shape, not by
  any live click-through (every seeded restaurant in this app happens to
  have real cuisine tags, so the missing case never surfaced in
  Playwright testing). When restructuring a listing's grouping/filter
  logic, always add an explicit fallback path for items the new grouping
  doesn't cover, not just for the zero-items-total case.
- **A client-side search filter must match against every string form the
  UI actually displays to the user, not just the underlying data's raw
  value.** The DoorDash-layout-rebuild's home-page search matched
  `cuisine_tags` slugs (`fast_food`) but the visible chips/headings show
  taxonomy labels (`Fast Food`) — typing what's on screen returned zero
  results. Build a slug-to-label lookup whenever a filter's visible
  chrome and its underlying data use different strings for the same
  concept.
- **A status-driven UI component (e.g. a step tracker) that maps a wider
  status enum onto a smaller set of display states should use a
  `Record<T, V>` TypeScript type over the *narrowed* union, not the full
  one, when one value needs special-case handling instead of a mapped
  step.** `OrderStatusTimeline` (customer-flow DoorDash-style polish)
  maps the 8-value `OrderStatus` union onto 4 display steps, with
  `cancelled` handled as an early-return special case rather than a
  mapped index. Typing the lookup table as
  `Record<Exclude<OrderStatus, "cancelled">, number>` makes the
  TypeScript compiler itself reject any future new status value that
  isn't explicitly added to the mapping (verified live during that
  plan's Task 1 by temporarily deleting one key and confirming the build
  fails) — cheaper and more durable than a runtime fallback or a
  code-review checklist item.
- **Every URL an n8n container node calls back into this machine (the
  app, Supabase, or anything else self-hosted) needs `host.docker.internal`,
  not `127.0.0.1`/`localhost` — this isn't unique to `APP_BASE_URL`.**
  Wiring n8n live for the first time (2026-09-25) found `SUPABASE_URL`
  set to `http://127.0.0.1:54321` in the n8n container's environment,
  which is unreachable from inside that container (it resolves to the
  container itself) and broke workflow 04's restaurant lat/lng lookup
  with "The service refused the connection" — silent on JSON/config
  review, only surfaces once the node actually executes. Also needs
  `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` in n8n's environment, or every
  node reading `{{$env.X}}` (the internal-secret header, the base URLs)
  fails with "access to env vars denied" regardless of whether the
  variable is correctly set — n8n blocks node-level env access by
  default. See `docs/n8n-webhook-setup.md` section 1 for the confirmed-
  working docker run command with both fixes applied.

- **`.font-heading` (in `app/globals.css`, Poppins weight 300 for
  hero/section headings) is deliberately defined outside any Tailwind
  `@layer` block** — this was to avoid colliding with a Tailwind-auto-
  generated utility of the same name (it isn't registered as a `--font-*`
  theme token, so no such utility exists, but the plain-CSS placement was
  also chosen so unlayered CSS reliably wins the cascade). The tradeoff:
  if a later redesign piece pairs `font-heading` with a Tailwind weight
  utility (e.g. `className="font-heading font-semibold"`), the unlayered
  `.font-heading` rule's own `font-weight: 300` silently wins regardless
  of utility order — found during piece 1's final review, not yet hit in
  practice since the only current usage (`HeroSearch`) pairs no weight
  class. If a later piece needs to override the weight, wrap the rule in
  `@layer utilities { ... }` or convert it to Tailwind v4's `@utility
  font-heading { ... }` syntax so normal utility-ordering rules apply.

## Standing phrase: "Commit Work" — NON-NEGOTIABLE

When Vishal says **"Commit Work"** in this project, perform these three
steps in sequence, every time, without asking for confirmation on each
individual step (this phrase is the standing pre-authorization for all
three, including the push to `origin`):

1. **Update project memory docs** — `CLAUDE.md`, `MEMORY.md`, `README.md`,
   and `AGENTS.md` if it needs a change given what's being committed (per
   the global "Update CLAUDE files" rule — check each one even if a given
   file turns out to need no change).
2. **Commit** the staged/relevant changes with a clear message describing
   what changed and why (per the global commit-message rules — never
   `--no-verify`, never amend, review `git status`/diff for secrets first).
3. **Push to `origin`** on the current branch.

If step 2's commit would include anything that looks like a secret, or if
`origin` isn't reachable/authorized (as has happened before in this repo —
see `md_version/HANDOFF_2.md` for the collaborator-access issue), stop and
report the problem rather than silently skipping the step.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
