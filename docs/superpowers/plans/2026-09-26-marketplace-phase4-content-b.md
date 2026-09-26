# Marketplace Phase 4 — Content B: Health, Retail, Personal Care, Electronics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed real, browsable stores and products for 4 categories —
Health, Retail, Personal Care, Electronics — reaching **75-100 browsable
products per category**, matching Uber Eats' own catalog depth per
explicit user request. 16 stores total (4 per category), each carrying
its category's full 20-item master catalog — 80 product rows per
category.

**Architecture:** Identical pattern to Phase 3 (now the established
pattern for this whole content-phase sequence) — pure `supabase/seed.sql`
addition, same fixed-UUID/`on conflict do nothing` idempotent insert
blocks, one 20-item master list per category shared across that
category's 4 stores. No schema or app code change.

**Tech Stack:** SQL (seed.sql), Pexels Search API via
`scripts/fetch-catalog-images.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-26-multi-vertical-marketplace-design.md`
(section 6, section 7 phase "Content phase B") — superseded on sizing by
this plan's 75-100-items-per-category target, per Phase 3's precedent.

## Global Constraints

- Follow Phase 3's exact established pattern (reread
  `docs/superpowers/plans/2026-09-26-marketplace-phase3-content-a.md`'s
  Task 2 worked example for the precise SQL block shape).
- **UUID prefix**: use `c0100000` through `c1000000` (hex, sixteen
  stores — 4 each for Health/Retail/Personal Care/Electronics) — a fresh
  range distinct from Phase 3's `b0...` prefixes and the original
  restaurants' `a0...` prefixes.
- **Every store in a category carries the SAME 20-item master list**
  given below.
- **Reuse one Pexels photo per item type across all 4 stores selling it.**
- All 16 vendor accounts use password `demo1234`.
- Zero schema/migration changes.
- Prices in rupees; ±10% per-store variation optional.

## Review Focus

- UUID collisions with Phase 3's `b0...` range or the original `a0...`
  range.
- `cuisine_tags`/`avg_prep_minutes` on these 16 stores — empty array and
  `null` respectively.
- Vendor `owner_id` wiring correctness.
- **Product count per category actually reaches ~80** — verify via the
  same count query as Phase 3's Task 3.
- Categories seeded by Phase 3 (Grocery/Convenience/Alcohol) must still
  show their data unaffected; categories not yet seeded (Pet/Flowers/
  Baby, Phase 5) must still show the clean empty state.

---

## Task 1: Fetch product/store images

**Files:** none created — feeds Task 2's SQL.

- [ ] **Step 1: Fetch banner + product photos (4 banner queries, then 20 product queries per category = 80 product photos total)**

```bash
node scripts/fetch-catalog-images.mjs \
  "pharmacy interior" "vitamin supplement shop" "medical store" "health store front" \
  "multivitamin tablets bottle" "pain relief gel tube" "adhesive bandages" "digital thermometer" \
  "vitamin c tablets" "protein powder container" "omega 3 capsules" "hand sanitizer bottle" \
  "blood pressure monitor" "face masks box" "cough syrup bottle" "antacid tablets" \
  "zinc supplements bottle" "calcium tablets bottle" "elastic bandage roll" "pulse oximeter" \
  "multivitamin gummies" "electrolyte powder sachets" "cotton balls bag" "antiseptic liquid bottle"

node scripts/fetch-catalog-images.mjs \
  "home goods store" "clothing store interior" "furniture home decor shop" "fashion boutique" \
  "bedsheet set folded" "non-stick frying pan" "storage basket" "table lamp" \
  "cotton t-shirt" "denim jeans" "ankle socks" "canvas tote bag" \
  "throw pillow cover" "kitchen knife set" "bath towel set" "wall clock" \
  "baseball cap" "woolen scarf" "laundry bag" "cutting board" \
  "umbrella stand" "sunglasses" "leather wallet" "yoga mat"

node scripts/fetch-catalog-images.mjs \
  "beauty cosmetics shop" "barber grooming shop" "skincare store" "pharmacy beauty aisle" \
  "facial cleanser bottle" "moisturizer jar" "sunscreen tube" "lip balm" \
  "disposable razor pack" "shaving cream can" "shampoo bottle" "deodorant spray" \
  "body wash bottle" "hair conditioner bottle" "face scrub jar" "toothpaste tube" \
  "toothbrush pack" "mouthwash bottle" "hair oil bottle" "nail polish bottle" \
  "makeup remover wipes" "hand cream tube" "perfume bottle" "talcum powder bottle"

node scripts/fetch-catalog-images.mjs \
  "electronics store" "gadget shop" "computer accessories store" "mobile phone shop" \
  "wired earphones" "usb-c cable" "power bank" "phone stand" \
  "bluetooth speaker" "phone case" "wireless mouse" "screen protector" \
  "wireless earbuds case" "usb flash drive" "laptop sleeve" "wireless keyboard" \
  "hdmi cable" "car phone mount" "smartwatch" "hd webcam" \
  "extension board socket" "led desk lamp" "portable ssd" "ring light"
```
Save the printed URLs for Task 2 — 16 banner photos + 80 product photos
needed (20 per category).

---

## Task 2: Seed data — Health, Retail, Personal Care, Electronics (4 stores × 20 items each, per category)

**Files:**
- Modify: `supabase/seed.sql`

**Interfaces:**
- Consumes: Task 1's fetched image URLs.
- Produces: 16 new `public.stores` rows (4 each of `'health'`,
  `'retail'`, `'personal_care'`, `'electronics'`), 320 new
  `public.products` rows (80 per category), 16 new vendor accounts.

- [ ] **Step 1: Health — 4 stores × this 20-item list**

Follow Phase 3's exact worked-example SQL pattern. UUID prefixes
`c0100000` (WellnessRx), `c0200000` (Vitamin Shop), `c0300000` (MedPlus
Pharmacy), `c0400000` (Care & Cure). All `category_type = 'health'`.
Locations: Vile Parle, Goregaon, Chembur, Kurla (Mumbai). Ratings vary
3.9-4.7.

| Item | Price | Category | Description |
|---|---|---|---|
| Multivitamin Tablets | 250 | Vitamins | Daily multivitamin, 60 tablets |
| Pain Relief Gel | 150 | First Aid | Fast-acting topical pain relief gel |
| Adhesive Bandages Pack | 80 | First Aid | Assorted sizes, 40 count |
| Digital Thermometer | 350 | Devices | Fast-read digital thermometer |
| Vitamin C Tablets | 200 | Vitamins | Immunity support, 500mg, 60 tablets |
| Protein Powder 500g | 900 | Supplements | Whey protein, chocolate flavor |
| Omega-3 Capsules | 450 | Supplements | Fish oil capsules, 90 count |
| Hand Sanitizer 200ml | 90 | First Aid | 70% alcohol hand sanitizer |
| Blood Pressure Monitor | 1800 | Devices | Digital BP monitor |
| Face Masks 3-ply 50pk | 250 | First Aid | Disposable face masks |
| Cough Syrup 100ml | 130 | Medicine | Herbal cough relief syrup |
| Antacid Tablets | 90 | Medicine | Fast-relief antacid tablets |
| Zinc Supplements | 220 | Vitamins | Immune support zinc tablets |
| Calcium Tablets | 240 | Vitamins | Bone health calcium + D3 |
| Elastic Bandage Roll | 60 | First Aid | Compression bandage roll |
| Pulse Oximeter | 900 | Devices | Fingertip oxygen saturation monitor |
| Multivitamin Gummies | 300 | Vitamins | Kids' chewable multivitamins |
| Electrolyte Powder Sachets | 150 | Supplements | Oral rehydration salts |
| Cotton Balls 100pc | 60 | First Aid | Sterile cotton balls |
| Antiseptic Liquid 200ml | 110 | First Aid | Wound cleaning antiseptic |

- [ ] **Step 2: Retail — 4 stores × this 20-item list**

UUID prefixes `c0500000` (Home Essentials), `c0600000` (Fashion Hub),
`c0700000` (Urban Living), `c0800000` (Style Bazaar). All
`category_type = 'retail'`. Locations: Andheri East, Borivali, Thane
West, Mulund. Ratings vary 3.8-4.6.

| Item | Price | Category | Description |
|---|---|---|---|
| Cotton Bedsheet Set | 800 | Home | Queen-size bedsheet with 2 pillow covers |
| Non-stick Frying Pan | 650 | Kitchen | 26cm non-stick frying pan |
| Storage Basket | 300 | Home | Woven storage basket, medium |
| Table Lamp | 550 | Home | Bedside table lamp with fabric shade |
| Cotton T-Shirt | 399 | Clothing | Crew-neck cotton t-shirt |
| Denim Jeans | 1200 | Clothing | Slim-fit denim jeans |
| Ankle Socks 3-pack | 199 | Clothing | Cotton ankle socks, pack of 3 |
| Canvas Tote Bag | 350 | Accessories | Durable canvas tote bag |
| Throw Pillow Cover | 250 | Home | Decorative cushion cover |
| Kitchen Knife Set | 750 | Kitchen | 5-piece stainless steel knife set |
| Bath Towel Set | 600 | Home | Set of 2 cotton bath towels |
| Wall Clock | 450 | Home | Round analog wall clock |
| Baseball Cap | 299 | Clothing | Adjustable cotton cap |
| Woolen Scarf | 350 | Clothing | Soft woolen winter scarf |
| Laundry Bag | 200 | Home | Mesh laundry storage bag |
| Cutting Board | 280 | Kitchen | Bamboo cutting board |
| Umbrella Stand | 400 | Home | Metal umbrella stand |
| Sunglasses | 550 | Accessories | UV-protection sunglasses |
| Leather Wallet | 650 | Accessories | Genuine leather bifold wallet |
| Yoga Mat | 500 | Fitness | Non-slip yoga mat, 6mm |

- [ ] **Step 3: Personal Care — 4 stores × this 20-item list**

UUID prefixes `c0900000` (Glow Beauty), `c0a00000` (Grooming Co.),
`c0b00000` (Beauty Bar), `c0c00000` (Pure Skin). All
`category_type = 'personal_care'`. Locations: Juhu, Santacruz, Khar,
Bandra West. Ratings vary 3.9-4.7.

| Item | Price | Category | Description |
|---|---|---|---|
| Facial Cleanser | 280 | Skincare | Gentle daily facial cleanser, 100ml |
| Moisturizer 50ml | 350 | Skincare | Hydrating face moisturizer |
| Sunscreen SPF50 | 400 | Skincare | Broad-spectrum SPF50 sunscreen |
| Lip Balm | 120 | Skincare | Moisturizing lip balm |
| Disposable Razor Pack | 150 | Grooming | Pack of 5 disposable razors |
| Shaving Cream | 180 | Grooming | Smooth shaving cream, 100g |
| Shampoo 200ml | 220 | Grooming | Everyday clarifying shampoo |
| Deodorant Spray | 190 | Grooming | 24-hour protection deodorant spray |
| Body Wash 250ml | 210 | Skincare | Moisturizing body wash |
| Conditioner 200ml | 230 | Grooming | Nourishing hair conditioner |
| Face Scrub 100g | 260 | Skincare | Exfoliating face scrub |
| Toothpaste 150g | 90 | Oral Care | Whitening toothpaste |
| Toothbrush 2-pack | 80 | Oral Care | Soft-bristle toothbrushes |
| Mouthwash 250ml | 150 | Oral Care | Antibacterial mouthwash |
| Hair Oil 200ml | 180 | Grooming | Nourishing coconut hair oil |
| Nail Polish | 120 | Beauty | Long-lasting nail polish |
| Makeup Remover Wipes | 140 | Skincare | Gentle makeup remover wipes |
| Hand Cream 75ml | 160 | Skincare | Moisturizing hand cream |
| Perfume 50ml | 900 | Fragrance | Eau de parfum, 50ml |
| Talcum Powder 200g | 100 | Skincare | Cooling talcum powder |

- [ ] **Step 4: Electronics — 4 stores × this 20-item list**

UUID prefixes `c0d00000` (TechZone), `c0e00000` (Gadget World),
`c0f00000` (Digital Hub), `c1000000` (CircuitPoint). All
`category_type = 'electronics'`. Locations: Powai, Malad West, Ghatkopar,
Vikhroli. Ratings vary 3.9-4.6.

| Item | Price | Category | Description |
|---|---|---|---|
| Wired Earphones | 499 | Audio | In-ear wired earphones with mic |
| USB-C Charging Cable | 299 | Accessories | 1m fast-charging USB-C cable |
| Power Bank 10000mAh | 1299 | Accessories | Compact fast-charge power bank |
| Phone Stand | 199 | Accessories | Adjustable desktop phone stand |
| Bluetooth Speaker | 1499 | Audio | Portable Bluetooth speaker |
| Phone Case | 249 | Accessories | Shockproof phone case |
| Wireless Mouse | 599 | Computer Accessories | Ergonomic wireless mouse |
| Screen Protector | 149 | Accessories | Tempered glass screen protector |
| Wireless Earbuds | 1999 | Audio | True wireless earbuds with case |
| USB Flash Drive 64GB | 599 | Storage | High-speed USB 3.0 flash drive |
| Laptop Sleeve | 799 | Accessories | Padded 14-inch laptop sleeve |
| Keyboard Wireless | 899 | Computer Accessories | Compact wireless keyboard |
| HDMI Cable 2m | 349 | Accessories | High-speed HDMI cable |
| Car Phone Mount | 399 | Accessories | Dashboard phone mount |
| Smartwatch | 2999 | Wearables | Fitness tracking smartwatch |
| Webcam HD | 1499 | Computer Accessories | 1080p HD webcam |
| Extension Board | 549 | Accessories | 6-socket surge-protected extension |
| LED Desk Lamp | 699 | Accessories | USB-powered LED desk lamp |
| Portable SSD 500GB | 3499 | Storage | Compact external SSD |
| Selfie Ring Light | 649 | Accessories | USB-powered ring light with stand |

- [ ] **Step 5: Verify no UUID collisions**

```bash
grep -c "c0[1-9a-f]00000-1111-1111-1111-111111111111\|c1000000-1111-1111-1111-111111111111" supabase/seed.sql
# Expect exactly 16
```

- [ ] **Step 6: Commit**

```bash
git add supabase/seed.sql
git commit -m "feat: seed Health, Retail, Personal Care, and Electronics stores and products (4 stores x 20 items each)"
```

---

## Task 3: Verify and document

**Files:** none.

- [ ] **Step 1: Full reset + build**

```bash
npx supabase db reset
npm run build
```

- [ ] **Step 2: Verify actual row counts hit the target**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
select s.category_type, count(p.id) as product_count
from public.stores s join public.products p on p.store_id = s.id
where s.category_type in ('health','retail','personal_care','electronics')
group by 1;
"
```
Expected: 80 for each of the 4 categories. Fix before proceeding if any
category falls short.

- [ ] **Step 3: Live verify**

```bash
npm run dev &
sleep 5
```
Load each of `?category=health`, `?category=retail`,
`?category=personal_care`, `?category=electronics` and confirm 4 real
stores each, and that clicking into one shows 20 real products. Confirm
`?category=grocery`/`convenience`/`alcohol` still show Phase 3's data
unaffected, and `?category=pet` (not yet seeded) still shows the clean
empty state.

Sign in as one new vendor (`wellness-rx@foodhub.local` / `demo1234`) and
confirm the vendor dashboard loads that store correctly.

- [ ] **Step 4: Update MEMORY.md**

Record: Phase 4 (Content B) complete — Health, Retail, Personal Care, and
Electronics categories now have real seeded stores/products: 4 stores
each, every store carrying its category's shared 20-item master catalog,
~80 products browsable per category (real row count confirmed). Note
Phase 5 (Pet/Flowers/Baby) is the last remaining content follow-on, after
which `docs/UserList.docx` should be regenerated once with all 40 new
vendor accounts from Phases 3-5 together.

- [ ] **Step 5: Commit**

```bash
git add MEMORY.md
git commit -m "docs: record phase 4 content-b completion"
```
