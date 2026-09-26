# Marketplace Phase 3 — Content A: Grocery, Convenience, Alcohol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed real, browsable stores and products for 3 categories —
Grocery, Convenience, Alcohol — so `/customer?category=grocery` (etc.,
from Phase 2) shows real data instead of the empty state. 6 stores total
(2 per category), each with 4 real products, real Pexels photos, and its
own vendor login account.

**Architecture:** Pure seed-data addition to `supabase/seed.sql`,
following the exact pattern already established for restaurants (fixed
UUIDs, `auth.users`/`auth.identities`/`public.users`/`public.addresses`/
`public.stores`/`public.products` insert blocks, all `on conflict (id) do
nothing` for idempotency). No schema change — `category_type` and
`product_attributes` already support any category (Phase 1). No app code
change — Phase 2's category filtering already works for any
`category_type` value with data behind it.

**Tech Stack:** SQL (seed.sql), Pexels Search API via the existing
`scripts/fetch-catalog-images.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-26-multi-vertical-marketplace-design.md`
(section 6, section 7 phase "Content phase A")

## Global Constraints

- **Follow the existing seed.sql pattern exactly** — same UUID-block
  style, same `on conflict (id) do nothing` idempotency, same comment
  style crediting Pexels for images. Do not introduce a different
  insertion style (e.g. a separate seed file, a different auth-account
  creation approach) for this content.
- **UUID prefix**: use `b0100000` through `b0600000` (hex, six stores) for
  store ids and matching vendor-user ids, to avoid any collision with the
  existing `a0...`-prefixed restaurant rows or Phase 1's own fixed ids —
  see the worked example below for the exact scheme.
- **All 6 vendor accounts use password `demo1234`**, matching every other
  seeded vendor in this project.
- **Zero schema/migration changes** — this phase is data-only.
- **Product prices are in the same numeric unit as existing `products.price`**
  (rupees, e.g. `60` means ₹60 — check an existing product row if
  unsure, don't introduce paise here since the column itself isn't
  paise-typed).

## Review Focus

- **UUID collisions** — verify no id in this phase's inserts already
  exists in `seed.sql` today (the `on conflict do nothing` makes a
  collision silently a no-op rather than an error, which would look like
  "it worked" while actually inserting nothing — grep for each new UUID
  before trusting the insert ran).
- **`cuisine_tags` on non-restaurant stores** — must be an empty array
  (`array[]::text[]`), not null (the column is `not null default '{}'`)
  and not a made-up cuisine slug (the `cuisine_taxonomy` FK-style check
  constraint only allows real taxonomy slugs, all restaurant-specific).
- **`avg_prep_minutes` on non-restaurant stores** — pass `null` explicitly
  (Phase 1 made the column nullable specifically for this); don't invent
  a prep-time number for a grocery store.
- **A vendor login that doesn't resolve to its store** — `resolveVendorStore()`
  (Phase 1) looks up `stores.owner_id = <vendor's auth id>`; verify each
  new store's `owner_id` matches its paired `auth.users` row exactly, or
  that vendor's login will show "No store found for this vendor".
- **The Phase 2 empty-state regression check**: after this phase, Alcohol
  is no longer empty, but Health/Retail/Pet/etc. still are (Phases 4-5
  haven't landed) — confirm those categories still show the clean empty
  state, not a broken partial render now that SOME non-restaurant data
  exists in the table.

---

## Task 1: Fetch product/store images

**Files:** none created — this task's output feeds Task 2's SQL.

- [ ] **Step 1: Fetch banner + product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "grocery store front" "supermarket aisle" \
  "milk carton" "bread loaf" "eggs carton" "rice bag" \
  "bananas fruit" "tomatoes" "potato chips bag" "orange juice bottle" \
  "convenience store" "corner store shop" \
  "bottled water" "instant noodles" "chocolate bar" "energy drink can" \
  "newspaper" "chewing gum" "biscuits pack" "ice cream cup" \
  "wine cellar shop" "craft beer brewery" \
  "red wine bottle" "white wine bottle" "sparkling wine bottle" "wine opener" \
  "beer six pack" "lager beer" "stout beer bottle" "beer glass"
```
Save the printed URLs somewhere you can reference while writing Task 2's
SQL (a scratch file is fine, don't commit it) — you'll need one banner
photo per store (6) and one product photo per product (24).

---

## Task 2: Seed data — Grocery, Convenience, Alcohol

**Files:**
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: Task 1's fetched image URLs.
- Produces: 6 new rows in `public.stores` (`category_type` one of
  `'grocery'`, `'convenience'`, `'alcohol'`), 24 new rows in
  `public.products`, 6 new vendor accounts.

- [ ] **Step 1: Worked example — follow this exact pattern for every store/product below**

Append to `supabase/seed.sql` (after the existing restaurant catalog
section), starting with this fully-worked first store:

```sql
-- Phase 3 (Content A): Grocery, Convenience, Alcohol categories.
-- Images from Pexels, fetched once via scripts/fetch-catalog-images.mjs
-- and hardcoded here, same pattern as the restaurant catalog above.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'b0100000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'fresh-mart@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'b0100000-1111-1111-1111-111111111111', 'email', 'b0100000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'b0100000-1111-1111-1111-111111111111', 'email', 'fresh-mart@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('b0100000-1111-1111-1111-111111111111', 'vendor', 'Fresh Mart Owner', null) on conflict (id) do nothing;
insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values ('b0100000-2222-2222-2222-222222222222', 'b0100000-1111-1111-1111-111111111111', 'store', 'Andheri West, Mumbai', 19.1197, 72.8468, true) on conflict (id) do nothing;
insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, category_type, banner_url) values ('b0100000-3333-3333-3333-333333333333', 'b0100000-1111-1111-1111-111111111111', 'Fresh Mart', array[]::text[], 'b0100000-2222-2222-2222-222222222222', 19.1197, 72.8468, true, null, 4.3, 'grocery', '<paste "grocery store front" or "supermarket aisle" Pexels URL>') on conflict (id) do nothing;
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('b0100000-4444-4444-4444-000000000001', 'b0100000-3333-3333-3333-333333333333', 'Milk 1L', 'Fresh whole milk, 1 litre', 60, 'Dairy', '{}'::jsonb, true, '<paste "milk carton" URL>'),
  ('b0100000-4444-4444-4444-000000000002', 'b0100000-3333-3333-3333-333333333333', 'Brown Bread', 'Whole wheat sandwich loaf', 45, 'Bakery', '{}'::jsonb, true, '<paste "bread loaf" URL>'),
  ('b0100000-4444-4444-4444-000000000003', 'b0100000-3333-3333-3333-333333333333', 'Farm Eggs (12pc)', 'Dozen fresh farm eggs', 90, 'Dairy', '{}'::jsonb, true, '<paste "eggs carton" URL>'),
  ('b0100000-4444-4444-4444-000000000004', 'b0100000-3333-3333-3333-333333333333', 'Basmati Rice 1kg', 'Premium long-grain basmati rice', 120, 'Staples', '{}'::jsonb, true, '<paste "rice bag" URL>')
on conflict (id) do nothing;
```

Replace every `<paste ... URL>` with a real Pexels URL from Task 1 before
committing.

- [ ] **Step 2: Repeat the exact same pattern for the remaining 5 stores**

Use UUID prefixes `b0200000` (Daily Basket), `b0300000` (QuickStop),
`b0400000` (Corner Store), `b0500000` (The Wine Cellar), `b0600000`
(Craft Beer Co.) — same id-suffix scheme as the worked example
(`-1111...` for the vendor user, `-2222...` for the address, `-3333...`
for the store, `-4444-4444-4444-000000000001` through `...004` for its 4
products).

| Store (prefix) | Email | category_type | cuisine_tags | Products (name — price — category — description) |
|---|---|---|---|---|
| Daily Basket (`b0200000`) | `daily-basket@foodhub.local` | `grocery` | `array[]::text[]` | Bananas 1dz — 50 — Produce — Fresh ripe bananas, dozen; Tomatoes 1kg — 40 — Produce — Farm-fresh tomatoes, 1kg; Potato Chips — 30 — Snacks — Classic salted potato chips; Orange Juice 1L — 110 — Beverages — 100% pure orange juice |
| QuickStop (`b0300000`) | `quickstop@foodhub.local` | `convenience` | `array[]::text[]` | Bottled Water 1L — 20 — Beverages — Purified drinking water; Instant Noodles — 25 — Snacks — Spicy instant noodle cup; Chocolate Bar — 40 — Snacks — Milk chocolate bar; Energy Drink — 80 — Beverages — Caffeinated energy drink, 250ml |
| Corner Store (`b0400000`) | `corner-store@foodhub.local` | `convenience` | `array[]::text[]` | Newspaper — 10 — Reading — Daily English newspaper; Chewing Gum — 15 — Snacks — Mint chewing gum pack; Biscuits Pack — 35 — Snacks — Assorted cream biscuits; Ice Cream Cup — 50 — Frozen — Vanilla ice cream cup, 100ml |
| The Wine Cellar (`b0500000`) | `wine-cellar@foodhub.local` | `alcohol` | `array[]::text[]` | Red Wine Bottle — 1200 — Wine — Full-bodied red wine, 750ml; White Wine Bottle — 1100 — Wine — Crisp white wine, 750ml; Sparkling Wine — 1500 — Wine — Celebration sparkling wine, 750ml; Wine Opener Kit — 300 — Accessories — Corkscrew and foil cutter set |
| Craft Beer Co. (`b0600000`) | `craft-beer-co@foodhub.local` | `alcohol` | `array[]::text[]` | IPA Six-Pack — 650 — Beer — India pale ale, 6x330ml; Lager Six-Pack — 600 — Beer — Crisp lager, 6x330ml; Stout Bottle — 250 — Beer — Rich dark stout, 500ml; Beer Glass Set — 400 — Accessories — Set of 2 pint glasses |

Full names and locations for the remaining stores' `addresses`/`stores`
rows (lat/lng — reuse Mumbai-area coordinates spread out like the
existing restaurant catalog does, e.g. 19.05-19.20 lat, 72.83-72.95 lng —
pick a distinct plausible value per store, not all identical):
- Daily Basket: "Bandra East, Mumbai"
- QuickStop: "Powai, Mumbai"
- Corner Store: "Malad West, Mumbai"
- The Wine Cellar: "Lower Parel, Mumbai"
- Craft Beer Co.: "Worli, Mumbai"

Ratings: give each store a plausible 3.9-4.6 rating (vary them, don't
copy the same number 6 times).

- [ ] **Step 3: Verify no UUID collisions**

```bash
grep -c "b0[1-6]00000-1111-1111-1111-111111111111" supabase/seed.sql
# Expect exactly 6 (one insert each, not duplicated, not colliding with
# any pre-existing id)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: seed Grocery, Convenience, and Alcohol stores and products"
```

---

## Task 3: Verify and document

**Files:**
- Modify: `docs/UserList.docx` — no code change here, just note in your
  report that this doc is now stale (lists only the original restaurant
  vendors) and should be regenerated; regenerating a .docx isn't
  practical mid-plan for an agent without the docx tooling context from
  the original session, so this task does NOT edit UserList.docx itself,
  just flags it in the report and in Step 3's MEMORY.md note.

- [ ] **Step 1: Full reset + build**

```bash
npx supabase db reset
npm run build
```

- [ ] **Step 2: Live verify**

```bash
npm run dev &
sleep 5
```
Load `http://localhost:3000/customer?category=grocery` — confirm 2 real
stores (Fresh Mart, Daily Basket) with real photos and names, not the
empty state. Repeat for `?category=convenience` (QuickStop, Corner
Store) and `?category=alcohol` (The Wine Cellar, Craft Beer Co.). Click
into one store, confirm its 4 products render with real names/prices/
photos. Confirm `?category=health` (not yet seeded) still shows the
clean empty state from Phase 2, not broken by this phase's changes.

Sign in as one new vendor (`fresh-mart@foodhub.local` / `demo1234`) at
`/vendor/login` and confirm the vendor dashboard loads that store
correctly (proves `owner_id` wiring is correct, per this task's Review
Focus item).

- [ ] **Step 3: Update MEMORY.md**

Record: Phase 3 (Content A) complete — Grocery, Convenience, and Alcohol
categories now have real seeded stores/products (2 stores each, 4
products each, real Pexels photos, dedicated vendor accounts). Note
`docs/UserList.docx` is now stale (doesn't list these 6 new vendor
accounts) and should be regenerated once all 3 content phases are done,
rather than 3 times incrementally. Note Phases 4-5 (Health/Retail/
Personal Care/Electronics, then Pet/Flowers/Baby) are the remaining
follow-ons.

- [ ] **Step 4: Commit**

```bash
git add MEMORY.md
git commit -m "docs: record phase 3 content-a completion"
```
