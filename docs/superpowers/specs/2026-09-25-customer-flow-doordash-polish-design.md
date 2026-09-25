# Customer Flow DoorDash-Style Polish (Design Spec)

Third redesign pass. The DoorDash-layout rebuild (2026-09-25) restructured
the home page and restaurant detail page (sidebar, header, cuisine
carousels). This pass extends the same visual system to the remaining
customer-flow pages — checkout, order confirmation/tracking,
login/signup — and fixes a density gap the prior pass left on the home
page: carousel/grid rows currently leave large blank areas when a row has
few cards, unlike DoorDash's tightly packed grid. Presentation and layout
only — no cart/checkout/auth/order-status logic changes.

## Why

Vishal wants the full customer flow (browse → checkout → place order →
track delivery) to visually read as one consistent DoorDash-style
experience end to end, not just the browse pages. He explicitly wants
DoorDash's mobile step-by-step checkout flow deferred to the future React
Native app — this pass targets DoorDash's *web* single-page checkout
style instead. He also flagged that the current home page still has too
much unused whitespace compared to DoorDash.com's dense layout.

## Scope

**In scope**: `app/customer/checkout/page.tsx`, `app/customer/orders/[id]/page.tsx`,
`app/customer/login/page.tsx`, and a density fix to
`app/customer/page.tsx`'s carousel/grid rendering (and, if the same gap
exists there, `components/CuisineCarouselRow.tsx`).

**Out of scope**: cart logic (`lib/cart-store`), checkout API
(`app/api/cart/checkout`), auth (`lib/auth`, `supabase.auth.*` calls),
order-status polling logic, payment resolution, the `getSafeRedirect`
open-redirect guard (must stay byte-identical — this function was a
multi-round security fix in Phase 3 per CLAUDE.md and must not be
touched). Multi-step/wizard checkout is explicitly out of scope — that is
mobile-app scope per Vishal's ruling.

## Design

### 1. Checkout — single-page DoorDash style

DoorDash's web checkout keeps everything on one page: delivery address,
payment method, order summary, and a prominent place-order button, no
step wizard. The current implementation is already structurally a single
page — this is a density/visual pass, not a restructure:

- Two-column layout on desktop (stacks to one column on mobile, matching
  the project's existing mobile-first breakpoint pattern): left column
  has delivery address + payment method selection; right column is a
  sticky order-summary card (item list pulled from `useCart()`, subtotal,
  delivery fee, total, the place-order button) — mirrors DoorDash's
  right-rail summary card that stays visible while scrolling.
- Payment method radio options become selectable cards (bordered box,
  radio dot, label) instead of bare `<input type="radio">` + text, matching
  the brand-token visual language already used elsewhere (e.g.
  `CuisineChip`'s active/inactive states).
  - Delivery address display reuses the existing `label` from
  `useAddress()` — no new address-selection UI, since `AddressPicker` in
  the header already owns that job project-wide.
- All existing behavior stays: session-loading guard, logged-out redirect
  to `/customer/login?redirectTo=/customer/checkout`, empty-cart guard,
  the exact `handleSubmit` fetch call and its request/response shape,
  error display, `clearCart()` only on `paymentStatus === "success"`.

### 2. Order confirmation/tracking — status timeline + coordinate readout

DoorDash's order tracking shows a horizontal/vertical step tracker
(Order placed → Preparing → On the way → Delivered) plus a live map. No
map key exists yet, so per Vishal's choice: keep a status timeline
component in the map's visual position, and keep the existing lat/lng
text readout as a placeholder for where the map will go once a Google
Maps key exists.

- New presentational component `components/OrderStatusTimeline.tsx`:
  takes the order's current `status` and renders 4 fixed steps (Placed,
  Preparing, On the way, Delivered) with the current step highlighted and
  prior steps marked complete. Maps the existing 8-value `OrderStatus`
  type onto these 4 display steps:
  - `placed`, `accepted` → step 1 (Placed)
  - `preparing`, `ready` → step 2 (Preparing)
  - `assigned`, `picked_up` → step 3 (On the way)
  - `delivered` → step 4 (Delivered)
  - `cancelled` → special-cased, renders a standalone cancelled state
    instead of the 4-step tracker (matches the existing early-return
    pattern for `payment.status === "failed"`)
- The existing lat/lng coordinate line (shown only for `assigned`/
  `picked_up`, per the existing `SHOW_LOCATION_FOR` gate — unchanged)
  moves into a bordered box styled like a map placeholder (e.g. a light
  gray box with a pin icon and the coordinate text centered), sitting
  where a real map would go once available. No new library, no new
  fetch — same `partnerLocation` state, same polling.
- Order summary (id, total, payment status/method) gets the same
  card-style treatment as the checkout page's summary card for visual
  consistency.

### 3. Login/signup — re-skin only

Wrap the existing centered-card form in the same page-level spacing/
container treatment as other customer pages (consistent with how it now
sits inside the sidebar/header shell from the prior redesign — this page
already renders inside `app/customer/layout.tsx`, so this is a class-only
pass on the card itself: border, shadow, padding, matching
`RestaurantCard`'s `rounded-xl border ... bg-brand-surface shadow-sm`
treatment). No new fields, no flow change. `getSafeRedirect`,
`handleLogin`, `handleSignup`, and every input's `value`/`onChange` stay
byte-identical.

### 4. Home page density fix

Current behavior: `CuisineCarouselRow` renders a `flex` row that only
takes up as much width as it has cards for (e.g. a cuisine with 1
restaurant leaves the rest of the row blank instead of the card growing
or the row wrapping). Two changes:

- Rows with few cards (fewer than fit one visible screen width) should
  not force a wide empty gap — the simplest fix consistent with
  "no new dependencies": cap each carousel row's card width response­ively
  and let the row's flex container start from the left with `justify-start`
  (already implicit) so it never centers or stretches; this alone removes
  most of the visual "empty on the right" effect, since a short row
  simply ends where its cards end rather than being forced full-width by
  a parent that expects a full row.
- Additionally, increase information density to match DoorDash's grid:
  reduce `CuisineCarouselRow`'s per-card width from `w-64` to a slightly
  narrower `w-56`, and reduce the gap between cards from `gap-4` to
  `gap-3`, so more cards are visible without scrolling on a typical
  desktop viewport — a direct response to Vishal's "remove whitespace,
  add more items, make the page fully packed" instruction.
- The flat grid fallback (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`,
  used for the cuisine-chip-filtered view and the "ungrouped restaurant"
  fallback from the prior plan's final-review fix) gets one more
  breakpoint step — `xl:grid-cols-4` — so it also densifies on wide
  screens instead of stopping at 3 columns.

## Data flow

No new data flow anywhere in this spec. Every page keeps its existing
`useEffect`/fetch/poll pattern; only JSX structure and Tailwind classes
change, plus the new purely-presentational `OrderStatusTimeline`
component (props: `{ status: OrderStatus }`, no fetching).

## Error handling

Unchanged. Every existing error/loading/empty-state branch
(`sessionLoading`, `!userId` redirect, empty cart, checkout `error`
state, order-fetch `error` state, payment-failed branch) stays exactly
as-is — this pass only changes what renders inside the success paths'
JSX.

## Testing / verification

- `npm run build` after each task, per standing project rule.
- Live Playwright walkthrough of the full flow end to end at desktop and
  the existing 390×844 mobile viewport: browse → add to cart → checkout
  (verify address/payment/summary all render, place a mock order) → order
  confirmation page (verify status timeline renders and updates through
  at least one status transition, or is verified against each of the 4
  display steps via direct navigation/seed data if a live transition
  isn't practical in one sitting) → login/signup page re-skin (verify
  `getSafeRedirect` behavior is unchanged: a same-origin `redirectTo`
  still redirects correctly, an off-origin one still falls back to
  `/customer`) → home page density (verify a single-restaurant cuisine
  row no longer stretches empty, verify more cards fit per row than
  before).
- Explicitly re-verify `getSafeRedirect`'s existing byte-for-byte
  correctness after the login page edit (this function survived 3 review
  rounds in Phase 3 and must not regress — CLAUDE.md's standing rule).

## Open questions / rulings already made (from brainstorming)

- Checkout stays single-page (DoorDash web style), not a step wizard —
  wizard flow is explicitly deferred to the future mobile app.
- Order tracking uses a 4-step status timeline plus the existing lat/lng
  readout as a map placeholder — no new map library/dependency.
- Login/signup gets a re-skin only, no structural or flow change.
- Home page carousel/grid density increases (narrower cards, tighter
  gaps, one more grid breakpoint) to remove whitespace and match
  DoorDash's packed layout, per explicit instruction.
