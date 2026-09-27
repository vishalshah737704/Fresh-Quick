# Phase 3 Redo (Grocery/Convenience/Alcohol) — Design

**Sub-project B of 4** in the "50+ unique items per store" content
redesign. Order: **A (restaurant menu expansion, complete, merged/pushed)
→ B (this doc) → C (Phase 4 redo) → D (Phase 5 fresh build)**.

## Goal

The 12 stores across Grocery, Convenience, and Alcohol (4 stores each,
merged to `main` under the old model) each reach **50+ items**, up from
20 each (240 total). Unlike sub-project A, these stores don't each have
their own distinct catalog today — within each category, all 4 stores
currently carry an *identical* 20-item catalog (same names, different
`product_attributes`-less rows with different ids), deliberate overlap at
the time, now superseded by the "every store distinct" redesign goal.

## Current state (verified live in `supabase/seed.sql`)

| Category | Stores | Items/store today | Item pattern |
|---|---|---|---|
| Grocery | Fresh Mart, Daily Basket, Green Grocer, Metro Grocery | 20 | identical 20-name catalog across all 4 |
| Convenience | QuickStop, Corner Store, 24/7 Shop, Metro Mart Express | 20 | identical 20-name catalog across all 4 |
| Alcohol | The Wine Cellar, Craft Beer Co., Spirits & More, The Bottle Shop | 20 | identical 20-name catalog across all 4 |

Product ids follow `bXX00000-4444-4444-4444-0000000000NN` (NN = 01-20)
per store, `bXX` block per store (b01-b04 grocery, b05-b08 convenience,
b09-b0c alcohol).

## Ruling: base store vs. non-base stores (binding, carried from
KICKOFF_9/HANDOFF_9, base-store choice confirmed this session)

Per category, **1 base store keeps its current 20 items untouched and
only gets padded**; the other 3 get **entirely fresh, unique catalogs
added on top of their current (untouched) 20 rows**, reaching 50+ each.

**Base store per category** (first-in-file, confirmed with Vishal):
- Grocery: **Fresh Mart**
- Convenience: **QuickStop**
- Alcohol: **The Wine Cellar**

**Non-base stores keep their old duplicate-name rows too** — never
deleted or renamed (no FK-breaking, and this matches the grandfathered
treatment sub-project A gave its own parked residuals, e.g. Burger Barn's
`Appetizer`/`Starter` split). Only *newly added* rows must be unique
app-wide. The old duplicate rows (60 rows: 20 names × 3 non-base stores
× 3 categories, since the base store's 20 are the "canonical" copy) are
NOT retroactively renamed and NOT added to the registry — they're
pre-existing, out of scope, exactly like sub-project A's parked
residuals.

Target per store: existing 20 (untouched) + 30+ new unique items = 50+.
12 stores × 30+ new items ≈ **360+ new product rows**, hand-curated.

## Global uniqueness constraint

Every *newly added* item name must be unique against the entire app,
checked against `docs/superpowers/plans/item-name-registry.md` (916
lines as of sub-project A's completion). Same mechanism as sub-project A:
read before writing, append only, never rewrite/restructure, controller
independently re-verifies line count + zero internal dupes after every
task (two real bugs in sub-project A came from implementers mishandling
this file).

## Category vocabulary (binding, per KICKOFF_9)

Each store's new rows must reuse that *same store's* existing `category`
values exactly — grep the store's current rows before writing new ones.
Observed existing vocabulary (verify live per-store before each task,
this table is a starting reference, not authoritative):

- Grocery: `Dairy`, `Bakery`, `Staples`, `Produce`, `Snacks`,
  `Beverages`, `Frozen`
- Convenience: `Beverages`, `Snacks`, `Frozen`, `Reading`, `Essentials`,
  `Electronics`, `Stationery`
- Alcohol: `Wine`, `Beer`, `Spirits`, `Accessories`, `Snacks` — confirmed
  live during Task 0 against `The Wine Cellar`, `Craft Beer Co.`,
  `Spirits & More`, and `The Bottle Shop`'s existing rows; identical
  across all four alcohol stores.

New items for a given store may introduce a genuinely new category value
only if nothing existing fits (e.g. a grocery store might reasonably add
`Personal Care` if it didn't have one) — but must not invent a
near-synonym of an existing one (sub-project A's recurring defect #5).

## Architecture

Identical mechanical pattern to sub-project A: pure `supabase/seed.sql`
additions (`insert into public.products ... on conflict do nothing`),
referencing each store's existing `store_id`. No schema/migration
change. No new vendor accounts — all 12 stores already have vendor
owners.

`is_veg` is not a concern for these categories: it lives in
`product_attributes` jsonb (not a required column since migration
`00000000000020`), and all existing grocery/convenience/alcohol rows
already omit it (`{}'::jsonb`) — this is a restaurant-only convention,
not applicable here.

`products.price` is plain rupees (matches existing convention in this
seed data already — e.g. `Milk 1L` = 60, not 6000).

Per store, one dispatch writes and commits that store's 30+ new item
rows plus its registry additions. Reuse the existing Pexels-fetch-once
pattern for photos. Prices realistic for each item type.

## Review focus (for the plan's task reviews)

- Every new item's name checked against the registry file as it stood
  BEFORE this dispatch's own additions.
- No existing item rows modified, deleted, or re-ordered — diff is pure
  appends.
- New rows use the target store's own existing category vocabulary
  exactly (grep first) — no near-synonym drift.
- Each store's final count actually reaches 50+ (live verified via
  `count(p.id) ... group by store_id`, scoped to the 12 store ids).
- `product.price` sanity-checked as plain rupees, not paise/×100.
- Registry line count and zero-internal-dupes independently re-verified
  by the controller after every task.
- Final whole-branch review re-checks whole-app name uniqueness (new
  items only) and does a fresh category-vocabulary sanity pass across
  all 12 stores (not just the ones touched this sub-project), per
  HANDOFF_9's known-gap #3.

## Out of scope

- Renaming or deduping the old 20-item-per-store duplicate catalogs
  (grandfathered, same treatment as sub-project A's parked residuals).
- Sub-projects C/D's stores — separate sub-projects, after this merges.
- Any UI/app code change — pure seed-data content.
- Store/vendor roster changes — 12 stores stay exactly as-is.

## Open question for the plan (writing-plans to resolve)

Batch size per dispatch: one store (30+ rows) per task, 12 tasks total,
matches sub-project A's "one unit per dispatch" granularity. Confirm
alcohol category's existing category vocabulary as part of task 0
(registry/prep) before any alcohol-store task starts writing new rows.
