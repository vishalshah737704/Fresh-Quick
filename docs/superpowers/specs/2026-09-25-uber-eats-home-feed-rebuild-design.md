# Uber Eats-style redesign — Piece 2: Home/Feed Rebuild

## Context

Piece 2 of the 6-piece Uber Eats-parity redesign (piece 1, design
tokens, is merged — see `docs/superpowers/specs/2026-09-25-uber-eats-design-refresh-design.md`
for the colors/fonts/shape rules this piece inherits and must keep
using). This piece brings the customer home/feed page
(`app/customer/page.tsx`) toward Uber Eats' feed: a live search
dropdown, a sort/filter bar, three curated carousel sections, and a
richer restaurant card — all based on live research of
`ubereats.com/feed` (2026-09-25, see piece 1's spec for the research
summary) and refined through a brainstorm session covering exactly what
this project's data can support without fabricating content.

**Scope grew beyond "visual only" during brainstorming**: Uber Eats
shows per-restaurant delivery fee and promo badges, which this project's
`restaurants` table has no columns for. Rather than fake that data or
skip it, this piece adds two real columns (`delivery_fee_paise`,
`promo_text`), a vendor-facing UI to set them, and wires checkout to use
the real per-restaurant fee instead of the current flat ₹30 constant.
That makes this piece touch the vendor and checkout surfaces, not just
the home page — flagged here so it's not a surprise mid-plan.

## Approved design

### 1. Data model

Migration adds two nullable-safe columns to `public.restaurants`:

```sql
alter table public.restaurants
  add column delivery_fee_paise integer not null default 3000,
  add column promo_text text;

alter table public.restaurants
  add constraint restaurants_delivery_fee_paise_check check (delivery_fee_paise >= 0);
```

`3000` paise = ₹30, matching the current flat fee exactly, so every
existing restaurant keeps today's checkout total with zero data
migration needed beyond the `default`. `promo_text` is free-form vendor-
set text (e.g. `"25% off ₹150+"`) — display only, not a real discount
engine; no coupon/validation logic reads or enforces it anywhere.

No RLS changes needed: `restaurants` already has a public-read policy
(`public_can_read_restaurants`) covering all columns, and writes go
through the existing service-role-backed `/api/vendor/restaurant` route
(see Known deferred items in MEMORY.md re: RLS write policies — this
follows the project's existing "service-role API route only" pattern,
never a direct client RLS write policy for this table).

### 2. Vendor dashboard

`app/vendor/dashboard/page.tsx` gains two fields alongside the existing
open/close toggle: a delivery-fee rupee number input and an optional
promo-text input, each with its own "Save" action (mirroring the
existing toggle's fetch-then-`PATCH` pattern). `PATCH
/api/vendor/restaurant` extends its existing body-validation branch
(currently only validates `isOpen`) to also accept `deliveryFeeRupees`
(number, converted to paise server-side, rejected if negative or
non-finite) and `promoText` (string or null, trimmed, empty string
normalized to `null`).

### 3. Checkout wiring

`app/api/cart/checkout/route.ts`'s existing restaurant lookup (currently
`select("id, is_open, is_suspended")`) extends to also select
`delivery_fee_paise`. `deliveryFeePaise` (currently
`Math.round(DELIVERY_FEE_RUPEES * 100)`) becomes
`restaurant.delivery_fee_paise` directly — already an integer, no
rounding needed. The RPC call's `p_delivery_fee` argument changes from
the `DELIVERY_FEE_RUPEES` constant to `deliveryFeePaise / 100`, matching
the existing rupee-at-the-boundary pattern the route already uses for
`p_subtotal`/`p_total`.

`app/customer/checkout/page.tsx` fetches the current restaurant's
`delivery_fee_paise` (a small `supabase.from("restaurants").select(...)`
keyed by `useCart()`'s existing `restaurantId`, same pattern used
elsewhere in this codebase) and uses it in place of the
`DELIVERY_FEE_RUPEES` constant for both the displayed "Delivery fee: ₹X"
line and the `total` calculation.

`DELIVERY_FEE_RUPEES` in `lib/order-constants.ts` stays only as
documentation of the column's default value (or is removed entirely if
its only remaining reference becomes the migration's literal `3000` —
decide during planning whichever reads clearer) — it must not remain as
logic anywhere after this piece.

### 4. Restaurant card redesign

`components/RestaurantCard.tsx` restructures its info block (the image
block's rating badge stays, per piece 1's already-updated hover-shadow
styling — untouched here) to a single metadata line matching Uber Eats'
"•"-delimited pattern:

```
⭐ 4.4 · 25 min · ₹30 Delivery Fee
```

(`₹0 Delivery Fee` renders in the accent green when `delivery_fee_paise`
is `0`, matching Uber's "free delivery" emphasis — every other value
renders in the normal muted-ink metadata color.) When `promo_text` is
set, it renders as a small accent-colored badge directly above the
restaurant name (same visual slot Uber Eats uses), absent entirely when
`null`. No favorite/heart icon — this project has no favorites feature,
and adding one is out of scope for a redesign piece (flagged and
declined during brainstorming).

### 5. Search dropdown

`components/HeaderSearchBox.tsx` gains a controlled-dropdown mode: on
each keystroke (200ms debounce), it shows up to 8 results split into two
groups — **restaurant matches** (filtered client-side from the home
page's already-loaded restaurant list by name/cuisine, exactly today's
existing `matchesQuery` logic, just rendered in a dropdown instead of
silently filtering the page) and **dish matches** (a new query: `select
id, name, restaurant_id, restaurants(name) from menu_items where name
ilike '%query%' and is_available = true limit 8`, cross-restaurant).
Clicking a restaurant match or a dish match navigates to
`/customer/restaurants/[id]` (the dish match's `restaurant_id`).
Clicking "Search for '<query>'" (always the last row) or pressing Enter
keeps today's existing in-place page-filtering behavior unchanged — the
dropdown is additive, not a replacement for that path.

### 6. Sort/filter bar

A new row directly below the search box, above the category chip row:
three toggle buttons — **Rating** (sort restaurants descending by
`rating`), **Delivery fee** (sort ascending by `delivery_fee_paise`),
**Under 30 min** (filter to `avg_prep_minutes < 30`, combinable with
either sort toggle) — plus a **Sort by** dropdown as a fourth control
covering the same two sort options plus **Prep time** (ascending) and
**Distance** (today's existing default, ascending by the already-computed
`distanceKm`). The two Rating/Delivery-fee toggle buttons and the Sort-by
dropdown all control the same single `sortBy` state (clicking a toggle
is shorthand for picking that option in the dropdown) — only "Under 30
min" is a true independent filter. All client-side over the already-
loaded restaurant list; no new queries.

### 7. Curated carousel sections

Three new `CuisineCarouselRow`-reusing sections render above the
existing cuisine-grouped rows, in this order: **Popular near you** (top
10 by `rating` descending, from the distance-sorted list already in
memory), **Offers near you** (restaurants where `promo_text is not
null`, rendered only when at least one exists — the whole section is
absent otherwise, same `restaurants.length === 0 → null` pattern
`CuisineCarouselRow` already uses), **Quick delivery** (restaurants
where `avg_prep_minutes < 30`, capped at 10). All three derive from the
same already-fetched `withDistance`/`searched` arrays the page computes
today — no new Supabase queries, same client-side derivation pattern as
the existing `byCuisine` grouping.

## Scope

**In scope:** the 7 sections above — schema migration, vendor dashboard
fields, checkout wiring, card redesign, search dropdown, sort/filter
bar, curated carousels.

**Out of scope (explicitly declined during brainstorming):**
- A real discount/coupon engine — `promo_text` is display-only.
- A favorites feature (heart icon, favorites table, favorites filter).
- Non-restaurant verticals (grocery, alcohol, etc. — Uber Eats' sidebar
  shortcuts) — this app is restaurant-delivery only.
- Filters with no equivalent concept in this app (Offers-as-a-filter
  distinct from the Offers carousel, Benefits eligible, SNAP).
- Restaurant page, item customization, cart redesign, checkout visual
  polish — pieces 3-6, unstarted.

## Testing plan

1. `npm run build`.
2. Migration applies cleanly against the running local Supabase stack
   (`docker exec ... psql < migration file`, same pattern used for the
   n8n webhooks migration), and a fresh `supabase db reset` also succeeds
   (confirms the migration is valid as a from-scratch replay, not just
   incrementally).
3. Vendor dashboard: set a delivery fee and promo text as the seeded
   demo vendor, confirm both persist and render correctly on that
   restaurant's home-page card.
4. Checkout: place a real order against a restaurant with a non-default
   delivery fee, confirm the checkout page's displayed fee and the
   order's stored `delivery_fee` both match the restaurant's configured
   value, not the old flat ₹30 (unless that restaurant's fee happens to
   still be the ₹30 default).
5. Search: type a dish name that exists on exactly one restaurant's menu
   and doesn't match any restaurant name/cuisine directly, confirm it
   appears in the dropdown's dish-match group and navigates correctly.
6. Sort/filter and curated carousels: Playwright pass over the home page
   at desktop and 390px width, confirming each new section renders,
   the "Under 30 min" filter actually narrows the list, and the "Offers
   near you" section is absent when no restaurant has `promo_text` set
   (seed data has none by default) and appears once one is set via step
   3's vendor test.

## Open questions for the plan

None — every section above was approved individually during
brainstorming. The plan should decide the exact fate of
`DELIVERY_FEE_RUPEES` (keep as a documented default reference vs. remove
entirely) since section 3 left that as an implementation-time call.
