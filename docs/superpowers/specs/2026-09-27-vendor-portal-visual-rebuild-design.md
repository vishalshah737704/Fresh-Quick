# Vendor portal visual rebuild

## Context

Sub-project 1 of a 3-part "vendor/delivery/admin visual pass" (candidate #1
from `KICKOFF_11.md`'s options, sequenced ahead of the mobile app and the
`MenuItemRow.tsx` non-veg-dot fix per Vishal's explicit ordering). Piece 1
of the Uber Eats-style redesign (`docs/superpowers/specs/2026-09-25-uber-eats-design-refresh-design.md`)
gave every surface the new color/type/shape tokens but explicitly deferred
"vendor/delivery/admin visual polish" as separate unscoped work. This spec
closes that gap for the vendor portal only. Delivery and admin each get
their own later spec/plan/build/merge cycle.

Vendor portal today: 4 pages (`app/vendor/login`, `dashboard`, `menu`,
`orders`), no shared layout/nav — each authenticated page duplicates its
own `useVendorSession()` call and manual `<Link>` buttons, styled as
narrow centered `max-w-2xl` stacked forms with no persistent navigation.

Approved scope (from brainstorming): a **fuller rebuild**, not a token-only
polish pass — new layout patterns per page, matching the customer
surface's quality bar. Uber Eats has no public vendor-facing UI to
reference, so this is original layout work using the existing design
tokens (`lib/branding.ts` colors, 8px card radius, 999px button radius,
Inter/Poppins fonts) as the only inherited constraint.

## Scope

**In scope:**
- New `app/vendor/layout.tsx`: persistent left sidebar (brand mark, nav
  links: Dashboard / Menu / Orders, store open/closed status badge, sign
  out button) wrapping the 3 authenticated pages. Collapses to a top bar
  with a drawer/hamburger at mobile width (<768px). Login page is
  excluded from this layout (stays a standalone centered card, restyled
  only).
- Dashboard page restructured into a stat-card row (open/closed toggle as
  its own prominent card) + a settings card (delivery fee, promo text).
  Same data/API calls as today — layout only.
- Orders page restructured into status-grouped kanban columns (Placed,
  Accepted, Preparing, Ready — terminal statuses `delivered`/`cancelled`
  excluded from the board entirely, matching today's `NEXT_LABEL`-driven
  statuses which never included them). Drop the status-filter dropdown
  (columns replace it) and the sort-order toggle (each column shows
  newest-first, no toggle). Cards restyled: 8px radius, item list, note,
  total, accept/reject/advance buttons using new button shapes.
- Menu page restructured from stacked forms into a table/grid of existing
  items (thumbnail, name, price, veg badge, availability toggle, edit
  trigger) with the add-item form and per-item option-group editor kept
  functionally identical, restyled to match.
- Login page: restyle only (centered card, new shapes/tokens/fonts) — no
  structural or flow change.
- Visual smoke test at desktop and 390px width for all 4 pages.

**Out of scope:**
- Delivery portal, admin portal — separate later sub-projects.
- Any new vendor feature, API route, or schema change. This is visual/UX
  restructuring of existing functionality only.
- `useVendorSession()` behavior change — the hook itself is untouched;
  only how/where it's called (moves into the layout so child pages don't
  each need it — see Architecture).
- The `MenuItemRow.tsx` customer-facing non-veg-dot bug (separate,
  already-queued item #3).

## Architecture

- `app/vendor/layout.tsx` (new, server component wrapping a client shell)
  calls `useVendorSession()` once via a new client component
  `components/vendor/VendorShell.tsx` that renders the sidebar/topbar and
  `{children}`. Each of dashboard/menu/orders drops its own
  `useVendorSession()` loading-gate and reads `storeId`/`loading` from a
  new `VendorSessionContext` (React context) that `VendorShell` provides,
  instead of each page re-deriving it. This removes the current
  duplication (all 3 pages independently redirect-on-no-session) and
  ensures the sidebar's store-open badge and the dashboard's own toggle
  read from a single resolved session/store.
- Store open/closed badge in the sidebar reads live state via the same
  `stores` query the dashboard already runs; simplest approach is
  lifting that one query (`is_open`) into `VendorShell` too, exposed via
  the same context, so dashboard doesn't refetch it separately. Dashboard
  keeps its own fetch for `delivery_fee_paise`/`promo_text` (not needed
  by the sidebar).
- Orders page: kanban columns are a pure client-side grouping of the
  existing `orders` array by `status` — no new API route, no change to
  `/api/vendor/orders`, `/api/vendor/orders/[id]/status`, or
  `/api/vendor/orders/[id]/reject`.
- Menu page: table/grid is a pure presentational restructuring of the
  existing `items` state and inline edit-form state — no change to
  `/api/vendor/menu-items*` routes.

## Testing plan

1. `npm run build` (project rule — not just `tsc --noEmit`).
2. Playwright pass: vendor login, dashboard, menu, orders at desktop and
   390px. Confirm sidebar/topbar nav works, store-open badge matches
   dashboard toggle state, kanban columns show correct orders per status,
   menu table shows existing seeded items correctly, no visual
   regressions vs. new token contrast rules.
3. Confirm no behavior regression: toggle open/closed, save delivery
   fee/promo, accept/reject/advance an order, add/edit a menu item,
   add an option group — all via the restyled UI, same as existing
   manual test coverage from Phase 4/6.

## Open questions for the plan

None — fully specified after brainstorming approval.
