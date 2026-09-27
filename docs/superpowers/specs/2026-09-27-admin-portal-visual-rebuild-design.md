# Admin portal visual rebuild

## Context

Sub-project 3 of 3 in the vendor/delivery/admin visual pass. Sub-projects
1 (vendor) and 2 (delivery) are complete and merged. Sub-project 2's spec
already baked in the route-group fix that sub-project 1's final review
discovered the hard way (a shell layout mounted on all routes including
login causes a post-login infinite-loading hang and stale session data
across account switches in the same tab); this spec does the same from
Task 1.

Admin portal today: 2 pages (`app/admin/login`, `app/admin/dashboard`),
no shared layout. `useAdminSession()`
(`components/admin/useAdminSession.ts`, structurally identical to the
vendor/delivery session hooks) is called directly in the dashboard page.
Dashboard shows three stacked plain-list sections: Orders (with a
reassign-partner dropdown+button per reassignable order), Restaurants
(with a suspend/unsuspend button), Delivery partners (read-only).

Approved scope: fuller rebuild, top-bar shell (no sidebar — admin has
exactly one destination, same reasoning as delivery), and the three
sections become tabs (Orders / Restaurants / Partners) with each panel
restyled into a table, per brainstorming decision.

## Scope

**In scope:**
- New route group `app/admin/(portal)/dashboard/page.tsx` (moved from
  `app/admin/dashboard/page.tsx`) with `app/admin/(portal)/layout.tsx`
  wrapping a new `AdminShell`. `app/admin/login` stays outside the route
  group — mandatory from Task 1, not a later fix.
- `AdminShell` (`components/admin/AdminShell.tsx`): top bar with brand
  mark and sign out button. No status badge (admin has no online/offline
  concept, unlike vendor's open/closed or delivery's online/offline).
- `AdminSessionContext`/`useAdminSessionContext()`: provides
  `{ loading, adminId }` — lifted from the page into the shell, same
  pattern as vendor/delivery.
- Dashboard page restructured: a tab bar (Orders / Restaurants /
  Partners) showing one panel at a time. Each panel becomes a table:
  - Orders: columns for order id, restaurant, status, total, and a
    reassign control (dropdown + button) for reassignable statuses —
    same `REASSIGNABLE_STATUSES` logic, same API calls.
  - Restaurants: columns for name, status (Open/Closed/Suspended), and a
    suspend/unsuspend button.
  - Delivery partners: columns for name, online status, vehicle type
    (read-only, no actions — matches today's behavior).
  All existing data-loading (`loadAll`) and mutation handlers
  (`toggleSuspend`, `reassign`) unchanged — layout/restyle only.
- Login page: restyle only, no structural change.
- Visual smoke test at desktop and 390px, plus the mandatory cold-session
  and cross-account live verification (same as sub-projects 1 and 2).

**Out of scope:**
- Vendor, delivery portals (done).
- Any new admin feature, API route, or schema change.
- `useAdminSession()` behavior change — hook itself untouched, only where
  it's called (moves into `AdminShell`).

## Architecture

- `app/admin/(portal)/layout.tsx` renders `<AdminShell>{children}</AdminShell>`.
  `app/admin/login/page.tsx` has no layout above it other than the root
  app layout.
- `AdminShell` calls `useAdminSession()` once, gates on `loading` before
  rendering children (no separate "no admin profile" case —
  `useAdminSession()` only ever returns a real `adminId` after a
  successful resolve, or redirects to login, mirroring delivery's hook).
- Dashboard page drops its own `useAdminSession()` call, reads `adminId`
  from `useAdminSessionContext()` (not actually used by the page's own
  logic today, but kept for parity/future use, matching the pattern
  established in vendor/delivery — if unused, this is fine, the context
  still exists to gate loading in the shell).
- Tab state (`activeTab: "orders" | "restaurants" | "partners"`) is
  local `useState` in the dashboard page — no URL/query-param sync needed
  (YAGNI; can be added later if deep-linking to a specific tab is ever
  requested).
- No API route changes anywhere (`/api/admin/*` untouched).

## Testing plan

1. `npm run build`.
2. Playwright pass: admin login, dashboard (all 3 tabs) at desktop and
   390px.
3. **Cold-session live verification (mandatory)**: clear browser storage,
   log in fresh as the seeded admin account, confirm dashboard loads
   without an infinite "Loading…" hang. If a second admin account exists
   or can be seeded for this test (ask before any DB write beyond
   read-only checks), sign out and log in as a different admin in the
   same tab, confirm no stale data. If only one seeded admin account
   exists, this cross-account check may be skipped with a ledger note —
   the route-group structure itself is what prevents the bug class, not
   account-specific state, so a single-account cold-login check still
   validates the fix's file-structure precondition.
4. Confirm no behavior regression: suspend/unsuspend a restaurant,
   reassign an order to an online delivery partner (seed test data only
   with explicit approval, matching sub-project 2's precedent).

## Open questions for the plan

None — fully specified after brainstorming approval.
