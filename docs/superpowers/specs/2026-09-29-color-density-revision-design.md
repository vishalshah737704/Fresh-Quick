# Color-Density Revision — Web + Mobile (Addendum to Figma-Kit Redesign)

Date: 2026-09-29
Status: Approved (Artifact canvas "REVISION 2" boards approved by Vishal)
Supersedes visual density decisions only — token values from
`docs/superpowers/specs/2026-09-29-figma-kit-redesign-design.md` are
unchanged; this addendum governs how those tokens are applied.

## Source of truth

The approved "REVISION 2" boards on the existing preview Artifact
(`https://claude.ai/artifact/EUgvUZCvWZuMpbDe3fV43v`): `CheckoutV2`,
`OrderConfirmV2`, `VendorDashboardV2`, `DeliveryAdminV2`. Every page in
scope must match this look **exactly, no deviation**, per Vishal's
explicit instruction — colored section backgrounds/gradients replacing
plain white/gray, solid-color footer/header bands, tinted card
accents, same button styles and pill shapes already established.

## Problems being fixed

1. **Too much white/blank space.** The original redesign (Tasks 1-13)
   used white cards on a flat light-gray page background — correct
   token usage, but visually flat and "blank" per Vishal's live
   feedback on the checkout and order-tracking pages. Every page in
   scope gets colored section backgrounds (light tinted washes:
   `#FFF4E8` orange-tint, `#EAF7EE` green-tint, `#E8ECF4` navy-tint) or
   solid brand-color bands (headers, footers, stat cards) — never a
   plain white-on-gray page again.
2. **Checkout/profile fields persist across sessions when they
   shouldn't.** `lib/address-store.tsx` persists delivery address to
   `localStorage` on purpose (existing feature). Vishal wants **every**
   checkout field blank on every visit, including name/email
   (currently autofilled from the logged-in user's profile via a
   `loadProfile` effect in `app/customer/checkout/page.tsx`). Fix:
   stop persisting address to `localStorage`, and stop autofilling
   name/email from profile — all three start blank every session.
3. **`router.push` inside render body bug** — already fixed and
   committed (`6a7a07a`) on 2026-09-29, before this addendum. Not
   revisited here.

## Visual pattern to apply everywhere (from the approved V2 boards)

- **Page/section backgrounds**: replace flat `bg-brand-bg` (#F4F4F4)
  page wrappers with a tinted gradient or solid tint appropriate to
  that section's dominant token — e.g. `linear-gradient(180deg,
  #FFF4E8 0%, #F4F4F4 200-260px)` for orange-led sections, `#E8ECF4`
  for navy-led sections, `#EAF7EE` for green-led sections. Every major
  page/portal needs at least one non-white/non-flat-gray background
  treatment — no page should render as plain white cards on plain gray.
- **Headers**: solid `bg-brand-ink` (navy) or `bg-brand-primary`
  (orange) full-width bands with white text, not a thin white top bar.
- **Footers/CTAs**: solid-color bands (`bg-brand-primary` totals,
  `bg-brand-accent` confirm actions) spanning full width, matching
  `CheckoutV2`'s footer treatment exactly.
- **Stat/info cards**: solid brand-color fills with white text for
  primary metrics (matches `VendorDashboardV2`'s stat row and
  `DeliveryAdminV2`'s admin stat cards), not white cards with colored
  text only.
- **Vendor/Delivery/Admin sidebars**: subtle navy gradient
  (`linear-gradient(180deg, #0B1D3A 0%, #132849 100%)`) instead of flat
  navy, matching `VendorDashboardV2`.
- **Kanban/order-list columns**: each column gets a light tinted
  background matching its header color (matches `VendorDashboardV2`'s
  `colBg` per column), not a flat white/gray column.
- This is a density/background change, not a token change — reuse
  every existing `brand-primary`/`brand-accent`/`brand-ink` token;
  tints are computed once as new CSS custom properties (see Global
  Constraints in the plan) so they stay centralized, never inline
  one-off hex per component.

## Scope — every surface from the original redesign, revisited

Same 6 surfaces as the original plan: Web Customer (home, restaurant
detail, cart, checkout, order tracking/confirmation, item
customization), Web Vendor, Web Delivery, Web Admin, Mobile Customer,
Mobile Delivery. This addendum's tasks restyle backgrounds/section
treatments only — no new logic, no new data, same guardrails as the
original plan (route-group placement, session guards, money
arithmetic, cart panel handler preservation all still apply
unchanged).

## Out of scope

- Any change to the open WCAG-contrast design decision (white text on
  brand-primary orange / brand-accent green) flagged in the original
  redesign's final review — not addressed by this addendum, still
  awaiting Vishal's call.
- Any new feature or schema change.
- Real device/simulator mobile testing (still not done, same
  carried-over gap as the original plan).
