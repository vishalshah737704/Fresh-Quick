# Marketplace Phase 3 — Content A: Grocery, Convenience, Alcohol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed real, browsable stores and products for 3 categories —
Grocery, Convenience, Alcohol — so `/customer?category=grocery` (etc.,
from Phase 2) shows real data instead of the empty state, with realistic
depth: **at least 75-100 browsable products per category**, matching the
density of a real marketplace like Uber Eats' grocery/retail categories
rather than a token 2-3 items. 12 stores total (4 per category), each
carrying its category's full 20-item master catalog — 80 product rows per
category (4 stores × 20 items).

**Architecture:** Pure seed-data addition to `supabase/seed.sql`,
following the exact pattern already established for restaurants (fixed
UUIDs, `auth.users`/`auth.identities`/`public.users`/`public.addresses`/
`public.stores`/`public.products` insert blocks, all `on conflict (id) do
nothing` for idempotency). Each category has ONE master list of 20 real,
distinct item types (below) — every one of that category's 4 stores
carries the SAME 20 items (a real grocery chain's stores mostly overlap
in what they stock; this is the realistic pattern, not padding). This
means only 20 unique Pexels photos are needed per category, reused across
that category's 4 stores, keeping the image-fetch volume sane while still
producing 80 real, browsable product listings per category. No schema
change — `category_type` and `product_attributes` already support any
category (Phase 1). No app code change — Phase 2's category filtering
already works for any `category_type` value with data behind it.

**Tech Stack:** SQL (seed.sql), Pexels Search API via the existing
`scripts/fetch-catalog-images.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-26-multi-vertical-marketplace-design.md`
(section 6, section 7 phase "Content phase A") — this plan supersedes
section 6's "2-3 stores, 3-5 products" sizing with a deeper catalog per
the user's explicit request for 75-100 items/category, referencing
Uber Eats' own category depth as the bar.

## Global Constraints

- **Follow the existing seed.sql pattern exactly** — same UUID-block
  style, same `on conflict (id) do nothing` idempotency, same comment
  style crediting Pexels for images.
- **UUID prefix**: use `b0100000` through `b0c00000` (hex, twelve
  stores — 4 each for Grocery/Convenience/Alcohol) for store ids and
  matching vendor-user ids, to avoid any collision with the existing
  `a0...`-prefixed restaurant rows or Phase 1's own fixed ids.
- **Every store in a category carries the SAME 20-item master list**
  (given below, per category) — do not invent additional unique items
  per store; the realism and the 75-100 target both come from 4 stores ×
  20 shared items, not from inventing 80 unique items by hand.
- **Reuse one Pexels photo per item type across all 4 stores selling it**
  — e.g. all 4 grocery stores' "Milk 1L" product row uses the same
  fetched milk-carton photo URL. This is intentional, not a shortcut to
  flag — real marketplaces do this too.
- **All 12 vendor accounts use password `demo1234`**.
- **Zero schema/migration changes** — this phase is data-only.
- **Prices are in the same numeric unit as existing `products.price`**
  (rupees). You MAY vary a given item's price by up to ±10% per store for
  realism (e.g. Milk 1L at ₹60 in one store, ₹58 or ₹65 in another) — this
  is optional judgment, not a requirement; using the exact master-list
  price at every store is also fine.

## Review Focus

- **UUID collisions** — verify no id in this phase's inserts already
  exists in `seed.sql` today.
- **`cuisine_tags` on non-restaurant stores** — must be an empty array
  (`array[]::text[]`), not null.
- **`avg_prep_minutes` on non-restaurant stores** — pass `null` explicitly.
- **A vendor login that doesn't resolve to its store** — verify every
  store's `owner_id` matches its paired `auth.users` row.
- **Product count per category actually reaches the 75-100 target** — a
  missed store or a truncated item list would silently under-deliver on
  the one thing this revision exists to fix; count the actual rows per
  category before calling this done (`select category_type, count(*) from
  products p join stores s on s.id = p.store_id group by 1` — see Task 3).
- **The Phase 2 empty-state regression check**: after this phase, Alcohol
  is no longer empty, but Health/Retail/Pet/etc. still are (Phases 4-5
  haven't landed) — confirm those categories still show the clean empty
  state.

---

## Task 1: Fetch product/store images

**Files:** none created — this task's output feeds Task 2's SQL.

- [ ] **Step 1: Fetch banner photos (one per store, 12 total) and product photos (one per item type, 60 total — 20 each for Grocery/Convenience/Alcohol)**

```bash
node scripts/fetch-catalog-images.mjs \
  "grocery store front" "supermarket aisle" "green grocer shop" "convenience mart storefront" \
  "milk carton" "bread loaf" "eggs carton" "rice bag" "bananas fruit" "tomatoes" \
  "potato chips bag" "orange juice bottle" "butter block" "yogurt cup" "flour bag" \
  "lentils dal" "sugar bag" "cooking oil bottle" "red onions" "potatoes vegetable" \
  "green tea box" "instant coffee jar" "frozen peas bag" "ice cream tub" "dish soap bottle" \
  "laundry detergent box" "paper towel roll" "roasted peanuts" "digestive biscuits"

node scripts/fetch-catalog-images.mjs \
  "convenience store" "corner store shop" "24 hour mini mart" "quick stop shop" \
  "bottled water" "instant noodles" "chocolate bar" "energy drink can" "newspaper" \
  "chewing gum" "biscuits pack" "ice cream cup" "potato wafers" "cola can" \
  "disposable lighter" "travel umbrella" "usb charging cable" "notebook stationery" "pen pack" \
  "aa batteries" "candy pack" "microwave popcorn" "mineral water bottle" "tissue pack"

node scripts/fetch-catalog-images.mjs \
  "wine cellar shop" "craft beer brewery" "spirits liquor shop" "bottle shop liquor store" \
  "red wine bottle" "white wine bottle" "sparkling wine bottle" "wine opener" "ipa beer six pack" \
  "lager beer" "stout beer bottle" "beer glass" "whisky bottle" "vodka bottle" \
  "rum bottle" "gin bottle" "rose wine bottle" "champagne bottle" "cocktail mixer" \
  "wine glass set" "craft cider bottle" "tequila bottle" "bar snacks nuts" "ice bucket"
```
Save the printed URLs somewhere you can reference while writing Task 2's
SQL (a scratch file is fine, don't commit it) — you need 12 banner photos
(one per store) and 60 product photos (one per unique item type across
the 3 categories' master lists — 20 each).

---

## Task 2: Seed data — Grocery, Convenience, Alcohol (4 stores × 20 items each)

**Files:**
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: Task 1's fetched image URLs.
- Produces: 12 new rows in `public.stores` (`category_type` one of
  `'grocery'`, `'convenience'`, `'alcohol'`, 4 each), 240 new rows in
  `public.products` (80 per category: 4 stores × 20 shared items), 12 new
  vendor accounts.

- [ ] **Step 1: Worked example — follow this exact pattern for every store below**

Append to `supabase/seed.sql` (after the existing restaurant catalog
section):

```sql
-- Phase 3 (Content A): Grocery, Convenience, Alcohol categories.
-- Every store in a category carries the same category-wide master item
-- list (20 items), matching real grocery-chain catalog overlap and
-- reaching a realistic ~80 browsable items per category (4 stores x 20
-- items). Images from Pexels, fetched once via
-- scripts/fetch-catalog-images.mjs and hardcoded here, same pattern as
-- the restaurant catalog above -- one photo per item type, reused across
-- every store that carries that item.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'b0100000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'fresh-mart@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'b0100000-1111-1111-1111-111111111111', 'email', 'b0100000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'b0100000-1111-1111-1111-111111111111', 'email', 'fresh-mart@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('b0100000-1111-1111-1111-111111111111', 'vendor', 'Fresh Mart Owner', null) on conflict (id) do nothing;
insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values ('b0100000-2222-2222-2222-222222222222', 'b0100000-1111-1111-1111-111111111111', 'store', 'Andheri West, Mumbai', 19.1197, 72.8468, true) on conflict (id) do nothing;
insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, category_type, banner_url) values ('b0100000-3333-3333-3333-333333333333', 'b0100000-1111-1111-1111-111111111111', 'Fresh Mart', array[]::text[], 'b0100000-2222-2222-2222-222222222222', 19.1197, 72.8468, true, null, 4.3, 'grocery', '<paste a grocery banner URL>') on conflict (id) do nothing;
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('b0100000-4444-4444-4444-000000000001', 'b0100000-3333-3333-3333-333333333333', 'Milk 1L', 'Fresh whole milk, 1 litre', 60, 'Dairy', '{}'::jsonb, true, '<milk carton URL>'),
  ('b0100000-4444-4444-4444-000000000002', 'b0100000-3333-3333-3333-333333333333', 'Brown Bread', 'Whole wheat sandwich loaf', 45, 'Bakery', '{}'::jsonb, true, '<bread loaf URL>'),
  ('b0100000-4444-4444-4444-000000000003', 'b0100000-3333-3333-3333-333333333333', 'Farm Eggs (12pc)', 'Dozen fresh farm eggs', 90, 'Dairy', '{}'::jsonb, true, '<eggs carton URL>'),
  ('b0100000-4444-4444-4444-000000000004', 'b0100000-3333-3333-3333-333333333333', 'Basmati Rice 1kg', 'Premium long-grain basmati rice', 120, 'Staples', '{}'::jsonb, true, '<rice bag URL>'),
  ('b0100000-4444-4444-4444-000000000005', 'b0100000-3333-3333-3333-333333333333', 'Bananas 1dz', 'Fresh ripe bananas, dozen', 50, 'Produce', '{}'::jsonb, true, '<bananas URL>'),
  ('b0100000-4444-4444-4444-000000000006', 'b0100000-3333-3333-3333-333333333333', 'Tomatoes 1kg', 'Farm-fresh tomatoes', 40, 'Produce', '{}'::jsonb, true, '<tomatoes URL>'),
  ('b0100000-4444-4444-4444-000000000007', 'b0100000-3333-3333-3333-333333333333', 'Potato Chips', 'Classic salted potato chips', 30, 'Snacks', '{}'::jsonb, true, '<potato chips URL>'),
  ('b0100000-4444-4444-4444-000000000008', 'b0100000-3333-3333-3333-333333333333', 'Orange Juice 1L', '100% pure orange juice', 110, 'Beverages', '{}'::jsonb, true, '<orange juice URL>'),
  ('b0100000-4444-4444-4444-000000000009', 'b0100000-3333-3333-3333-333333333333', 'Butter 200g', 'Salted table butter', 90, 'Dairy', '{}'::jsonb, true, '<butter URL>'),
  ('b0100000-4444-4444-4444-000000000010', 'b0100000-3333-3333-3333-333333333333', 'Yogurt Cup 400g', 'Plain set yogurt', 55, 'Dairy', '{}'::jsonb, true, '<yogurt URL>'),
  ('b0100000-4444-4444-4444-000000000011', 'b0100000-3333-3333-3333-333333333333', 'Whole Wheat Flour 5kg', 'Atta for chapati/roti', 220, 'Staples', '{}'::jsonb, true, '<flour URL>'),
  ('b0100000-4444-4444-4444-000000000012', 'b0100000-3333-3333-3333-333333333333', 'Toor Dal 1kg', 'Split pigeon peas', 130, 'Staples', '{}'::jsonb, true, '<lentils URL>'),
  ('b0100000-4444-4444-4444-000000000013', 'b0100000-3333-3333-3333-333333333333', 'Sugar 1kg', 'Refined white sugar', 45, 'Staples', '{}'::jsonb, true, '<sugar URL>'),
  ('b0100000-4444-4444-4444-000000000014', 'b0100000-3333-3333-3333-333333333333', 'Cooking Oil 1L', 'Refined sunflower oil', 160, 'Staples', '{}'::jsonb, true, '<cooking oil URL>'),
  ('b0100000-4444-4444-4444-000000000015', 'b0100000-3333-3333-3333-333333333333', 'Onions 1kg', 'Fresh red onions', 35, 'Produce', '{}'::jsonb, true, '<onions URL>'),
  ('b0100000-4444-4444-4444-000000000016', 'b0100000-3333-3333-3333-333333333333', 'Potatoes 1kg', 'Fresh potatoes', 30, 'Produce', '{}'::jsonb, true, '<potatoes URL>'),
  ('b0100000-4444-4444-4444-000000000017', 'b0100000-3333-3333-3333-333333333333', 'Green Tea Bags 25ct', 'Antioxidant green tea bags', 150, 'Beverages', '{}'::jsonb, true, '<green tea URL>'),
  ('b0100000-4444-4444-4444-000000000018', 'b0100000-3333-3333-3333-333333333333', 'Instant Coffee 100g', 'Freeze-dried instant coffee', 220, 'Beverages', '{}'::jsonb, true, '<instant coffee URL>'),
  ('b0100000-4444-4444-4444-000000000019', 'b0100000-3333-3333-3333-333333333333', 'Frozen Peas 500g', 'Green peas, frozen pack', 70, 'Frozen', '{}'::jsonb, true, '<frozen peas URL>'),
  ('b0100000-4444-4444-4444-000000000020', 'b0100000-3333-3333-3333-333333333333', 'Ice Cream Tub 700ml', 'Vanilla ice cream tub', 250, 'Frozen', '{}'::jsonb, true, '<ice cream tub URL>')
on conflict (id) do nothing;
```

Replace every `<...>` placeholder with a real Pexels URL from Task 1.

- [ ] **Step 2: Repeat for the remaining 3 grocery stores, using the SAME 20-item list above**

UUID prefixes `b0200000` (Green Grocer), `b0300000` (Metro Grocery), and
a 4th — wait, Grocery gets exactly 4 stores total (including Fresh Mart
from Step 1): `b0100000` Fresh Mart, `b0200000` Daily Basket, `b0300000`
Green Grocer, `b0400000` Metro Grocery. Each gets its own
`auth.users`/`address`/`store` block (new owner, new address, new
`banner_url` from Task 1's grocery banner photos) but its 20
`public.products` rows use the EXACT SAME 20 item names/descriptions/
prices/categories as Step 1's list (image URLs may also be reused
identically — same physical product). Locations (vary per store, Mumbai
area): Daily Basket — "Bandra East, Mumbai"; Green Grocer — "Powai,
Mumbai"; Metro Grocery — "Malad West, Mumbai". Ratings: vary 3.9-4.6.

- [ ] **Step 3: Convenience — 4 stores × the 20-item Convenience list**

UUID prefixes `b0500000` (QuickStop), `b0600000` (Corner Store),
`b0700000` (24/7 Shop), `b0800000` (Metro Mart Express). All `category_type = 'convenience'`.
Every store's 20 products (use this exact list for all 4):

| Item | Price | Category | Description |
|---|---|---|---|
| Bottled Water 1L | 20 | Beverages | Purified drinking water |
| Instant Noodles | 25 | Snacks | Spicy instant noodle cup |
| Chocolate Bar | 40 | Snacks | Milk chocolate bar |
| Energy Drink | 80 | Beverages | Caffeinated energy drink, 250ml |
| Newspaper | 10 | Reading | Daily English newspaper |
| Chewing Gum | 15 | Snacks | Mint chewing gum pack |
| Biscuits Pack | 35 | Snacks | Assorted cream biscuits |
| Ice Cream Cup | 50 | Frozen | Vanilla ice cream cup, 100ml |
| Potato Wafers | 30 | Snacks | Crispy potato wafers |
| Cola Can 300ml | 45 | Beverages | Carbonated cola drink |
| Lighter | 25 | Essentials | Disposable pocket lighter |
| Umbrella | 250 | Essentials | Compact travel umbrella |
| Phone Charging Cable | 150 | Electronics | Micro-USB charging cable |
| Notebook | 40 | Stationery | 100-page ruled notebook |
| Pen Pack | 30 | Stationery | Pack of 5 ballpoint pens |
| Batteries AA 4pk | 90 | Essentials | Alkaline AA batteries |
| Candy Pack | 25 | Snacks | Assorted fruit candies |
| Popcorn Pack | 45 | Snacks | Microwave popcorn, butter flavor |
| Mineral Water 500ml | 15 | Beverages | Small bottled water |
| Tissue Pack | 35 | Essentials | Pocket tissue pack |

Locations: QuickStop — "Powai, Mumbai"; Corner Store — "Malad West,
Mumbai"; 24/7 Shop — "Kandivali, Mumbai"; Metro Mart Express — "Dadar,
Mumbai". Ratings: vary 3.8-4.5.

- [ ] **Step 4: Alcohol — 4 stores × the 20-item Alcohol list**

UUID prefixes `b0900000` (The Wine Cellar), `b0a00000` (Craft Beer Co.),
`b0b00000` (Spirits & More), `b0c00000` (The Bottle Shop). All
`category_type = 'alcohol'`. Every store's 20 products:

| Item | Price | Category | Description |
|---|---|---|---|
| Red Wine Bottle | 1200 | Wine | Full-bodied red wine, 750ml |
| White Wine Bottle | 1100 | Wine | Crisp white wine, 750ml |
| Sparkling Wine | 1500 | Wine | Celebration sparkling wine, 750ml |
| Wine Opener Kit | 300 | Accessories | Corkscrew and foil cutter set |
| IPA Six-Pack | 650 | Beer | India pale ale, 6x330ml |
| Lager Six-Pack | 600 | Beer | Crisp lager, 6x330ml |
| Stout Bottle | 250 | Beer | Rich dark stout, 500ml |
| Beer Glass Set | 400 | Accessories | Set of 2 pint glasses |
| Whisky Bottle 750ml | 2200 | Spirits | Blended whisky |
| Vodka Bottle 750ml | 1400 | Spirits | Triple-distilled vodka |
| Rum Bottle 750ml | 1300 | Spirits | Dark spiced rum |
| Gin Bottle 750ml | 1600 | Spirits | London dry gin |
| Rose Wine Bottle | 1150 | Wine | Chilled rosé wine, 750ml |
| Champagne Bottle | 3200 | Wine | French-style champagne, 750ml |
| Cocktail Mixer Pack | 350 | Accessories | Assorted cocktail mixers |
| Wine Glass Set | 450 | Accessories | Set of 4 wine glasses |
| Craft Cider Bottle | 280 | Beer | Apple cider, 500ml |
| Tequila Bottle 750ml | 1800 | Spirits | 100% agave tequila |
| Bar Snacks Mix | 150 | Snacks | Salted nuts and pretzel mix |
| Ice Bucket | 500 | Accessories | Stainless steel ice bucket |

Locations: The Wine Cellar — "Lower Parel, Mumbai"; Craft Beer Co. —
"Worli, Mumbai"; Spirits & More — "Colaba, Mumbai"; The Bottle Shop —
"Fort, Mumbai". Ratings: vary 3.9-4.7.

- [ ] **Step 5: Verify no UUID collisions and correct row counts**

```bash
grep -c "b0[1-9a-c]00000-1111-1111-1111-111111111111" supabase/seed.sql
# Expect exactly 12
grep -c "'grocery'" supabase/seed.sql   # expect 4 (store rows) -- product rows don't repeat the literal category_type string
```

- [ ] **Step 6: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: seed Grocery, Convenience, and Alcohol stores and products (4 stores x 20 items each)"
```

---

## Task 3: Verify and document

**Files:** none — `docs/UserList.docx` regeneration is deferred to Phase 5
(covers all 3 content phases' vendor accounts at once).

- [ ] **Step 1: Full reset + build**

```bash
npx supabase db reset
npm run build
```

- [ ] **Step 2: Verify actual row counts hit the 75-100 target**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
select s.category_type, count(p.id) as product_count
from public.stores s join public.products p on p.store_id = s.id
where s.category_type in ('grocery','convenience','alcohol')
group by 1;
"
```
Expected: 80 for each of the 3 categories (4 stores × 20 items). If any
category is short, find the missing store/items and fix before
proceeding — this count check is the actual acceptance criterion for
this whole revised plan, not just a nice-to-have.

- [ ] **Step 3: Live verify**

```bash
npm run dev &
sleep 5
```
Load `http://localhost:3000/customer?category=grocery` — confirm 4 real
stores with real photos/names, and clicking into one shows 20 real
products. Repeat for `?category=convenience` and `?category=alcohol`.
Confirm `?category=health` (not yet seeded) still shows the clean empty
state.

Sign in as one new vendor (`fresh-mart@foodhub.local` / `demo1234`) at
`/vendor/login` and confirm the vendor dashboard loads that store
correctly.

- [ ] **Step 4: Update MEMORY.md**

Record: Phase 3 (Content A) complete — Grocery, Convenience, and Alcohol
categories now have real seeded stores/products: 4 stores each, every
store carrying its category's shared 20-item master catalog, ~80
products browsable per category (real row count confirmed via the query
in Step 2). Note this revised sizing (up from the original spec's
2-stores/3-5-products estimate) was per explicit user request for 75-100
items/category, referencing Uber Eats' own catalog depth. Note
`docs/UserList.docx` regeneration is deferred to Phase 5 (covers all 3
content phases' 12+16+12 = 40 new vendor accounts at once — see Phase
4/5 plans for their own store counts). Note Phases 4-5 (Health/Retail/
Personal Care/Electronics, then Pet/Flowers/Baby) are the remaining
follow-ons, same 4-stores/20-items sizing.

- [ ] **Step 5: Commit**

```bash
git add MEMORY.md
git commit -m "docs: record phase 3 content-a completion"
```
