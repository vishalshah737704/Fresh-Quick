# Delivery portal visual rebuild

## Context

Sub-project 2 of 3 in the vendor/delivery/admin visual pass (candidate #1
from `KICKOFF_11.md`). Sub-project 1 (vendor portal, spec
`2026-09-27-vendor-portal-visual-rebuild-design.md`) is complete and
merged. Its final whole-branch review found a Critical bug class worth
carrying forward as a binding constraint here: the session shell
(`VendorShell`) was originally mounted by a layout applied to ALL routes
under `/vendor/`, including `/vendor/login` — since that layout persisted
across client-side navigation into/out of login, it caused (a) a
post-login infinite "Loading…" hang, and (b) stale session/store data
shown after signing out and logging in as a different account in the same
tab. The fix was a Next.js route group (`app/vendor/(portal)/...`) so the
shell only mounts for authenticated pages and never for login. This spec
bakes that route-group structure in from Task 1, not as a post-review fix.

Delivery portal today: 2 pages (`app/delivery/login`,
`app/delivery/dashboard`), no shared layout — `useDeliverySession()`
(`components/delivery/useDeliverySession.ts`, structurally identical to
the vendor session hook: resolves session/role, redirects to login on
failure, never flips its own `loading` flag on that redirect path) is
called directly in the dashboard page. Dashboard shows two stacked lists
(Available orders, Your deliveries) plus an online/offline toggle,
manual/geolocation-prefilled lat/lng inputs, a 15s location ping, and a
10s available-orders poll while online.

Approved scope: fuller rebuild, but scaled to this portal's much smaller
surface (1 authenticated page vs. vendor's 3) — no sidebar; a simple top
bar instead (per brainstorming decision: a sidebar with one destination
is pattern-matching vendor unnecessarily). Two-column layout for the two
lists at desktop width, stacked on mobile.

## Scope

**In scope:**
- New route group `app/delivery/(portal)/dashboard/page.tsx` (moved from
  `app/delivery/dashboard/page.tsx`) with `app/delivery/(portal)/layout.tsx`
  wrapping a new `DeliveryShell` client component. `app/delivery/login`
  stays outside the route group — the shell never mounts there.
- `DeliveryShell` (`components/delivery/DeliveryShell.tsx`): top bar with
  brand mark, online/offline status badge (read from the same
  `useDeliverySession()` call, lifted here instead of in the page), sign
  out button. No sidebar, no nav links (nothing to navigate to).
- `DeliverySessionContext` (`components/delivery/DeliverySessionContext.tsx`):
  provides `{ loading, partnerId, isOnline, setIsOnline }` — note
  `setIsOnline` is a plain setter here (not an async refetch like vendor's
  `refreshIsOpen`), since the dashboard's own `toggleOnline()` already
  gets the authoritative new value back from `/api/delivery/toggle-online`'s
  response body and can push it directly into context.
- Dashboard page restructured: online toggle badge (restyled, pill radius
  — current version uses `rounded` not `rounded-full`) + lat/lng inputs
  block, then a two-column grid (`md:grid-cols-2`) of Available
  orders / Your deliveries cards at desktop width, single column on
  mobile. All existing behavior (claim, advance status, view address,
  geolocation prefill, 15s ping, 10s poll) unchanged — layout/restyle
  only.
- Login page: restyle only (centered card, new tokens/shapes), no
  structural change.
- Visual smoke test at desktop and 390px width for both pages, PLUS the
  same live cold-session verification the vendor rebuild's final review
  required: clear storage, log in fresh, confirm no infinite loading;
  sign out and log in as a different delivery partner in the same tab,
  confirm no stale partner/online data leaks across the switch.

**Out of scope:**
- Vendor portal (done), admin portal (sub-project 3, separate).
- Any new delivery feature, API route, or schema change.
- `useDeliverySession()` behavior change — hook itself untouched, only
  where/how it's called (moves into `DeliveryShell`, same as vendor's
  Task 1 pattern, this time correctly scoped to the route group from the
  start).
- Google Maps integration for the lat/lng inputs — still out of scope per
  project-wide "no Maps API key yet" constraint; this rebuild only
  restyles the existing manual/geolocation-prefilled text inputs.

## Architecture

- `app/delivery/(portal)/layout.tsx` renders `<DeliveryShell>{children}</DeliveryShell>`.
  `app/delivery/login/page.tsx` has no layout above it other than the root
  app layout — structurally identical to how the vendor rebuild's fix
  ended up (login outside the route group, portal pages inside it).
- `DeliveryShell` calls `useDeliverySession()` once, gates on
  `loading`/`!partnerId` before rendering children (mirroring
  `VendorShell`'s no-store-linked message, using the equivalent "no
  delivery partner profile linked" case — check what `useDeliverySession`
  actually returns for that case before assuming it's exactly parallel;
  today it only ever returns `partnerId: null` while loading, then either
  a real id or a redirect, so this may only need a loading gate, not a
  separate no-partner message. Confirm during Task 1 and adjust the
  brief's exact behavior to match reality rather than assuming symmetry
  with vendor.).
- Dashboard page drops its own `useDeliverySession()` call, reads
  `partnerId`/`isOnline`/`setIsOnline` from `useDeliverySessionContext()`
  instead. `toggleOnline()`'s existing `setOnline(body.isOnline)` call
  becomes `setIsOnline(body.isOnline)` via context.
- No API route changes anywhere (`/api/delivery/*` untouched).

## Testing plan

1. `npm run build`.
2. Playwright pass: delivery login, dashboard at desktop and 390px.
3. **Cold-session live verification (mandatory, learned from vendor
   sub-project's final review)**: clear browser storage, log in fresh as
   a seeded delivery partner, confirm dashboard loads without an infinite
   "Loading…" hang. Sign out, log in as a DIFFERENT seeded delivery
   partner in the same tab, confirm the new partner's own online-status
   and delivery list show — not the previous partner's.
4. Confirm no behavior regression: toggle online/offline, claim an
   available order, advance status, view address, geolocation prefill
   (or graceful fallback to manual inputs on permission denial), 15s ping
   and 10s poll still fire while online.

## Open questions for the plan

None — fully specified after brainstorming approval.
