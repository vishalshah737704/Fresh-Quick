# Fresh & Quick — DoorDash-Layout Rebuild (Design Spec)

Second redesign pass on the customer surface. The 2026-09-25 "Fresh &
Quick redesign" changed color/brand tokens and added photo cards but kept
the original flat single-column layout. This pass restructures the
**layout itself** to match doordash.com/home's structure: persistent left
sidebar nav, a fuller header (search + address + delivery/pickup toggle +
cart), and cuisine-grouped horizontal carousel rows instead of a flat
grid. No cart/checkout/auth logic changes — presentation layer only.

## Why

Vishal compared the live app to doordash.com/home directly and found the
structural gap too large to call "DoorDash-inspired": no sidebar, no
carousel rows, minimal header. This spec closes that structural gap while
keeping the existing brand tokens (`lib/branding.ts`) and business logic
untouched.

## Scope

**In scope**: `app/customer/layout.tsx`, `app/customer/page.tsx` (home),
`app/customer/restaurants/[id]/page.tsx` (detail page — density/polish
only, no structural change), new presentational components.

**Out of scope**: cart/checkout/order logic, auth, vendor/delivery/admin
surfaces, API routes, database. `AddressPicker`, `CartPanel`,
`CartConflictDialog` are reused as-is (styling pass only, no behavior
change) since spec explicitly forbids touching checkout/cart logic.

## Layout structure

### Left sidebar (new — `components/SidebarNav.tsx`)

Persistent vertical rail, icon + label per item, fixed width (~240px
desktop, collapses/hides below a breakpoint — mobile gets a bottom tab bar
or hamburger instead, matching existing mobile-first patterns elsewhere in
the app). Four items only, matching DoorDash's icon *style* (rounded icon
+ label, active-state highlight) without importing DoorDash's product
verticals the app doesn't have:

- Home (`/customer`)
- Restaurants (`/customer` — same page, sidebar item exists for visual
  parity with DoorDash's structure; can point to a `#restaurants` anchor
  on the home page rather than a real second route)
- Orders (`/customer/orders` — currently only
  `/customer/orders/[id]` exists for a single order; this sidebar item
  links to the most recent order if logged in, or prompts login,
  matching existing auth-gate pattern from checkout)
- Account (`/customer/login` if logged out, else a simple account info
  view — reuses the existing session/auth pattern, no new backend)

Rendered in `app/customer/layout.tsx`, wrapping all customer pages (same
place `AddressPicker` is currently rendered globally).

### Header (rebuilt — extends existing `app/customer/layout.tsx` header row)

Single row, left-to-right: logo/wordmark → search box (visual-only
initially — filters the visible restaurant list client-side by name/
cuisine text match, no new API) → address picker (existing
`AddressPicker` component, restyled to sit inline in the header instead of
its own bar) → Delivery/Pickup toggle (**visual-only, disabled** — always
shows "Delivery" selected, "Pickup" present but non-interactive with a
`disabled` state and `cursor-not-allowed`, since the app has no pickup
flow) → cart icon with item-count badge (existing `CartPanel` trigger) →
Sign In/Up or account menu.

### Home page (`app/customer/page.tsx`) — carousel rows replace flat grid

Structure top to bottom:

1. `HeroSearch` (existing component, unchanged — already headline/subtext
   only after the duplicated-AddressPicker fix from the last redesign)
2. `PromoBanner` (existing, unchanged)
3. `CuisineChipRow` (existing filter chips) — when a chip is active,
   collapse to a single filtered grid (current behavior preserved) instead
   of carousel rows, since "filtered by one cuisine" and "grouped by
   cuisine" are redundant together
4. **New**: when no cuisine filter is active, render one
   `CuisineCarouselRow` per cuisine that has ≥1 open restaurant, each row
   a horizontal-scrolling strip of `RestaurantCard`s (existing card
   component, unchanged) under a cuisine-name heading, scroll via native
   CSS `overflow-x-auto` + `scroll-snap` (no new JS scroll library —
   matches "no new dependencies without approval" rule)

Cuisines with zero open restaurants are omitted, not shown empty.

### Restaurant detail page — polish only

No structural change (single restaurant, no carousel makes sense here).
Apply the same spacing/card/typography density pass as the rest of this
work: menu item rows get consistent padding/border treatment matching the
new home page's card style, banner image sizing reviewed against the new
denser layout.

## New components

- `components/SidebarNav.tsx` — the left rail, active-route highlighting
  via `usePathname()`, four static items as above.
- `components/CuisineCarouselRow.tsx` — takes a cuisine label + restaurant
  list, renders heading + horizontal scroll strip of existing
  `RestaurantCard`s. Pure presentational, no data fetching (parent page
  passes already-fetched restaurants grouped client-side, matching the
  existing pattern of grouping/filtering that already exists in
  `app/customer/page.tsx`).
- `components/DeliveryPickupToggle.tsx` — visual-only two-segment toggle,
  `Pickup` permanently disabled, no state beyond the CSS active class on
  `Delivery`.

No new components for the header search box or address-picker inline
placement — those are restyle/reposition of existing pieces
(`AddressPicker` moves from its own bar into the header row; a plain
`<input>` is added inline for the search box, wired to existing client-
side filtering already used by `CuisineChipRow`, if such filtering exists,
else a new minimal `useState` filter on restaurant name/cuisine text,
still no new API route).

## Data flow

No new data flow. Restaurants are already fetched once for
`app/customer/page.tsx`; grouping into cuisine buckets for carousel rows
is a client-side `.reduce()`/`groupBy`-style transform of the same
already-fetched array, same pattern the existing cuisine chip filter
already uses to filter that array.

## Error handling

Unchanged from current behavior — the existing (previously
silently-swallowed, still-deferred per MEMORY.md) cuisine-fetch error
handling is out of scope for this pass; not touching it further avoids
scope creep into a separately-tracked deferred item.

## Testing / verification

- `npm run build` (not just `tsc --noEmit`) before marking any page task
  done, per standing project rule.
- Live Playwright walkthrough of the rebuilt home page and restaurant
  detail page at both desktop and the existing 390×844 mobile viewport
  (matching Phase 8's precedent), confirming: sidebar renders and
  highlights active route, header search/toggle/cart all render and don't
  break existing `AddressPicker`/`CartPanel` behavior, carousel rows
  scroll horizontally and omit empty cuisines, cuisine-chip filter still
  collapses to single grid correctly, checkout flow end-to-end (add items
  → cart → login → checkout) still works unchanged.
- Verify no `<a href>` tags were introduced (project's `next/link`-only
  navigation rule).

## Open questions / rulings already made (from brainstorming)

- Sidebar stays minimal (4 items), not a full DoorDash vertical-category
  list — the app has no Grocery/Retail/Alcohol verticals to nav to.
- Delivery/Pickup toggle is visual-only and disabled on Pickup — no
  pickup order flow exists or is being added.
- Carousel rows group by cuisine, using the existing 12-slug taxonomy —
  no new sorting/rating-based grouping in this pass.
