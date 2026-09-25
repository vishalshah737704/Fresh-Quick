# Uber Eats-style redesign — Piece 1: Design token refresh

## Context

This is piece 1 of a 6-piece redesign bringing Fresh & Quick's customer
surface toward Uber Eats' web ordering flow (feed → restaurant →
customize → cart), based on live research of
`ubereats.com/feed?...` (2026-09-25) and two refero.design style
references (`Uber`, `sweetgreen`). The 6 pieces, each with its own
spec/plan/build/merge cycle:

1. **Design token refresh** (this spec)
2. Home/feed rebuild (search, category chips, sort/filter, cards, carousels)
3. Restaurant page rebuild (sticky anchor nav, vertical menu, in-menu search, Quick Add)
4. Item customization (option groups: size/add-ons, special instructions — new schema)
5. Cart redesign (slide-out panel, per-option line items, order note)
6. Checkout visual polish

This piece lands the color/type/shape foundation every later piece builds
on. It does **not** redesign any page layout — only token values, fonts,
and a light pass over shared primitives (buttons, cards, badges) so the
new tokens render correctly where they're already used.

## Approved design (2026-09-25, via visual companion)

User picked "Bolder / greener accent" from a 3-way live preview blending
the Uber and sweetgreen refero styles.

### Colors (`lib/branding.ts` + `app/globals.css`'s 6-token system)

| Token | Old | New | Role |
|---|---|---|---|
| `primary` | `#DC2626` | `#12140f` | Primary buttons, nav, high-contrast text |
| `accent` | `#F97316` | `#b6e02e` | Badges, prices, "$0 delivery," selected states — used sparingly |
| `background` | `#FFF8F0` | `#faf9f4` | Page canvas (soft cream, not stark white) |
| `surface` | `#FFFFFF` | `#ffffff` | Card backgrounds (unchanged — stays white so cards pop off the cream canvas) |
| `ink` | `#1F1B16` | `#12140f` | Primary text |
| `inkMuted` | `#6B6153` | `#6b6b62` | Secondary/metadata text |

Text-on-accent contrast: `#12140f` on `#b6e02e` passes WCAG AA (the lime
is bright enough that white text would fail — always pair the accent
background with near-black text, never white).

### Typography

- Body/UI text: **Inter** (replaces Geist Sans as the primary UI font;
  Uber's own substitute recommendation for UberMoveText). Load via
  `next/font/google` the same way `Geist`/`Geist_Mono` are loaded today
  in `app/layout.tsx`.
- Hero/section headlines only (page `<h1>`s, section headers like
  "Popular near you"): **Poppins**, weight 300 (light) — sweetgreen's
  editorial-headline touch. Not used for body copy, buttons, or card
  titles — those stay Inter at regular/semibold weight, per Uber's
  utilitarian pattern.
- Geist Mono can be dropped (unused outside dev tooling) or kept for any
  future code/number-display need — no functional impact either way,
  decide during implementation.

### Shape, shadow, spacing

- Card/input border radius: **8px** (Uber's value — denser browse UI).
- Button border radius: **999px** (full pill — both styles agree here).
- Card shadow: subtle only on featured/interactive cards (`0 3px 14px
  -6px rgba(0,0,0,0.18)`, from the approved preview), flat elsewhere —
  don't add shadow to every card by default.
- No other spacing/density changes in this piece — later pieces (2-3)
  own actual layout density per-page.

## Scope

**In scope:**
- `lib/branding.ts` — update the 6 hex values.
- `app/globals.css` — update the same 6 CSS custom properties (kept in
  sync per the file's own comment), add `--font-inter`/`--font-poppins`
  theme tokens, update `body` font-family.
- `app/layout.tsx` — swap/add font loaders (`Inter`, `Poppins` via
  `next/font/google`) alongside or replacing `Geist`.
- Any shared button/card/badge primitive component that hardcodes a
  radius or shadow value inconsistent with the new 8px/999px/subtle-only
  rules (audit during implementation — don't assume none exist).
- Visual smoke test across all four role surfaces (customer, vendor,
  delivery, admin) at desktop and 390px mobile width, per the project's
  existing Phase 8 pattern — confirm nothing breaks contrast/legibility
  with the new tokens, since every surface consumes these same 6 tokens.

**Out of scope (later pieces):**
- Any page layout, component structure, or new UI (search bar, category
  chips, sort bar, slide-out cart, item modal, etc.) — pieces 2-6.
- Vendor/delivery/admin visual "polish" beyond the automatic token
  inheritance they already get from the shared tokens — a dedicated
  visual pass for those surfaces (if wanted) is separate, unscoped work
  per `HANDOFF_4.md`'s deferred-work list, not part of this redesign.
- Pexels image sourcing — pieces 2-3 (restaurant/menu imagery) are where
  new images actually get fetched and baked into `seed.sql`, per this
  project's existing rule that Pexels calls happen once, not at runtime.

## Testing plan

1. `npm run build` (per project rule — not just `tsc --noEmit`).
2. Playwright pass: load customer home, a restaurant detail page, vendor
   dashboard, delivery dashboard, admin dashboard at both desktop and
   390px width. Screenshot each, confirm no color/contrast regressions
   (e.g. accent-colored text on accent background, illegible muted text).
3. Confirm the accent color (`#b6e02e`) only appears in small doses
   (badges/prices/selected-state) in existing usage sites — if any
   component currently fills a large area with the old accent
   (`#F97316`) as a background wash, flag it for a follow-up decision
   rather than silently keeping a large-area accent fill (inconsistent
   with the approved "used sparingly" rule).

## Open questions for the plan

None — this piece is fully specified. Pieces 2-6 will each get their own
brainstorm session before their own spec is written, per the user's
"one spec per piece" decision.
