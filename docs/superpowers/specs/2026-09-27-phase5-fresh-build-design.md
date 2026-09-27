# Phase 5 Fresh Build (Pet/Flowers/Baby) — Design

**Sub-project D of 4** in the "50+ unique items per store" content
redesign. Order: **A (restaurant menu expansion) → B (Phase 3 redo) → C
(Phase 4 redo) → D (this doc)**. All three prior sub-projects are
complete, merged, and pushed. This is the final sub-project.

**Authored under full autonomy** (per Vishal's standing instruction to run
all remaining phases without stopping for questions) — decisions below
are rulings, not interactive Q&A, following the exact precedent set by
sub-projects B and C.

## Goal

Build 12 entirely new stores across 3 categories never seeded before —
Pet, Flowers, Baby (4 stores each) — each with a fresh, fully unique,
hand-curated 50-item catalog. Unlike sub-projects B and C, there is no
prior seed data of any kind for these categories: no old worktree, no
store rows, no vendor accounts. Everything is built from scratch.

## Ruling: category_type values already whitelisted

Confirmed in `supabase/migrations/00000000000020_stores_products_rename.sql`:
`'pet'`, `'flowers'`, `'baby'` are already valid `category_type` values.
No schema/migration change needed.

## Ruling: UUID prefix block

`d01`-`d0c` confirmed unused (`grep -c "'d0" supabase/seed.sql` → 0
matches). Assignment:
- Pet: `d0100000`-`d0400000`
- Flowers: `d0500000`-`d0800000`
- Baby: `d0900000`-`d0c00000`

## Ruling: store roster (new, invented for this sub-project)

| Category | Store | Lat/Lng (Mumbai-area, spread out like prior sub-projects) |
|---|---|---|
| Pet | Paws & Claws | 19.0728, 72.8826 |
| Pet | The Pet Corner | 19.1334, 72.9133 |
| Pet | Furry Friends Mart | 19.0522, 72.8397 |
| Pet | Whiskers & Wags | 19.1990, 72.8397 |
| Flowers | Petal Bloom | 19.1075, 72.8263 |
| Flowers | Fresh Petals Co. | 19.0433, 72.9067 |
| Flowers | The Flower Basket | 19.1550, 72.8397 |
| Flowers | Bloom & Blossom | 19.0836, 72.9450 |
| Baby | Little Steps | 19.1197, 72.9051 |
| Baby | Tiny Tots Store | 19.0658, 72.8695 |
| Baby | BabyCare Hub | 19.1750, 72.9700 |
| Baby | Cuddle & Co. | 19.0290, 72.8940 |

Each store gets its own fresh vendor account (`auth.users`/
`auth.identities`/`public.users` role `vendor`) and address
(`public.addresses`), all built from scratch in Task 0 — same pattern as
sub-project B/C's vendor rows, just newly created instead of ported.

## Ruling: `is_veg` — omitted entirely

None of Pet/Flowers/Baby have a natural veg/non-veg concept (unlike
sub-project C's Health category, which had food-adjacent supplements).
Every row uses `product_attributes: {}'::jsonb`. This matches Retail/
Personal Care/Electronics' precedent from sub-project C.

## Ruling: price format — decimal rupees.paise (consistent with sub-project C)

`products.price` uses decimal rupees.paise (e.g. 149.75), continuing the
convention Vishal set for sub-project C, applied consistently going
forward rather than reverting to sub-projects A/B's whole-rupee-only
style.

## Ruling: category vocabulary (5 per category, confirmed in Task 0)

- Pet: `Pet Food`, `Toys & Accessories`, `Grooming & Health`, `Habitat &
  Bedding`, `Training & Travel`
- Flowers: `Fresh Flowers`, `Bouquets & Arrangements`, `Plants`, `Gift
  Hampers`, `Vases & Decor`
- Baby: `Feeding`, `Diapering & Bath`, `Clothing`, `Toys & Learning`,
  `Nursery & Safety`

## Global uniqueness constraint

Every item name must be unique across the ENTIRE app — checked against
`docs/superpowers/plans/item-name-registry.md` (2,076 lines as of
sub-project C's completion). Append-only, same mechanism as A/B/C.

## Architecture

- Fresh worktree off current `main`. Copy `.env.local` in as one of the
  first setup steps (standing rule from sub-project B/C).
- Task 0 creates all 12 stores' vendor accounts, addresses, and store
  rows from scratch (`auth.users`, `auth.identities`, `public.users`,
  `public.addresses`, `public.stores`), zero products.
- Per store, one dispatch writes that store's 50 new item rows plus its
  registry additions, as a brand-new, separate `insert into
  public.products (...) values (...) on conflict (id) do nothing;`
  statement — **never editing an existing insert statement** (standing
  rule from sub-project C's Task 10 regression).
- Every dispatch bakes in the two dominant defect classes from
  sub-project C from the start:
  1. **Image dedup must check the WHOLE `seed.sql` file**, with a
     literal copy-pasteable grep command given in every dispatch — not
     "check your own 50 rows."
  2. **Never edit an existing insert statement** — always append a new,
     separate one.
- Reuse the existing Pexels-fetch-once pattern for photos.

## Review focus (for the plan's task reviews)

- Every new item name checked against the registry as it stood before
  the task's own commit.
- Zero deletions in every task's diff (`git diff --stat` shows additions
  only).
- Image URL uniqueness verified against the WHOLE file, independently
  re-checked by the reviewer (do not trust implementer self-reports,
  per sub-project C's repeated experience).
- Category values match the confirmed per-category vocabulary exactly.
- `product_attributes` is `{}'::jsonb` on every row (no is_veg).
- `products.price` decimal rupees.paise.
- Each store's final count reaches exactly 50.
- Final whole-branch review re-derives all app-wide image_url duplicates
  from scratch (sub-project C's final review caught 14 collisions every
  individual task review had missed) and does a live browser UI check.

## Out of scope

- Any UI/app code change — pure seed-data content (vendor/address/store
  rows + product rows only).
- Sub-projects A/B/C — already complete, merged, pushed.

## Open question for the plan (writing-plans to resolve)

Batch size per dispatch: one store (50 rows) per task, 12 tasks total,
plus Task 0 (vendor/store creation + category vocab confirmation +
registry starting state) and a final whole-branch verification task — 14
tasks total, matching sub-projects B/C's granularity.
