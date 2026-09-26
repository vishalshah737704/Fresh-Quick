# Multi-Vertical Marketplace — Design Spec

Date: 2026-09-26
Status: Draft, pending approval

## 1. Goal

Fresh & Quick is today a food-only delivery platform: `restaurants` sell
`menu_items`, checkout/cart/vendor-dashboard/admin-dashboard are all written
in those terms. This spec generalizes the app into an Uber-Eats-style
multi-vertical marketplace: the same customer app, vendor panel, delivery
partner app, and admin dashboard now serve 10 non-food categories in
addition to restaurants — Grocery, Convenience, Alcohol, Health, Retail,
Pet, Flowers, Baby, Personal Care, and Electronics — each with real seeded
stores and products, not placeholder/"coming soon" entries.

This is architectural, not a styling change: it renames and generalizes the
core commerce data model (`restaurants`→`stores`, `menu_items`→`products`)
and touches essentially every file that references either today. Fresh &
Quick's own branding (name, colors, photography) is kept throughout — this
adopts Uber Eats' sidebar *layout/structure* (icon list, category browsing),
not its brand.

## 2. Decisions locked in during brainstorming

- **Vendor model**: one generic `stores` table and one generic `products`
  table serve every category, including restaurants (`category_type =
  'restaurant'`). No parallel/second commerce system.
- **Rollout size**: all 10 non-restaurant categories get real seeded stores
  and products in this effort, not a "coming soon" placeholder subset.
  Sequenced across phases (section 7) rather than one giant change, but the
  end state has all 10 populated.
- **Cart/checkout**: stays single-store-only, same rule as today's
  single-restaurant-only cart — a store is a store regardless of category.
- **Category-specific product fields** (veg/spice flags, expiry date, size,
  brand, wattage, pet species, etc.) live in a `product_attributes jsonb`
  column rather than per-category columns, so adding a category never
  requires a schema migration for its product shape.
- **Category icons**: Pexels-sourced images, fetched once and hardcoded into
  seed data — same fetch-once pattern already used for menu item photos
  (`scripts/fetch-catalog-images.mjs`), never called live at runtime.
- **Visual match to Uber Eats**: layout/structure only (sidebar icon list,
  category row, card grid patterns). Fresh & Quick's name, colors, and
  photography stay as-is — this is "inspired by," not a lookalike, per the
  project's standing no-brand-clone rule.

## 3. Data model changes

### 3.1 Renamed/generalized tables

- `restaurants` → `stores`. Columns kept as-is (`owner_id`, `name`,
  `address_id`, `lat`, `lng`, `is_open`, `is_suspended`, `rating`,
  `banner_url`, `delivery_fee_paise`, `promo_text`) plus:
  - `category_type text not null check (category_type in ('restaurant',
    'grocery', 'convenience', 'alcohol', 'health', 'retail', 'pet',
    'flowers', 'baby', 'personal_care', 'electronics'))`
  - `cuisine_tags` stays (nullable/empty for non-restaurant stores — the
    existing cuisine taxonomy/filter machinery keeps working unmodified for
    `category_type = 'restaurant'`).
  - `avg_prep_minutes` becomes nullable (only meaningful for restaurants;
    UI shows "prep time" for restaurants, "ships in X" or nothing for other
    categories — see section 5).
- `menu_items` → `products`. Columns kept (`name`, `description`, `price`,
  `category`, `is_available`, `image_url`) plus:
  - `store_id` (renamed from `restaurant_id`)
  - `product_attributes jsonb not null default '{}'` — replaces the
    restaurant-specific `is_veg boolean` (migrated into
    `product_attributes->>'is_veg'` for existing rows, so no data loss).
- `menu_item_option_groups`/`menu_item_options` stay as-is structurally
  (rename FK target only) — already generic enough (size, add-ons, spice
  level apply just as well to e.g. a pizza-sized item or a grocery
  multipack).

### 3.2 Renamed foreign keys

`orders.restaurant_id` → `orders.store_id`, `reviews.restaurant_id` →
`reviews.store_id`. `order_items.menu_item_id` → `order_items.product_id`.

### 3.3 Migration approach

A single migration (or small numbered sequence) does: `alter table rename`
for both tables and all renamed columns, add `category_type` (backfilled to
`'restaurant'` for all existing rows, then constraint added not-null),
migrate `is_veg` into `product_attributes`, drop the old `is_veg` column.
Every RLS policy, the `checkout_place_order` RPC, and every index/FK
referencing the old names gets recreated under the new names in the same
migration set — this is a rename pass, existing policy *logic* doesn't
change, just what it's named/points at.

### 3.4 Blast radius (files touched, not exhaustive)

Every vendor route (`app/api/vendor/**`), `lib/vendor-auth.ts`,
`lib/vendor-option-auth.ts`, `lib/use-delivery-fee.ts`, the checkout route
and RPC, every admin route referencing restaurants/orders, every customer
page (`/customer`, `/customer/restaurants/[id]` → renamed
`/customer/stores/[id]`), delivery assignment's restaurant lat/lng lookup
(`app/api/internal/orders/[id]/assign`), n8n workflow 04's restaurant
lookup, and every migration file that added an RLS policy scoped to
`restaurant_id`/`owner_id` (roughly a dozen). This phase is almost entirely
mechanical rename + re-verification, not new logic — see section 7's
phase 1 for how it's isolated from the new-feature work.

## 4. Checkout / cart impact

No rule changes: cart is still single-store-only (today's single-restaurant
rule already generalizes — "you can't mix items from two stores" reads
identically whether both are restaurants or one's a pet store). The
existing "different restaurant → clear cart?" prompt becomes "different
store?" in copy only.

Order-summary and confirmation UI conditionally shows category-appropriate
language: `category_type = 'restaurant'` shows "Prep time: N min"; every
other category shows "Ships in ~N min" using the same `avg_prep_minutes`
column (renamed meaning, not renamed column, to avoid a second migration) —
or no timing line at all if a store hasn't set one.

## 5. Customer-facing UI

### 5.1 Sidebar

`components/SidebarNav.tsx` replaces its 4 food-app items with:
Home, then one entry per category (Restaurants, Grocery, Convenience,
Alcohol, Health, Retail, Pet, Flowers, Baby, Personal Care, Electronics),
then Orders, then Account — matching Uber Eats' icon-list structure
(icon + label, sticky left column) but using Fresh & Quick's existing
color tokens (`brand-primary` active state, etc.), not Uber Eats' green.
Icons are Pexels photos (small square crops), not emoji — sourced once per
category and hardcoded into `lib/category-icons.ts` (URL constants), same
"fetched once, never live" pattern as menu photography.

### 5.2 Category browsing

Clicking a sidebar category navigates to `/customer?category=grocery`
(etc.), filtering the home feed's store grid to that `category_type` —
reusing the existing cuisine-chip filter component's pattern, generalized
from filtering by `cuisine_tags` to filtering by `category_type` first,
then by `cuisine_tags` only within `category_type = 'restaurant'`.

### 5.3 Store page

`/customer/restaurants/[id]` becomes `/customer/stores/[id]` (redirect kept
at the old path for any saved links). Layout is category-agnostic: still a
header (name, rating, category badge) + searchable product grid — no
per-category page templates, since `product_attributes` carries whatever
category-specific display a product needs (e.g. a badge if
`product_attributes.brand` is set) without new page variants.

## 6. Seed content plan (all 10 categories)

Each category gets 2-3 stores, each with 3-5 products (matching today's
per-restaurant density), a dedicated vendor account per store
(`<store-slug>@foodhub.local` / `demo1234`, same pattern as existing
restaurant vendors, added to `UserList.docx` once seeded), and real Pexels
photos fetched once via an extended
`scripts/fetch-catalog-images.mjs` and hardcoded into `seed.sql` —
consistent with how the existing 17 restaurants were seeded.

Representative examples (final picks made during each content phase, not
locked here): Grocery (Fresh Mart, Daily Basket), Convenience (QuickStop,
Corner Store), Alcohol (The Wine Cellar, Craft Beer Co.), Health
(WellnessRx, Vitamin Shop), Retail (Home Essentials, Fashion Hub), Pet
(Paws & Claws, Pet Pantry), Flowers (Bloom & Co, Petal Studio), Baby
(Little Ones, Baby Basics), Personal Care (Glow Beauty, Grooming Co.),
Electronics (TechZone, Gadget World).

## 7. Phasing

Given the size (comparable to redoing Phases 1-4 of the original 8-phase
build), this ships as its own numbered phase sequence, each independently
planned/built/merged per this project's existing "one phase at a time"
convention:

1. **Foundation** — the full rename/generalization migration (section 3),
   every touched route/policy/page updated to match, `/customer/stores/*`
   redirect from the old path. No new visible feature; success criterion is
   the existing restaurant flow (browse → order → vendor accept → delivery)
   working identically end-to-end after the rename.
2. **Sidebar + category browsing** — new `SidebarNav`, Pexels category
   icons, `category_type` filtering on the home feed, store page path
   rename.
3. **Content phase A** — Grocery, Convenience, Alcohol seeded (stores,
   products, vendor accounts, images).
4. **Content phase B** — Health, Retail, Personal Care, Electronics seeded.
5. **Content phase C** — Pet, Flowers, Baby seeded.

Content phases are grouped for manageable review size, not by any
technical dependency — they could run in a different grouping or order
without affecting the foundation.

## 8. Out of scope

- Per-category checkout differences (e.g. age verification for Alcohol,
  prescription upload for Health) — flagged as a known gap, not built here.
- Category-specific search/filter facets beyond the existing name/cuisine
  search (e.g. faceted search by brand/size for Electronics) — the generic
  product grid + search box from section 5.3 is what ships.
- Inventory/stock-out handling beyond the existing `is_available` boolean.
- Mobile app (already out of scope per the original platform spec).
