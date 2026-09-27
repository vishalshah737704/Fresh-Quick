# Phase 5 Fresh Build (Pet/Flowers/Baby) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 12 brand-new stores (4 each: Pet, Flowers, Baby) each get a
fresh, fully unique, hand-curated 50-item catalog, built entirely from
scratch (no prior seed data of any kind for these categories).

**Architecture:** Fresh worktree off current `main`. Task 0 creates all
12 stores' vendor accounts, addresses, and store rows from scratch. Each
of Tasks 1-12 then writes one store's 50 new `insert into public.products`
rows as a brand-new, separate insert statement. The shared append-only
registry file (`docs/superpowers/plans/item-name-registry.md`) tracks
every item name used anywhere in the app.

**Tech Stack:** SQL (seed.sql), Pexels Search API via
`scripts/fetch-catalog-images.mjs` for new product photos.

**Spec:** `docs/superpowers/specs/2026-09-27-phase5-fresh-build-design.md`

## Global Constraints

- Every new item name must be unique across the ENTIRE app — checked
  against `docs/superpowers/plans/item-name-registry.md` (2,076 lines as
  of sub-project C) before written, appended in the same commit. Append
  only, never rewrite/restructure the registry.
- `products.price` is a decimal rupees.paise value (e.g. 149.75), never
  integer paise, never x100.
- `product_attributes` is `{}'::jsonb` on EVERY row in this sub-project
  — no `is_veg` anywhere (Pet/Flowers/Baby have no veg/non-veg concept).
- Each store's 50 new rows must use that category's confirmed vocabulary
  from Task 0 exactly — no near-synonym drift.
- Zero schema/migration changes — `pet`/`flowers`/`baby` category_type
  values already exist in migration `00000000000020_stores_products_rename.sql`.
- **Every task must add a brand-new, separate `insert into
  public.products (...) values (...) on conflict (id) do nothing;`
  statement — NEVER edit, open, or extend an existing insert statement.**
  A prior sub-project's Task 10 accidentally deleted a different store's
  entire 50-row catalog this exact way; every dispatch must warn against
  it explicitly and every task must verify `git diff --stat` shows only
  additions before committing.
- **Image dedup must be checked against the WHOLE `seed.sql` file, not
  just the task's own 50 rows.** This was the dominant defect class in
  the prior sub-project (real collisions in 4 of 16 tasks, plus 14 more
  caught only by final review). Every dispatch gives the exact
  copy-pasteable whole-file grep command; every task review independently
  re-verifies from scratch rather than trusting the implementer's claim.
- Each store's product count must reach exactly 50, verified live via
  `count(p.id) ... where store_id = ...`.
- Reuse the existing Pexels-fetch-once pattern (fetch once, bake URLs
  into seed.sql — never called at runtime).
- Copy `.env.local` into the new worktree as one of the first setup
  steps.

## Review Focus

- A new item name that collides with the registry as it stood before
  this task's own commit.
- Any diff containing a deletion anywhere in `supabase/seed.sql` (the
  Task 10 regression class from the prior sub-project) — zero tolerance,
  always a Critical finding.
- An `image_url` that collides with ANY other row anywhere in the file
  (not just this task's own 50) — independently re-derived by the
  reviewer every time, never trusted from the implementer's report alone.
- A new row's `category` value not matching Task 0's confirmed
  per-category vocabulary exactly.
- `product_attributes` containing anything other than `{}'::jsonb`
  (is_veg has no place in this sub-project).
- A store's final live count falling short of (or exceeding) 50.

---

## Task 0: Create vendor accounts, stores, and confirm registry/category state

**Files:**
- Modify: `supabase/seed.sql` (append 12 new store-setup blocks —
  vendor/address/store rows only, zero product rows)

**Interfaces:**
- Consumes: `docs/superpowers/plans/item-name-registry.md` as left by
  sub-project C.
- Produces: 12 store rows (with vendor owner accounts and addresses)
  available in this worktree's `supabase/seed.sql` for Tasks 1-12 to
  reference by `store_id`.

- [ ] **Step 1: Create the worktree and copy `.env.local`**

```bash
git worktree add .claude/worktrees/phase5-fresh-build -b worktree-phase5-fresh-build main
cp .env.local .claude/worktrees/phase5-fresh-build/.env.local
cd .claude/worktrees/phase5-fresh-build
npm install
```

- [ ] **Step 2: Verify current registry line count**

```bash
wc -l docs/superpowers/plans/item-name-registry.md
```
Expect 2076 or more.

- [ ] **Step 3: Create 12 new vendor/address/store blocks in `supabase/seed.sql`**

Append these 12 blocks (5 statements each: `auth.users`, `auth.identities`,
`public.users`, `public.addresses`, `public.stores`) after the last
existing store block in the file, matching the exact column shape and
`on conflict do nothing` pattern of the existing blocks (see any
sub-project C store block, e.g. `WellnessRx`, as a template). Use
password `demo1234`, email pattern `<slug>@foodhub.local`, `role =
'vendor'`, `full_name = '<Store Name> Owner'`.

| Store | category_type | UUID prefix | Lat | Lng | Rating |
|---|---|---|---|---|---|
| Paws & Claws | pet | d0100000 | 19.0728 | 72.8826 | 4.4 |
| The Pet Corner | pet | d0200000 | 19.1334 | 72.9133 | 4.2 |
| Furry Friends Mart | pet | d0300000 | 19.0522 | 72.8397 | 4.0 |
| Whiskers & Wags | pet | d0400000 | 19.1990 | 72.8397 | 4.5 |
| Petal Bloom | flowers | d0500000 | 19.1075 | 72.8263 | 4.6 |
| Fresh Petals Co. | flowers | d0600000 | 19.0433 | 72.9067 | 4.1 |
| The Flower Basket | flowers | d0700000 | 19.1550 | 72.8397 | 4.3 |
| Bloom & Blossom | flowers | d0800000 | 19.0836 | 72.9450 | 4.7 |
| Little Steps | baby | d0900000 | 19.1197 | 72.9051 | 4.5 |
| Tiny Tots Store | baby | d0a00000 | 19.0658 | 72.8695 | 4.2 |
| BabyCare Hub | baby | d0b00000 | 19.1750 | 72.9700 | 4.0 |
| Cuddle & Co. | baby | d0c00000 | 19.0290 | 72.8940 | 4.6 |

Each store's UUIDs: owner `<prefix>-1111-1111-1111-111111111111`,
address `<prefix>-2222-2222-2222-222222222222`, store
`<prefix>-3333-3333-3333-333333333333`. Use a real Pexels banner photo
per store (fetch once via `scripts/fetch-catalog-images.mjs`, category-
appropriate: pet shop, flower shop, baby store interiors).

- [ ] **Step 4: Verify the 12 stores exist with zero products**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select s.name, s.category_type, count(p.id) from public.stores s left join public.products p on p.store_id = s.id where s.category_type in ('pet','flowers','baby') group by s.name, s.category_type order by s.category_type, s.name;"
```
Expect all 12 rows present, count = 0 for every store.

- [ ] **Step 5: Confirm category vocabulary for this plan**

Adopt these five categories per category for all of Tasks 1-12:
- Pet: `Pet Food`, `Toys & Accessories`, `Grooming & Health`,
  `Habitat & Bedding`, `Training & Travel`
- Flowers: `Fresh Flowers`, `Bouquets & Arrangements`, `Plants`,
  `Gift Hampers`, `Vases & Decor`
- Baby: `Feeding`, `Diapering & Bath`, `Clothing`, `Toys & Learning`,
  `Nursery & Safety`

- [ ] **Step 6: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: create Phase 5 vendor accounts and store rows (Pet/Flowers/Baby)"
```

---
## Task 1: Paws & Claws (Pet) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 0.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "dry dog food bag" "dry cat food bag" "wet cat food cans" "wet dog food pouch" \
  "dog treats pack" "cat treats pack" "dog chew bone" "puppy training pads" \
  "dog leash" "dog collar" "cat collar bell" "pet carrier bag" \
  "dog bed" "cat bed" "scratching post" "pet water fountain" \
  "dog food bowl" "cat litter box" "cat litter bag" "pet grooming brush" \
  "dog shampoo bottle" "flea and tick spray" "pet nail clipper" "dog dental chews" \
  "cat scratching pad" "dog squeaky toy" "cat toy mouse" "interactive pet toy" \
  "bird cage" "bird seed pack" "fish tank" "fish food flakes" \
  "hamster cage" "rabbit hutch" "pet carrier crate" "dog raincoat" \
  "dog sweater" "pet id tag" "pet feeding mat" "cat tree tower" \
  "dog muzzle" "pet stroller" "dog poop bags" "pet odor eliminator spray" \
  "pet first aid kit" "dog harness" "cat harness" "aquarium filter" \
  "reptile heat lamp" "pet vitamins supplement"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find Paws & Claws' `store_id` (`d0100000-3333-3333-3333-333333333333`) and
add new `insert into public.products` rows referencing it, as a brand-new
separate insert statement (never edit an existing one), `on conflict do
nothing`, ids `d0100000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Dry Dog Food 3kg | 850.50 | Pet Food | Balanced adult dog dry food |
| Dry Cat Food 2kg | 650.00 | Pet Food | Complete nutrition cat kibble |
| Wet Cat Food Cans 6pk | 420.75 | Pet Food | Gravy-based wet cat food, pack of 6 |
| Wet Dog Food Pouch 12pk | 480.00 | Pet Food | Meaty wet dog food pouches |
| Dog Treats Biscuits 500g | 220.50 | Pet Food | Crunchy dog training treats |
| Cat Treats Pack | 180.00 | Pet Food | Soft cat training treats |
| Dog Chew Bone | 250.75 | Pet Food | Long-lasting rawhide chew bone |
| Puppy Training Pads 30pk | 450.00 | Habitat & Bedding | Absorbent puppy pee pads |
| Nylon Dog Leash | 380.50 | Toys & Accessories | Durable 1.5m dog leash |
| Adjustable Dog Collar | 320.00 | Toys & Accessories | Padded adjustable collar |
| Cat Collar with Bell | 180.75 | Toys & Accessories | Breakaway safety cat collar |
| Pet Carrier Bag | 1450.00 | Toys & Accessories | Soft-sided travel carrier bag |
| Orthopedic Dog Bed | 1850.50 | Habitat & Bedding | Memory foam dog bed |
| Cozy Cat Bed | 650.00 | Habitat & Bedding | Plush round cat bed |
| Cat Scratching Post | 950.75 | Habitat & Bedding | Sisal-wrapped scratching post |
| Pet Water Fountain | 1250.00 | Habitat & Bedding | Automatic circulating water fountain |
| Stainless Steel Food Bowl | 220.50 | Habitat & Bedding | Non-slip stainless steel bowl |
| Cat Litter Box | 650.00 | Habitat & Bedding | Enclosed hooded litter box |
| Clumping Cat Litter 5kg | 480.75 | Pet Food | Odor-control clumping litter |
| Pet Grooming Brush | 280.00 | Grooming & Health | De-shedding grooming brush |
| Dog Shampoo 250ml | 350.50 | Grooming & Health | Oatmeal moisturizing dog shampoo |
| Flea and Tick Spray | 420.00 | Grooming & Health | Natural flea and tick repellent |
| Pet Nail Clipper | 180.75 | Grooming & Health | Safety-guard nail clipper |
| Dog Dental Chews 10pk | 320.00 | Grooming & Health | Plaque-control dental chews |
| Cat Scratching Pad | 350.50 | Toys & Accessories | Corrugated cardboard scratch pad |
| Squeaky Dog Toy | 220.00 | Toys & Accessories | Durable squeaky plush toy |
| Cat Toy Mouse 3pk | 150.75 | Toys & Accessories | Catnip-filled toy mice |
| Interactive Puzzle Toy | 650.00 | Toys & Accessories | Treat-dispensing puzzle toy |
| Bird Cage Medium | 2450.50 | Habitat & Bedding | Wire-frame medium bird cage |
| Bird Seed Mix 1kg | 250.00 | Pet Food | Mixed seed blend for birds |
| Fish Tank 20L | 1850.75 | Habitat & Bedding | Glass aquarium fish tank |
| Fish Food Flakes | 150.00 | Pet Food | Tropical fish flake food |
| Hamster Cage | 1450.50 | Habitat & Bedding | Multi-level hamster cage |
| Rabbit Hutch | 3450.00 | Habitat & Bedding | Outdoor wooden rabbit hutch |
| Hard-Shell Pet Carrier Crate | 2450.75 | Toys & Accessories | Airline-approved carrier crate |
| Dog Raincoat | 450.00 | Toys & Accessories | Waterproof hooded dog raincoat |
| Dog Sweater | 380.50 | Toys & Accessories | Knit winter dog sweater |
| Pet ID Tag | 120.00 | Toys & Accessories | Engraved pet identification tag |
| Pet Feeding Mat | 220.75 | Habitat & Bedding | Waterproof spill-proof feeding mat |
| Cat Tree Tower | 3450.00 | Habitat & Bedding | Multi-level cat tree with scratching posts |
| Dog Muzzle | 280.50 | Toys & Accessories | Adjustable basket muzzle |
| Pet Stroller | 4450.00 | Toys & Accessories | 3-wheel pet travel stroller |
| Dog Poop Bags 120pk | 180.75 | Habitat & Bedding | Biodegradable waste bags |
| Pet Odor Eliminator Spray | 250.00 | Grooming & Health | Enzyme-based odor eliminator |
| Pet First Aid Kit | 650.50 | Grooming & Health | Compact pet emergency first aid kit |
| Dog Harness | 450.00 | Toys & Accessories | No-pull padded dog harness |
| Cat Harness | 380.75 | Toys & Accessories | Escape-proof cat walking harness |
| Aquarium Filter | 850.00 | Habitat & Bedding | Submersible aquarium filter pump |
| Reptile Heat Lamp | 650.50 | Habitat & Bedding | UVB reptile heat lamp |
| Pet Multivitamin Supplement | 420.00 | Grooming & Health | Daily pet health supplement |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Paws & Claws';"
```
Expect 50, and confirm no other store's counts changed.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build Paws & Claws catalog with 50 unique items"
```

---

## Task 2: The Pet Corner (Pet) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 1.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "grain free dog food" "kitten food bag" "puppy food bag" "senior dog food" \
  "freeze dried dog treats" "dental sticks dog" "catnip toy" "chew rope toy dog" \
  "retractable dog leash" "reflective dog collar" "cat carrier backpack" "travel water bottle pet" \
  "heated pet bed" "cat cave bed" "elevated dog feeder" "slow feeder bowl dog" \
  "automatic pet feeder" "pet grooming glove" "cat nail caps" "ear cleaning solution pet" \
  "pet toothbrush" "pet toothpaste" "cat wand toy" "laser pointer cat toy" \
  "dog frisbee" "tennis ball dog" "plush dog toy" "cat condo" \
  "bird perch" "parrot toys" "small animal bedding" "guinea pig cage" \
  "turtle tank" "snake terrarium" "dog crate large" "cat window perch" \
  "dog cooling mat" "dog booties" "pet nail file" "flea comb" \
  "dog training clicker" "whistle for dog training" "pet camera" "pet gate" \
  "car seat cover pet" "dog seat belt" "pet ramp" "pet stairs" \
  "cat litter mat" "pet hair remover roller"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find The Pet Corner's `store_id` (`d0200000-3333-3333-3333-333333333333`)
and add new rows as a brand-new insert statement, ids
`d0200000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Grain-Free Dog Food 3kg | 1250.50 | Pet Food | Grain-free adult dog kibble |
| Kitten Food 1kg | 420.00 | Pet Food | Nutrient-rich kitten formula |
| Puppy Food 2kg | 680.75 | Pet Food | Growth-formula puppy kibble |
| Senior Dog Food 3kg | 950.00 | Pet Food | Joint-support senior dog food |
| Freeze-Dried Dog Treats | 380.50 | Pet Food | Single-ingredient freeze-dried treats |
| Dental Sticks 7pk | 280.00 | Pet Food | Plaque-reducing dental chew sticks |
| Catnip Toy Set | 220.75 | Toys & Accessories | Catnip-infused plush toy set |
| Chew Rope Toy | 250.00 | Toys & Accessories | Cotton rope tug toy |
| Retractable Dog Leash 5m | 550.50 | Toys & Accessories | Auto-retracting leash with brake |
| Reflective Dog Collar | 280.00 | Toys & Accessories | Night-safety reflective collar |
| Cat Carrier Backpack | 1650.75 | Toys & Accessories | Bubble-window carrier backpack |
| Travel Water Bottle for Pets | 350.00 | Toys & Accessories | Portable pet water dispenser |
| Heated Pet Bed | 2450.50 | Habitat & Bedding | Thermostat-controlled heated bed |
| Covered Cat Cave Bed | 850.00 | Habitat & Bedding | Enclosed cave-style cat bed |
| Elevated Dog Feeder | 950.75 | Habitat & Bedding | Raised double-bowl feeder stand |
| Slow Feeder Bowl | 380.00 | Habitat & Bedding | Anti-gulp slow feeding bowl |
| Automatic Pet Feeder | 3450.50 | Habitat & Bedding | Programmable timed pet feeder |
| Pet Grooming Glove | 250.00 | Grooming & Health | Silicone deshedding grooming glove |
| Cat Nail Caps Kit | 320.75 | Grooming & Health | Soft vinyl nail cap kit |
| Pet Ear Cleaning Solution | 220.00 | Grooming & Health | Gentle ear wax cleaning solution |
| Pet Toothbrush Set | 180.50 | Grooming & Health | Dual-head pet toothbrush set |
| Pet Toothpaste | 220.00 | Grooming & Health | Enzymatic poultry-flavor toothpaste |
| Cat Wand Teaser Toy | 250.75 | Toys & Accessories | Feather wand interactive toy |
| Laser Pointer Cat Toy | 280.00 | Toys & Accessories | Automatic laser pointer toy |
| Dog Frisbee | 250.50 | Toys & Accessories | Durable rubber flying disc |
| Tennis Ball Dog Toy 3pk | 180.00 | Toys & Accessories | Non-abrasive tennis balls |
| Plush Squeaky Dog Toy | 220.75 | Toys & Accessories | Soft plush animal-shaped toy |
| Multi-Level Cat Condo | 4450.00 | Habitat & Bedding | Carpeted multi-tier cat condo |
| Wooden Bird Perch | 250.50 | Habitat & Bedding | Natural wood bird perch stand |
| Parrot Chew Toys 5pk | 380.00 | Toys & Accessories | Assorted parrot chew toys |
| Small Animal Bedding 1kg | 220.75 | Habitat & Bedding | Soft paper small-pet bedding |
| Guinea Pig Cage | 2450.00 | Habitat & Bedding | Spacious wire-frame guinea pig cage |
| Turtle Tank | 1850.50 | Habitat & Bedding | Glass turtle habitat tank |
| Snake Terrarium | 3450.00 | Habitat & Bedding | Front-opening glass terrarium |
| Large Dog Crate | 3950.75 | Habitat & Bedding | Foldable wire dog crate, large |
| Cat Window Perch | 650.00 | Habitat & Bedding | Suction-cup window mounted perch |
| Dog Cooling Mat | 550.50 | Habitat & Bedding | Self-cooling gel pet mat |
| Dog Booties Set of 4 | 450.00 | Toys & Accessories | Non-slip paw protection booties |
| Pet Nail File | 120.75 | Grooming & Health | Electric pet nail grinder file |
| Flea Comb | 150.00 | Grooming & Health | Fine-tooth flea removal comb |
| Dog Training Clicker | 120.50 | Toys & Accessories | Positive-reinforcement training clicker |
| Dog Training Whistle | 150.00 | Toys & Accessories | Ultrasonic dog training whistle |
| Pet Monitoring Camera | 3450.75 | Toys & Accessories | WiFi pet activity camera |
| Pet Safety Gate | 1450.00 | Habitat & Bedding | Adjustable pressure-mount pet gate |
| Car Seat Cover for Pets | 950.50 | Toys & Accessories | Waterproof rear seat cover |
| Dog Car Seat Belt | 280.00 | Toys & Accessories | Adjustable car safety harness belt |
| Pet Ramp | 1650.00 | Toys & Accessories | Foldable car/bed access ramp |
| Pet Stairs | 1850.75 | Habitat & Bedding | 3-step foam pet stairs |
| Cat Litter Trapping Mat | 350.00 | Habitat & Bedding | Honeycomb litter-trapping mat |
| Pet Hair Remover Roller | 220.50 | Grooming & Health | Reusable pet hair lint roller |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'The Pet Corner';"
```
Expect 50, and confirm Paws & Claws still shows 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build The Pet Corner catalog with 50 unique items"
```

---

## Task 3: Furry Friends Mart (Pet) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 2.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "raw dog food frozen" "organic cat food" "duck jerky dog treats" "salmon oil for dogs" \
  "probiotic pet supplement" "joint supplement dog" "calming chews dog" "hairball remedy cat" \
  "dog winter coat" "cat costume" "bandana for dogs" "pet bowtie" \
  "double dog bowl stand" "travel bowl collapsible" "pet food storage container" "cat food dispenser" \
  "memory foam dog mattress" "cat hammock" "dog kennel outdoor" "puppy playpen" \
  "dog agility set" "cat scratching ball" "dog rope tug toy" "puzzle feeder cat" \
  "dog bandana bib" "reflective dog vest" "dog life jacket" "pet sunscreen" \
  "dog wipes" "cat ear wipes" "pet deodorizing spray" "pet stain remover" \
  "aquarium gravel" "aquarium plants artificial" "betta fish tank" "fish tank heater" \
  "bird bath" "bird nesting box" "hamster wheel" "hamster exercise ball" \
  "rabbit food pellets" "guinea pig food" "chinchilla dust bath" "ferret cage" \
  "dog harness vest" "cat leash" "pet id microchip scanner" "dog whistle silent" \
  "dog training treat pouch" "pet grooming table"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find Furry Friends Mart's `store_id` (`d0300000-3333-3333-3333-333333333333`)
and add new rows as a brand-new insert statement, ids
`d0300000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Raw Frozen Dog Food 2kg | 1450.50 | Pet Food | Raw-diet frozen dog food |
| Organic Cat Food 1kg | 650.00 | Pet Food | Certified organic cat kibble |
| Duck Jerky Dog Treats | 350.75 | Pet Food | Single-protein duck jerky treats |
| Salmon Oil for Dogs 250ml | 450.00 | Grooming & Health | Omega-3 skin and coat oil |
| Probiotic Pet Supplement | 380.50 | Grooming & Health | Digestive health probiotic powder |
| Joint Supplement for Dogs | 550.00 | Grooming & Health | Glucosamine joint support chews |
| Calming Chews for Dogs | 420.75 | Grooming & Health | Anxiety-relief calming chews |
| Hairball Remedy for Cats | 280.00 | Grooming & Health | Gel-based hairball control remedy |
| Dog Winter Coat | 650.50 | Toys & Accessories | Insulated waterproof winter coat |
| Cat Costume | 380.00 | Toys & Accessories | Fun dress-up cat costume |
| Dog Bandana Set 3pk | 220.75 | Toys & Accessories | Cotton dog bandana set |
| Pet Bowtie Collar Accessory | 150.00 | Toys & Accessories | Clip-on pet bowtie |
| Double Dog Bowl Stand | 650.50 | Habitat & Bedding | Elevated double-bowl feeding stand |
| Collapsible Travel Bowl | 220.00 | Habitat & Bedding | Silicone foldable travel bowl |
| Pet Food Storage Container | 850.75 | Habitat & Bedding | Airtight pet food storage bin |
| Automatic Cat Food Dispenser | 2450.00 | Habitat & Bedding | Portion-controlled food dispenser |
| Memory Foam Dog Mattress | 2850.50 | Habitat & Bedding | Orthopedic memory foam mattress |
| Cat Hammock | 550.00 | Habitat & Bedding | Under-chair hanging cat hammock |
| Outdoor Dog Kennel | 4450.75 | Habitat & Bedding | Weatherproof outdoor dog kennel |
| Puppy Playpen | 2450.00 | Habitat & Bedding | Foldable puppy exercise playpen |
| Dog Agility Training Set | 1850.50 | Toys & Accessories | Backyard agility obstacle set |
| Cat Scratching Ball Toy | 250.00 | Toys & Accessories | Rolling scratch pad ball toy |
| Dog Rope Tug Toy | 220.75 | Toys & Accessories | Heavy-duty braided tug rope |
| Interactive Puzzle Feeder for Cats | 450.00 | Toys & Accessories | Slow-feed puzzle feeder toy |
| Dog Bandana Bib | 180.50 | Toys & Accessories | Absorbent slobber bib bandana |
| Reflective Dog Safety Vest | 380.00 | Toys & Accessories | High-visibility reflective vest |
| Dog Life Jacket | 950.75 | Toys & Accessories | Buoyant swim safety life jacket |
| Pet-Safe Sunscreen | 320.00 | Grooming & Health | UV-protection pet-safe sunscreen |
| Dog Cleaning Wipes 80pk | 250.50 | Grooming & Health | Deodorizing dog cleaning wipes |
| Cat Ear Cleaning Wipes | 220.00 | Grooming & Health | Gentle ear cleaning wipes |
| Pet Deodorizing Spray | 280.75 | Grooming & Health | Long-lasting deodorizing spray |
| Pet Stain and Odor Remover | 350.00 | Grooming & Health | Enzymatic stain and odor remover |
| Aquarium Gravel 2kg | 250.50 | Habitat & Bedding | Colored decorative aquarium gravel |
| Artificial Aquarium Plants Set | 380.00 | Habitat & Bedding | Realistic silk aquarium plants |
| Betta Fish Tank | 950.75 | Habitat & Bedding | Compact betta fish tank |
| Aquarium Water Heater | 650.00 | Habitat & Bedding | Adjustable submersible heater |
| Bird Bath | 320.50 | Habitat & Bedding | Hanging outdoor bird bath |
| Bird Nesting Box | 450.00 | Habitat & Bedding | Wooden bird nesting box |
| Hamster Exercise Wheel | 380.75 | Toys & Accessories | Silent-spin hamster wheel |
| Hamster Exercise Ball | 250.00 | Toys & Accessories | Clear plastic exercise ball |
| Rabbit Food Pellets 2kg | 350.50 | Pet Food | Timothy hay-based rabbit pellets |
| Guinea Pig Food 1kg | 280.00 | Pet Food | Vitamin C-fortified guinea pig food |
| Chinchilla Dust Bath | 420.75 | Grooming & Health | Volcanic pumice dust bath powder |
| Ferret Cage | 3450.00 | Habitat & Bedding | Multi-level ferret cage |
| Dog Harness Vest | 480.50 | Toys & Accessories | Padded step-in harness vest |
| Cat Walking Leash | 250.00 | Toys & Accessories | Lightweight cat walking leash |
| Pet Microchip Scanner | 2450.75 | Grooming & Health | Universal pet microchip reader |
| Silent Dog Training Whistle | 150.00 | Toys & Accessories | Ultrasonic silent training whistle |
| Dog Training Treat Pouch | 350.00 | Toys & Accessories | Belt-clip training treat pouch |
| Pet Grooming Table | 3450.50 | Grooming & Health | Adjustable-height grooming table |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Furry Friends Mart';"
```
Expect 50, and confirm the prior 2 pet stores still show 50 each.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build Furry Friends Mart catalog with 50 unique items"
```

---

## Task 4: Whiskers & Wags (Pet) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 3.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "weight management dog food" "hypoallergenic dog food" "kitten milk replacer" "puppy milk formula" \
  "bully stick dog chew" "yak cheese dog chew" "cat grass kit" "catnip spray bottle" \
  "led dog collar" "gps dog tracker" "cat breakaway collar" "martingale dog collar" \
  "wheeled pet carrier" "soft pet crate" "cooling vest dog" "heating pad pet" \
  "raised dog bowl set" "no spill dog bowl" "cat automatic litter box" "litter scoop" \
  "pet hair vacuum" "dog nail grinder" "pet ear powder" "waterless pet shampoo" \
  "cat teeth cleaning treats" "dog breath freshener" "puppy chew toy set" "kong style toy" \
  "cat feather toy" "dog ball launcher" "flirt pole cat toy" "snuffle mat dog" \
  "bird swing toy" "parakeet cage" "cockatiel toys" "finch cage" \
  "hedgehog cage" "sugar glider cage" "tortoise enclosure" "lizard terrarium kit" \
  "dog training leash long line" "no pull dog harness front clip" "cat calming spray" "dog anxiety wrap" \
  "pet travel carrier airline" "dog booster car seat" "pet food scoop" "pet medicine pill dispenser" \
  "pet thermometer" "dog cooling bandana"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find Whiskers & Wags' `store_id` (`d0400000-3333-3333-3333-333333333333`)
and add new rows as a brand-new insert statement, ids
`d0400000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Weight Management Dog Food 3kg | 950.50 | Pet Food | Low-calorie weight management kibble |
| Hypoallergenic Dog Food 3kg | 1250.00 | Pet Food | Limited-ingredient hypoallergenic food |
| Kitten Milk Replacer | 380.75 | Pet Food | Nutrient-rich kitten milk formula |
| Puppy Milk Formula | 420.00 | Pet Food | Colostrum-enriched puppy formula |
| Bully Stick Dog Chew 5pk | 450.50 | Pet Food | Single-ingredient bully stick chews |
| Yak Cheese Dog Chew | 380.00 | Pet Food | Long-lasting himalayan yak chew |
| Cat Grass Growing Kit | 220.75 | Toys & Accessories | Wheatgrass growing kit for cats |
| Catnip Spray Bottle | 180.00 | Toys & Accessories | Concentrated catnip spray |
| LED Light-Up Dog Collar | 380.50 | Toys & Accessories | USB-rechargeable LED safety collar |
| GPS Dog Tracker | 3450.00 | Toys & Accessories | Real-time GPS pet tracking device |
| Breakaway Cat Safety Collar | 220.75 | Toys & Accessories | Quick-release safety collar |
| Martingale Dog Collar | 320.00 | Toys & Accessories | No-slip martingale training collar |
| Wheeled Pet Carrier | 2850.50 | Toys & Accessories | Rolling airline-style pet carrier |
| Soft-Sided Pet Crate | 1650.00 | Habitat & Bedding | Collapsible soft travel crate |
| Cooling Vest for Dogs | 650.75 | Toys & Accessories | Evaporative cooling dog vest |
| Heating Pad for Pets | 850.00 | Habitat & Bedding | Adjustable-temperature pet heating pad |
| Raised Dog Bowl Set | 550.50 | Habitat & Bedding | Elevated dual dog bowl set |
| No-Spill Dog Bowl | 280.00 | Habitat & Bedding | Non-slip splash-guard dog bowl |
| Automatic Self-Cleaning Litter Box | 8450.75 | Habitat & Bedding | Self-scooping automatic litter box |
| Cat Litter Scoop | 120.00 | Habitat & Bedding | Sifting metal litter scoop |
| Handheld Pet Hair Vacuum | 2450.50 | Grooming & Health | Cordless pet hair vacuum |
| Dog Nail Grinder | 650.00 | Grooming & Health | Low-noise rotary nail grinder |
| Pet Ear Cleaning Powder | 180.75 | Grooming & Health | Drying ear cleaning powder |
| Waterless Pet Shampoo | 350.00 | Grooming & Health | No-rinse waterless dry shampoo |
| Cat Teeth Cleaning Treats | 250.50 | Grooming & Health | Enzymatic dental treats |
| Dog Breath Freshener Spray | 220.00 | Grooming & Health | Oral care breath freshener |
| Puppy Chew Toy Set 5pk | 380.75 | Toys & Accessories | Assorted teething chew toy set |
| Rubber Treat-Dispensing Toy | 450.00 | Toys & Accessories | Durable rubber treat toy |
| Feather Wand Cat Toy | 220.50 | Toys & Accessories | Bell-attached feather wand |
| Automatic Dog Ball Launcher | 4450.00 | Toys & Accessories | Motorized fetch ball launcher |
| Flirt Pole Cat Toy | 350.75 | Toys & Accessories | Interactive flirt pole exerciser |
| Snuffle Mat for Dogs | 650.00 | Toys & Accessories | Enrichment sniffing activity mat |
| Bird Swing Toy | 220.50 | Toys & Accessories | Wooden perch swing toy |
| Parakeet Cage | 1850.00 | Habitat & Bedding | Compact parakeet cage with accessories |
| Cockatiel Chew Toys 4pk | 350.75 | Toys & Accessories | Safe cockatiel chew toy set |
| Finch Cage | 2450.00 | Habitat & Bedding | Flight-style finch cage |
| Hedgehog Cage | 3450.50 | Habitat & Bedding | Ventilated hedgehog habitat cage |
| Sugar Glider Cage | 4450.00 | Habitat & Bedding | Tall multi-level glider cage |
| Tortoise Enclosure | 3850.75 | Habitat & Bedding | Open-top tortoise habitat |
| Lizard Terrarium Starter Kit | 4450.50 | Habitat & Bedding | Complete reptile terrarium kit |
| Long Training Leash 10m | 450.00 | Training & Travel | Recall training long line leash |
| No-Pull Front-Clip Harness | 550.75 | Training & Travel | Anti-pull front-clip dog harness |
| Cat Calming Pheromone Spray | 380.00 | Grooming & Health | Stress-relief pheromone spray |
| Dog Anxiety Wrap | 650.50 | Grooming & Health | Pressure-therapy anxiety wrap |
| Airline-Approved Pet Travel Carrier | 3450.00 | Training & Travel | TSA-compliant travel carrier |
| Dog Booster Car Seat | 2450.75 | Training & Travel | Elevated booster car seat |
| Pet Food Scoop | 150.00 | Habitat & Bedding | Measured pet food scoop |
| Pet Pill Dispenser | 220.50 | Grooming & Health | Easy-grip pill administration dispenser |
| Digital Pet Thermometer | 450.00 | Grooming & Health | Fast-read digital pet thermometer |
| Cooling Bandana for Dogs | 250.75 | Toys & Accessories | Evaporative cooling bandana |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Whiskers & Wags';"
```
Expect 50, and confirm all 3 prior pet stores still show 50 each.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build Whiskers & Wags catalog with 50 unique items"
```

---

## Task 5: Petal Bloom (Flowers) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 4.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "red roses bouquet" "white lilies bouquet" "sunflower bunch" "tulip bouquet" \
  "orchid plant pot" "carnation bouquet" "mixed flower bouquet" "gerbera daisy bouquet" \
  "pink roses bunch" "yellow roses bunch" "birthday flower bouquet" "anniversary flower arrangement" \
  "wedding flower bouquet" "funeral flower wreath" "get well soon flowers" "congratulations flower basket" \
  "money plant pot" "succulent plant set" "bonsai plant" "areca palm plant" \
  "peace lily plant" "snake plant pot" "flowering plant pot" "hanging plant basket" \
  "chocolate and flower gift box" "teddy bear and flowers gift" "flower gift hamper" "fruit and flower basket" \
  "glass flower vase" "ceramic flower vase" "flower pot decorative" "wicker flower basket" \
  "flower wrapping paper" "ribbon for bouquet" "greeting card flowers" "flower food preservative" \
  "artificial flower bouquet" "dried flower bouquet" "lavender bunch" "eucalyptus bunch" \
  "flower crown" "corsage flower" "boutonniere flower" "table centerpiece flowers" \
  "garden flower seeds packet" "plant fertilizer" "gardening gloves" "watering can small" \
  "plant pot saucer" "flower scissors"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find Petal Bloom's `store_id` (`d0500000-3333-3333-3333-333333333333`)
and add new rows as a brand-new insert statement, ids
`d0500000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Red Roses Bouquet 12pc | 850.50 | Fresh Flowers | Dozen fresh red roses |
| White Lilies Bouquet | 950.00 | Fresh Flowers | Fragrant white lily bouquet |
| Sunflower Bunch 6pc | 650.75 | Fresh Flowers | Bright fresh sunflower bunch |
| Tulip Bouquet 10pc | 1250.00 | Fresh Flowers | Mixed color tulip bouquet |
| Orchid Plant Pot | 1450.50 | Plants | Potted phalaenopsis orchid |
| Carnation Bouquet | 550.00 | Fresh Flowers | Assorted color carnation bouquet |
| Mixed Seasonal Flower Bouquet | 950.75 | Bouquets & Arrangements | Seasonal mixed flower arrangement |
| Gerbera Daisy Bouquet | 650.00 | Fresh Flowers | Vibrant gerbera daisy bunch |
| Pink Roses Bunch 6pc | 550.50 | Fresh Flowers | Soft pink rose bunch |
| Yellow Roses Bunch 6pc | 550.00 | Fresh Flowers | Cheerful yellow rose bunch |
| Birthday Flower Bouquet | 850.75 | Bouquets & Arrangements | Celebratory birthday bouquet |
| Anniversary Flower Arrangement | 1650.00 | Bouquets & Arrangements | Romantic anniversary arrangement |
| Wedding Flower Bouquet | 2450.50 | Bouquets & Arrangements | Bridal wedding flower bouquet |
| Funeral Flower Wreath | 1850.00 | Bouquets & Arrangements | Condolence flower wreath |
| Get Well Soon Flower Basket | 750.75 | Gift Hampers | Cheerful get-well flower basket |
| Congratulations Flower Basket | 950.00 | Gift Hampers | Celebratory congratulations basket |
| Money Plant Pot | 380.50 | Plants | Air-purifying money plant |
| Succulent Plant Set 4pc | 550.00 | Plants | Assorted mini succulent set |
| Bonsai Plant | 1450.75 | Plants | Miniature ornamental bonsai tree |
| Areca Palm Plant | 850.00 | Plants | Indoor air-purifying areca palm |
| Peace Lily Plant | 650.50 | Plants | Low-maintenance peace lily plant |
| Snake Plant Pot | 550.00 | Plants | Hardy indoor snake plant |
| Flowering Plant Pot | 480.75 | Plants | Seasonal flowering potted plant |
| Hanging Plant Basket | 650.00 | Plants | Trailing hanging plant basket |
| Chocolate and Flower Gift Box | 1250.50 | Gift Hampers | Combo chocolate and flower gift |
| Teddy Bear and Flowers Gift | 950.00 | Gift Hampers | Plush teddy with flower bouquet |
| Deluxe Flower Gift Hamper | 2450.75 | Gift Hampers | Premium flower and treats hamper |
| Fruit and Flower Basket | 1650.00 | Gift Hampers | Fresh fruit and flower combo basket |
| Glass Flower Vase | 450.50 | Vases & Decor | Clear cylindrical glass vase |
| Ceramic Flower Vase | 550.00 | Vases & Decor | Hand-painted ceramic vase |
| Decorative Flower Pot | 380.75 | Vases & Decor | Glazed decorative planter pot |
| Wicker Flower Basket | 420.00 | Vases & Decor | Woven wicker gift basket |
| Flower Wrapping Paper Roll | 150.50 | Vases & Decor | Decorative floral wrapping paper |
| Satin Ribbon for Bouquets | 80.00 | Vases & Decor | Assorted color satin ribbon |
| Floral Greeting Card | 60.75 | Vases & Decor | Printed floral greeting card |
| Flower Food Preservative Sachets | 50.00 | Vases & Decor | Cut-flower food preservative |
| Artificial Flower Bouquet | 650.50 | Fresh Flowers | Realistic long-lasting silk bouquet |
| Dried Flower Bouquet | 550.00 | Fresh Flowers | Rustic dried flower arrangement |
| Lavender Bunch | 380.75 | Fresh Flowers | Fragrant fresh lavender bunch |
| Eucalyptus Bunch | 350.00 | Fresh Flowers | Fresh greenery eucalyptus bunch |
| Flower Crown | 450.50 | Bouquets & Arrangements | Floral hair crown accessory |
| Wrist Corsage | 380.00 | Bouquets & Arrangements | Elastic wrist corsage flower |
| Boutonniere Flower Pin | 250.75 | Bouquets & Arrangements | Lapel boutonniere flower pin |
| Table Centerpiece Arrangement | 1250.00 | Bouquets & Arrangements | Low floral table centerpiece |
| Garden Flower Seeds Packet | 80.50 | Plants | Assorted flower seed packet |
| Plant Fertilizer 500g | 220.00 | Plants | All-purpose plant fertilizer |
| Gardening Gloves Pair | 180.75 | Plants | Durable garden work gloves |
| Small Watering Can | 280.00 | Vases & Decor | Compact indoor watering can |
| Plant Pot Saucer Set | 150.50 | Vases & Decor | Drip-catching pot saucer set |
| Floral Scissors | 220.00 | Vases & Decor | Precision floral cutting scissors |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Petal Bloom';"
```
Expect 50, and confirm all 4 pet stores still show 50 each.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build Petal Bloom catalog with 50 unique items"
```

---

## Task 6: Fresh Petals Co. (Flowers) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 5.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "purple orchid bouquet" "lavender roses bouquet" "mixed tulips pastel" "daffodil bunch" \
  "iris flower bouquet" "hydrangea bouquet" "peony bouquet" "chrysanthemum bouquet" \
  "baby's breath bouquet" "anthurium flower pot" "jasmine flower garland" "marigold garland" \
  "rose gift box" "flower box arrangement" "valentine flower bouquet" "mothers day flower bouquet" \
  "new baby flower bouquet" "housewarming plant gift" "retirement flower bouquet" "farewell flower bouquet" \
  "spider plant pot" "aloe vera plant pot" "jade plant pot" "fiddle leaf fig plant" \
  "rubber plant pot" "cactus plant set" "bamboo plant lucky" "fern plant hanging" \
  "gift basket with candles and flowers" "wine and flower gift set" "cake and flower combo" "personalized flower gift" \
  "terracotta pot" "metal flower vase" "bud vase set" "flower box gift packaging" \
  "cellophane wrap flowers" "floral tape" "floral foam block" "flower thorn stripper" \
  "silk flower arrangement" "preserved rose in box" "flower garland for decoration" "rose petals bag" \
  "flower bouquet stand" "plant hanger macrame" "plant mister spray bottle" "pruning shears" \
  "soil potting mix bag" "plant markers labels"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find Fresh Petals Co.'s `store_id` (`d0600000-3333-3333-3333-333333333333`)
and add new rows as a brand-new insert statement, ids
`d0600000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Purple Orchid Bouquet | 1250.50 | Fresh Flowers | Elegant purple orchid bouquet |
| Lavender Roses Bouquet | 950.00 | Fresh Flowers | Soft lavender rose bouquet |
| Pastel Mixed Tulips | 850.75 | Fresh Flowers | Pastel-toned mixed tulip bunch |
| Daffodil Bunch | 550.00 | Fresh Flowers | Bright yellow daffodil bunch |
| Iris Flower Bouquet | 750.50 | Fresh Flowers | Deep blue iris bouquet |
| Hydrangea Bouquet | 950.00 | Fresh Flowers | Full-bloom hydrangea bouquet |
| Peony Bouquet | 1450.75 | Fresh Flowers | Lush pink peony bouquet |
| Chrysanthemum Bouquet | 650.00 | Fresh Flowers | Assorted chrysanthemum bunch |
| Baby's Breath Bouquet | 380.50 | Fresh Flowers | Delicate baby's breath bunch |
| Anthurium Plant Pot | 950.00 | Plants | Glossy red anthurium plant |
| Jasmine Flower Garland | 220.75 | Fresh Flowers | Fragrant jasmine string garland |
| Marigold Garland | 180.00 | Fresh Flowers | Traditional marigold flower garland |
| Rose Gift Box | 1650.50 | Gift Hampers | Boxed premium rose arrangement |
| Flower Box Arrangement | 1450.00 | Bouquets & Arrangements | Hat-box style flower arrangement |
| Valentine Flower Bouquet | 1850.75 | Bouquets & Arrangements | Romantic Valentine's rose bouquet |
| Mother's Day Flower Bouquet | 1250.00 | Bouquets & Arrangements | Special Mother's Day bouquet |
| New Baby Flower Bouquet | 950.50 | Bouquets & Arrangements | Pastel new-baby congratulations bouquet |
| Housewarming Plant Gift Set | 850.00 | Gift Hampers | Potted plant housewarming gift |
| Retirement Flower Bouquet | 950.75 | Bouquets & Arrangements | Celebratory retirement bouquet |
| Farewell Flower Bouquet | 850.00 | Bouquets & Arrangements | Heartfelt farewell bouquet |
| Spider Plant Pot | 380.50 | Plants | Air-purifying spider plant |
| Aloe Vera Plant Pot | 350.00 | Plants | Medicinal aloe vera plant |
| Jade Plant Pot | 420.75 | Plants | Lucky jade succulent plant |
| Fiddle Leaf Fig Plant | 1850.00 | Plants | Statement fiddle leaf fig tree |
| Rubber Plant Pot | 950.50 | Plants | Glossy-leaf rubber plant |
| Cactus Plant Set 3pc | 450.00 | Plants | Assorted mini cactus set |
| Lucky Bamboo Plant | 380.75 | Plants | Braided lucky bamboo stalks |
| Hanging Fern Plant | 550.00 | Plants | Boston fern hanging plant |
| Candles and Flowers Gift Basket | 1650.50 | Gift Hampers | Scented candles and flower combo |
| Wine and Flower Gift Set | 2450.00 | Gift Hampers | Wine bottle with flower bouquet |
| Cake and Flower Combo | 1450.75 | Gift Hampers | Celebration cake with flowers |
| Personalized Flower Gift Box | 1850.00 | Gift Hampers | Customizable message flower box |
| Terracotta Plant Pot | 280.50 | Vases & Decor | Classic terracotta plant pot |
| Metal Flower Vase | 650.00 | Vases & Decor | Modern brushed-metal vase |
| Bud Vase Set 3pc | 380.75 | Vases & Decor | Mini glass bud vase set |
| Flower Box Gift Packaging | 220.00 | Vases & Decor | Rigid flower gift box packaging |
| Cellophane Flower Wrap Roll | 120.50 | Vases & Decor | Clear cellophane wrapping roll |
| Floral Tape Roll | 60.00 | Vases & Decor | Self-sealing floral tape |
| Floral Foam Block Set | 150.75 | Vases & Decor | Water-retaining floral foam blocks |
| Flower Thorn Stripper Tool | 120.00 | Vases & Decor | Rose thorn and leaf stripper |
| Silk Flower Arrangement | 750.50 | Fresh Flowers | Premium artificial silk arrangement |
| Preserved Rose in Box | 1450.00 | Gift Hampers | Long-lasting preserved rose gift box |
| Decorative Flower Garland | 220.75 | Vases & Decor | Artificial decorative garland |
| Rose Petals Bag | 150.00 | Vases & Decor | Fresh rose petals for decoration |
| Flower Bouquet Display Stand | 650.50 | Vases & Decor | Wooden bouquet display stand |
| Macrame Plant Hanger | 350.00 | Vases & Decor | Handwoven macrame plant hanger |
| Plant Mister Spray Bottle | 180.75 | Plants | Fine-mist plant watering bottle |
| Pruning Shears | 280.00 | Plants | Sharp bypass pruning shears |
| Potting Soil Mix 5kg | 350.50 | Plants | Nutrient-rich potting soil mix |
| Plant Labels Markers 20pc | 100.00 | Plants | Waterproof plant identification markers |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Fresh Petals Co.';"
```
Expect 50, and confirm Petal Bloom still shows 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build Fresh Petals Co. catalog with 50 unique items"
```

---

## Task 7: The Flower Basket (Flowers) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 6.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "red and white rose bouquet" "mixed exotic flower bouquet" "protea flower bouquet" "lily and rose combo bouquet" \
  "single stem rose gift" "flower bouquet box round" "graduation flower bouquet" "sympathy flower arrangement" \
  "diwali flower decoration" "flower rangoli fresh" "temple flower garland" "car flower decoration garland" \
  "office desk plant" "bonsai ficus plant" "string of pearls plant" "pothos plant pot" \
  "calathea plant pot" "philodendron plant pot" "zz plant pot" "monstera plant pot" \
  "flower and chocolate hamper large" "spa and flower gift set" "birthday cake flower gift combo" "anniversary gift hamper flowers" \
  "brass flower vase" "tall floor vase" "mini succulent pots set" "hanging glass terrarium" \
  "gift wrapping bow" "flower box liner" "sisal moss decorative" "raffia ribbon" \
  "preserved flower dome" "flower resin keepsake" "dried lavender sachet" "potpourri bag" \
  "flower bouquet care kit" "plant food spikes" "self watering planter" "grow light for plants" \
  "hand trowel garden tool" "garden kneeler pad" "seed starter tray" "plant stand wooden" \
  "wall mounted planter" "vertical garden kit" "orchid fertilizer spray" "rose bush plant" \
  "hibiscus plant pot" "marigold plant pot"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find The Flower Basket's `store_id` (`d0700000-3333-3333-3333-333333333333`)
and add new rows as a brand-new insert statement, ids
`d0700000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Red and White Rose Bouquet | 950.50 | Fresh Flowers | Classic red-white rose combo |
| Mixed Exotic Flower Bouquet | 1650.00 | Fresh Flowers | Exotic imported flower bouquet |
| Protea Flower Bouquet | 1450.75 | Fresh Flowers | Striking protea flower bunch |
| Lily and Rose Combo Bouquet | 1250.00 | Fresh Flowers | Elegant lily-rose combination |
| Single Stem Rose Gift | 250.50 | Fresh Flowers | One long-stem rose gift |
| Round Flower Bouquet Box | 1450.00 | Bouquets & Arrangements | Hat-box round flower arrangement |
| Graduation Flower Bouquet | 850.75 | Bouquets & Arrangements | Congratulatory graduation bouquet |
| Sympathy Flower Arrangement | 1650.00 | Bouquets & Arrangements | Somber sympathy flower arrangement |
| Diwali Flower Decoration Set | 650.50 | Fresh Flowers | Festive Diwali flower decor set |
| Fresh Flower Rangoli Kit | 450.00 | Fresh Flowers | Fresh petals for rangoli design |
| Temple Flower Garland | 150.75 | Fresh Flowers | Traditional temple offering garland |
| Car Flower Decoration Garland | 380.00 | Fresh Flowers | Wedding car decoration garland |
| Office Desk Plant | 350.50 | Plants | Low-light compact desk plant |
| Bonsai Ficus Plant | 1650.00 | Plants | Ornamental ficus bonsai |
| String of Pearls Plant | 450.75 | Plants | Trailing succulent string of pearls |
| Pothos Plant Pot | 320.00 | Plants | Easy-care trailing pothos plant |
| Calathea Plant Pot | 650.50 | Plants | Patterned-leaf calathea plant |
| Philodendron Plant Pot | 550.00 | Plants | Heart-leaf philodendron plant |
| ZZ Plant Pot | 650.75 | Plants | Drought-tolerant ZZ plant |
| Monstera Plant Pot | 950.00 | Plants | Split-leaf monstera plant |
| Large Flower and Chocolate Hamper | 2450.50 | Gift Hampers | Deluxe flower and chocolate hamper |
| Spa and Flower Gift Set | 1850.00 | Gift Hampers | Relaxation spa kit with flowers |
| Birthday Cake and Flower Combo | 1650.75 | Gift Hampers | Birthday cake paired with flowers |
| Anniversary Gift Hamper with Flowers | 2450.00 | Gift Hampers | Premium anniversary combo hamper |
| Brass Flower Vase | 850.50 | Vases & Decor | Antique-finish brass vase |
| Tall Floor Vase | 1450.00 | Vases & Decor | Decorative tall floor-standing vase |
| Mini Succulent Pots Set 6pc | 550.75 | Plants | Assorted mini succulent pot set |
| Hanging Glass Terrarium | 650.00 | Vases & Decor | Geometric hanging glass terrarium |
| Gift Wrapping Bow Set | 100.50 | Vases & Decor | Assorted decorative gift bows |
| Flower Box Liner Sheets | 80.00 | Vases & Decor | Waterproof flower box liners |
| Decorative Sisal Moss | 120.75 | Vases & Decor | Natural sisal moss filler |
| Raffia Ribbon Roll | 90.00 | Vases & Decor | Natural raffia gift ribbon |
| Preserved Flower Glass Dome | 1450.50 | Gift Hampers | Everlasting preserved flower dome |
| Flower Resin Keepsake | 650.00 | Vases & Decor | Handcrafted resin flower keepsake |
| Dried Lavender Sachet Set | 220.75 | Vases & Decor | Fragrant dried lavender sachets |
| Potpourri Bag | 180.00 | Vases & Decor | Scented dried flower potpourri |
| Flower Bouquet Care Kit | 250.50 | Vases & Decor | Flower food and trimming care kit |
| Plant Food Fertilizer Spikes | 220.00 | Plants | Slow-release fertilizer spikes |
| Self-Watering Planter | 950.75 | Vases & Decor | Reservoir-based self-watering pot |
| Grow Light for Indoor Plants | 1450.00 | Plants | LED full-spectrum plant grow light |
| Hand Trowel Garden Tool | 180.50 | Plants | Ergonomic hand trowel |
| Garden Kneeler Pad | 450.00 | Plants | Cushioned garden kneeling pad |
| Seed Starter Tray | 250.75 | Plants | 12-cell seed starting tray |
| Wooden Plant Stand | 850.00 | Vases & Decor | Tiered wooden plant display stand |
| Wall-Mounted Planter | 550.50 | Vases & Decor | Space-saving wall planter |
| Vertical Garden Starter Kit | 1650.00 | Plants | Modular vertical garden system |
| Orchid Fertilizer Spray | 280.75 | Plants | Specialized orchid feeding spray |
| Rose Bush Plant | 650.00 | Plants | Potted flowering rose bush |
| Hibiscus Plant Pot | 550.50 | Plants | Tropical flowering hibiscus plant |
| Marigold Plant Pot | 280.00 | Plants | Potted flowering marigold plant |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'The Flower Basket';"
```
Expect 50, and confirm the prior 2 flower stores still show 50 each.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build The Flower Basket catalog with 50 unique items"
```

---

## Task 8: Bloom & Blossom (Flowers) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 7.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "coral roses bouquet" "champagne roses bouquet" "blue orchid bouquet" "purple hydrangea bouquet" \
  "gladiolus bouquet" "aster flower bouquet" "ranunculus bouquet" "freesia bouquet" \
  "flower bouquet in basket" "flower crate arrangement" "engagement flower bouquet" "baby shower flower bouquet" \
  "thank you flower bouquet" "just because flowers" "condolence flower basket" "flower wreath door" \
  "air plant tillandsia" "dracaena plant pot" "croton plant pot" "boston fern plant" \
  "english ivy plant pot" "aglaonema plant pot" "flower and mug gift set" "flower and perfume gift set" \
  "flower and greeting card combo" "premium orchid gift box" "copper flower vase" "crystal flower vase" \
  "concrete planter pot" "hanging basket coco liner" "flower box with led lights" "gift tag tags for flowers" \
  "tissue paper for flowers" "kraft paper wrap flowers" "flower preservation spray" "bouquet holder handle" \
  "plant repotting kit" "bug spray for plants" "neem oil spray plant" "moisture meter plant" \
  "garden hand fork" "garden apron" "compost bin small" "worm castings fertilizer" \
  "orchid bark mix" "cactus soil mix" "flower press kit" "pressed flower frame" \
  "eco friendly flower wrap" "flower delivery box insulated"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find Bloom & Blossom's `store_id` (`d0800000-3333-3333-3333-333333333333`)
and add new rows as a brand-new insert statement, ids
`d0800000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Coral Roses Bouquet | 950.50 | Fresh Flowers | Warm-toned coral rose bouquet |
| Champagne Roses Bouquet | 1050.00 | Fresh Flowers | Elegant champagne-hued roses |
| Blue Orchid Bouquet | 1650.75 | Fresh Flowers | Rare-look blue orchid bouquet |
| Purple Hydrangea Bouquet | 1250.00 | Fresh Flowers | Full purple hydrangea bunch |
| Gladiolus Bouquet | 650.50 | Fresh Flowers | Tall statement gladiolus bunch |
| Aster Flower Bouquet | 550.00 | Fresh Flowers | Delicate aster flower bunch |
| Ranunculus Bouquet | 950.75 | Fresh Flowers | Layered-petal ranunculus bunch |
| Freesia Bouquet | 650.00 | Fresh Flowers | Fragrant freesia flower bunch |
| Flower Bouquet in Wicker Basket | 1450.50 | Bouquets & Arrangements | Basket-style flower arrangement |
| Flower Crate Arrangement | 1250.00 | Bouquets & Arrangements | Rustic wooden crate arrangement |
| Engagement Flower Bouquet | 1850.75 | Bouquets & Arrangements | Celebratory engagement bouquet |
| Baby Shower Flower Bouquet | 950.00 | Bouquets & Arrangements | Soft-toned baby shower bouquet |
| Thank You Flower Bouquet | 650.50 | Bouquets & Arrangements | Appreciation thank-you bouquet |
| Just Because Flower Bouquet | 550.00 | Bouquets & Arrangements | Everyday surprise flower bouquet |
| Condolence Flower Basket | 1450.75 | Bouquets & Arrangements | Respectful condolence basket |
| Flower Wreath for Door | 850.00 | Vases & Decor | Decorative front-door wreath |
| Air Plant Tillandsia Set | 450.50 | Plants | Soil-free air plant set |
| Dracaena Plant Pot | 650.00 | Plants | Tall striped-leaf dracaena plant |
| Croton Plant Pot | 550.75 | Plants | Colorful variegated croton plant |
| Boston Fern Plant | 480.00 | Plants | Lush hanging Boston fern |
| English Ivy Plant Pot | 380.50 | Plants | Trailing English ivy plant |
| Aglaonema Plant Pot | 650.00 | Plants | Chinese evergreen aglaonema plant |
| Flower and Mug Gift Set | 850.75 | Gift Hampers | Ceramic mug with flower bouquet |
| Flower and Perfume Gift Set | 1850.00 | Gift Hampers | Perfume bottle with flowers |
| Flower and Greeting Card Combo | 750.50 | Gift Hampers | Bouquet with personalized card |
| Premium Orchid Gift Box | 2450.00 | Gift Hampers | Luxury boxed orchid gift |
| Copper Flower Vase | 750.75 | Vases & Decor | Hammered copper-finish vase |
| Crystal Flower Vase | 1450.00 | Vases & Decor | Faceted crystal-cut vase |
| Concrete Planter Pot | 450.50 | Vases & Decor | Modern minimalist concrete planter |
| Hanging Basket with Coco Liner | 380.00 | Vases & Decor | Coco-lined hanging plant basket |
| Flower Box with LED Lights | 1650.75 | Gift Hampers | Illuminated flower gift box |
| Gift Tags for Flowers 20pc | 80.00 | Vases & Decor | Assorted floral gift tags |
| Tissue Paper for Flowers | 100.50 | Vases & Decor | Colored flower wrapping tissue |
| Kraft Paper Flower Wrap | 90.00 | Vases & Decor | Rustic kraft wrapping paper |
| Flower Preservation Spray | 280.75 | Vases & Decor | Longevity flower preservation spray |
| Bouquet Holder Handle | 150.00 | Vases & Decor | Ergonomic bouquet carrying handle |
| Plant Repotting Kit | 450.50 | Plants | Complete plant repotting tool kit |
| Plant Bug Spray | 220.00 | Plants | Organic insect control spray |
| Neem Oil Spray for Plants | 250.75 | Plants | Natural neem oil pest spray |
| Plant Soil Moisture Meter | 280.00 | Plants | 3-in-1 soil moisture meter |
| Garden Hand Fork | 150.50 | Plants | Compact garden hand fork |
| Garden Work Apron | 380.00 | Plants | Multi-pocket gardening apron |
| Small Compost Bin | 950.75 | Plants | Countertop kitchen compost bin |
| Worm Castings Fertilizer | 280.00 | Plants | Organic worm castings fertilizer |
| Orchid Bark Potting Mix | 250.50 | Plants | Specialized orchid bark mix |
| Cactus and Succulent Soil Mix | 220.00 | Plants | Well-draining cactus soil mix |
| Flower Pressing Kit | 450.75 | Vases & Decor | DIY flower pressing craft kit |
| Pressed Flower Photo Frame | 650.00 | Vases & Decor | Frame for pressed flower art |
| Eco-Friendly Flower Wrap | 120.50 | Vases & Decor | Biodegradable flower wrapping |
| Insulated Flower Delivery Box | 350.00 | Vases & Decor | Temperature-safe flower transport box |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Bloom & Blossom';"
```
Expect 50, and confirm all 3 prior flower stores still show 50 each.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build Bloom & Blossom catalog with 50 unique items"
```

---

## Task 9: Little Steps (Baby) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 8.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "baby feeding bottle" "baby formula milk powder tin" "baby food puree jar" "baby cereal box" \
  "sippy cup baby" "baby bottle warmer" "baby bottle sterilizer" "burp cloth set baby" \
  "baby bib set" "high chair baby" "baby diapers pack" "diaper rash cream" \
  "baby wipes pack" "changing mat baby" "diaper bag" "baby bath tub" \
  "baby shampoo bottle" "baby lotion bottle" "baby powder bottle" "baby soap bar" \
  "baby onesie set" "baby romper" "baby socks pack" "baby mittens cap set" \
  "baby sleepsuit" "baby swaddle blanket" "baby crib mobile" "baby monitor" \
  "baby night light" "pacifier set" "teething ring toy" "baby rattle toy" \
  "stacking rings toy baby" "soft plush toy baby" "activity gym baby" "baby walker" \
  "baby stroller" "car seat infant" "baby carrier wrap" "baby playpen" \
  "baby gate safety" "outlet covers safety" "corner guards safety" "baby proofing kit" \
  "nursing pillow" "baby bassinet" "crib mattress" "fitted crib sheet" \
  "baby thermometer" "nasal aspirator baby"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find Little Steps' `store_id` (`d0900000-3333-3333-3333-333333333333`)
and add new rows as a brand-new insert statement, ids
`d0900000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Anti-Colic Baby Feeding Bottle | 380.50 | Feeding | Vented anti-colic feeding bottle |
| Infant Formula Milk Powder 400g | 850.00 | Feeding | Stage-1 infant formula powder |
| Baby Food Puree Jar 4pk | 280.75 | Feeding | Organic fruit puree jars |
| Baby Cereal 300g | 250.00 | Feeding | Fortified infant rice cereal |
| Sippy Cup with Handles | 220.50 | Feeding | Spill-proof toddler sippy cup |
| Baby Bottle Warmer | 1450.00 | Feeding | Fast electric bottle warmer |
| Baby Bottle Sterilizer | 2450.75 | Feeding | Steam electric bottle sterilizer |
| Burp Cloth Set 5pk | 350.00 | Feeding | Absorbent cotton burp cloths |
| Baby Bib Set 4pk | 280.50 | Feeding | Waterproof silicone baby bibs |
| High Chair | 3450.00 | Feeding | Adjustable foldable high chair |
| Baby Diapers Pack (M) 40pc | 650.75 | Diapering & Bath | Ultra-absorbent diapers, medium |
| Diaper Rash Cream 100g | 220.00 | Diapering & Bath | Zinc oxide rash relief cream |
| Baby Wipes Pack 80pc | 180.50 | Diapering & Bath | Fragrance-free baby wipes |
| Changing Mat | 650.00 | Diapering & Bath | Portable padded changing mat |
| Diaper Bag | 1650.75 | Diapering & Bath | Multi-compartment diaper bag |
| Baby Bath Tub | 950.00 | Diapering & Bath | Ergonomic infant bath tub |
| Baby Shampoo 200ml | 250.50 | Diapering & Bath | Tear-free baby shampoo |
| Baby Lotion 200ml | 280.00 | Diapering & Bath | Gentle moisturizing baby lotion |
| Baby Powder 200g | 180.75 | Diapering & Bath | Talc-free baby powder |
| Baby Soap Bar 3pk | 150.00 | Diapering & Bath | Mild glycerin baby soap |
| Baby Onesie Set 3pk | 650.50 | Clothing | Cotton short-sleeve onesie set |
| Baby Romper | 450.00 | Clothing | Soft cotton baby romper |
| Baby Socks Pack 6pk | 220.75 | Clothing | Non-slip baby socks pack |
| Baby Mittens and Cap Set | 250.00 | Clothing | Newborn mittens and cap set |
| Baby Sleepsuit | 480.50 | Clothing | Zippered footed sleepsuit |
| Baby Swaddle Blanket | 550.00 | Nursery & Safety | Breathable muslin swaddle blanket |
| Baby Crib Mobile | 950.75 | Nursery & Safety | Musical hanging crib mobile |
| Baby Monitor | 3450.00 | Nursery & Safety | Video and audio baby monitor |
| Baby Night Light | 550.50 | Nursery & Safety | Soft-glow nursery night light |
| Orthodontic Pacifier Set 2pk | 180.00 | Feeding | BPA-free orthodontic pacifiers |
| Silicone Teething Ring | 220.75 | Toys & Learning | Cooling silicone teething ring |
| Baby Rattle Toy | 250.00 | Toys & Learning | Colorful grip rattle toy |
| Stacking Rings Toy | 380.50 | Toys & Learning | Classic stacking rings toy |
| Soft Plush Toy | 450.00 | Toys & Learning | Cuddly stuffed animal toy |
| Baby Activity Gym | 1850.75 | Toys & Learning | Play mat with hanging toys |
| Baby Walker | 2450.00 | Toys & Learning | Adjustable-height baby walker |
| Lightweight Baby Stroller | 6450.50 | Nursery & Safety | Foldable lightweight stroller |
| Infant Car Seat | 8450.00 | Nursery & Safety | Rear-facing infant car seat |
| Baby Carrier Wrap | 1650.75 | Nursery & Safety | Ergonomic baby carrier wrap |
| Baby Playpen | 3450.00 | Nursery & Safety | Foldable mesh baby playpen |
| Baby Safety Gate | 1450.50 | Nursery & Safety | Pressure-mount safety gate |
| Electrical Outlet Covers 12pk | 150.00 | Nursery & Safety | Child-safe outlet plug covers |
| Furniture Corner Guards 8pk | 220.75 | Nursery & Safety | Soft silicone corner guards |
| Baby Proofing Kit | 850.00 | Nursery & Safety | Complete home baby-proofing kit |
| Nursing Pillow | 850.50 | Feeding | Ergonomic breastfeeding support pillow |
| Baby Bassinet | 4450.00 | Nursery & Safety | Bedside co-sleeper bassinet |
| Crib Mattress | 3450.75 | Nursery & Safety | Breathable foam crib mattress |
| Fitted Crib Sheet | 450.00 | Nursery & Safety | Soft cotton fitted crib sheet |
| Digital Baby Thermometer | 380.50 | Diapering & Bath | Fast no-touch baby thermometer |
| Baby Nasal Aspirator | 220.00 | Diapering & Bath | Gentle nasal mucus aspirator |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Little Steps';"
```
Expect 50, and confirm all 8 prior stores (4 pet + 4 flowers) still show 50 each.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build Little Steps catalog with 50 unique items"
```

---

## Task 10: Tiny Tots Store (Baby) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 9.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "toddler sippy cup spout" "toddler snack cup" "baby led weaning spoon set" "silicone bib toddler" \
  "baby food maker blender" "breast pump electric" "milk storage bags" "baby bottle brush" \
  "toddler booster seat" "travel high chair" "cloth diapers reusable" "diaper pail" \
  "baby wet bag" "swim diapers" "baby sunscreen" "baby mosquito repellent patch" \
  "toddler pajamas set" "baby dress girl" "baby shoes soft sole" "toddler shoes first walker" \
  "baby hat sun" "baby swimwear" "baby bathrobe" "baby towel hooded" \
  "white noise machine baby" "baby room thermometer" "blackout curtains nursery" "diaper stacker" \
  "wooden building blocks toddler" "shape sorter toy" "toddler puzzle wooden" "musical toy piano baby" \
  "baby book cloth" "board book set toddler" "ride on toy toddler" "push walker toy" \
  "baby bouncer seat" "baby swing electric" "playmat foam tiles" "baby jumper doorway" \
  "diaper changing table" "wardrobe organizer baby" "baby hangers set" "laundry detergent baby" \
  "fabric softener baby" "stain remover baby clothes" "baby food steamer blender" "toddler fork spoon set" \
  "baby placemat silicone" "baby snack container"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find Tiny Tots Store's `store_id` (`d0a00000-3333-3333-3333-333333333333`)
and add new rows as a brand-new insert statement, ids
`d0a00000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Toddler Spout Sippy Cup | 220.50 | Feeding | Soft-spout toddler sippy cup |
| Toddler Snack Cup | 180.00 | Feeding | Spill-proof snack storage cup |
| Baby-Led Weaning Spoon Set | 250.75 | Feeding | Soft-tip self-feeding spoon set |
| Silicone Toddler Bib | 220.00 | Feeding | Wipeable catch-all silicone bib |
| Baby Food Maker Blender | 3450.50 | Feeding | Steam and blend baby food maker |
| Electric Breast Pump | 4450.00 | Feeding | Double electric breast pump |
| Breast Milk Storage Bags 50pk | 380.75 | Feeding | Pre-sterilized milk storage bags |
| Baby Bottle Brush | 150.00 | Feeding | Long-handle bottle cleaning brush |
| Toddler Booster Seat | 950.50 | Feeding | Portable chair booster seat |
| Foldable Travel High Chair | 1650.00 | Feeding | Compact fold-flat travel high chair |
| Reusable Cloth Diapers Set 5pk | 1450.75 | Diapering & Bath | Adjustable washable cloth diapers |
| Diaper Disposal Pail | 1850.00 | Diapering & Bath | Odor-lock diaper disposal pail |
| Baby Wet Bag | 350.50 | Diapering & Bath | Waterproof cloth diaper wet bag |
| Swim Diapers 12pk | 450.00 | Diapering & Bath | Reusable-style swim diapers |
| Baby Sunscreen SPF 50 | 350.75 | Diapering & Bath | Mineral-based baby sunscreen |
| Baby Mosquito Repellent Patch | 180.00 | Diapering & Bath | Natural mosquito repellent patches |
| Toddler Pajama Set | 550.50 | Clothing | Cotton toddler pajama set |
| Baby Girl Dress | 650.00 | Clothing | Frilly cotton baby dress |
| Soft-Sole Baby Shoes | 380.75 | Clothing | Flexible soft-sole crib shoes |
| Toddler First-Walker Shoes | 850.00 | Clothing | Supportive first-walker shoes |
| Baby Sun Hat | 280.50 | Clothing | Wide-brim UV-protection sun hat |
| Baby Swimwear Set | 450.00 | Clothing | UV-protective baby swimwear |
| Baby Bathrobe | 550.75 | Clothing | Hooded terry baby bathrobe |
| Hooded Baby Towel | 380.00 | Diapering & Bath | Soft hooded bath towel |
| White Noise Sleep Machine | 950.50 | Nursery & Safety | Soothing white noise machine |
| Baby Room Thermometer | 220.00 | Nursery & Safety | Digital nursery room thermometer |
| Blackout Curtains for Nursery | 850.75 | Nursery & Safety | Light-blocking nursery curtains |
| Diaper Stacker | 350.00 | Nursery & Safety | Hanging diaper storage stacker |
| Wooden Building Blocks Set | 650.50 | Toys & Learning | Natural wood building block set |
| Shape Sorter Toy | 450.00 | Toys & Learning | Classic shape-sorting cube toy |
| Wooden Toddler Puzzle | 380.75 | Toys & Learning | Chunky wooden peg puzzle |
| Musical Toy Piano | 950.00 | Toys & Learning | Interactive light-up piano toy |
| Cloth Baby Book | 280.50 | Toys & Learning | Crinkly soft cloth activity book |
| Board Book Set 5pk | 450.00 | Toys & Learning | Durable toddler board book set |
| Ride-On Toy | 3450.75 | Toys & Learning | Foot-propelled ride-on toy |
| Push Walker Toy | 1450.00 | Toys & Learning | Stability push-along walker toy |
| Baby Bouncer Seat | 2450.50 | Nursery & Safety | Vibrating infant bouncer seat |
| Electric Baby Swing | 6450.00 | Nursery & Safety | Multi-speed electric baby swing |
| Foam Playmat Tiles Set | 850.75 | Toys & Learning | Interlocking foam floor tiles |
| Doorway Baby Jumper | 1650.00 | Toys & Learning | Adjustable doorway bounce jumper |
| Diaper Changing Table | 4450.50 | Nursery & Safety | Storage-shelf changing table |
| Baby Wardrobe Organizer | 650.00 | Nursery & Safety | Hanging closet organizer set |
| Baby Clothes Hangers Set 20pk | 220.75 | Nursery & Safety | Notched baby-size hangers |
| Baby Laundry Detergent 1L | 350.00 | Diapering & Bath | Hypoallergenic baby detergent |
| Baby Fabric Softener 1L | 320.50 | Diapering & Bath | Gentle baby fabric softener |
| Baby Clothes Stain Remover | 220.00 | Diapering & Bath | Pre-wash stain remover spray |
| Baby Food Steamer Blender | 2850.75 | Feeding | 4-in-1 steam and puree blender |
| Toddler Fork and Spoon Set | 180.50 | Feeding | Chunky-grip toddler cutlery set |
| Silicone Baby Placemat | 250.00 | Feeding | Suction-base silicone placemat |
| Baby Snack Container Set | 220.75 | Feeding | Stackable snack storage set |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Tiny Tots Store';"
```
Expect 50, and confirm Little Steps still shows 50.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build Tiny Tots Store catalog with 50 unique items"
```

---

## Task 11: BabyCare Hub (Baby) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 10.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "organic baby formula" "toddler snack bars" "baby juice bottle" "baby multivitamin drops" \
  "baby probiotic drops" "gripe water baby" "baby gas relief drops" "baby teething gel" \
  "baby vapor rub" "baby cough syrup" "baby eczema cream" "baby diaper cream tube" \
  "baby cotton buds" "baby nail clipper set" "baby hair brush comb set" "baby grooming kit" \
  "baby laundry basket" "baby hooded towel set" "baby washcloth set" "baby bath toys" \
  "baby bath thermometer" "infant swimming float" "baby life jacket" "kids helmet baby" \
  "baby knee pads crawling" "toddler backpack" "kids lunch box" "kids water bottle" \
  "baby food pouches" "toddler multivitamin gummies" "baby oil bottle" "baby massage oil" \
  "diaper genie refill" "baby wipes warmer" "portable bottle warmer" "travel diaper changing kit" \
  "car sun shade baby" "stroller organizer" "stroller rain cover" "car seat mirror baby" \
  "baby carrier hip seat" "baby float ring" "kids toothbrush set" "baby dental wipes" \
  "toddler learning tablet toy" "flashcards for babies" "baby sensory toy" "stacking cups toy" \
  "baby mirror toy" "crawling tunnel toy"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find BabyCare Hub's `store_id` (`d0b00000-3333-3333-3333-333333333333`)
and add new rows as a brand-new insert statement, ids
`d0b00000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Organic Baby Formula 400g | 1250.50 | Feeding | Organic stage-2 baby formula |
| Toddler Snack Bars 6pk | 220.00 | Feeding | Whole-grain toddler snack bars |
| Baby Juice Bottle | 180.75 | Feeding | No-added-sugar baby fruit juice |
| Baby Multivitamin Drops | 380.00 | Feeding | Daily infant multivitamin drops |
| Baby Probiotic Drops | 420.50 | Feeding | Digestive-health probiotic drops |
| Gripe Water for Babies | 220.00 | Feeding | Colic-relief gripe water |
| Baby Gas Relief Drops | 250.75 | Feeding | Simethicone gas relief drops |
| Baby Teething Gel | 180.00 | Diapering & Bath | Soothing teething relief gel |
| Baby Vapor Rub | 220.50 | Diapering & Bath | Gentle chest vapor rub |
| Baby Cough Syrup | 220.00 | Diapering & Bath | Pediatric herbal cough syrup |
| Baby Eczema Cream | 350.75 | Diapering & Bath | Soothing eczema relief cream |
| Diaper Cream Tube 100g | 250.00 | Diapering & Bath | Barrier diaper rash cream |
| Baby Cotton Buds | 120.50 | Diapering & Bath | Safety-tip baby cotton buds |
| Baby Nail Clipper Set | 220.00 | Diapering & Bath | Rounded-tip baby nail clippers |
| Baby Hair Brush and Comb Set | 250.75 | Diapering & Bath | Soft-bristle grooming set |
| Baby Grooming Kit | 650.00 | Diapering & Bath | Complete baby grooming kit |
| Baby Laundry Basket | 550.50 | Nursery & Safety | Foldable baby laundry hamper |
| Hooded Baby Towel Set 2pk | 550.00 | Diapering & Bath | Soft cotton hooded towel set |
| Baby Washcloth Set 6pk | 220.75 | Diapering & Bath | Ultra-soft bamboo washcloths |
| Baby Bath Toys Set | 350.00 | Toys & Learning | Floating squirt bath toy set |
| Baby Bath Thermometer | 220.50 | Diapering & Bath | Duck-shaped bath thermometer |
| Infant Swimming Float | 450.00 | Toys & Learning | Inflatable infant swim float |
| Baby Life Jacket | 650.75 | Nursery & Safety | Buoyant infant swim life jacket |
| Kids Bike Helmet | 550.00 | Nursery & Safety | Adjustable toddler bike helmet |
| Crawling Knee Pads | 220.50 | Clothing | Cushioned crawling knee pads |
| Toddler Backpack | 450.00 | Clothing | Mini toddler school backpack |
| Kids Lunch Box | 380.75 | Feeding | Insulated kids lunch box |
| Kids Water Bottle | 250.00 | Feeding | Spill-proof kids water bottle |
| Baby Food Pouches 6pk | 320.50 | Feeding | Squeezable fruit and veg pouches |
| Toddler Multivitamin Gummies | 380.00 | Feeding | Chewable toddler vitamin gummies |
| Baby Oil 200ml | 220.75 | Diapering & Bath | Nourishing baby massage oil |
| Baby Massage Oil 100ml | 250.00 | Diapering & Bath | Ayurvedic baby massage oil |
| Diaper Pail Refill Cartridge | 350.50 | Diapering & Bath | Odor-seal refill cartridge |
| Baby Wipes Warmer | 850.00 | Diapering & Bath | Adjustable wipes warmer |
| Portable Bottle Warmer | 950.75 | Feeding | USB-powered travel bottle warmer |
| Travel Diaper Changing Kit | 650.00 | Diapering & Bath | Compact travel changing kit |
| Car Window Sun Shade | 280.50 | Nursery & Safety | UV-protection car window shade |
| Stroller Organizer | 450.00 | Nursery & Safety | Hanging stroller storage organizer |
| Stroller Rain Cover | 350.75 | Nursery & Safety | Universal stroller rain cover |
| Baby Car Seat Mirror | 380.00 | Nursery & Safety | Rear-facing car seat mirror |
| Baby Hip Seat Carrier | 1450.50 | Nursery & Safety | Ergonomic hip seat baby carrier |
| Baby Swimming Float Ring | 350.00 | Toys & Learning | Inflatable neck swim float ring |
| Kids Toothbrush Set 2pk | 180.75 | Diapering & Bath | Soft-bristle toddler toothbrushes |
| Baby Dental Wipes | 220.00 | Diapering & Bath | Xylitol baby gum and teeth wipes |
| Toddler Learning Tablet Toy | 850.50 | Toys & Learning | Interactive educational tablet toy |
| Baby Flashcards Set | 250.00 | Toys & Learning | High-contrast learning flashcards |
| Baby Sensory Toy Set | 450.75 | Toys & Learning | Textured sensory exploration toys |
| Stacking Cups Toy | 220.00 | Toys & Learning | Nesting and stacking cup toy |
| Baby Safety Mirror Toy | 250.50 | Toys & Learning | Shatterproof crib mirror toy |
| Crawling Tunnel Toy | 950.00 | Toys & Learning | Collapsible play tunnel |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'BabyCare Hub';"
```
Expect 50, and confirm the prior 2 baby stores still show 50 each.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build BabyCare Hub catalog with 50 unique items"
```

---

## Task 12: Cuddle & Co. (Baby) — 50 fresh unique items

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `docs/superpowers/plans/item-name-registry.md`

**Interfaces:**
- Consumes: registry as it stands after Task 11.
- Produces: appends its 50 new names.

- [ ] **Step 1: Fetch product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "toddler formula milk" "baby rice cakes snack" "toddler yogurt melts" "baby teething biscuits" \
  "baby electrolyte solution" "baby sunscreen stick" "baby lip balm" "baby hand sanitizer" \
  "baby face mask reusable" "baby bandana bib set" "baby overalls dungarees" "baby cardigan sweater" \
  "baby jacket winter" "baby snowsuit" "baby beanie hat" "baby sunglasses" \
  "baby shoes sandals" "baby socks with grip" "baby leggings set" "baby swim diaper reusable" \
  "nursery wall decal" "nursery rug" "nursery lamp" "baby crib bumper" \
  "baby pillow flat head" "baby sleep sack" "baby sound machine portable" "baby humidifier" \
  "baby air purifier" "baby room fan" "wooden toy car" "baby xylophone toy" \
  "baby drum toy" "toddler ball pit" "kids tent play" "baby swing outdoor" \
  "toddler slide indoor" "baby rocking chair" "wooden rocking horse" "baby doll toy" \
  "baby teether toy set" "silicone teether necklace" "baby bibs waterproof set" "toddler apron art" \
  "kids crayons set" "toddler coloring book" "baby bath book" "kids puzzle mat" \
  "baby carrier backpack hiking" "diaper bag backpack"
```

- [ ] **Step 2: Read the registry, then add these 50 new products to `supabase/seed.sql`**

Find Cuddle & Co.'s `store_id` (`d0c00000-3333-3333-3333-333333333333`)
and add new rows as a brand-new insert statement, ids
`d0c00000-4444-4444-4444-000000000001` through `...050`.

| Item | Price | Category | Description |
|---|---|---|---|
| Toddler Formula Milk 400g | 950.50 | Feeding | Stage-3 toddler growth formula |
| Baby Rice Cakes Snack | 150.00 | Feeding | Melt-in-mouth rice cake snacks |
| Toddler Yogurt Melts | 180.75 | Feeding | Freeze-dried yogurt melt snacks |
| Baby Teething Biscuits | 150.00 | Feeding | Rusk-style teething biscuits |
| Baby Electrolyte Solution | 220.50 | Feeding | Pediatric oral rehydration solution |
| Baby Sunscreen Stick | 280.00 | Diapering & Bath | Mineral sunscreen stick applicator |
| Baby Lip Balm | 120.75 | Diapering & Bath | Moisturizing baby lip balm |
| Baby Hand Sanitizer | 150.00 | Diapering & Bath | Alcohol-free baby hand sanitizer |
| Reusable Baby Face Mask | 180.50 | Diapering & Bath | Soft breathable kids face mask |
| Baby Bandana Bib Set 4pk | 280.00 | Feeding | Stylish bandana-style bibs |
| Baby Overalls Dungarees | 550.75 | Clothing | Cotton denim-style overalls |
| Baby Cardigan Sweater | 480.00 | Clothing | Soft knit baby cardigan |
| Baby Winter Jacket | 650.50 | Clothing | Padded hooded winter jacket |
| Baby Snowsuit | 850.00 | Clothing | All-in-one insulated snowsuit |
| Baby Beanie Hat | 220.75 | Clothing | Soft knit baby beanie |
| Baby Sunglasses | 250.00 | Clothing | UV-protection flexible sunglasses |
| Baby Sandals | 350.50 | Clothing | Adjustable-strap baby sandals |
| Grip Socks Set 6pk | 220.00 | Clothing | Non-slip grip-sole baby socks |
| Baby Leggings Set 3pk | 450.75 | Clothing | Stretch cotton baby leggings |
| Reusable Swim Diaper | 380.00 | Diapering & Bath | Adjustable reusable swim diaper |
| Nursery Wall Decal Set | 350.50 | Nursery & Safety | Removable nursery wall stickers |
| Nursery Area Rug | 1450.00 | Nursery & Safety | Soft nursery play rug |
| Nursery Table Lamp | 650.75 | Nursery & Safety | Soft-glow nursery table lamp |
| Breathable Crib Bumper | 850.00 | Nursery & Safety | Mesh breathable crib bumper |
| Flat Head Prevention Pillow | 450.50 | Nursery & Safety | Orthopedic infant head pillow |
| Baby Sleep Sack | 650.00 | Clothing | Wearable weighted sleep sack |
| Portable Sound Machine | 950.75 | Nursery & Safety | Travel-size white noise machine |
| Nursery Humidifier | 1450.00 | Nursery & Safety | Cool-mist nursery humidifier |
| Baby Room Air Purifier | 2450.50 | Nursery & Safety | HEPA nursery air purifier |
| Nursery Room Fan | 950.00 | Nursery & Safety | Quiet oscillating nursery fan |
| Wooden Toy Car | 350.75 | Toys & Learning | Handcrafted wooden pull-along car |
| Baby Xylophone Toy | 450.00 | Toys & Learning | Colorful wooden xylophone toy |
| Baby Drum Toy | 380.50 | Toys & Learning | Musical drum learning toy |
| Toddler Ball Pit | 1650.00 | Toys & Learning | Pop-up ball pit with balls |
| Kids Play Tent | 1450.75 | Toys & Learning | Foldable pop-up play tent |
| Outdoor Baby Swing | 2450.00 | Toys & Learning | Backyard toddler swing seat |
| Indoor Toddler Slide | 1850.50 | Toys & Learning | Compact indoor plastic slide |
| Baby Rocking Chair | 3450.00 | Nursery & Safety | Upholstered nursery glider chair |
| Wooden Rocking Horse | 2450.75 | Toys & Learning | Classic wooden rocking horse |
| Soft Baby Doll Toy | 380.00 | Toys & Learning | Huggable soft-body baby doll |
| Baby Teether Toy Set 4pk | 280.50 | Toys & Learning | BPA-free assorted teether set |
| Silicone Teether Necklace | 250.00 | Toys & Learning | Mom-wearable teething necklace |
| Waterproof Bib Set 3pk | 280.75 | Feeding | Roll-up waterproof feeding bibs |
| Toddler Art Apron | 350.00 | Clothing | Waterproof toddler art smock |
| Kids Crayons Set 24pk | 180.50 | Toys & Learning | Non-toxic jumbo crayon set |
| Toddler Coloring Book | 150.00 | Toys & Learning | Large-print toddler coloring book |
| Baby Bath Book | 250.75 | Toys & Learning | Waterproof floating bath book |
| Kids Foam Puzzle Mat | 950.00 | Toys & Learning | Interlocking alphabet foam mat |
| Hiking Baby Carrier Backpack | 4450.50 | Nursery & Safety | Framed outdoor hiking carrier |
| Diaper Bag Backpack | 1850.00 | Diapering & Bath | Convertible backpack diaper bag |

- [ ] **Step 3: Append these 50 names to the registry**

- [ ] **Step 4: Verify `git diff --stat` shows additions only, then live count**

```bash
git diff --stat
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.name = 'Cuddle & Co.';"
```
Expect 50, and confirm all 3 prior baby stores still show 50 each.

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql docs/superpowers/plans/item-name-registry.md
git commit -m "feat: build Cuddle & Co. catalog with 50 unique items"
```

---

## Task 13: Final whole-branch verification

**Files:**
- None modified — verification only, unless a defect is found (in which
  case fix inline in `supabase/seed.sql` and/or the registry, then
  re-run this task's checks).

**Interfaces:**
- Consumes: final state of `supabase/seed.sql` and the registry after
  Task 12.

- [ ] **Step 1: Verify all 12 stores reach exactly 50**

```bash
npx supabase db reset
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select s.name, count(p.id) from public.stores s join public.products p on p.store_id = s.id where s.category_type in ('pet','flowers','baby') group by s.name order by s.name;"
```
Expect all 12 rows to show count = 50.

- [ ] **Step 2: Verify whole-app name uniqueness of newly added items**

```bash
docker exec supabase_db_phase1-scaffold-db psql -U postgres -t -A -c "select name, count(*) from public.products group by name having count(*) > 1 order by name;"
```
Expect only pre-existing, already-documented duplicates from sub-projects
A/B/C. No NEW duplicate should appear among names added by Tasks 1-12 —
cross-check any newly flagged name against this plan's 12 item tables.

- [ ] **Step 3: Verify registry integrity**

```bash
wc -l docs/superpowers/plans/item-name-registry.md
sort docs/superpowers/plans/item-name-registry.md | uniq -d
```
Expect line count = 2076 + 600 (50 x 12) = 2676 (or higher only if a
task's own item count exceeded exactly 50). Expect zero output from
`uniq -d`.

- [ ] **Step 4: Category-vocabulary sanity pass**

```bash
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select s.name, p.category, count(*) from public.products p join public.stores s on s.id = p.store_id where s.category_type in ('pet','flowers','baby') group by s.name, p.category order by s.name, p.category;"
```
For each store, confirm every category value is one of that category's
5 confirmed vocabulary values from Task 0 — no near-synonym drift.

- [ ] **Step 5: `product_attributes` scope check**

```bash
docker exec supabase_db_phase1-scaffold-db psql -U postgres -t -A -c "select count(*) from public.products p join public.stores s on s.id = p.store_id where s.category_type in ('pet','flowers','baby') and p.product_attributes != '{}'::jsonb;"
```
Expect 0 — no row in this sub-project should have anything but `{}` in
`product_attributes` (no is_veg anywhere, unlike sub-project C's Health
stores).

- [ ] **Step 6: Price format check**

Spot-check 10 rows across different stores from `supabase/seed.sql` to
confirm prices are deliberately decimal rupees.paise, not uniformly
rounded to whole numbers.

- [ ] **Step 7: Image URL sanity check — re-derive from scratch, do not trust individual task reports**

```bash
docker exec supabase_db_phase1-scaffold-db psql -U postgres -t -A -c "select p.image_url, count(*) from public.products p join public.stores s on s.id = p.store_id where s.category_type in ('pet','flowers','baby') group by p.image_url having count(*) > 1;"
```
For each of the 12 new stores' 600 rows, independently re-derive whether
any image_url is shared with (a) another one of these 600 rows or (b) any
pre-existing row from sub-projects A/B/C. This exact check missed 14 real
collisions in sub-project C despite every individual task claiming
"zero duplicates" — do not skip this re-derivation. Fix any found by
fetching a genuinely new photo, directly in this task.

- [ ] **Step 8: Live browser UI check**

Start the local dev server and app stack. In a browser:
- Confirm all 12 new stores appear in the customer home feed under their
  correct category (Pet, Flowers, Baby).
- Open at least one store per category and confirm 50 items render with
  correct names, prices (decimal), categories, and photos.
- Add an item to cart from a Baby store and confirm checkout total
  reflects the decimal price correctly.

- [ ] **Step 9: Full app build check**

```bash
npm run build
```
Expect success, no errors.

- [ ] **Step 10: Commit (only if Steps 4/5/7 required a fix; otherwise skip)**

```bash
git add supabase/seed.sql
git commit -m "fix: correct issues found in sub-project D final review"
```
