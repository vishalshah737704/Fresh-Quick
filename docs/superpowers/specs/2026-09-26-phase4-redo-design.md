# Phase 4 Redo (Health/Retail/Personal Care/Electronics) — Design

**Sub-project C of 4** in the "50+ unique items per store" content
redesign. Order: **A (restaurant menu expansion, complete) → B (Phase 3
redo, complete, merged/pushed) → C (this doc) → D (Phase 5 fresh build)**.

## Goal

The 16 stores across Health, Retail, Personal Care, and Electronics (4
stores each) each reach **50+ items**, up from 20 each (320 total). This
content was built in worktree `.claude/worktrees/marketplace-phase4`
under the OLD shared-catalog model and **never merged to `main`** — that
worktree's own ledger (`.superpowers/sdd/2026-09-26-marketplace-phase4-content-b/progress.md`)
has a binding `STOP` note recording the same mid-session scope pivot that
produced sub-project B.

## Current state (verified live in the old worktree's seed data)

| Category | Stores | Items/store today | Item pattern |
|---|---|---|---|
| Health | WellnessRx, Vitamin Shop, MedPlus Pharmacy, Care & Cure | 20 | identical 20-name catalog across all 4 |
| Retail | Home Essentials, Fashion Hub, Urban Living, Style Bazaar | 20 | identical 20-name catalog across all 4 |
| Personal Care | Glow Beauty, Grooming Co., Beauty Bar, Pure Skin | 20 | identical 20-name catalog across all 4 |
| Electronics | TechZone, Gadget World, Digital Hub, CircuitPoint | 20 | identical 20-name catalog across all 4 |

Unlike Phase 3, this content is **not live on `main`** — no orders or any
other FK reference these rows, so the "never delete/modify existing
items" constraint that bound sub-project B does not apply here. Store ids
follow `c0100000`-`c1000000` prefixes (c01-c04 Health, c05-c08 Retail,
c09-c0c Personal Care, c0d-c10 Electronics); none of these prefixes
collide with Phase 3's `b0*` or restaurants' `a0*`.

## Ruling: discard old catalogs, fresh 4×50 unique per category (confirmed with Vishal)

Unlike sub-project B's "1 base store keeps its 20, other 3 get fresh
sets" pattern, **all 16 stores here get an entirely new, unique 50+ item
catalog** — no store's old duplicate-name 20 items are kept or padded.
This is possible only because the old data was never merged: there is no
live "original" catalog worth preserving, and nothing references these
rows by FK. Sub-project C is therefore structurally identical to sub-
project D's "fresh build" pattern, just with the store/vendor roster
already decided.

**Store/vendor roster stays as-is** (confirmed): reuse all 16 store rows
verbatim from the old worktree — names, `owner_id`, `address_id`, `lat`/
`lng`, `category_type`, banner images. Only the `insert into
public.products` rows change (old 20-per-store rows dropped entirely,
replaced by 50+ new ones).

Target per store: 50+ freshly hand-curated, app-unique items (no
old-row baseline to add on top of). 16 stores × 50+ items = **800+ new
product rows**.

## Global uniqueness constraint

Every new item name must be unique against the entire app, checked
against `docs/superpowers/plans/item-name-registry.md` (1,276 lines as of
sub-project B's completion). Same mechanism as A and B: read before
writing, append only, never rewrite/restructure, controller independently
re-verifies line count + zero internal dupes after every task.

## `is_veg` ruling (confirmed with Vishal — overrides the general
restaurant-only convention for this sub-project)

- **Health category only**: items include food-adjacent products
  (protein powder, nutrition bars, supplements, meal-replacement shakes)
  where veg/non-veg is meaningful. These rows carry
  `product_attributes: {"is_veg": true|false}`, judged on real
  ingredients (e.g. whey/gelatin-based = non-veg, plant/soy-based = veg)
  — never keyword-matched (recurring defect class #4).
- **Retail, Personal Care, Electronics**: omit `is_veg` entirely (no
  natural veg/non-veg concept for clothing, cosmetics, gadgets) — same as
  Phase 3's non-food categories.

## Price ruling (confirmed with Vishal — overrides sub-projects A/B's
plain-whole-rupee convention for this sub-project)

`products.price` is a **decimal rupees.paise value** (e.g. `149.75`, not
`150` or `14975`) for every new item in this sub-project, across all 4
categories. This is still plain decimal rupees — never paise-as-integer
— it just uses the fractional part instead of always rounding to whole
rupees. Realistic per-item-type pricing (e.g. a vitamin bottle vs. a
laptop) still applies.

## Category vocabulary (binding, confirm live during Task 0)

Each store's new rows must reuse that store's own existing `category`
values, or a sensible new one if genuinely nothing fits (never a
near-synonym of an existing value). Since all old rows are being dropped
before the new ones are written, there is no existing per-store
vocabulary to grep — Task 0 instead proposes one category vocabulary per
**category** (not per individual store, since all 4 stores in a category
start from the same blank slate), which every store-task in that category
then reuses exactly. Starting reference (confirm/refine during Task 0):

- Health: `Medicines`, `Vitamins & Supplements`, `First Aid`,
  `Personal Health Devices`, `Wellness`
- Retail: `Home & Kitchen`, `Apparel`, `Footwear`, `Furniture`,
  `Decor`
- Personal Care: `Skincare`, `Haircare`, `Bath & Body`, `Grooming`,
  `Fragrance`
- Electronics: `Mobiles & Accessories`, `Audio`, `Computing`,
  `Home Appliances`, `Wearables`

## Architecture

- **Fresh worktree off current `main`** (not the old, stale
  `marketplace-phase4` worktree, which predates Phase 3 redo and the
  Uber Eats redesign pieces). Copy `.env.local` into it as one of the
  first setup steps (recurring defect class #7).
- Port the 16 `insert into public.stores` rows from the old worktree's
  seed files (`health-seeds-output.sql`, `personalcare-seeds-output.sql`,
  and the relevant blocks of its `supabase/seed.sql`) into the new
  worktree's `supabase/seed.sql`, verbatim — names/owners/addresses/
  category_type/banner_url unchanged. Confirm during Task 0 that the
  vendor `auth.users`/`public.users` owner rows for all 16 stores are
  also present in that old worktree's seed data and portable the same
  way (they should be, per HANDOFF_10 §"reusing vendor accounts/store
  rows").
- No schema/migration change — `category_type` values (`health`,
  `retail`, `personal_care`, `electronics`) are already whitelisted in
  migration `00000000000020_stores_products_rename.sql`.
- Per store, one dispatch writes and commits that store's 50+ new item
  rows plus its registry additions (`insert into public.products ... on
  conflict do nothing`). Reuse the existing Pexels-fetch-once pattern for
  photos, real category-appropriate images (not reused unrelated photos —
  the exact defect class the Phase 3 redo review caught).

## Review focus (for the plan's task reviews)

- Every new item's name checked against the registry file as it stood
  BEFORE this dispatch's own additions.
- Old 20-item rows for a store are fully replaced, not padded — a task's
  diff should show the old rows removed (or never carried over from the
  ported store INSERT) and 50+ new unique rows added.
- New rows use that category's confirmed vocabulary (from Task 0) — no
  near-synonym drift, no per-store one-off categories.
- Each store's final count actually reaches 50+ (live verified via
  `count(p.id) ... group by store_id`, scoped to the 16 store ids).
- `is_veg` present and realistically judged for Health rows only, absent
  for Retail/Personal Care/Electronics rows.
- `product.price` sanity-checked as decimal rupees.paise, not paise-as-
  integer or always-whole-number.
- `image_url` values are genuinely fetched for the item pictured, not a
  silent fallback to an unrelated existing photo (verify the worktree's
  `.env.local`/Pexels key is reachable from Task 0 onward, per recurring
  defect class #7).
- Registry line count and zero-internal-dupes independently re-verified
  by the controller after every task.
- Final whole-branch review re-checks whole-app name uniqueness (new
  items only), a category-vocabulary sanity pass across all 16 stores,
  and a live browser/UI check per the RLS/UI verification lesson in
  `CLAUDE.md`.

## Out of scope

- Sub-project D's stores (Pet/Flowers/Baby) — separate sub-project, after
  this merges.
- Any UI/app code change — pure seed-data content (store rows + product
  rows only).
- Merging or reviving the old `marketplace-phase4` worktree — it is
  superseded and stays untouched (left in place per HANDOFF_10, or
  removed at Vishal's discretion once this sub-project merges — not this
  sub-project's concern).

## Open question for the plan (writing-plans to resolve)

Batch size per dispatch: one store (50+ rows) per task, 16 tasks total,
plus Task 0 (category vocab confirmation + registry starting line count +
store/vendor-row porting + `.env.local` copy) and a final whole-branch
verification task — 18 tasks total, matching sub-project B's granularity.
