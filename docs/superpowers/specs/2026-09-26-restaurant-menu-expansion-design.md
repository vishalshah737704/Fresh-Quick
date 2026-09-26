# Restaurant Menu Expansion — Design

**Sub-project A of 4** in the "50+ unique items per store" content redesign
(supersedes parts of the original multi-vertical marketplace content plan).
Order: **A (this doc) → B (Phase 3 redo) → C (Phase 4 redo) → D (Phase 5
fresh build)** — each runs after the prior one, in the same worktree-per-
sub-project pattern as the original marketplace phases.

## Goal

Every one of the 17 existing restaurants reaches **50+ menu items**, up
from the current 2-3 each (~43 total across all 17). Existing items are
kept — never deleted or replaced — because `order_items` rows reference
them by id and historical orders must stay valid. New items are added
until each restaurant crosses 50.

## Current state (verified live)

| Restaurant | Cuisine tags | Current items |
|---|---|---|
| Bangkok Bites | thai | 3 |
| Bella Italia | italian | 3 |
| Burger Barn | fast_food | 2 |
| Demo Kitchen | indian, fast_food | 2 |
| Dosa Corner | south_indian | 3 |
| El Sombrero | mexican | 2 |
| Fresh Fit | healthy | 2 |
| Golden Dragon | chinese | 3 |
| Green Bowl | healthy | 3 |
| Juice Junction | beverages | 2 |
| Pasta Palace | italian | 2 |
| Punjabi Dhaba | north_indian | 3 |
| Spice Route | indian | 3 |
| Sweet Tooth | desserts | 3 |
| Taco Fiesta | mexican | 3 |
| The Bread Basket | bakery | 3 |
| Wok This Way | chinese | 2 |

17 restaurants x ~47-48 new dishes each = **~810 new menu-item rows**,
hand-authored, cuisine-appropriate to each restaurant's existing
`cuisine_tags`.

## Global uniqueness constraint

Every item name across the ENTIRE app (all 57 stores/restaurants across
all 4 sub-projects, ~2,850 rows total) must be unique — no repeats
anywhere, any category. This sub-project runs first and is the first
writer to the shared registry.

**Mechanism:** a single file, `docs/superpowers/plans/item-name-registry.md`,
holds one line per item name used so far, created by this sub-project and
appended to (never rewritten) by B, C, and D in turn. Every implementer
dispatch in every sub-project:
1. Reads the current registry before writing any new item names.
2. Picks names that don't collide with any existing line.
3. Appends its own new names to the registry as part of its commit,
   in the same PR/commit as its SQL changes.

The registry is plain text, one name per line, sorted is not required —
append-only, plan-file-tracked (committed to git, not gitignored SDD
scratch), so it survives across sub-project worktrees and persists after
each is merged to main.

## Architecture

Identical mechanical pattern to the existing content phases: pure
`supabase/seed.sql` addition (append new `insert into public.products`
blocks with `on conflict do nothing`, referencing each restaurant's
existing `store_id`). No schema/migration change. No new vendor
accounts needed — all 17 restaurants already have vendor owners.

Per restaurant, one dispatch (or a small batch of 2-3 restaurants sharing
a similar cuisine, if that keeps dispatch size reasonable) writes and
commits that restaurant's ~47-48 new dish rows plus its registry
additions. Prices in rupees, realistic for each dish. Reuse the existing
Pexels-fetch-once pattern for photos (fetch a batch of dish-appropriate
queries per restaurant/cuisine, then hand-write the SQL with the fetched
URLs, same as every prior content phase).

## Review focus (for the plan's task reviews)

- Every new item's name checked against the registry file as it stood
  BEFORE this dispatch's own additions (no dispatch may collide with an
  earlier dispatch in the same sub-project, nor with anything the
  registry already held).
- No existing item rows modified, deleted, or re-ordered — diff should be
  pure appends.
- Each restaurant's final count actually reaches 50+ (live verified via
  the same `count(p.id) ... group by store` pattern used in prior phases,
  scoped to `category_type = 'restaurant'` this time, per-store not just
  per-category).
- Dish names/descriptions plausible for the restaurant's own
  `cuisine_tags` (a Thai place shouldn't suddenly sell tacos).
- Zero schema/migration changes.

## Out of scope

- Changing existing items' prices, descriptions, or availability.
- Restaurants B/C/D's stores — those are separate sub-projects, handled
  after this one merges (their implementers will read this sub-project's
  final registry state as their starting point).
- Any UI/app code change — this is pure seed-data content, matching every
  prior content phase.

## Open question for the plan (writing-plans to resolve)

How many restaurants per implementer dispatch is the right batch size —
Phase 3/4's precedent was one *category* (80 rows) per dispatch; here one
*restaurant* is only ~47-48 rows, so batching 2-3 similar-cuisine
restaurants per dispatch may be more efficient than 17 separate
dispatches. Leave this sizing call to the plan.
