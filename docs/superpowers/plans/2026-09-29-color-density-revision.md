# Color-Density Revision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved "REVISION 2" colored-section visual
density (matching the Artifact canvas's `CheckoutV2`/`OrderConfirmV2`/
`VendorDashboardV2`/`DeliveryAdminV2` boards exactly) across every
surface from the original Figma-kit redesign, and fix checkout fields
to start blank every session instead of persisting/autofilling.

**Architecture:** New CSS custom properties for section-tint
backgrounds are added once to `app/globals.css` (web) and as reusable
color constants in `mobile/theme.ts` (mobile), then every page/screen
consumes them by class/style reference — no inline one-off hex.
Bug fix (Task 1) is isolated and unlocks nothing else, so it goes
first and independently.

**Tech Stack:** Next.js (App Router, TS) + Tailwind CSS v4 (web),
Expo/React Native + StyleSheet (mobile). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-29-color-density-revision-design.md`
(addendum to `docs/superpowers/specs/2026-09-29-figma-kit-redesign-design.md`,
whose token values are unchanged and still binding)

## Global Constraints

- Match the approved "REVISION 2" preview boards **exactly** — no
  deviation, per Vishal's explicit instruction. When a page has no
  direct V2 mockup (e.g. home page), apply the same pattern language
  (tinted section gradients, solid-color header/footer bands, solid
  stat-card fills) consistently, not a new invented style.
- New tint tokens added to `app/globals.css` `@theme inline` block:
  `--color-brand-primary-tint: #FFF4E8`, `--color-brand-accent-tint:
  #EAF7EE`, `--color-brand-ink-tint: #E8ECF4`. Mirror in
  `mobile/theme.ts` as `BRAND.colors.primaryTint`/`accentTint`/
  `inkTint`. No component may hardcode these hex values directly.
- Every existing session/role guard, route-group placement, cart-panel
  handler behavior, money arithmetic (integer cents), and
  `OrderStatusTimeline`'s exhaustiveness-typed mapping from the
  original redesign plan remain unchanged — this is a background/
  visual-density pass only, same non-negotiables as before.
- `npm run build` must pass after every web task.
- Task 1 (blank-every-session fix) touches `lib/address-store.tsx` and
  `app/customer/checkout/page.tsx` — real behavior change, reviewed
  with the same rigor as a logic task, not a visual one.

## Review Focus

1. **A "colorful" background change accidentally reducing text
   contrast further** — tinted backgrounds (`#FFF4E8`, `#EAF7EE`,
   `#E8ECF4`) are light, so dark-ink text on them should stay readable;
   the existing white-text-on-brand-primary/-accent contrast problem
   (flagged, not fixed, in the original redesign's final review) must
   not get a second instance introduced on a NEW solid-color band this
   plan adds (e.g. a new solid-orange footer with white text needs the
   same contrast scrutiny as the buttons already flagged).
2. **Address/name/email fields silently still prefilling** on a second
   test visit — the fix must be verified live (reload the page after
   filling and submitting once), not just by reading the code, since a
   `localStorage` write path that isn't fully removed will look correct
   in a fresh single-session read.
3. **A new tint token being added ad-hoc per-file** instead of
   centrally in `app/globals.css`/`mobile/theme.ts` — grep for raw
   `#FFF4E8`/`#EAF7EE`/`#E8ECF4` hex outside the two token files after
   every task.
4. **Vendor/Admin kanban column backgrounds losing their existing
   status-grouping legibility** once a tinted column background is
   added — the column's header pill color and its new tinted body
   background must still visually pair (same hue family), not clash.
5. **Mobile screens receiving a background tint that fights with
   existing card shadows/borders** — `elevation`/`shadowColor` styling
   in React Native can look wrong against a non-white background;
   verify each restyled mobile screen still renders cards with visible
   separation from their new tinted background.

---

### Task 1: Fix checkout fields to start blank every session

**Files:**
- Modify: `lib/address-store.tsx`
- Modify: `app/customer/checkout/page.tsx`

**Interfaces:**
- Consumes: existing `AddressProvider`/`useAddress()` API (from `lib/address-store.tsx`) and the existing `loadProfile` effect in `app/customer/checkout/page.tsx`.
- Produces: `useAddress()`'s shape is unchanged (still returns `lat, lng, label, deliveryDetails, setDeliveryDetails`) — only the persistence side-effect is removed. `CheckoutPage`'s recipientName/recipientEmail state initialization changes from profile-fetched values to always-empty strings.

- [ ] **Step 1: Read `lib/address-store.tsx` in full**

Locate the `localStorage.getItem(STORAGE_KEY)` read (used to hydrate
initial state) and the `localStorage.setItem(STORAGE_KEY, ...)` write
(used to persist on every `setDeliveryDetails` call) — both around
lines 49 and 77 per this codebase's current structure.

- [ ] **Step 2: Remove the localStorage persistence**

Remove the `localStorage.getItem` hydration call so the provider
always starts from its default empty `DeliveryDetails` state, and
remove the `localStorage.setItem` write inside the effect/handler that
currently persists on every address change. Do not remove the
`AddressProvider`/context structure itself — only the browser-storage
read/write calls. If removing these calls leaves an unused
`STORAGE_KEY` constant or an empty try/catch block, clean those up too
(dead code from the removed feature).

- [ ] **Step 3: Read `app/customer/checkout/page.tsx`'s `loadProfile` effect in full**

Locate the effect that fetches the session's email and profile
`full_name` and sets `recipientName`/`recipientEmail` state from it
(the effect starting around where `supabase.auth.getSession()` and
`.from("users").select("full_name")` are called, near where the
`useEffect(() => { setDeliveryDetails(address); ... }, [address])` and
the router-redirect effect from the earlier fix sit).

- [ ] **Step 4: Remove the profile-based autofill**

Remove the `setRecipientName`/`setRecipientEmail` calls inside
`loadProfile` (or remove the whole effect if fetching the profile
served no other purpose in this file — check whether `sessionData`/
`profile` are used for anything else in the file before deleting the
effect entirely; if they are, keep the fetch but stop it from calling
`setRecipientName`/`setRecipientEmail`). `recipientName`/
`recipientEmail`'s `useState` initial values should already be `""`
(empty string) per the current code — confirm this and leave them as
the sole source of the field's starting value.

- [ ] **Step 5: Verify with npm run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Live-verify the fix**

Start the dev server, log in, go to checkout, type a name/email/
address, do NOT place the order, reload the page. Expected: all three
fields are empty again (not repopulated from the previous input or
from profile/localStorage). This is a required live check per this
plan's Review Focus #2 — a code read alone is not sufficient evidence.

- [ ] **Step 7: Commit**

```bash
git add lib/address-store.tsx app/customer/checkout/page.tsx
git commit -m "fix(checkout): stop persisting/autofilling contact and address fields across sessions"
```

---

### Task 2: Web design tokens — add tint tokens

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `--color-brand-primary-tint` (#FFF4E8), `--color-brand-accent-tint` (#EAF7EE), `--color-brand-ink-tint` (#E8ECF4) inside the existing `@theme inline` block. Every later web task in this plan consumes these three tokens by class name (`bg-brand-primary-tint`, etc.) or CSS var reference in a gradient.

- [ ] **Step 1: Add the three tint tokens to the `@theme inline` block**

```css
--color-brand-primary-tint: #FFF4E8;
--color-brand-accent-tint: #EAF7EE;
--color-brand-ink-tint: #E8ECF4;
```

- [ ] **Step 2: Verify with npm run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat(design): add brand color tint tokens for section backgrounds"
```

---

### Task 3: Mobile design tokens — add tint constants

**Files:**
- Modify: `mobile/theme.ts`

**Interfaces:**
- Produces: `BRAND.colors.primaryTint` (#FFF4E8), `BRAND.colors.accentTint` (#EAF7EE), `BRAND.colors.inkTint` (#E8ECF4). Mobile tasks in this plan consume these.

- [ ] **Step 1: Add the three tint constants to `BRAND.colors`**

```ts
primaryTint: "#FFF4E8",
accentTint: "#EAF7EE",
inkTint: "#E8ECF4",
```

- [ ] **Step 2: Commit**

```bash
git add mobile/theme.ts
git commit -m "feat(design): add brand color tint constants for section backgrounds (mobile)"
```

---

### Task 4: Web Customer — Checkout + order tracking color-density

**Files:**
- Modify: `app/customer/checkout/page.tsx`
- Modify: `components/OrderStatusTimeline.tsx`
- Modify: `app/customer/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 2's tint tokens.
- Produces: no new exports; visual density change only.

- [ ] **Step 1: Read all three files in full**

Confirm Task 1's fix is already merged into `checkout/page.tsx` before
starting (this task builds on it). Note `OrderStatusTimeline.tsx`'s
exhaustiveness-typed step mapping and `cancelled` early-return branch
(unchanged since the original redesign — do not touch).

- [ ] **Step 2: Match `CheckoutV2`'s exact visual pattern**

Reference: the approved Artifact canvas board `CheckoutV2.dc.html`.
Apply:
- Page background: `linear-gradient(180deg, var(--color-brand-primary-tint) 0%, var(--color-brand-bg) 260px)` (or Tailwind arbitrary-value equivalent).
- Header: solid `bg-brand-ink` band with white heading text.
- Each form section (Contact/Address/Payment) gets a colored top
  border (`border-t-4 border-brand-primary` / `border-brand-accent` /
  `border-brand-ink` respectively) and its section heading in that
  same color.
- Empty input fields get a tinted background matching their section's
  color family (e.g. `bg-brand-primary-tint` for contact fields,
  `bg-brand-accent-tint` for address fields) with a matching-hue
  border, not a plain white/gray input.
- Sticky footer: solid `bg-brand-primary` band, white "Total to pay"
  label, `bg-brand-accent` pill button for the submit action.

- [ ] **Step 3: Match `OrderConfirmV2`'s exact visual pattern on `app/customer/orders/[id]/page.tsx`**

Reference: the approved Artifact canvas board `OrderConfirmV2.dc.html`.
Apply:
- Page background: solid `bg-brand-ink` band for the top ~220px
  (containing the order-number heading and success checkmark),
  transitioning to `bg-brand-bg` below.
- The `OrderStatusTimeline` component's containing card becomes a
  white `rounded-[var(--radius-card)]` card with a stronger shadow,
  sitting on the navy band's lower edge (overlapping slightly, per the
  V2 mockup's layered look) — restyle the PAGE's wrapper around the
  timeline component, not the timeline's own internal step-marker
  logic (already correctly colored per the original redesign's Task 7).
- Add two info cards below the timeline: a `bg-brand-accent-tint` card
  for the total, a `bg-brand-primary-tint` card for the payment method
  — both reading from data already rendered elsewhere on this page
  (no new fetch).

- [ ] **Step 4: Verify with npm run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 5: Grep for stray hex outside token files**

Run: `git diff app/customer/checkout/page.tsx app/customer/orders/\[id\]/page.tsx components/OrderStatusTimeline.tsx | grep -E "^\+.*#[0-9a-fA-F]{3,6}"`
Expected: no output — every color reference goes through a token class.

- [ ] **Step 6: Confirm `OrderStatusTimeline`'s exhaustiveness mapping untouched**

Run: `npx tsc --noEmit`
Expected: no error.

- [ ] **Step 7: Commit**

```bash
git add app/customer/checkout/page.tsx components/OrderStatusTimeline.tsx "app/customer/orders/[id]/page.tsx"
git commit -m "style(customer): apply REVISION 2 color-density pattern to checkout and order tracking"
```

---

### Task 5: Web Customer — Home + restaurant detail color-density

**Files:**
- Modify: `components/HeroSearch.tsx`
- Modify: `components/PromoBanner.tsx`
- Modify: `components/CategoryIconRow.tsx`
- Modify: `app/customer/stores/[id]/page.tsx`
- Modify: `components/StoreRatingSummary.tsx`

**Interfaces:**
- Consumes: Task 2's tint tokens.
- Produces: no new exports; visual density change only.

- [ ] **Step 1: Read all five files in full**

These are the files the original redesign's Tasks 3-4 already
restyled with tokens — this task adds section-background density on
top, without touching fetch/prop/routing logic (already verified
clean in the original redesign; re-verify it's still clean after your
edit).

- [ ] **Step 2: Apply colored section backgrounds**

- `HeroSearch.tsx`: already has an orange hero band from the original
  redesign — extend it with a subtle gradient
  (`linear-gradient(120deg, var(--color-brand-primary) 55%, var(--color-brand-primary-tint) 100%)`)
  rather than a flat fill, matching the V2 boards' less-flat look.
- `PromoBanner.tsx`: give its container a `bg-brand-ink-tint` or
  `bg-brand-accent-tint` background (pick whichever reads better
  against its existing image/text content) instead of a white/gray
  card.
- `CategoryIconRow.tsx`: wrap the row in a `bg-brand-primary-tint`
  section band instead of sitting directly on the flat page
  background.
- `app/customer/stores/[id].tsx`'s menu-category sections: alternate
  or apply a single consistent tint (`bg-brand-accent-tint`) behind
  the menu-item list area, distinct from the page's base background.
- `StoreRatingSummary.tsx`: give its card a `bg-brand-primary-tint`
  background instead of plain white.

- [ ] **Step 3: Verify with npm run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Grep for stray hex**

Run: `git diff components/HeroSearch.tsx components/PromoBanner.tsx components/CategoryIconRow.tsx "app/customer/stores/[id]/page.tsx" components/StoreRatingSummary.tsx | grep -E "^\+.*#[0-9a-fA-F]{3,6}"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add components/HeroSearch.tsx components/PromoBanner.tsx components/CategoryIconRow.tsx "app/customer/stores/[id]/page.tsx" components/StoreRatingSummary.tsx
git commit -m "style(customer): apply REVISION 2 color-density pattern to home and restaurant detail"
```

---

### Task 6: Web Customer — Cart panel + item customization color-density

**Files:**
- Modify: `components/CartPanel.tsx`
- Modify: `components/ItemCustomizationModal.tsx`

**Interfaces:**
- Consumes: Task 2's tint tokens.
- Produces: no new exports, no prop/handler signature change; visual density change only.

- [ ] **Step 1: Read both files in full, re-confirm handler locations**

Same fragile-logic map as the original redesign's Task 5/Task 7:
`CartPanel.tsx`'s `clearCart` onClick, `Link href`, cart-store hooks
(confirmed to have NO drawer/Escape logic on this branch); `
ItemCustomizationModal.tsx`'s `lineId`/cart-model calls, `toggleOption`,
price math. All must stay byte-identical.

- [ ] **Step 2: Apply colored section backgrounds**

- `CartPanel.tsx`: give the sidebar's line-items area a subtle
  `bg-brand-accent-tint` background behind the white line-item rows
  (rows stay white/card-like, the surrounding scroll area gets the
  tint) instead of sitting on plain white.
- `ItemCustomizationModal.tsx`: give the scrollable options area a
  `bg-brand-primary-tint` background behind the white option-group
  cards, matching the denser look from the V2 boards.

- [ ] **Step 3: Verify with npm run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Diff-review for handler preservation**

Run: `git diff components/CartPanel.tsx components/ItemCustomizationModal.tsx`
Expected: every changed line is inside a `className`/`style` attribute
or JSX-layout wrapper — no handler/hook body line changed. If any
handler body line shows as changed, revert that hunk and redo the
restyle around it.

- [ ] **Step 5: Commit**

```bash
git add components/CartPanel.tsx components/ItemCustomizationModal.tsx
git commit -m "style(customer): apply REVISION 2 color-density pattern to cart panel and item customization"
```

---

### Task 7: Web Vendor — color-density pass

**Files:**
- Modify: `components/vendor/VendorShell.tsx`
- Modify: `app/vendor/(portal)/orders/page.tsx`
- Modify: `app/vendor/(portal)/dashboard/page.tsx`

**Interfaces:**
- Consumes: Task 2's tint tokens.
- Produces: no new exports, no new data/fetch; visual density change only, consuming the exact same kanban data the original redesign's Task 8 already wired up.

- [ ] **Step 1: Read all three files in full**

Confirm the `(portal)` route-group exclusion of `/vendor/login` is
intact (do not alter). Note the kanban's existing column
grouping/status mapping from the original redesign — unchanged.

- [ ] **Step 2: Match `VendorDashboardV2`'s exact visual pattern**

Reference: the approved Artifact canvas board `VendorDashboardV2.dc.html`.
Apply:
- Sidebar: `linear-gradient(180deg, var(--color-brand-ink) 0%, #132849 100%)` instead of a flat navy fill.
- Main content area: `linear-gradient(180deg, var(--color-brand-primary-tint) 0%, var(--color-brand-bg) 160px)` background instead of flat gray.
- Stat cards: solid brand-color fills (`bg-brand-primary`/`bg-brand-ink`/`bg-brand-accent`) with white text for the first three stats, white card with dark text for the fourth (revenue) — matching the V2 board's 3-solid-plus-1-white pattern.
- Kanban columns: each column gets a tinted background matching its header color family (`bg-brand-primary-tint` behind the New column, `bg-brand-ink-tint` behind Preparing, `bg-brand-accent-tint` behind Ready, a neutral gray-tint behind Completed) — the order cards inside stay white.

- [ ] **Step 3: Verify with npm run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Confirm no new network call introduced**

Run: `git diff "app/vendor/(portal)/orders/page.tsx" "app/vendor/(portal)/dashboard/page.tsx" | grep -E "^\+.*(fetch\(|supabase\.|\.from\()"`
Expected: no output.

- [ ] **Step 5: Live-verify login → dashboard**

Log in as a seeded vendor account, confirm the denser color scheme
renders correctly and the kanban board's status grouping is still
legible (Review Focus #4 — check that each column's header color and
its new tinted body still visually pair).

- [ ] **Step 6: Commit**

```bash
git add components/vendor/VendorShell.tsx "app/vendor/(portal)/orders/page.tsx" "app/vendor/(portal)/dashboard/page.tsx"
git commit -m "style(vendor): apply REVISION 2 color-density pattern"
```

---

### Task 8: Web Delivery — color-density pass

**Files:**
- Modify: `components/delivery/DeliveryShell.tsx`
- Modify: `app/delivery/(portal)/dashboard/page.tsx`

**Interfaces:**
- Consumes: Task 2's tint tokens.
- Produces: no new exports, no new data/fetch; visual density change only.

- [ ] **Step 1: Read both files in full**

Confirm the `(portal)` route-group exclusion of `/delivery/login` is
intact. Note the accept/decline handler logic — unchanged since the
original redesign's Task 9.

- [ ] **Step 2: Match `DeliveryAdminV2`'s left panel exact visual pattern**

Reference: the approved Artifact canvas board `DeliveryAdminV2.dc.html`
(left/delivery half specifically). Apply:
- Panel/page background: `linear-gradient(180deg, var(--color-brand-primary-tint) 0%, #fff 200px)` wrapping the whole content area, replacing the flat gray background.
- Header bar: solid `bg-brand-primary` band with white heading text (was likely already navy-sidebar-adjacent per Task 9's original restyle — this task's header refers to the content area's own header, not the sidebar).
- Each delivery-offer card gets a colored left border (`border-l-4 border-brand-primary`) matching the V2 board.
- Earnings summary bar stays `bg-brand-ink` (already correct from the original redesign).

- [ ] **Step 3: Verify with npm run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Live-verify login → dashboard**

Log in as a seeded delivery-partner account, confirm the denser color
scheme renders and accept/decline buttons still work.

- [ ] **Step 5: Commit**

```bash
git add components/delivery/DeliveryShell.tsx "app/delivery/(portal)/dashboard/page.tsx"
git commit -m "style(delivery): apply REVISION 2 color-density pattern"
```

---

### Task 9: Web Admin — color-density pass

**Files:**
- Modify: `components/admin/AdminShell.tsx`
- Modify: `app/admin/(portal)/dashboard/page.tsx`

**Interfaces:**
- Consumes: Task 2's tint tokens.
- Produces: no new exports, no new data/fetch; visual density change only, consuming the exact same vendor-table data the original redesign's Task 10 already wired up.

- [ ] **Step 1: Read both files in full**

Confirm the `(portal)` route-group exclusion of `/admin/login` is
intact. Confirm the revenue-calculation fix from the final review
(`Math.round(o.total * 100)`, excluding cancelled orders) is present
and untouched by this task.

- [ ] **Step 2: Match `DeliveryAdminV2`'s right panel exact visual pattern**

Reference: the approved Artifact canvas board `DeliveryAdminV2.dc.html`
(right/admin half specifically). Apply:
- Panel/page background: `linear-gradient(180deg, var(--color-brand-ink-tint) 0%, #fff 200px)`.
- Header bar: solid `bg-brand-ink` band with white heading text.
- Stat cards: solid brand-color fills (`bg-brand-primary`/`bg-brand-ink`/`bg-brand-accent`) with white text for all three stat cards (active orders/vendors/revenue) — matching the V2 board's fully-solid admin stat row (distinct from Vendor's 3-solid-plus-1-white pattern).
- Vendor table: keep the existing `bg-brand-ink` header row and status
  pills (unchanged from the original redesign's Task 10) — this task
  only adds the surrounding panel background and stat-card fill
  change, not the table itself.

- [ ] **Step 3: Verify with npm run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Confirm no new network call introduced**

Run: `git diff "app/admin/(portal)/dashboard/page.tsx" | grep -E "^\+.*(fetch\(|supabase\.|\.from\()"`
Expected: no output.

- [ ] **Step 5: Live-verify login → dashboard**

Log in as the seeded admin account, confirm the denser color scheme
renders and the vendor table still displays correctly.

- [ ] **Step 6: Commit**

```bash
git add components/admin/AdminShell.tsx "app/admin/(portal)/dashboard/page.tsx"
git commit -m "style(admin): apply REVISION 2 color-density pattern"
```

---

### Task 10: Mobile Customer — color-density pass

**Files:**
- Modify: `mobile/src/app/customer/(tabs)/home.tsx`
- Modify: `mobile/src/app/customer/store/[id].tsx`
- Modify: `mobile/src/app/customer/cart.tsx`
- Modify: `mobile/components/ItemCustomizationModal.tsx`
- Modify: `mobile/components/StoreCard.tsx`

**Interfaces:**
- Consumes: Task 3's tint constants.
- Produces: no new exports; visual density change only.

- [ ] **Step 1: Read all five files in full**

These are the exact files the original redesign's Task 11 already
restyled with tokens — this task adds section-background density on
top. Note `useRequireSession` call sites (home.tsx:50, cart.tsx:20,
store/[id].tsx:93 per the original task) — must remain unchanged.

- [ ] **Step 2: Apply colored section backgrounds (React Native StyleSheet)**

- `home.tsx`: give the screen's root `ScrollView`/container a subtle
  tint (`backgroundColor: BRAND.colors.primaryTint`) behind the hero,
  transitioning to `BRAND.colors.background` further down (React
  Native has no CSS gradients without an extra library — use a plain
  `backgroundColor` on the top section container instead of a
  gradient, or use `expo-linear-gradient` ONLY if it's already a
  project dependency; check `mobile/package.json` first — if it's not
  already a dependency, do not add it, use a flat tint-colored View
  section instead).
- `store/[id].tsx`: give the menu-list container a
  `backgroundColor: BRAND.colors.accentTint` instead of the flat
  `background`.
- `cart.tsx`: give the line-items scroll area a
  `backgroundColor: BRAND.colors.accentTint`.
- `ItemCustomizationModal.tsx`: give the scrollable options area a
  `backgroundColor: BRAND.colors.primaryTint`.
- `StoreCard.tsx`: no background change needed (it's a card sitting ON
  a tinted parent, per the above) — confirm its own `backgroundColor`
  stays `BRAND.colors.surface` (white) so it contrasts against the new
  tinted parent background (Review Focus #5 — verify shadow/border
  still separates the card visibly).

- [ ] **Step 3: Check for `expo-linear-gradient` before using it anywhere**

Run: `grep -n "expo-linear-gradient" mobile/package.json`
If absent: use flat `backgroundColor` tints only, no gradients, in
every file this task touches (and note this constraint applies to
Task 11 too).

- [ ] **Step 4: Grep for stray hex and confirm useRequireSession unchanged**

Run: `grep -rn "#FFF4E8\|#EAF7EE\|#E8ECF4" mobile/src/app/customer/ mobile/components/ItemCustomizationModal.tsx mobile/components/StoreCard.tsx`
Expected: no matches outside `mobile/theme.ts` (every reference must go
through `BRAND.colors.*Tint`, never a literal).
Run: `grep -n "useRequireSession" mobile/src/app/customer/\(tabs\)/home.tsx mobile/src/app/customer/cart.tsx "mobile/src/app/customer/store/[id].tsx"`
Expected: same call sites as before this task's edit.

- [ ] **Step 5: Commit**

```bash
git add "mobile/src/app/customer/(tabs)/home.tsx" "mobile/src/app/customer/store/[id].tsx" mobile/src/app/customer/cart.tsx mobile/components/ItemCustomizationModal.tsx mobile/components/StoreCard.tsx
git commit -m "style(mobile-customer): apply REVISION 2 color-density pattern"
```

---

### Task 11: Mobile Delivery — color-density pass

**Files:**
- Modify: `mobile/src/app/delivery/dashboard.tsx`

**Interfaces:**
- Consumes: Task 3's tint constants.
- Produces: no new exports; visual density change only.

- [ ] **Step 1: Read the file in full**

Note `useRequireSession("/login/delivery")`'s call site (line 39 per
the original redesign's Task 12) and the accept/decline/toggle-online
handler logic — must remain unchanged.

- [ ] **Step 2: Apply colored section background**

Give the screen's root container a
`backgroundColor: BRAND.colors.primaryTint` behind the delivery-offer
cards (cards stay `BRAND.colors.surface` white), matching the same
pattern as Task 10's mobile customer screens. No gradients (per Task
10 Step 3's finding on `expo-linear-gradient` availability — reuse
that finding, don't re-check unless this task's own read of
`mobile/package.json` suggests otherwise).

- [ ] **Step 3: Grep for stray hex and confirm useRequireSession unchanged**

Run: `grep -n "#FFF4E8\|#EAF7EE\|#E8ECF4" mobile/src/app/delivery/dashboard.tsx` (expect no matches) and `grep -n "useRequireSession" mobile/src/app/delivery/dashboard.tsx` (expect the same line/call as before this task's edit).

- [ ] **Step 4: Commit**

```bash
git add mobile/src/app/delivery/dashboard.tsx
git commit -m "style(mobile-delivery): apply REVISION 2 color-density pattern"
```

---

### Task 12: Whole-branch final review

**Files:**
- No new file changes expected — this task is a review pass. Any fix
  it finds gets applied directly to the file(s) named in the finding.

- [ ] **Step 1: Full-repo tint-hex grep**

Run: `grep -rn "#FFF4E8\|#EAF7EE\|#E8ECF4" app/ components/ lib/ mobile/ --include="*.tsx" --include="*.ts" --include="*.css"`
Expected: matches ONLY inside `app/globals.css` and `mobile/theme.ts`
— any match elsewhere means a component hardcoded the tint instead of
using the token/constant.

- [ ] **Step 2: Full build + typecheck**

Run: `npm run build && npx tsc --noEmit`
Expected: both succeed.

- [ ] **Step 3: Live browser walk of all 4 web login surfaces**

Load `/customer` (including checkout and an order confirmation page),
`/vendor/login` → dashboard, `/delivery/login` → dashboard,
`/admin/login` → dashboard, confirm each renders the REVISION 2 color
density correctly and no portal regressed to a plain white/gray look.

- [ ] **Step 4: Re-verify Task 1's blank-every-session fix live**

Type into checkout's name/email/address fields, reload without
submitting, confirm all three are still empty (this is the
highest-risk finding class per this plan's Review Focus #2 — verify
it again at the whole-branch level, not just Task 1's own check).

- [ ] **Step 5: Confirm cart/checkout interaction behavior intact**

Add an item to cart, open the cart panel, confirm it still opens/
displays correctly with its new tinted background and no regression to
its `clearCart`/checkout-link behavior.

- [ ] **Step 6: Final commit (only if Step 1's grep found strays to fix)**

If Step 1 found any stray tint hex, fix them in their owning files and
commit:

```bash
git add -A
git commit -m "fix(design): close remaining stray tint hex references found in final review"
```
