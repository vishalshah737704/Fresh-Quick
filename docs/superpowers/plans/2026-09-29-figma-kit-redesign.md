# Figma Community Kit Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full visual-token rebrand of the entire app — web (Customer,
Vendor, Delivery, Admin) and mobile (Customer, Delivery) — using the
Figma community kit's palette (orange/navy/green), pill/rounded-card
shapes, and Poppins-700 headings, with zero business-logic or
data-flow change.

**Architecture:** Token-first: Task 1 replaces `lib/branding.ts` +
`app/globals.css` (web) and Task 2 replaces `mobile/theme.ts`
(mobile) — every later task consumes these tokens by class/style
reference only, never a hardcoded hex. Each surface task restyles
existing components/pages in place; no component is moved, renamed,
or logically rewritten. Vendor/Admin dashboards get new freeform
layout markup (kanban columns, table) per the approved spec, still
built from the same token set.

**Tech Stack:** Next.js (App Router, TS) + Tailwind CSS v4 (web),
Expo/React Native + StyleSheet (mobile). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-figma-kit-redesign-design.md`

## Global Constraints

- Six (now eight, with `brand-danger` + shape tokens) brand tokens stay
  isolated to `lib/branding.ts` / `app/globals.css` `@theme` (web) and
  `mobile/theme.ts` (mobile) — no component may hardcode a hex value.
- Every restyled authenticated screen keeps its existing session/role
  guard call exactly as-is (`useRoleGuard`/`useSession` from
  `lib/auth.ts` on web, `useRequireSession` from
  `mobile/lib/use-require-session.ts` on mobile) — verify by grep in
  each task, not by assumption.
- `npm run build` must pass after every web task, not just
  `tsc --noEmit`.
- No API route, DB migration, RLS policy, or component prop/interface
  change — visual/style-only diffs everywhere except the two new
  freeform-layout tasks (Vendor kanban, Admin table), which add markup
  but no new data fetching (reuse existing fetched data shape).
- Vendor/Delivery/Admin route-group-shell structure (`(portal)` route
  group excluding each role's own `/login` page) must not be touched —
  restyle `VendorShell.tsx`/`DeliveryShell.tsx`/`AdminShell.tsx`
  in place, don't restructure their route groups.

## Review Focus

1. **Hardcoded hex leaking into a component during restyle** — a
   reasonable dev copy-pastes a color from the Figma screenshot instead
   of using the new token; grep for stray hex codes outside
   `globals.css`/`branding.ts`/`theme.ts` at the end of each task.
2. **`.font-heading` cascade regression** — moving it into
   `@layer utilities` changes specificity; any place currently pairing
   `font-heading` with a Tailwind weight utility must be checked to
   still render Poppins-700 (not silently reverting to an old weight).
3. **Role-guard hook accidentally dropped** — a full-file restyle is
   exactly the kind of change that's tempted to rewrite a page's return
   JSX wholesale and lose the guard call at the top; every task greps
   for it before considering itself done.
4. **Vendor kanban/Admin table treated as a data-shape change** — the
   new freeform layouts must consume the exact same fetched data the
   old layout used; a task that quietly adds a new API call or changes
   what fields are read is out of scope and must be rejected in review.
5. **Cart/checkout visual restyle breaking the slide-out panel's
   existing open/close and note-flush behavior** (piece 5's known
   fragile spot — Escape-key note flush, close-on-navigate) — a
   restyle-only task must not touch the event handlers, only the
   className/style props.

---

### Task 1: Web design tokens (`lib/branding.ts` + `app/globals.css`)

**Files:**
- Modify: `lib/branding.ts`
- Modify: `app/globals.css:8-19` (theme tokens), `app/globals.css:34-40` (`.font-heading`)

**Interfaces:**
- Produces: `BRAND.theme.{primary,accent,background,surface,ink,inkMuted,danger}` object shape (adds `danger`); Tailwind tokens `--color-brand-primary`, `--color-brand-accent`, `--color-brand-bg`, `--color-brand-surface`, `--color-brand-ink`, `--color-brand-ink-muted`, `--color-brand-danger` (new), `--radius-card` (new, `16px`), `--radius-pill` (new, `999px`); utility class `.font-heading` (Poppins 700, now inside `@layer utilities`). Every later web task consumes these names unchanged.

- [ ] **Step 1: Update `lib/branding.ts` token values**

Replace the `theme` object's values (keep the `BRAND.name` field
`"Fresh & Quick"` unchanged) and add a `danger` key:

```ts
theme: {
  primary: "#F5821F",
  accent: "#1E8A3E",
  background: "#F4F4F4",
  surface: "#FFFFFF",
  ink: "#0B1D3A",
  inkMuted: "#6B7280",
  danger: "#E0524D",
},
```

- [ ] **Step 2: Update `app/globals.css` `@theme inline` block (lines 8-19)**

Replace the six `--color-brand-*` values to match Step 1, and add two
new lines inside the same `@theme inline { … }` block:

```css
--color-brand-primary: #F5821F;
--color-brand-accent: #1E8A3E;
--color-brand-bg: #F4F4F4;
--color-brand-surface: #FFFFFF;
--color-brand-ink: #0B1D3A;
--color-brand-ink-muted: #6B7280;
--color-brand-danger: #E0524D;
--radius-card: 16px;
--radius-pill: 999px;
```

- [ ] **Step 3: Move `.font-heading` into `@layer utilities` and bump weight to 700**

Read the current rule at `app/globals.css:34-40` first (it has an
explanatory comment above it about being deliberately outside
`@theme` to win the cascade against a Tailwind auto-utility — that
comment is now stale once wrapped in `@layer utilities`, since Tailwind
v4's layer ordering already makes an explicit weight utility win when
paired; remove the stale comment and replace it with):

```css
@layer utilities {
  /* Poppins 700 for hero/section headings — kit's bold display style.
     Inside @layer utilities so a paired Tailwind weight utility
     (e.g. `font-heading font-semibold`) still wins predictably. */
  .font-heading {
    font-family: var(--font-poppins), sans-serif;
    font-weight: 700;
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds with no type or CSS errors.

- [ ] **Step 5: Grep for stray hardcoded hex outside token files**

Run: `grep -rn "#12140f\|#b6e02e\|#faf9f4" app/ components/ lib/ --include="*.tsx" --include="*.ts" --include="*.css"`
Expected: no matches (old token values fully replaced; any match
means a component hardcoded the old color instead of referencing the
token — fix before proceeding).

- [ ] **Step 6: Commit**

```bash
git add lib/branding.ts app/globals.css
git commit -m "feat(design): replace brand tokens with Figma-kit palette (web)"
```

---

### Task 2: Mobile design tokens (`mobile/theme.ts`)

**Files:**
- Modify: `mobile/theme.ts`

**Interfaces:**
- Consumes: nothing (mirrors Task 1's values independently, per the file's existing "must stay in sync" comment).
- Produces: `BRAND.colors.{primary,accent,background,surface,ink,inkMuted,danger}`, `BRAND.fonts.heading` (now `Poppins_700Bold` instead of `Poppins_300Light`), `BRAND.radius` (kept as the small-radius default; add `BRAND.radiusPill = 999`). Every mobile task consumes these names unchanged.

- [ ] **Step 1: Update `mobile/theme.ts`**

Mirror Task 1's values and add the same new fields, keeping the file's
existing structure and "kept in sync with lib/branding.ts and
app/globals.css" comment:

```ts
colors: {
  primary: "#F5821F",
  accent: "#1E8A3E",
  background: "#F4F4F4",
  surface: "#FFFFFF",
  ink: "#0B1D3A",
  inkMuted: "#6B7280",
  danger: "#E0524D",
},
fonts: {
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemiBold: "Inter_600SemiBold",
  heading: "Poppins_700Bold",
},
radius: 8,
radiusPill: 999,
```

Note: if `Poppins_700Bold` is not already loaded as an Expo font asset
(check the existing font-loading call near where `Poppins_300Light`
is loaded, typically `App.tsx` or an Expo font hook), swap the loaded
weight import from 300 to 700 in that same loading call — do not add
a second Poppins weight import, since the design only uses one
heading weight throughout.

- [ ] **Step 2: Grep for the font-loading call and confirm the weight swap**

Run: `grep -rn "Poppins_300Light\|Poppins_700Bold" mobile/`
Expected: no remaining `Poppins_300Light` reference anywhere in
`mobile/`; `Poppins_700Bold` used consistently (theme file + font
loader).

- [ ] **Step 3: Commit**

```bash
git add mobile/theme.ts
git commit -m "feat(design): replace brand tokens with Figma-kit palette (mobile)"
```

---

### Task 3: Web Customer — Home page

**Files:**
- Modify: `app/customer/page.tsx`

**Interfaces:**
- Consumes: `brand-primary`/`brand-accent`/`brand-bg`/`brand-surface`/`brand-ink`/`brand-ink-muted` Tailwind classes, `radius-card`/`radius-pill` (Task 1).
- Produces: no new exports; visual restyle only.

- [ ] **Step 1: Read the current file**

Read `app/customer/page.tsx` in full before editing, to preserve every
existing data-fetch call, loading/error branch, and link target.

- [ ] **Step 2: Apply new visual language**

Update className usage across the hero, category grid, restaurant
grid, and stat-banner sections to use the new tokens and shapes:
- Hero section: `bg-brand-primary` background, white heading text,
  `rounded-[var(--radius-pill)]` search input + button (pill shape).
- Category/restaurant cards: `rounded-[var(--radius-card)]
  bg-brand-surface shadow-sm`.
- Any existing category/cuisine chip: pill shape
  (`rounded-[var(--radius-pill)]`), `bg-brand-ink text-white` for the
  active/selected state (matches the kit's dark-navy tag-pill pattern).
- Stat banner (if present, or add per spec's "numbered step badges /
  stat strip" pattern only if an equivalent section already exists in
  this file — do not add a new section not already present): full-bleed
  `bg-brand-primary`, large white numbers.
- Do NOT change any `fetch`/`useEffect`/routing logic, prop names, or
  the cuisine-taxonomy fallback logic (a known fragile spot from the
  DoorDash-layout-rebuild — restyle its container only).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Grep for stray hex and confirm no logic touched**

Run: `git diff app/customer/page.tsx | grep -E "^\+.*#[0-9a-fA-F]{3,6}"`
Expected: no output (every color reference goes through a Tailwind
token class, never a literal hex in the diff).

- [ ] **Step 5: Commit**

```bash
git add app/customer/page.tsx
git commit -m "style(customer): restyle home page with Figma-kit tokens"
```

---

### Task 4: Web Customer — Restaurant/store detail pages

**Files:**
- Modify: `app/customer/restaurants/[id]/page.tsx`
- Modify: `app/customer/stores/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: no new exports; visual restyle only.

- [ ] **Step 1: Read both files in full**

Both routes exist in parallel (restaurants vs. stores) — read each
fully before editing so the same visual pattern is applied consistently
to both without assuming they share structure.

- [ ] **Step 2: Apply new visual language to both files**

- Header/banner: `bg-brand-ink` dark section with white text, rating
  badge as a white `rounded-[var(--radius-card)]` chip (matches the
  kit's restaurant-detail hero).
- Menu category sidebar/tabs: pill or dark-navy-pill for the active
  category (matches kit's left-nav menu list).
- Menu item cards: `rounded-[var(--radius-card)] bg-brand-surface`,
  price shown in a small `bg-brand-accent` pill.
- Basket/order-summary sidebar: `bg-brand-accent` header bar ("My
  Basket"), `bg-brand-primary` total-to-pay pill, `bg-brand-ink`
  checkout button pill — matches the kit's basket sidebar exactly.
- Preserve every existing `loading.tsx` sibling reference, existing
  category-grouping/fallback logic (the "no cuisine tag → Other
  bucket" fix from a prior session), and any scroll-spy/anchor-nav
  behavior with its existing click-handler-sets-state-directly fix —
  restyle containers/classNames only.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Confirm both files' `loading.tsx` siblings still exist**

Run: `ls app/customer/restaurants/[id]/loading.tsx app/customer/stores/[id]/loading.tsx`
Expected: both files present (unchanged by this task — this step just
confirms the restyle didn't accidentally get scoped into deleting or
renaming them).

- [ ] **Step 5: Commit**

```bash
git add "app/customer/restaurants/[id]/page.tsx" "app/customer/stores/[id]/page.tsx"
git commit -m "style(customer): restyle restaurant/store detail pages with Figma-kit tokens"
```

---

### Task 5: Web Customer — Cart panel

**Files:**
- Modify: `components/CartPanel.tsx`
- Modify: `components/CartConflictDialog.tsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: no new exports, no prop signature change; visual restyle only.

- [ ] **Step 1: Read `CartPanel.tsx` in full, noting every event handler**

Specifically locate: the Escape-keydown handler, the "Checkout" link's
onClick (must still close the drawer before navigating — a previously
fixed bug), the draft-note blur-commit logic and its explicit-flush-on-close
fix, and `clearCart()`'s effect on `open` state. These must remain
byte-for-byte identical in behavior — only JSX className/style changes.

- [ ] **Step 2: Apply new visual language**

- Panel header: `bg-brand-accent` (green "My Basket" bar, matches kit).
- Line items: existing layout, updated text/border colors to
  `brand-ink`/`brand-ink-muted`.
- Total-to-pay: `bg-brand-primary rounded-[var(--radius-pill)]` pill.
- Checkout button: `bg-brand-ink` (or `bg-brand-accent` if that reads
  better against the total-to-pay pill above it — implementer's call,
  but must be a token class, not a new literal color) pill button.
- `CartConflictDialog.tsx`: restyle its modal chrome
  (`rounded-[var(--radius-card)]`, button pills) to match, no
  copy/logic change.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Diff-review for handler preservation**

Run: `git diff components/CartPanel.tsx`
Expected: every changed line is inside a `className`/`style` attribute
or JSX structure that doesn't touch `onClick`/`onKeyDown`/`useEffect`
bodies — if any handler body line shows as changed, revert that hunk
and redo the restyle around it.

- [ ] **Step 5: Commit**

```bash
git add components/CartPanel.tsx components/CartConflictDialog.tsx
git commit -m "style(customer): restyle cart panel with Figma-kit tokens"
```

---

### Task 6: Web Customer — Checkout page

**Files:**
- Modify: `app/customer/checkout/page.tsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: no new exports; visual restyle only.

- [ ] **Step 1: Read the file in full**

Note the existing `useRoleGuard`/`useSession` call location, the
Suspense boundary around `useSearchParams()` (a prior build-breaking
fix — must stay), and every money-display line (must stay
integer-cents/paise arithmetic, display formatting only).

- [ ] **Step 2: Apply new visual language**

- Form sections: `rounded-[var(--radius-card)] bg-brand-surface`
  cards on `bg-brand-bg` page background.
- Primary "Place Order" button: `bg-brand-accent
  rounded-[var(--radius-pill)]` (matches kit's green confirm CTA).
- Order summary sidebar: same basket-pill pattern as Task 5.
- Error/validation banners: `bg-brand-danger` (new token from Task 1).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: succeeds (specifically confirms the Suspense boundary around
`useSearchParams()` wasn't accidentally removed — this exact class of
bug broke the build in Phase 3 and `tsc` alone won't catch it).

- [ ] **Step 4: Grep for role-guard preservation**

Run: `grep -n "useRoleGuard\|useSession" app/customer/checkout/page.tsx`
Expected: at least one match, same hook call present as before the edit.

- [ ] **Step 5: Commit**

```bash
git add app/customer/checkout/page.tsx
git commit -m "style(customer): restyle checkout page with Figma-kit tokens"
```

---

### Task 7: Web Customer — Order tracking + item customization modal

**Files:**
- Modify: `components/OrderStatusTimeline.tsx`
- Modify: `components/ItemCustomizationModal.tsx`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: no new exports, no prop signature change; visual restyle only.

- [ ] **Step 1: Read both files in full**

`OrderStatusTimeline.tsx`: note the `Record<Exclude<OrderStatus,
"cancelled">, number>` typed step-mapping and the `cancelled`
early-return branch — do not touch the mapping logic or its wording
(the ready/preparing bucketing text issue is explicitly out of scope
per the spec). `ItemCustomizationModal.tsx`: note the `lineId`-based
cart model and any per-line-note blur-commit logic.

- [ ] **Step 2: Apply new visual language to `OrderStatusTimeline.tsx`**

- Step markers: filled `bg-brand-accent` circle for completed steps,
  `bg-brand-primary` for the current step, `bg-brand-ink-muted` for
  future steps (color changes only — the step-index mapping itself is
  untouched).
- Connecting line: `bg-brand-ink-muted` with `bg-brand-accent` fill up
  to the current step.

- [ ] **Step 3: Apply new visual language to `ItemCustomizationModal.tsx`**

Match the kit's exact customize-modal pattern from the approved
preview:
- Full-bleed food-photo header image, `rounded-t-[var(--radius-card)]`.
- Breadcrumb row above the title.
- Topping/option group headers: `bg-brand-ink` dark pill with white
  text (matches kit's "Vegetable Toppings" / "Meat Toppings" pill
  headers).
- Selected checkbox/option state: `bg-brand-accent` (green check,
  matches kit).
- Sticky footer: `bg-brand-primary` total-to-pay pill on the left,
  "Next Step"/"Add" button as a `bg-brand-accent` pill on the right.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Confirm the `OrderStatus` exhaustiveness type still compiles**

Run: `npx tsc --noEmit`
Expected: no error — confirms the `Record<Exclude<OrderStatus,
"cancelled">, number>` mapping wasn't accidentally widened or narrowed
during the restyle.

- [ ] **Step 6: Commit**

```bash
git add components/OrderStatusTimeline.tsx components/ItemCustomizationModal.tsx
git commit -m "style(customer): restyle order tracking and item customization with Figma-kit tokens"
```

---

### Task 8: Web Vendor — Shell + dashboard (freeform kanban)

**Files:**
- Modify: `components/vendor/VendorShell.tsx`
- Modify: `app/vendor/(portal)/dashboard/page.tsx`
- Modify: `app/vendor/(portal)/orders/page.tsx`

**Interfaces:**
- Consumes: Task 1 tokens; existing order-fetch data shape from `orders/page.tsx` (field names unchanged).
- Produces: no new exports, no new API calls; visual restyle + new kanban markup consuming existing data only.

- [ ] **Step 1: Read all three files in full**

Confirm `VendorShell.tsx` sits inside the `(portal)` route group that
excludes `/vendor/login` (per the standing CLAUDE.md rule) — do not
alter this route-group placement. Note the exact shape of the orders
data already fetched in `orders/page.tsx` (status field name, order id
field name) before designing the kanban columns.

- [ ] **Step 2: Restyle `VendorShell.tsx`**

- Sidebar: `bg-brand-ink` with white text, active nav item as
  `bg-brand-primary rounded-[var(--radius-pill)]` pill (matches the
  approved Vendor Dashboard preview).
- Top bar (if present): `bg-brand-surface` with `brand-ink` text.

- [ ] **Step 3: Add freeform kanban layout to `orders/page.tsx` (or `dashboard/page.tsx`, whichever currently renders the order list — read Step 1's findings to confirm which)**

Group the EXISTING fetched orders array by their existing status field
into four visual columns (New/Preparing/Ready/Completed — map to
whatever the actual status enum values are, found in Step 1), each
column a `bg-brand-primary`/`bg-brand-ink`/`bg-brand-accent`/gray pill
header over a vertical stack of `rounded-[var(--radius-card))
bg-brand-surface` order cards. This is a `.filter()`/`.reduce()` over
the array already in memory — no new fetch, no new prop, no new API
route.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Confirm no new network call was introduced**

Run: `git diff app/vendor/\(portal\)/orders/page.tsx app/vendor/\(portal\)/dashboard/page.tsx | grep -E "^\+.*(fetch\(|supabase\.|\.from\()"`
Expected: no output, or only lines that are pure re-reads of a
variable already fetched before this diff (manually confirm no new
data-source line was added — the kanban must consume existing state
only, per Global Constraints).

- [ ] **Step 6: Live-verify login → dashboard still works**

Start the dev server (`npm run app:start` or equivalent per README),
log in as a seeded vendor account, confirm the dashboard/orders page
loads with the new kanban view and no infinite-loading hang (the
known route-group-layout bug class) — this is a required live browser
check per Global Constraints, not just a build check.

- [ ] **Step 7: Commit**

```bash
git add components/vendor/VendorShell.tsx "app/vendor/(portal)/dashboard/page.tsx" "app/vendor/(portal)/orders/page.tsx"
git commit -m "style(vendor): restyle shell and add kanban order board with Figma-kit tokens"
```

---

### Task 9: Web Delivery Partner — Shell + dashboard

**Files:**
- Modify: `components/delivery/DeliveryShell.tsx`
- Modify: `app/delivery/(portal)/dashboard/page.tsx`

**Interfaces:**
- Consumes: Task 1 tokens; existing delivery-order data shape (field names unchanged).
- Produces: no new exports, no new API calls; visual restyle only (list layout, not a new kanban — per the approved preview, Delivery keeps a card-list of available/active deliveries).

- [ ] **Step 1: Read both files in full**

Confirm the `(portal)` route-group exclusion of `/delivery/login` is
intact — do not alter it.

- [ ] **Step 2: Restyle `DeliveryShell.tsx`**

Same sidebar/top-bar pattern as Task 8's `VendorShell.tsx` restyle
(`bg-brand-ink` sidebar, pill active state) for visual consistency
across portals.

- [ ] **Step 3: Restyle `dashboard/page.tsx`**

Each existing delivery/order-offer row becomes a
`rounded-[var(--radius-card)] bg-brand-surface` card with an "Accept"
button as a `bg-brand-accent rounded-[var(--radius-pill)]` pill
(matches the approved Delivery+Admin preview's left panel). Earnings
summary (if present) as a `bg-brand-ink` pill bar. No change to the
underlying accept/reject handler logic or data source.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Live-verify login → dashboard**

Log in as a seeded delivery-partner account, confirm dashboard loads
with new styling, accept/decline buttons still functional.

- [ ] **Step 6: Commit**

```bash
git add components/delivery/DeliveryShell.tsx "app/delivery/(portal)/dashboard/page.tsx"
git commit -m "style(delivery): restyle shell and dashboard with Figma-kit tokens"
```

---

### Task 10: Web Admin — Shell + dashboard (freeform vendor table)

**Files:**
- Modify: `components/admin/AdminShell.tsx`
- Modify: `app/admin/(portal)/dashboard/page.tsx`

**Interfaces:**
- Consumes: Task 1 tokens; existing admin-fetched data shape (vendor list, platform stats — field names unchanged).
- Produces: no new exports, no new API calls; visual restyle + new table markup consuming existing data only.

- [ ] **Step 1: Read the file in full**

Confirm the `(portal)` route-group exclusion of `/admin/login` is
intact. Note the exact shape of whatever vendor/platform data is
already fetched (this is the single main admin page per the Explore
findings — confirm there isn't a separate vendor-management page
before assuming `dashboard/page.tsx` is the only file to touch; if a
separate vendor list page exists, add it to this task's Files list and
apply the same pattern).

- [ ] **Step 2: Restyle `AdminShell.tsx`**

Same sidebar pattern as Tasks 8/9 for cross-portal consistency.

- [ ] **Step 3: Restyle stat cards + add freeform table to `dashboard/page.tsx`**

- Platform stat cards (active orders, vendor count, revenue): small
  `bg-brand-bg` inset cards inside a `bg-brand-surface
  rounded-[var(--radius-card)]` container, big number in
  `brand-primary`/`brand-ink`/`brand-accent` per stat (matches
  approved preview).
- Vendor table: header row `bg-brand-ink` white text; status column
  as a colored pill (`bg-brand-accent` active, `bg-brand-primary`
  paused, gray pending) — built from the EXISTING vendor array already
  in memory, no new fetch.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Confirm no new network call was introduced**

Run: `git diff "app/admin/(portal)/dashboard/page.tsx" | grep -E "^\+.*(fetch\(|supabase\.|\.from\()"`
Expected: no output (same check as Task 8 Step 5).

- [ ] **Step 6: Live-verify login → dashboard**

Log in as the seeded admin account, confirm dashboard loads with the
new stat cards and vendor table, no infinite-loading hang.

- [ ] **Step 7: Commit**

```bash
git add components/admin/AdminShell.tsx "app/admin/(portal)/dashboard/page.tsx"
git commit -m "style(admin): restyle shell and add vendor table with Figma-kit tokens"
```

---

### Task 11: Mobile Customer — Home, store, cart screens

**Files:**
- Modify: `mobile/src/app/customer/(tabs)/home.tsx`
- Modify: `mobile/src/app/customer/store/[id].tsx`
- Modify: `mobile/src/app/customer/cart.tsx`

**Interfaces:**
- Consumes: Task 2 mobile tokens (`BRAND.colors.*`, `BRAND.fonts.heading`, `BRAND.radiusPill`).
- Produces: no new exports; visual restyle only.

- [ ] **Step 1: Read all three files in full**

Confirm `useRequireSession` is called in each (or in a shared layout
they sit under) before editing — note its exact call site so Step 4
can verify it's untouched. Note whether the store screen's item
customization is an inline modal/bottom-sheet within this same file
(per the Explore agent's finding that no separate mobile
item-customize screen file exists) — if so, its restyle belongs in
this task's `store/[id].tsx` edit, using the same customize-modal
pattern as Task 7's web version, adapted to a full-screen/bottom-sheet
mobile layout.

- [ ] **Step 2: Apply new visual language**

- `home.tsx`: hero section `backgroundColor: BRAND.colors.primary`,
  category chips as pill-shaped (`borderRadius: BRAND.radiusPill`)
  `StyleSheet` views, restaurant cards `borderRadius: 16` on
  `BRAND.colors.surface`.
- `store/[id].tsx`: header `backgroundColor: BRAND.colors.ink`, menu
  item cards `borderRadius: 16`, and (per Step 1's finding) the inline
  item-customize sheet restyled with the same dark-pill
  option-group-header + green-selected-checkbox pattern as Task 7.
- `cart.tsx`: bottom-sheet/cart screen restyled to match Task 5's web
  cart pattern — green header bar, pill total/checkout buttons — same
  visual language, native `StyleSheet` implementation.
- Every color reference goes through `BRAND.colors.*`/`BRAND.radiusPill`
  from `mobile/theme.ts` — no literal hex in any of the three files.

- [ ] **Step 3: Grep for stray hex**

Run: `grep -rn "#12140f\|#b6e02e\|#faf9f4\|#F5821F\|#1E8A3E\|#0B1D3A" mobile/src/app/customer/`
Expected: no matches — every color must be a `BRAND.colors.*`
reference, not a literal (including the NEW hex values — they belong
only in `mobile/theme.ts` from Task 2).

- [ ] **Step 4: Confirm session guard preserved**

Run: `grep -rn "useRequireSession" mobile/src/app/customer/`
Expected: same call sites present as before the edit (compare against
Step 1's notes).

- [ ] **Step 5: Commit**

```bash
git add "mobile/src/app/customer/(tabs)/home.tsx" "mobile/src/app/customer/store/[id].tsx" mobile/src/app/customer/cart.tsx
git commit -m "style(mobile-customer): restyle home, store, and cart screens with Figma-kit tokens"
```

---

### Task 12: Mobile Delivery Partner — Dashboard screen

**Files:**
- Modify: `mobile/src/app/delivery/dashboard.tsx`

**Interfaces:**
- Consumes: Task 2 mobile tokens.
- Produces: no new exports; visual restyle only.

- [ ] **Step 1: Read the file in full**

Note the `useRequireSession` call site and the existing
accept/decline delivery-offer handler logic.

- [ ] **Step 2: Apply new visual language**

Match Task 9's web delivery-dashboard pattern, native equivalent:
delivery-offer cards `borderRadius: 16` on `BRAND.colors.surface`,
"Accept" button pill (`borderRadius: BRAND.radiusPill`,
`backgroundColor: BRAND.colors.accent`), earnings summary bar
`backgroundColor: BRAND.colors.ink`.

- [ ] **Step 3: Grep for stray hex and guard preservation**

Run: `grep -n "#12140f\|#b6e02e\|#faf9f4" mobile/src/app/delivery/dashboard.tsx` (expect no matches) and `grep -n "useRequireSession" mobile/src/app/delivery/dashboard.tsx` (expect same call site as Step 1).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/app/delivery/dashboard.tsx
git commit -m "style(mobile-delivery): restyle dashboard screen with Figma-kit tokens"
```

---

### Task 13: Whole-branch final review

**Files:**
- No new file changes expected — this task is a review pass, per `superpowers:subagent-driven-development`'s final-review step. Any fix it finds gets applied directly to the file(s) named in the finding.

- [ ] **Step 1: Full-repo hex grep**

Run: `grep -rn "#12140f\|#b6e02e\|#faf9f4" app/ components/ lib/ mobile/ --include="*.tsx" --include="*.ts" --include="*.css"`
Expected: zero matches anywhere in the repo — confirms every surface
in Tasks 3-12 was actually migrated off the old token values, not just
the ones this plan explicitly listed.

- [ ] **Step 2: Full build + typecheck**

Run: `npm run build && npx tsc --noEmit`
Expected: both succeed.

- [ ] **Step 3: Live browser walk of all 4 web login surfaces**

Per the standing CLAUDE.md rule (a login-breaking layout/RLS bug has
shipped twice past curl-only verification), load `/customer`,
`/vendor/login` → dashboard, `/delivery/login` → dashboard,
`/admin/login` → dashboard in an actual browser with cleared storage,
confirm each logs in and its restyled portal renders without an
infinite-loading hang or a wrong-role flash.

- [ ] **Step 4: Confirm `.font-heading` renders correctly in both themes**

Load a page using `font-heading` paired with a Tailwind weight
utility (if any exists after Tasks 3-10's edits) and confirm Poppins
700 renders, not a fallback weight — this is the Review Focus item #2
regression check.

- [ ] **Step 5: Confirm cart/checkout interaction behavior intact**

Open the cart panel, add an item, hit Escape with an unsaved note
draft in an open note field, confirm the note still flushes (Review
Focus item #5) — this is a live interaction check, not just a visual
one.

- [ ] **Step 6: Final commit (only if Step 1's grep found strays to fix)**

If Step 1 found any remaining old-token hex values, fix them in their
owning files and commit:

```bash
git add -A
git commit -m "fix(design): close remaining old-token hex references found in final review"
```
