# Marketplace Phase 5 — Content C: Pet, Flowers, Baby Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed real, browsable stores and products for the final 3
categories — Pet, Flowers, Baby — completing all 10 non-restaurant
categories, each reaching **75-100 browsable products** per the user's
explicit Uber-Eats-depth request. 12 stores total (4 per category), each
carrying its category's full 20-item master catalog — 80 product rows
per category. This is the last content phase — once it lands, every
category in the sidebar (Phase 2) has real, deep data behind it.

**Architecture:** Identical pattern to Phases 3 and 4 — pure
`supabase/seed.sql` addition, same fixed-UUID/`on conflict do nothing`
idempotent insert blocks, one 20-item master list per category shared
across that category's 4 stores. No schema or app code change. This
phase also regenerates `docs/UserList.docx` once, covering all 40 vendor
accounts added across Phases 3, 4, and 5 together.

**Tech Stack:** SQL (seed.sql), Pexels Search API via
`scripts/fetch-catalog-images.mjs`, `docx` (npm) for the UserList.docx
regeneration (see the `anthropic-skills:docx` skill for creation
mechanics — the existing `docs/UserList.docx` was built with a Node
script using the `docx` package; regenerate it the same way).

**Spec:** `docs/superpowers/specs/2026-09-26-multi-vertical-marketplace-design.md`
(section 6, section 7 phase "Content phase C" — this is the FINAL phase
of the whole multi-vertical marketplace project) — superseded on sizing
by Phase 3's 75-100-items-per-category precedent.

## Global Constraints

- Follow Phase 3/4's exact established pattern.
- **UUID prefix**: use `d0100000` through `d0c00000` (hex, twelve
  stores — 4 each for Pet/Flowers/Baby) — a fresh range distinct from
  `a0...` (restaurants), `b0...` (Phase 3), `c0...` (Phase 4).
- **Every store in a category carries the SAME 20-item master list**
  given below.
- **Reuse one Pexels photo per item type across all 4 stores selling it.**
- All 12 vendor accounts use password `demo1234`.
- Zero schema/migration changes, except the UserList.docx regeneration
  (a docs artifact, not code).
- Prices in rupees; ±10% per-store variation optional.

## Review Focus

- UUID collisions with `a0.../b0.../c0...` prefixes.
- `cuisine_tags`/`avg_prep_minutes` — empty array and `null`.
- Vendor `owner_id` wiring correctness.
- **Product count per category actually reaches ~80** — same count query
  as Phases 3/4.
- Phases 3/4's categories must still show their data unaffected.
- **UserList.docx completeness**: the regenerated doc must list every
  vendor account across restaurants (original + Phase 1) AND all 40 new
  accounts from Phases 3/4/5 (12 + 16 + 12) — not just this phase's 12.
  Missing any prior phase's accounts would be a real regression.

---

## Task 1: Fetch product/store images

**Files:** none created — feeds Task 2's SQL.

- [ ] **Step 1: Fetch banner + product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "pet store interior" "pet shop aisle" "animal supplies store" "pet supply shop front" \
  "dry dog food bag" "cat litter bag" "pet shampoo bottle" "dog chew toy" \
  "wet cat food cans" "bird seed bag" "fish food flakes" "pet leash" \
  "dry cat food bag" "pet bed cushion" "pet collar" "dog treats bag" \
  "cat scratching post" "pet carrier bag" "flea tick spray" "pet feeding bowl" \
  "dog grooming brush" "hamster bedding" "aquarium filter" "puppy training pads"

node scripts/fetch-catalog-images.mjs \
  "flower shop interior" "florist shop" "garden nursery plants" "flower boutique" \
  "rose bouquet" "mixed flower bouquet" "orchid plant pot" "flower vase" \
  "tulip bouquet" "sunflower bunch" "succulent plant pot" "greeting card" \
  "lily bouquet" "carnation flowers" "bonsai tree pot" "money plant pot" \
  "chocolate gift box" "small teddy bear" "scented candle" "anniversary flower bouquet" \
  "birthday flower basket" "peace lily plant" "gift wrapping paper" "cactus planter set"

node scripts/fetch-catalog-images.mjs \
  "baby store interior" "baby products shop" "infant nursery shop" "baby boutique store" \
  "diapers pack" "baby wipes pack" "baby food jar" "baby lotion bottle" \
  "baby onesie clothing" "pacifier" "baby powder bottle" "baby feeding bottle" \
  "baby shampoo bottle" "diaper rash cream" "baby bibs" "baby socks" \
  "baby blanket" "baby oil bottle" "baby cereal box" "teething toy" \
  "baby nail clipper set" "baby sun hat" "baby swaddle wrap" "baby bath tub"
```
Save the printed URLs for Task 2 — 12 banner photos + 60 product photos
needed (20 per category).

---

## Task 2: Seed data — Pet, Flowers, Baby (4 stores × 20 items each, per category)

**Files:**
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: Task 1's fetched image URLs.
- Produces: 12 new `public.stores` rows (4 each of `'pet'`, `'flowers'`,
  `'baby'`), 240 new `public.products` rows (80 per category), 12 new
  vendor accounts.

- [ ] **Step 1: Pet — 4 stores × this 20-item list**

Follow Phase 3's exact worked-example SQL pattern. UUID prefixes
`d0100000` (Paws & Claws), `d0200000` (Pet Pantry), `d0300000` (The Pet
Stop), `d0400000` (Furry Friends). All `category_type = 'pet'`.
Locations: Thane West, Mulund, Vikhroli, Ghatkopar (Mumbai). Ratings vary
3.9-4.7.

| Item | Price | Category | Description |
|---|---|---|---|
| Dry Dog Food 3kg | 850 | Food | Chicken & rice dry dog food, 3kg |
| Cat Litter 5kg | 450 | Litter | Clumping cat litter, 5kg |
| Pet Shampoo | 250 | Grooming | Gentle oatmeal pet shampoo |
| Chew Toy | 180 | Toys | Durable rubber chew toy |
| Wet Cat Food Pack | 300 | Food | Wet cat food, 6x85g pouches |
| Bird Seed Mix | 150 | Food | Mixed seed blend for pet birds |
| Fish Food Flakes | 120 | Food | Tropical fish flake food |
| Pet Leash | 350 | Accessories | Adjustable nylon pet leash |
| Dry Cat Food 2kg | 650 | Food | Salmon dry cat food, 2kg |
| Pet Bed | 900 | Accessories | Soft cushioned pet bed |
| Pet Collar | 200 | Accessories | Adjustable reflective collar |
| Dog Treats Pack | 220 | Food | Training treat pack |
| Cat Scratching Post | 750 | Accessories | Sisal scratching post |
| Pet Carrier | 1100 | Accessories | Ventilated travel carrier |
| Flea & Tick Spray | 280 | Health | Natural flea and tick spray |
| Pet Feeding Bowl Set | 250 | Accessories | Stainless steel bowl set |
| Dog Grooming Brush | 200 | Grooming | Deshedding grooming brush |
| Hamster Bedding | 180 | Accessories | Soft absorbent hamster bedding |
| Aquarium Filter | 650 | Accessories | Small tank aquarium filter |
| Puppy Training Pads | 300 | Accessories | Absorbent training pads, 30ct |

- [ ] **Step 2: Flowers — 4 stores × this 20-item list**

UUID prefixes `d0500000` (Bloom & Co), `d0600000` (Petal Studio),
`d0700000` (Flower Fiesta), `d0800000` (Garden Grace). All
`category_type = 'flowers'`. Locations: Bandra West, Khar, Juhu,
Santacruz. Ratings vary 3.9-4.7.

| Item | Price | Category | Description |
|---|---|---|---|
| Rose Bouquet | 650 | Bouquets | Dozen red roses bouquet |
| Mixed Flower Bunch | 550 | Bouquets | Seasonal mixed flower bunch |
| Orchid Plant | 900 | Plants | Potted orchid plant |
| Flower Vase | 400 | Accessories | Ceramic flower vase |
| Tulip Bouquet | 700 | Bouquets | Fresh tulip bouquet, 10 stems |
| Sunflower Bunch | 500 | Bouquets | Bright sunflower bunch |
| Succulent Planter | 350 | Plants | Mini succulent planter set |
| Greeting Card | 80 | Accessories | Handmade greeting card |
| Lily Bouquet | 750 | Bouquets | Fragrant lily bouquet |
| Carnation Bunch | 450 | Bouquets | Assorted carnation bunch |
| Bonsai Plant | 1200 | Plants | Miniature bonsai tree |
| Money Plant | 300 | Plants | Potted money plant, air-purifying |
| Chocolate Box | 400 | Gifts | Assorted chocolate gift box |
| Teddy Bear Small | 350 | Gifts | Small plush teddy bear |
| Scented Candle | 250 | Gifts | Lavender scented candle |
| Anniversary Bouquet | 950 | Bouquets | Premium mixed anniversary bouquet |
| Birthday Flower Basket | 850 | Bouquets | Festive birthday flower basket |
| Peace Lily Plant | 550 | Plants | Air-purifying peace lily |
| Gift Wrapping Paper | 60 | Accessories | Decorative gift wrap sheet |
| Cactus Planter Set | 400 | Plants | Set of 3 mini cactus planters |

- [ ] **Step 3: Baby — 4 stores × this 20-item list**

UUID prefixes `d0900000` (Little Ones), `d0a00000` (Baby Basics),
`d0b00000` (Tiny Tots), `d0c00000` (Cradle Care). All
`category_type = 'baby'`. Locations: Vikhroli, Ghatkopar, Chembur,
Kurla. Ratings vary 3.9-4.7.

| Item | Price | Category | Description |
|---|---|---|---|
| Diapers Pack | 550 | Diapering | Size M diapers, 48 count |
| Baby Wipes | 150 | Diapering | Fragrance-free baby wipes, 80 count |
| Baby Food Jar | 90 | Feeding | Pureed fruit baby food jar |
| Baby Lotion | 220 | Skincare | Gentle baby moisturizing lotion |
| Baby Onesie | 350 | Clothing | Soft cotton baby onesie |
| Pacifier Set | 180 | Feeding | Orthodontic pacifier, 2-pack |
| Baby Powder | 160 | Skincare | Talc-free baby powder |
| Feeding Bottle | 300 | Feeding | BPA-free feeding bottle, 250ml |
| Baby Shampoo 200ml | 210 | Skincare | Tear-free baby shampoo |
| Diaper Rash Cream | 180 | Skincare | Soothing diaper rash cream |
| Baby Bibs 3-pack | 250 | Feeding | Waterproof baby bibs |
| Baby Socks 3-pack | 150 | Clothing | Soft cotton baby socks |
| Baby Blanket | 500 | Nursery | Soft fleece baby blanket |
| Baby Oil 200ml | 190 | Skincare | Nourishing baby massage oil |
| Baby Cereal 200g | 220 | Feeding | Wheat and fruit baby cereal |
| Teething Toy | 200 | Toys | Soft silicone teething toy |
| Baby Nail Clipper Set | 150 | Grooming | Safety baby grooming kit |
| Baby Sunhat | 250 | Clothing | Cotton sun protection hat |
| Baby Swaddle Wrap | 400 | Nursery | Muslin swaddle wrap |
| Baby Bath Tub | 900 | Nursery | Ergonomic infant bath tub |

- [ ] **Step 4: Verify no UUID collisions**

```bash
grep -c "d0[1-9a-c]00000-1111-1111-1111-111111111111" supabase/seed.sql
# Expect exactly 12
```

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: seed Pet, Flowers, and Baby stores and products (4 stores x 20 items each)"
```

---

## Task 3: Regenerate UserList.docx (all Phases 3-5 vendor accounts — 40 total)

**Files:**
- Modify: `docs/UserList.docx`

**Interfaces:** none — documentation artifact, not app code.

- [ ] **Step 1: List every vendor account that needs to appear**

Read the current doc first: `pandoc -t markdown docs/UserList.docx`.

The regenerated doc needs the ORIGINAL accounts (admin, customer,
delivery, demo vendor, 16 restaurant vendors — already in the doc) PLUS
all 40 new vendor accounts from Phases 3-5:

Phase 3 (12): fresh-mart, daily-basket, green-grocer, metro-grocery,
quickstop, corner-store, 24-7-shop (slug: use a valid email-safe form,
e.g. `247-shop@foodhub.local`), metro-mart-express, wine-cellar,
craft-beer-co, spirits-and-more, the-bottle-shop

Phase 4 (16): wellness-rx, vitamin-shop, medplus-pharmacy, care-and-cure,
home-essentials, fashion-hub, urban-living, style-bazaar, glow-beauty,
grooming-co, beauty-bar, pure-skin, techzone, gadget-world, digital-hub,
circuitpoint

Phase 5 (12): paws-and-claws, pet-pantry, the-pet-stop, furry-friends,
bloom-and-co, petal-studio, flower-fiesta, garden-grace, little-ones,
baby-basics, tiny-tots, cradle-care

All `@foodhub.local`, all password `demo1234`. Cross-check this list
against the ACTUAL emails used in `supabase/seed.sql` for Phases 3-5
(read the file, don't just trust this list — Phase 3/4's plans may have
used slightly different exact email slugs; use whatever is actually in
seed.sql as the source of truth).

- [ ] **Step 2: Regenerate the document**

Load the `anthropic-skills:docx` skill for the `docx` (npm) API mechanics
if needed. Reuse the existing `docs/UserList.docx` structure (core
accounts table, restaurant vendor table) and ADD one new
table/section per category group — "Grocery, Convenience, Alcohol Vendor
Accounts" (12), "Health, Retail, Personal Care, Electronics Vendor
Accounts" (16), "Pet, Flowers, Baby Vendor Accounts" (12) — each listing
store name, email, password, category_type. Keep the existing tables'
content unchanged, just carried forward.

Write the generating script to your scratchpad/temp directory (not
committed — only the output `.docx` is committed), run it, overwrite
`docs/UserList.docx`.

- [ ] **Step 3: Verify the regenerated doc**

```bash
pandoc -t markdown docs/UserList.docx | grep -c "@foodhub.local"
```
Expect at least 59 (original ~19 + 40 new — count precisely against
Step 1's actual seed.sql-derived list). Spot-check a few:
`grep -c "wine-cellar@foodhub.local\|techzone@foodhub.local\|bloom-and-co@foodhub.local"`
on the pandoc output should be 3 (adjust exact slugs to match what's
actually in seed.sql).

- [ ] **Step 4: Commit**

```bash
git add docs/UserList.docx
git commit -m "docs: regenerate UserList.docx with all 40 Phase 3-5 vendor accounts"
```

---

## Task 4: Final verification — all 10 categories, whole project

**Files:** none — verification only.

- [ ] **Step 1: Full reset + build**

```bash
npx supabase db reset
npm run build
```

- [ ] **Step 2: Verify final row counts across ALL 10 categories**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
select s.category_type, count(p.id) as product_count, count(distinct s.id) as store_count
from public.stores s join public.products p on p.store_id = s.id
group by 1 order by 1;
"
```
Expected: `restaurant` shows its original ~40 products across 17 stores
(unchanged by this project); every one of the other 10 categories shows
~80 products across 4 stores each. This is the acceptance criterion for
the entire multi-vertical marketplace project's content depth.

- [ ] **Step 3: Live verify every category has real, deep data**

```bash
npm run dev &
sleep 5
```
Load the customer home page and click through all 11 sidebar categories
— confirm every one shows real stores (4 each for the 10 non-restaurant
categories) with real photos/names/prices; no empty state should appear
for ANY category anymore. Click into at least 3 stores spread across
different categories and confirm ~20 products render per store.

Place one full test order against a NON-restaurant store (e.g. Fresh
Mart from Phase 3) through the real checkout UI, end to end, to confirm
the generalized checkout/cart flow (built category-agnostic since Phase
1) actually works for a non-restaurant purchase.

- [ ] **Step 4: Update MEMORY.md**

Record: Phase 5 (Content C) complete, and with it, the ENTIRE
multi-vertical marketplace project is done — all 10 non-restaurant
categories have real seeded stores/products at Uber-Eats-comparable
depth: 4 stores each, ~80 products per category (40 stores, ~800 products
total across Phases 3-5), the sidebar (Phase 2) navigates all 11
categories with real data behind every one, `docs/UserList.docx` covers
all 59+ demo accounts. Note the spec's section 8 "out of scope" items
(age verification for alcohol, prescription upload for health, faceted
search, inventory/stock-out beyond `is_available`) remain explicitly
unbuilt, as designed. Note the content depth (75-100 items/category,
achieved via 4 stores sharing a 20-item master catalog per category) was
a mid-project sizing revision from the original spec's 2-3-stores
estimate, made per explicit user request referencing Uber Eats.

- [ ] **Step 5: Commit**

```bash
git add MEMORY.md
git commit -m "docs: record phase 5 content-c completion -- marketplace project done"
```
