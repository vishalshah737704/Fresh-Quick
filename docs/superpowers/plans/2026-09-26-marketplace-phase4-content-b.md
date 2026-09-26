# Marketplace Phase 4 — Content B: Health, Retail, Personal Care, Electronics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed real, browsable stores and products for 4 categories —
Health, Retail, Personal Care, Electronics — so those `/customer?category=...`
views (from Phase 2) show real data instead of the empty state. 8 stores
total (2 per category), each with 4 real products, real Pexels photos,
and its own vendor login account.

**Architecture:** Identical pattern to Phase 3 — pure `supabase/seed.sql`
addition, same fixed-UUID/`on conflict do nothing` idempotent insert
blocks. No schema or app code change.

**Tech Stack:** SQL (seed.sql), Pexels Search API via
`scripts/fetch-catalog-images.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-26-multi-vertical-marketplace-design.md`
(section 6, section 7 phase "Content phase B")

## Global Constraints

- Follow the existing seed.sql pattern exactly — same as Phase 3's Task
  2 worked example (reread `docs/superpowers/plans/2026-09-26-marketplace-phase3-content-a.md`
  Task 2 if this plan runs before or after Phase 3's own PR merges, for
  the exact block shape).
- **UUID prefix**: use `c0100000` through `c0800000` (hex, eight stores)
  — a fresh range distinct from Phase 3's `b0...` prefixes and the
  original restaurants' `a0...` prefixes.
- All 8 vendor accounts use password `demo1234`.
- Zero schema/migration changes — data-only.
- Prices in the same numeric unit as existing `products.price` (rupees).

## Review Focus

- **UUID collisions** with Phase 3's `b0...` range or the original `a0...`
  range — grep before trusting an insert ran.
- **`cuisine_tags`/`avg_prep_minutes`** on these 8 stores — empty array
  and `null` respectively, same as Phase 3.
- **Vendor `owner_id` wiring** — each store's `owner_id` must match its
  paired `auth.users` row.
- **Categories seeded by Phase 3 (Grocery/Convenience/Alcohol) must still
  show their Phase-3 data unaffected** — this phase only adds rows, never
  modifies/deletes Phase 3's.
- **Categories NOT yet seeded (Pet/Flowers/Baby, Phase 5)** must still
  show the clean empty state after this phase lands.

---

## Task 1: Fetch product/store images

**Files:** none created — feeds Task 2's SQL.

- [ ] **Step 1: Fetch banner + product photos**

```bash
node scripts/fetch-catalog-images.mjs \
  "pharmacy interior" "vitamin supplement shop" \
  "multivitamin tablets bottle" "pain relief gel tube" "adhesive bandages" "digital thermometer" \
  "vitamin c tablets" "protein powder container" "omega 3 capsules" "hand sanitizer bottle" \
  "home goods store" "clothing store interior" \
  "bedsheet set folded" "non-stick frying pan" "storage basket" "table lamp" \
  "cotton t-shirt" "denim jeans" "ankle socks" "canvas tote bag" \
  "beauty cosmetics shop" "barber grooming shop" \
  "facial cleanser bottle" "moisturizer jar" "sunscreen tube" "lip balm" \
  "disposable razor pack" "shaving cream can" "shampoo bottle" "deodorant spray" \
  "electronics store" "gadget shop" \
  "wired earphones" "usb-c cable" "power bank" "phone stand" \
  "bluetooth speaker" "phone case" "wireless mouse" "screen protector"
```
Save the printed URLs for use in Task 2 — 8 banner photos + 32 product
photos needed.

---

## Task 2: Seed data — Health, Retail, Personal Care, Electronics

**Files:**
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: Task 1's fetched image URLs.
- Produces: 8 new `public.stores` rows (`category_type` one of
  `'health'`, `'retail'`, `'personal_care'`, `'electronics'`), 32 new
  `public.products` rows, 8 new vendor accounts.

- [ ] **Step 1: Follow Phase 3's exact worked-example pattern**

For the precise SQL block shape (the `auth.users`/`auth.identities`/
`public.users`/`public.addresses`/`public.stores`/`public.products`
insert sequence, comment style, `on conflict do nothing` usage), copy the
pattern from `docs/superpowers/plans/2026-09-26-marketplace-phase3-content-a.md`'s
Task 2 Step 1 worked example — same structure, just this phase's data
below. Use UUID suffix scheme `-1111...` (vendor user), `-2222...`
(address), `-3333...` (store), `-4444-4444-4444-000000000001..004`
(its 4 products), under each store's own `c0X00000` prefix.

Append a header comment before this phase's block:
```sql
-- Phase 4 (Content B): Health, Retail, Personal Care, Electronics
-- categories. Images from Pexels, fetched once via
-- scripts/fetch-catalog-images.mjs and hardcoded here, same pattern as
-- the restaurant catalog and Phase 3's grocery/convenience/alcohol block.
```

- [ ] **Step 2: Write all 8 stores and 32 products**

| Store (prefix) | Email | category_type | Address (city area, Mumbai) | Products (name — price — category — description) |
|---|---|---|---|---|
| WellnessRx (`c0100000`) | `wellness-rx@foodhub.local` | `health` | Vile Parle, Mumbai | Multivitamin Tablets — 250 — Vitamins — Daily multivitamin, 60 tablets; Pain Relief Gel — 150 — First Aid — Fast-acting topical pain relief gel; Adhesive Bandages Pack — 80 — First Aid — Assorted sizes, 40 count; Digital Thermometer — 350 — Devices — Fast-read digital thermometer |
| Vitamin Shop (`c0200000`) | `vitamin-shop@foodhub.local` | `health` | Goregaon, Mumbai | Vitamin C Tablets — 200 — Vitamins — Immunity support, 500mg, 60 tablets; Protein Powder 500g — 900 — Supplements — Whey protein, chocolate flavor; Omega-3 Capsules — 450 — Supplements — Fish oil capsules, 90 count; Hand Sanitizer 200ml — 90 — First Aid — 70% alcohol hand sanitizer |
| Home Essentials (`c0300000`) | `home-essentials@foodhub.local` | `retail` | Chembur, Mumbai | Cotton Bedsheet Set — 800 — Home — Queen-size bedsheet with 2 pillow covers; Non-stick Frying Pan — 650 — Kitchen — 26cm non-stick frying pan; Storage Basket — 300 — Home — Woven storage basket, medium; Table Lamp — 550 — Home — Bedside table lamp with fabric shade |
| Fashion Hub (`c0400000`) | `fashion-hub@foodhub.local` | `retail` | Kurla, Mumbai | Cotton T-Shirt — 399 — Clothing — Crew-neck cotton t-shirt; Denim Jeans — 1200 — Clothing — Slim-fit denim jeans; Ankle Socks 3-pack — 199 — Clothing — Cotton ankle socks, pack of 3; Canvas Tote Bag — 350 — Accessories — Durable canvas tote bag |
| Glow Beauty (`c0500000`) | `glow-beauty@foodhub.local` | `personal_care` | Juhu, Mumbai | Facial Cleanser — 280 — Skincare — Gentle daily facial cleanser, 100ml; Moisturizer 50ml — 350 — Skincare — Hydrating face moisturizer; Sunscreen SPF50 — 400 — Skincare — Broad-spectrum SPF50 sunscreen; Lip Balm — 120 — Skincare — Moisturizing lip balm |
| Grooming Co. (`c0600000`) | `grooming-co@foodhub.local` | `personal_care` | Santacruz, Mumbai | Disposable Razor Pack — 150 — Grooming — Pack of 5 disposable razors; Shaving Cream — 180 — Grooming — Smooth shaving cream, 100g; Shampoo 200ml — 220 — Grooming — Everyday clarifying shampoo; Deodorant Spray — 190 — Grooming — 24-hour protection deodorant spray |
| TechZone (`c0700000`) | `techzone@foodhub.local` | `electronics` | Andheri East, Mumbai | Wired Earphones — 499 — Audio — In-ear wired earphones with mic; USB-C Charging Cable — 299 — Accessories — 1m fast-charging USB-C cable; Power Bank 10000mAh — 1299 — Accessories — Compact fast-charge power bank; Phone Stand — 199 — Accessories — Adjustable desktop phone stand |
| Gadget World (`c0800000`) | `gadget-world@foodhub.local` | `electronics` | Borivali, Mumbai | Bluetooth Speaker — 1499 — Audio — Portable Bluetooth speaker; Phone Case — 249 — Accessories — Shockproof phone case; Wireless Mouse — 599 — Computer Accessories — Ergonomic wireless mouse; Screen Protector — 149 — Accessories — Tempered glass screen protector |

Ratings: give each store a plausible 3.9-4.7 rating, varied per store
(don't repeat the same number). Lat/lng: pick distinct plausible Mumbai
coordinates per store (spread across roughly 19.05-19.25 lat,
72.83-72.95 lng), matching the areas named in the address column.

- [ ] **Step 3: Verify no UUID collisions**

```bash
grep -c "c0[1-8]00000-1111-1111-1111-111111111111" supabase/seed.sql
# Expect exactly 8
```

- [ ] **Step 4: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: seed Health, Retail, Personal Care, and Electronics stores and products"
```

---

## Task 3: Verify and document

**Files:** none.

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
Load each of `?category=health`, `?category=retail`,
`?category=personal_care`, `?category=electronics` and confirm 2 real
stores each with real photos/names/prices, not the empty state. Click
into one store from each category, confirm its 4 products render
correctly. Confirm `?category=grocery`/`convenience`/`alcohol` still show
Phase 3's data unaffected, and `?category=pet` (not yet seeded) still
shows the clean empty state.

Sign in as one new vendor (`wellness-rx@foodhub.local` / `demo1234`) at
`/vendor/login` and confirm the vendor dashboard loads that store
correctly.

- [ ] **Step 3: Update MEMORY.md**

Record: Phase 4 (Content B) complete — Health, Retail, Personal Care, and
Electronics categories now have real seeded stores/products (2 stores
each, 4 products each). Note Phase 5 (Pet/Flowers/Baby) is the last
remaining content follow-on, after which `docs/UserList.docx` should be
regenerated once with all new vendor accounts from Phases 3-5 together.

- [ ] **Step 4: Commit**

```bash
git add MEMORY.md
git commit -m "docs: record phase 4 content-b completion"
```
