# Marketplace Phase 5 — Content C: Pet, Flowers, Baby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed real, browsable stores and products for the final 3
categories — Pet, Flowers, Baby — completing all 10 non-restaurant
categories from the multi-vertical marketplace spec. 6 stores total (2
per category), each with 4 real products, real Pexels photos, and its
own vendor login account. This is the last content phase — once it
lands, every category in the sidebar (Phase 2) has real data behind it.

**Architecture:** Identical pattern to Phases 3 and 4 — pure
`supabase/seed.sql` addition, same fixed-UUID/`on conflict do nothing`
idempotent insert blocks. No schema or app code change. This phase also
regenerates `docs/UserList.docx` once, covering all vendor accounts added
across Phases 3, 4, and 5 together (deferred from those phases
specifically to avoid regenerating the same document 3 times).

**Tech Stack:** SQL (seed.sql), Pexels Search API via
`scripts/fetch-catalog-images.mjs`, `docx` (npm) for the UserList.docx
regeneration (see the `anthropic-skills:docx` skill for creation
mechanics if the implementer doesn't already know the pattern — the
existing `docs/UserList.docx` was built with a Node script using the
`docx` package; regenerate it the same way, don't hand-edit a `.docx`).

**Spec:** `docs/superpowers/specs/2026-09-26-multi-vertical-marketplace-design.md`
(section 6, section 7 phase "Content phase C" — this is the FINAL phase
of the whole multi-vertical marketplace project)

## Global Constraints

- Follow the existing seed.sql pattern exactly — same shape as Phases 3
  and 4's Task 2 worked examples.
- **UUID prefix**: use `d0100000` through `d0600000` (hex, six stores) —
  a fresh range distinct from `a0...` (restaurants), `b0...` (Phase 3),
  `c0...` (Phase 4).
- All 6 vendor accounts use password `demo1234`.
- Zero schema/migration changes — data-only, except the UserList.docx
  regeneration (a docs artifact, not code).
- Prices in the same numeric unit as existing `products.price` (rupees).

## Review Focus

- **UUID collisions** with `a0.../b0.../c0...` prefixes — grep before
  trusting an insert ran.
- **`cuisine_tags`/`avg_prep_minutes`** on these 6 stores — empty array
  and `null` respectively.
- **Vendor `owner_id` wiring** — each store's `owner_id` must match its
  paired `auth.users` row.
- **Phases 3/4's categories must still show their data unaffected** —
  this phase only adds rows.
- **UserList.docx completeness**: the regenerated doc must list every
  vendor account across restaurants (original + Phase 1) AND all of
  Phases 3/4/5's new accounts (18 new vendor rows total: 6 + 8 + 6) — not
  just this phase's 6. Missing any of Phase 3/4's accounts from the
  regenerated doc would be a real regression (the doc existed before and
  covered restaurants; this phase's regeneration must be a superset, not
  a narrower replacement).

---

## Task 1: Fetch product/store images

**Files:** none created — feeds Task 2's SQL.

- [ ] **Step 1: Fetch banner + product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "pet store interior" "pet shop aisle" \
  "dry dog food bag" "cat litter bag" "pet shampoo bottle" "dog chew toy" \
  "wet cat food cans" "bird seed bag" "fish food flakes" "pet leash" \
  "flower shop interior" "florist shop" \
  "rose bouquet" "mixed flower bouquet" "orchid plant pot" "flower vase" \
  "tulip bouquet" "sunflower bunch" "succulent plant pot" "greeting card" \
  "baby store interior" "baby products shop" \
  "diapers pack" "baby wipes pack" "baby food jar" "baby lotion bottle" \
  "baby onesie clothing" "pacifier" "baby powder bottle" "baby feeding bottle"
```
Save the printed URLs for use in Task 2 — 6 banner photos + 24 product
photos needed.

---

## Task 2: Seed data — Pet, Flowers, Baby

**Files:**
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: Task 1's fetched image URLs.
- Produces: 6 new `public.stores` rows (`category_type` one of `'pet'`,
  `'flowers'`, `'baby'`), 24 new `public.products` rows, 6 new vendor
  accounts.

- [ ] **Step 1: Follow the established worked-example pattern**

Same block shape as Phase 3/4 (see
`docs/superpowers/plans/2026-09-26-marketplace-phase3-content-a.md`'s
Task 2 Step 1 for the exact SQL structure). UUID suffix scheme
`-1111...`/`-2222...`/`-3333...`/`-4444-4444-4444-00000000000{1..4}`
under each store's `d0X00000` prefix.

Header comment:
```sql
-- Phase 5 (Content C): Pet, Flowers, Baby categories -- the final
-- content phase. Images from Pexels, fetched once via
-- scripts/fetch-catalog-images.mjs and hardcoded here, same pattern as
-- the restaurant catalog and Phases 3/4's blocks.
```

- [ ] **Step 2: Write all 6 stores and 24 products**

| Store (prefix) | Email | category_type | Address (Mumbai area) | Products (name — price — category — description) |
|---|---|---|---|---|
| Paws & Claws (`d0100000`) | `paws-and-claws@foodhub.local` | `pet` | Thane West, Mumbai | Dry Dog Food 3kg — 850 — Food — Chicken & rice dry dog food, 3kg; Cat Litter 5kg — 450 — Litter — Clumping cat litter, 5kg; Pet Shampoo — 250 — Grooming — Gentle oatmeal pet shampoo; Chew Toy — 180 — Toys — Durable rubber chew toy |
| Pet Pantry (`d0200000`) | `pet-pantry@foodhub.local` | `pet` | Mulund, Mumbai | Wet Cat Food Pack — 300 — Food — Wet cat food, 6x85g pouches; Bird Seed Mix — 150 — Food — Mixed seed blend for pet birds; Fish Food Flakes — 120 — Food — Tropical fish flake food; Pet Leash — 350 — Accessories — Adjustable nylon pet leash |
| Bloom & Co (`d0300000`) | `bloom-and-co@foodhub.local` | `flowers` | Bandra West, Mumbai | Rose Bouquet — 650 — Bouquets — Dozen red roses bouquet; Mixed Flower Bunch — 550 — Bouquets — Seasonal mixed flower bunch; Orchid Plant — 900 — Plants — Potted orchid plant; Flower Vase — 400 — Accessories — Ceramic flower vase |
| Petal Studio (`d0400000`) | `petal-studio@foodhub.local` | `flowers` | Khar, Mumbai | Tulip Bouquet — 700 — Bouquets — Fresh tulip bouquet, 10 stems; Sunflower Bunch — 500 — Bouquets — Bright sunflower bunch; Succulent Planter — 350 — Plants — Mini succulent planter set; Greeting Card — 80 — Accessories — Handmade greeting card |
| Little Ones (`d0500000`) | `little-ones@foodhub.local` | `baby` | Vikhroli, Mumbai | Diapers Pack — 550 — Diapering — Size M diapers, 48 count; Baby Wipes — 150 — Diapering — Fragrance-free baby wipes, 80 count; Baby Food Jar — 90 — Feeding — Pureed fruit baby food jar; Baby Lotion — 220 — Skincare — Gentle baby moisturizing lotion |
| Baby Basics (`d0600000`) | `baby-basics@foodhub.local` | `baby` | Ghatkopar, Mumbai | Baby Onesie — 350 — Clothing — Soft cotton baby onesie; Pacifier Set — 180 — Feeding — Orthodontic pacifier, 2-pack; Baby Powder — 160 — Skincare — Talc-free baby powder; Feeding Bottle — 300 — Feeding — BPA-free feeding bottle, 250ml |

Ratings: plausible 3.9-4.7, varied per store. Lat/lng: distinct plausible
Mumbai coordinates matching the named areas.

- [ ] **Step 3: Verify no UUID collisions**

```bash
grep -c "d0[1-6]00000-1111-1111-1111-111111111111" supabase/seed.sql
# Expect exactly 6
```

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: seed Pet, Flowers, and Baby stores and products"
```

---

## Task 3: Regenerate UserList.docx (all Phases 3-5 vendor accounts)

**Files:**
- Modify: `docs/UserList.docx`

**Interfaces:** none — this is a documentation artifact, not app code.

- [ ] **Step 1: List every vendor account that needs to appear**

The regenerated doc needs the ORIGINAL accounts (admin, customer,
delivery, the demo vendor, and the 16 original restaurant vendors —
these are already in the existing `docs/UserList.docx`, read it first
with `pandoc -t markdown docs/UserList.docx` to see the current table and
match its style) PLUS all 20 new vendor accounts from Phases 3-5:

Phase 3 (6): fresh-mart, daily-basket, quickstop, corner-store,
wine-cellar, craft-beer-co (all `@foodhub.local`)

Phase 4 (8): wellness-rx, vitamin-shop, home-essentials, fashion-hub,
glow-beauty, grooming-co, techzone, gadget-world

Phase 5 (6): paws-and-claws, pet-pantry, bloom-and-co, petal-studio,
little-ones, baby-basics

All 20 use password `demo1234`, matching every other seeded vendor.

- [ ] **Step 2: Regenerate the document**

Load the `anthropic-skills:docx` skill (or equivalent docx-creation
guidance available to you) for the exact `docx` (npm) API mechanics if
you haven't built a `.docx` before. Reuse the same document structure as
the existing `docs/UserList.docx` (core accounts table, then a restaurant
vendor table) but ADD a new section/table per category — "Grocery,
Convenience, Alcohol Vendor Accounts" (Phase 3's 6), "Health, Retail,
Personal Care, Electronics Vendor Accounts" (Phase 4's 8), "Pet, Flowers,
Baby Vendor Accounts" (Phase 5's 6) — each listing store name, email,
password, and category_type. Keep the existing restaurant-vendor table
and core-accounts table unchanged in content, just carried forward into
the new version.

Write the generating script to your scratchpad/temp directory (not
committed — only the output `.docx` is committed, matching how the
original was built), run it, and overwrite `docs/UserList.docx`.

- [ ] **Step 3: Verify the regenerated doc**

```bash
pandoc -t markdown docs/UserList.docx | grep -c "@foodhub.local"
```
Expect at least 45 (the original ~19 accounts + 20 new ones, roughly —
count precisely against your Step 1 list; the important thing is every
one of the 20 new emails appears, not an exact total). Spot-check a few
specific emails appear: `grep -c "wine-cellar@foodhub.local\|techzone@foodhub.local\|bloom-and-co@foodhub.local"` on the pandoc output should be 3.

- [ ] **Step 4: Commit**

```bash
git add docs/UserList.docx
git commit -m "docs: regenerate UserList.docx with all 20 Phase 3-5 vendor accounts"
```

---

## Task 4: Final verification — all 10 categories, whole project

**Files:** none — verification only.

- [ ] **Step 1: Full reset + build**

```bash
npx supabase db reset
npm run build
```

- [ ] **Step 2: Live verify every category has real data**

```bash
npm run dev &
sleep 5
```
Load the customer home page and click through all 11 sidebar categories
(Restaurants + 10 new) — confirm every single one now shows real stores
with real photos, names, and prices; the empty state from Phase 2 should
no longer appear for ANY category (this is the first point in the whole
project where that's true). Click into one store per category (11 total,
or spot-check at least 5 spread across different phases) and confirm
products render correctly.

Place one full test order against a NON-restaurant store (e.g. Fresh
Mart from Phase 3) through the real checkout UI, end to end, to confirm
the generalized checkout/cart flow (built category-agnostic since Phase
1) actually works for a non-restaurant purchase, not just restaurants —
this is the first real test of that claim anywhere in this whole
project.

- [ ] **Step 3: Update MEMORY.md**

Record: Phase 5 (Content C) complete, and with it, the ENTIRE
multi-vertical marketplace project (spec:
`docs/superpowers/specs/2026-09-26-multi-vertical-marketplace-design.md`)
is done — all 10 non-restaurant categories have real seeded stores/
products (20 total: 6+8+6 across Phases 3/4/5), the sidebar (Phase 2)
navigates all 11 categories, `docs/UserList.docx` covers all 39+ demo
accounts. Note the spec's section 8 "out of scope" items (age
verification for alcohol, prescription upload for health, faceted
search, inventory/stock-out beyond `is_available`) remain explicitly
unbuilt, as designed.

- [ ] **Step 4: Commit**

```bash
git add MEMORY.md
git commit -m "docs: record phase 5 content-c completion -- marketplace project done"
```
