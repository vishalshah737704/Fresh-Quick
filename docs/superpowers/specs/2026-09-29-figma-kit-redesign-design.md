# Figma Community Kit Redesign — Full Rebrand (Web + Mobile, All Roles)

Date: 2026-09-29
Status: Approved (visual preview approved by Vishal 2026-09-29)

## Source

Figma community file: "Food Delivery Website + App Design UI Kit"
(duplicated copy: `mGN05EK0Aqfj7LP7dzNcl7`). Figma MCP had no editor
access (account seat is View-tier) — design pulled from screenshots
Vishal provided (home desktop, restaurant detail, ordering/customize
modals, delivery popups, mobile pages, basket). Kit covers **customer
screens only** — no vendor/delivery-partner/admin dashboard designs
exist in it.

## Decisions (from brainstorming)

1. **Scope/order**: all 6 real surfaces built together in one big pass
   (not phased). Real surface count is 6, not the original "8" framing —
   mobile is Customer + Delivery Partner only per standing CLAUDE.md
   rule (Vendor/Admin stay web-only):
   - Web Customer
   - Web Vendor
   - Web Delivery Partner
   - Web Admin
   - Mobile Customer (Expo/React Native)
   - Mobile Delivery Partner (Expo/React Native)
2. **Brand tokens**: full rebrand — kit's colors/typography become the
   new single source of truth, replacing the Uber-Eats-era tokens.
3. **Non-customer roles**: kit has no dashboard designs, so Vendor/
   Delivery/Admin get **freeform new layouts** inspired by the kit's
   aesthetic (not constrained to today's sidebar/table structure),
   rather than a literal reskin.
4. **Visual approval gate**: an Artifact canvas preview (6 static
   mockups: customer home, restaurant detail, cart, item-customize
   modal, vendor dashboard, delivery+admin dashboards) was built and
   approved before any real-code work — see the artifact link shared
   in conversation. This spec formalizes what that preview already
   demonstrated visually.

## Design tokens

Replace `lib/branding.ts` (web) and `mobile/theme.ts` (mobile) — the
existing 6-token system stays structurally the same shape, values
change, plus 2 additions:

| Token | New value | Used for |
|---|---|---|
| `brand-primary` | `#F5821F` (orange) | primary CTAs, hero accents, active nav state |
| `brand-accent` | `#1E8A3E` (green) | checkout/confirm CTAs, success states, basket header |
| `brand-bg` | `#F4F4F4` (light gray) | page background |
| `brand-surface` | `#FFFFFF` | cards, modals |
| `brand-ink` | `#0B1D3A` (navy) | headings, nav bar, dark sections, sidebar |
| `brand-ink-muted` | mid-gray (kept close to current tone) | secondary text |
| `brand-danger` *(new)* | red/pink (kit's error-state color) | error banners, disabled/blocked checkout, validation |
| — shape tokens *(new)* | `--radius-card: 16px`, `--radius-pill: 999px` | card corners; buttons/badges/tags |

Typography: headings move to Poppins weight 700 (kit's bold rounded
display face), replacing the current Poppins-300 `.font-heading` rule
(`app/globals.css`) — per the existing CLAUDE.md gotcha, this rule
must move inside `@layer utilities` (or become a Tailwind v4
`@utility`) as part of this change, since a later utility-class weight
override needs to reliably win. Body text stays Inter.

Six color tokens stay isolated to `lib/branding.ts` / Tailwind `@theme`
tokens in `app/globals.css` (web) and `mobile/theme.ts` (mobile) — no
component may hardcode a hex value, per standing project rule.

## Component/pattern language (from the kit)

- **Pill shapes**: all primary/secondary buttons, category chips,
  status badges, nav CTAs — `border-radius: 999px`.
- **Rounded cards**: `16px` radius, soft shadow (`0 2px 10px
  rgba(11,29,58,0.06)`), white surface on gray page background.
- **Dark navy chrome**: headers/footers, sidebar nav (Vendor/Delivery/
  Admin), section dividers, and "tag pill" labels (e.g. topping-group
  headers in item customization) use `brand-ink` as a solid fill with
  white text/icons.
- **Modal-based item customization**: full-bleed food photo header +
  breadcrumb + grouped checkbox sections + sticky total/next-step
  footer. This becomes the pattern for both web AND mobile item
  customization, reusing the existing `lineId` cart model from the
  Uber-Eats-refresh piece 4 (no schema change needed — same line-item
  identity, new visual chrome).
- **Numbered step badges** and **full-bleed stat-banner strips**
  (orange background, large white numbers) for marketing/informational
  sections (home page "how it works", footer stats).
- **Kanban/table hybrid** for Vendor (order columns: New/Preparing/
  Ready/Completed) and Admin (vendor table with status pills) — new
  freeform layout per decision 3, still using the same pill/card/navy
  tokens.

## Per-surface scope

### Web Customer
Home, restaurant/store detail, cart (slide-out panel — keep piece 5's
existing open/close/note-flush behavior, restyle only), checkout,
order tracking (`OrderStatusTimeline` — restyle only, do not touch its
`ready`/`preparing` bucketing logic, which is a separate known
issue), item customization modal.

### Web Vendor / Web Delivery / Web Admin
Restyle existing route-group-shell layouts (sidebar/top-bar nav) with
new tokens; Vendor's order board and Admin's vendor table get the new
freeform kanban/table layout described above. **Preserve the existing
route-group structure that excludes each role's own login page** — this
is a hard-won bug fix (CLAUDE.md gotcha), not something this visual
pass may touch.

### Mobile Customer / Mobile Delivery Partner
Apply the same tokens to `mobile/theme.ts`; bottom-tab nav, home feed,
store screen, cart bottom-sheet, checkout, item-customize screen (same
modal pattern, adapted to a full-screen mobile flow) get the new visual
language. No navigation structure change — this is a re-skin of the
existing UberEats-style mobile redesign, not a new IA.

## Data flow / error handling

Purely visual/token change — no API contracts, DB schema, or data-flow
changes anywhere in this spec. Every existing session/role guard
(`useRoleGuard`/`useSession` web, `useRequireSession` mobile) must
remain wired exactly as-is on every restyled screen — this is a
standing per-task checklist item per CLAUDE.md, called out again here
because a full-surface visual pass is exactly the kind of change that's
tempted to touch a whole page file wholesale.

## Testing / verification

- `npm run build` after every web page/route change (not just
  `tsc --noEmit`) per standing project rule.
- Live browser check per surface after merge (not just curl) — Vendor/
  Delivery/Admin restyles must each confirm login → portal navigation
  still works, since this project has twice shipped a route-group
  layout bug that only a live login flow catches.
- Mobile: no real device/simulator run has ever been done in this
  project (carried-over gap) — Expo Go or simulator check is out of
  scope for this pass unless Vishal specifically asks; note this
  explicitly in the plan/PR rather than silently skipping it.

## Out of scope

- Any new feature, schema change, or business logic change.
- Fixing the known `OrderStatusTimeline` ready/preparing bucketing
  wording issue (tracked separately in MEMORY.md/CLAUDE.md).
- n8n workflow re-import/publish status (tracked separately, only
  relevant if this pass touches order-status UI wording, which it
  does not beyond restyling).
- Google Maps integration (still a stub).
