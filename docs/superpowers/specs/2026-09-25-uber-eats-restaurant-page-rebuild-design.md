# Uber Eats-style redesign — Piece 3: Restaurant page rebuild

## Context

Piece 3 of the 6-piece Uber Eats-style redesign (piece 1: design tokens,
piece 2: home/feed rebuild, both merged to `main`). This piece rebuilds
`app/customer/restaurants/[id]/page.tsx` and `components/MenuItemRow.tsx`
toward Uber Eats' restaurant-page pattern: a sticky category anchor-nav,
an in-menu search box, and a vertical item list with a corner "Quick Add"
button — based on the live Uber Eats research documented in piece 1's
spec. Approved via the visual-companion mockup
(`restaurant-page.html`, 2026-09-25) — see that mockup for the approved
visual reference (banner → search → sticky pill nav → grouped vertical
sections → image-right cards with a circular `+` overlay).

`menu_items.category` (text, nullable) already exists in the schema
(migration `00000000000001_core_schema.sql`) and is already writable via
the vendor menu's inline edit form — **no new schema or migration is
needed for this piece**. "Quick Add" is a restyle of the existing
instant one-tap add (`MenuItemRow`'s current button), not new
customization logic — option groups (size/add-ons) and a customization
modal are piece 4's scope, not this one.

## Approved design

### Grouping menu items by category

- Group `menuItems` by `category`, preserving first-seen order across
  the fetched list (a `Map<string, MenuItem[]>` built by iterating once).
- Items with `category === null` are bucketed into a trailing synthetic
  **"Other"** group, appended after all real categories regardless of
  where a null item appeared in the fetch order.
- If the resulting group count is **2 or more**, render the sticky
  anchor-nav bar and per-category `<section>` headings. If it's **0 or
  1** (every item shares the same single category, or all are null and
  therefore all fall into one "Other" group), skip the anchor-nav and
  section headings entirely and render the existing flat vertical list —
  matching piece 2's precedent of falling back gracefully when grouping
  data doesn't support real grouping.
- A restaurant with a mix of real categories and null items always
  produces at least 2 groups once "Other" is added, so it always gets
  the anchor-nav treatment in that case.

### Sticky anchor-nav

- Renders as a horizontal row of pill buttons (one per group, in group
  order), `position: sticky` under the page's top chrome (the existing
  customer layout header, not re-implemented here — verify actual sticky
  offset against `app/customer/layout.tsx`'s real header height during
  implementation, the mockup's `top:0` was illustrative only).
- Clicking a pill smooth-scrolls to that group's `<section id="category-<slug>">`
  (slug via a simple lowercase/hyphenate of the category name, `"other"`
  for the synthetic group).
- An `IntersectionObserver` watches each section and highlights
  (background `brand-primary`, text white — matches the mockup's active-pill
  style) whichever section is currently most visible; all other pills stay
  outline-style. No new dependency — native `IntersectionObserver`, same
  approach already used for scroll-based state elsewhere is not present in
  this codebase yet, but the API needs no library.

### In-menu search

- A single search `<input>` directly under the banner (above the
  anchor-nav, matching the mockup), client-side only, no new API call —
  same pattern as the home page's existing search.
- Filters `menuItems` by case-insensitive substring match against `name`
  **or** `description` before grouping.
- A group with zero remaining matches after filtering is hidden entirely,
  including its anchor-nav pill — matches piece 2's dish-search precedent
  of not showing empty structure.
- If the search query produces zero matches across every group, show a
  "No items match “…”" message in place of the list (same pattern as the
  home page's empty-search state).

### Item card ("Quick Add" restyle)

`MenuItemRow` restyle (no prop/behavior changes beyond layout):

- Left: item name (semibold) with the existing 🟢/🔴 veg indicator prefix
  kept as-is (piece 1 did not touch this; out of scope to redesign the
  indicator itself here), description (muted, `line-clamp-2` if long),
  price.
- Right: a 72×72px image (existing `image_url`, 8px radius per piece 1
  tokens; when `image_url` is null, keep a placeholder block — do not
  invent new fallback art) with a circular accent-colored `+` button
  absolutely positioned at its bottom-right corner, overlapping the image
  edge (per the approved mockup). Clicking it calls the exact same
  `addItem(...)` call the current full-width "Add" button makes — no
  behavior change, only the button's shape/position.
- `disabled`/unavailable state: same as today (grey out, block the
  click), just carried over into the new corner-button shape — button
  shows a disabled visual state (reduced opacity) rather than text like
  "Unavailable" (no room for a text label in a small circular button);
  the row itself can still show an "Unavailable"/"Closed" indicator in
  its text column if useful, decide exact placement during implementation
  as a detail, not a scope question.

### Restaurant-closed/suspended banner

Unchanged from today — the existing `isUnavailable` warning banner stays
as-is above the item list.

## Scope

**In scope:**
- `app/customer/restaurants/[id]/page.tsx` — category grouping, search
  state, anchor-nav rendering, scroll-spy wiring, section markup.
- `components/MenuItemRow.tsx` — visual restyle only (image-right layout,
  corner `+` button); `addItem` call and props unchanged.
- Possibly a new small presentational component for the anchor-nav bar
  itself if `page.tsx` would otherwise grow too large (implementer's
  call, follow existing component-extraction patterns from pieces 1-2).

**Out of scope (later pieces / other work):**
- Any new DB schema, migration, or option-group data model — piece 4.
- A customization modal or multi-step add flow — piece 4.
- Cart panel changes — piece 5.
- Checkout changes — piece 6.
- Vendor-side UI for setting `category` — already exists, untouched.
- Changing the veg/non-veg indicator's visual treatment beyond what's
  already described above.

## Testing plan

1. `npm run build` (full output including the TypeScript phase, per
   project rule — a Turbopack "Compiled successfully" line alone is not
   sufficient).
2. Live Playwright pass covering all three grouping cases using real seed
   data (find or seed one example of each, or a throwaway local edit via
   the vendor menu UI if seed data doesn't already cover a case):
   - A restaurant where every item shares one category or all are
     null → flat list, no anchor-nav.
   - A restaurant with 2+ real categories and no null items → anchor-nav
     with only real category pills.
   - A restaurant with a mix of categorized and null items → anchor-nav
     including a trailing "Other" pill.
3. Click each anchor-nav pill and confirm it scrolls to and highlights
   the right section; scroll manually and confirm the scroll-spy
   highlight updates without clicking.
4. Type into the in-menu search box and confirm: matching items remain
   grouped under their real section headings, groups with no remaining
   matches (and their pill) disappear, and an all-groups-empty query
   shows the empty-state message.
5. Confirm the corner `+` button still adds the correct item/price to the
   cart (check the cart panel's contents match), and that it's disabled
   and non-functional when the restaurant is closed/suspended or the item
   itself is unavailable.
6. Screenshot at desktop and 390px width, per the project's established
   visual-smoke-test pattern.

## Open questions for the plan

None — grouping rules, fallback thresholds, search behavior, and the
Quick Add restyle are all fully specified above from the approved
mockup and this brainstorm's clarifying answers.
