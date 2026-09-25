# Fresh & Quick — DoorDash-Inspired Redesign + Catalog Expansion Design

**Date:** 2026-09-25
**Status:** Approved for planning

## Goal

Give FoodHub a richer, DoorDash-inspired visual identity under its real
name "Fresh & Quick" — across all four surfaces (customer, vendor,
delivery, admin) — and expand the seed catalog from 1 demo restaurant to
15-20 restaurants across a wider cuisine range with real Pexels photos.
Also fix the 5 documented bugs in the existing (explicitly untested) n8n
workflow JSON and turn the setup doc into a full walkthrough.

This is a **visual and content** project, not a functional one — no new
user-facing features, no schema changes to behavior, no new RLS surface.
`restaurants.banner_url` already exists in the schema (added in Phase 1,
never populated) and needs no migration.

**Explicitly not a literal DoorDash clone**: no DoorDash logo, brand
colors, copyrighted photography, or copy is used. This borrows DoorDash's
general page *structure* (hero/search → cuisine filters → photo-forward
restaurant grid), rendered entirely with Fresh & Quick's own name and a
new color system, and Pexels-licensed stock photography — consistent with
the project's existing "functional clone, no brand assets" framing.

## Out of scope

- Any new database tables, columns, or RLS policies.
- Any new customer-facing feature (search-by-text, filters beyond
  cuisine, ratings/reviews UI, promotions logic).
- Live n8n verification — no n8n instance is available in this
  environment; workflow JSON fixes are code-reviewed against n8n's
  documented node behavior, not run.
- Mobile app work (separate planned sub-project, untouched).

## 1. Visual system

### `lib/branding.ts`

```typescript
export const BRAND = {
  name: "Fresh & Quick",
  theme: {
    primary: "#DC2626",   // deep red — primary actions, active states
    accent: "#F97316",    // warm orange — highlights, badges, secondary CTAs
    background: "#FFF8F0", // warm cream — page background
    surface: "#FFFFFF",   // card/panel background
    ink: "#1F1B16",       // near-black warm charcoal — primary text
    inkMuted: "#6B6153",  // muted warm gray — secondary text
  },
} as const;
```

`app/globals.css`'s Tailwind `@theme` block gets matching tokens
(`--color-brand-primary`, `--color-brand-accent`, `--color-brand-bg`,
`--color-brand-surface`, `--color-brand-ink`, `--color-brand-ink-muted`),
so every surface pulls from the same 6 tokens — changing the palette
later means editing exactly these two files, per the project's existing
branding-isolation rule. No component hardcodes a hex value or the brand
name string.

### New shared components (`components/`)

- **`CuisineChip.tsx`** — a single pill-shaped filter chip (label +
  optional icon glyph), active/inactive visual state via the brand
  tokens. Pure presentational, takes `label`, `active`, `onClick`.
- **`CuisineChipRow.tsx`** — horizontally-scrollable row of
  `CuisineChip`s built from `cuisine_taxonomy`, plus an "All" chip.
  Emits the selected cuisine slug (or `null` for "All") via `onSelect`.
- **`HeroSearch.tsx`** — homepage hero: headline, subtext, and the
  existing address-picker control (reused from wherever the current
  address-store UI lives — not rebuilt) restyled into a prominent search
  bar. No new search *functionality* — same address-store read/write.
- **`PromoBanner.tsx`** — a simple static promotional strip (e.g. "Free
  delivery on your first order") — visual only, no backing logic, no
  data fetch. One optional prop for the message text so it isn't
  hardcoded in three places if reused.

### Restyled existing components

- **`RestaurantCard.tsx`** — add a photo (from `restaurants.banner_url`,
  falling back to a generic placeholder graphic — a plain colored div
  with a food-icon glyph, not a fetched image — when null, since not
  every restaurant is guaranteed a banner in the wild), larger card
  footprint, rating shown as a small badge overlapping the image
  (DoorDash-style), delivery-time as a pill. Same props/data shape as
  today (`restaurant`, `distanceKm`) — this task only changes the JSX/
  Tailwind classes, not the component's public interface, so
  `app/customer/page.tsx`'s usage is unaffected.
- **`MenuItemRow.tsx`** — larger item photo, price/veg-badge layout
  cleanup. Same props.
- **Vendor/delivery/admin pages** — re-skin only: swap ad hoc Tailwind
  gray/blue utility classes for the new brand tokens, adjust spacing/
  card radii/typography to match the new visual language. No JSX
  structure, data-fetching, or route changes. These are simpler internal
  tools and stay functionally identical — this is purely a find-and-
  replace-style visual pass per file.

## 2. Customer homepage (`app/customer/page.tsx`)

New layout, same data source:

1. `HeroSearch` at the top.
2. `CuisineChipRow` below the hero — selecting a cuisine filters the
   already-fetched `restaurants` array client-side by
   `cuisine_tags.includes(selectedSlug)` (mirrors the existing
   client-side distance-sort pattern already in this file — no new
   fetch, no new API route).
3. Restaurant grid (CSS grid, responsive columns) of the restyled
   `RestaurantCard`, in the existing distance-sorted order, now filtered
   by the selected chip.

The existing loading/error/empty states (already present in this file)
are preserved, just restyled to match.

## 3. Restaurant detail page (`app/customer/restaurants/[id]/page.tsx`)

Add a banner image at the top (same `banner_url` column, same fallback
placeholder as the card), keep the existing closed/suspended banner logic
(added in the last triage) unchanged, restyle the menu list using the
updated `MenuItemRow`.

## 4. Vendor / delivery / admin re-skin

Each of the following files gets a Tailwind-class-only pass (brand
tokens, spacing, card/button styling) with **zero logic changes**:
`app/vendor/dashboard/page.tsx`, `app/vendor/menu/page.tsx`,
`app/vendor/orders/page.tsx`, `app/delivery/dashboard/page.tsx`,
`app/admin/dashboard/page.tsx`, plus the four login/signup pages if their
current styling looks inconsistent with the new system (`app/*/login/
page.tsx` — confirm at implementation time whether they already use brand
tokens or hardcoded classes).

## 5. Catalog expansion (`supabase/seed.sql`)

Expand from 1 to **18 restaurants** across these cuisine slugs (all
already exist in `cuisine_taxonomy` except the 3 marked *new*, which need
one small migration adding them to the taxonomy table — the only schema
change in this whole project, and it's pure data, not a structural
change):

- indian (2), north_indian (1), south_indian (1) — existing slugs
- chinese (2), italian (2), fast_food (2), desserts (1), beverages (1) —
  existing slugs
- *new*: mexican (2), thai (1), bakery (1), healthy (2) — 4 new
  `cuisine_taxonomy` rows

Each restaurant gets: a name, 1-2 cuisine tags, a lat/lng near the
existing demo coordinates (small deliberate spread so distance-sorting on
the homepage looks realistic), `banner_url` (Pexels), `avg_prep_minutes`,
a plausible `rating`, and 3-5 menu items each with their own `image_url`
(Pexels) — roughly 60-90 menu items total.

### Image sourcing

A one-time Node script (`scripts/fetch-catalog-images.mjs`, follows the
project's existing "fetch once, bake URLs into seed.sql, never call
Pexels at runtime" rule) queries the Pexels Search API using
`PEXELS_API_KEY` from `.env.local` for restaurant-banner-style and
food-dish-style photos per cuisine, and prints the resulting
`(name, url)` pairs for hand-assembly into `seed.sql` — this mirrors
exactly how the existing single demo restaurant's menu photos were
originally sourced (see MEMORY.md's "External API keys" section). The
script is a one-off tool, not part of the app's runtime or build, and
requires no new npm dependency (uses `fetch`, built into Node 18+).

### New migration

`supabase/migrations/00000000000014_expand_cuisine_taxonomy.sql` — adds
`mexican`, `thai`, `bakery`, `healthy` to `cuisine_taxonomy` via the same
`insert ... on conflict (slug) do nothing` pattern as migration 4.
`seed.sql` itself is not a migration and needs no version bump — it's
re-run in full by `npx supabase db reset` regardless.

## 6. n8n workflow fixes + guide

Fix, in `n8n/workflows/*.json`, the issues MEMORY.md's Phase 7 entry
already documents:
- `IF` nodes declared `typeVersion: 2` using v1's parameter shape → align
  to whichever version's shape is actually used (downgrade the declared
  `typeVersion` to 1, since the parameters are v1-shaped, rather than
  rewriting the parameters to v2 — smaller, safer change).
- Workflow 02's decision node uses the legacy `function`-node API
  (`$input.item.json`) — convert to the modern `Code` node API
  (`$input.item.json` is actually still valid in n8n's Code node; the
  real fix is confirming the node's declared `type`/`typeVersion` match
  a Code node, not a legacy Function node, and adjusting whichever is
  wrong).
- Workflow 04 indexes the restaurant-lookup HTTP response as `$json[0]`
  — HTTP Request node v4 returns one item per array element already, so
  downstream nodes should reference `$json` directly; fix the indexing
  expression.
- Add an empty-candidates guard before workflow 04's assign POST (an `IF`
  node checking the candidates array isn't empty, routing to a no-op/log
  branch instead of firing an empty assignment request).
- Add `webhookId` fields to every webhook node (n8n regenerates these on
  import if absent, but pre-populating avoids the churn note in
  MEMORY.md).

`docs/n8n-webhook-setup.md` gets rewritten into a full walkthrough:
prerequisites (n8n instance, Docker or cloud), import steps per workflow,
where to set `N8N_INTERNAL_SECRET` and the app's base URL in n8n's
credentials/webhook config, activation order, and a "how to test each
workflow" section (what to trigger, what to expect) — still explicitly
labeled as **reviewed but not run against a live instance**, since none
is available here; MEMORY.md's Phase 7 honesty framing carries forward
unchanged.

## Testing / verification

- `npm run build` after every code/visual change (project standard rule).
- Live browser walkthrough (Playwright) of the new customer homepage,
  restaurant detail page, and cuisine-chip filtering, plus a visual
  spot-check of each re-skinned vendor/delivery/admin page — this is a
  visual project, so "does it look right and not break existing
  functionality" is the test, not new automated tests (matches the
  project's existing no-automated-suite state, documented in MEMORY.md).
- `npx supabase db reset` after the seed/migration changes, followed by
  loading `/customer` and confirming 18 restaurants render with images,
  cuisine filtering narrows the grid correctly, and no console errors
  appear (mobile viewport spot-check, per the Phase 8 precedent).
- The n8n JSON fixes are reviewed against n8n's public node-parameter
  documentation for the specific node types/versions involved, not
  executed — this gets stated plainly in the final report, not implied
  otherwise.

## Review focus

- A restaurant with no `banner_url` (e.g. any future vendor-created one,
  or a seed row where the Pexels fetch didn't return a usable image) must
  render the placeholder gracefully, not a broken `<img>` or a Next.js
  image-optimization error — this needs an explicit test in the
  `RestaurantCard` restyle.
- Pexels-sourced image hostnames must pass the existing
  `isAllowedImageUrl`/`next.config.ts` allowed-image-host check (the one
  that already guards vendor-supplied menu image URLs from Phase 4) —
  confirm the Pexels CDN host used is already allow-listed, or add it,
  rather than shipping seed data whose images silently fail to render.
- Cuisine-chip filtering against a restaurant with multiple cuisine tags
  must show it under every matching chip, not just its first tag.
- The new migration's `on conflict (slug) do nothing` must not silently
  no-op if a taxonomy label wording changes later — not a concern for
  this pass, but worth a one-line comment in the migration for future
  readers (matches migration 4's own existing comment style).
- Re-skinned vendor/delivery/admin pages must keep every existing error-
  surfacing element (Phase 8's write-failure messages) visually present,
  not accidentally dropped during the Tailwind-class pass.
