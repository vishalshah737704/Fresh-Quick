# Marketplace Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the food-only `restaurants`/`menu_items` data model into
category-agnostic `stores`/`products` (with a `category_type` column), and
update every file that references the old names, with zero behavior change
to the existing restaurant flow. This is Phase 1 ("Foundation") of the
multi-vertical marketplace spec — it unlocks phases 2-5 (sidebar/category
browsing, then per-category seed content) but adds no new visible feature
itself.

**Architecture:** One migration renames tables/columns and adds
`category_type` (backfilled to `'restaurant'`); Postgres automatically
carries RLS policies, indexes, and FKs across a rename (they're bound by
OID, not re-parsed from text), so no policy needs to be rewritten. Every
application-layer file that references the old table/column names as
string literals (`.from("restaurants")`, `.eq("restaurant_id", ...)`,
`restaurantId` variables) is a separate, mechanical rename task grouped by
layer (shared libs → vendor routes → admin routes → checkout → customer
UI), so each layer can be verified independently before the next depends
on it.

**Tech Stack:** Next.js App Router (TypeScript), Supabase (Postgres + Auth),
`npx supabase db reset` for migrations, `npm run build` for type-checking,
`curl`/`psql` for live verification (this project has no unit test
framework — verification throughout is live smoke-testing against a local
Supabase + dev server, per existing project convention; follow that
pattern here, don't introduce a new one).

**Spec:** `docs/superpowers/specs/2026-09-26-multi-vertical-marketplace-design.md`
(sections 3 and 7, phase 1)

## Global Constraints

- **Zero behavior change.** Every existing restaurant-flow capability
  (browse, checkout, vendor accept/reject, delivery assignment, admin
  suspend) must work identically after this plan as before — this phase
  adds no feature, it only renames.
- **Component/page filenames are NOT renamed in this phase**, except
  `app/customer/restaurants/[id]/page.tsx` → `app/customer/stores/[id]/page.tsx`
  (explicitly required by the spec, section 5.3, with an old-path
  redirect). `MenuItemRow.tsx`, `ItemCustomizationModal.tsx`, etc. keep
  their filenames; only their internal DB-facing variable/prop names that
  mirror renamed columns change. Renaming every component file is out of
  scope for this phase — it adds risk without changing behavior.
- **Never rename `avg_prep_minutes`** (spec section 4: kept as-is, just
  becomes nullable and is displayed conditionally later in phase 2 — this
  phase does not touch its display logic at all).
- **Money-path discipline still applies**: `checkout_place_order`'s numeric
  handling is untouched by this plan — only its parameter/column names
  change, never its arithmetic.
- **Run `npm run build` after every task**, not just at the end (per this
  repo's own standing rule: a missing-Suspense-style build break has
  bitten this project before and `tsc` alone doesn't catch it).

## Review Focus

- **A leftover literal `"restaurants"` or `"menu_items"` string anywhere
  in `app/`, `lib/`, or `components/`** after this plan claims completion
  — the final grep in Task 7 must return zero hits outside comments/docs,
  or the rename is incomplete and some code path silently 404s against a
  table that no longer exists.
- **RLS policies that reference `owner_id`/table name in raw SQL comments
  or `_note`/`notes` JSON fields inside migration files** — these are
  prose, not executable, and renaming the table does NOT update them
  automatically; stale comments aren't a correctness bug but a task's
  self-check should not mistake an updated comment for a required code
  change (don't waste time rewriting migration history's prose).
- **`is_veg` display logic in customer-facing components** — it moves from
  a top-level boolean to `product_attributes->>'is_veg'`; a component that
  still reads `item.is_veg` directly (rather than the migrated field) will
  silently show every item as "not veg" instead of erroring, which is the
  kind of bug that only shows up by actually looking at the rendered page,
  not the build output.
- **The old `/customer/restaurants/[id]` links** (e.g. any hardcoded href,
  the seed data's implicit assumption, browser history/bookmarks) — must
  redirect to `/customer/stores/[id]`, not 404.
- **n8n workflow 04's restaurant lat/lng lookup** (`n8n/workflows/04-*.json`)
  and `docs/n8n-webhook-setup.md`'s references to `restaurants`/
  `restaurant_id` — these are outside the app's TypeScript/build pipeline
  so `npm run build` won't catch a stale reference here; must be checked
  and updated by hand in Task 6.

---

## Task 1: Migration — rename tables/columns, add `category_type`

**Files:**
- Create: `supabase/migrations/00000000000020_stores_products_rename.sql`

**Interfaces:**
- Produces: table `public.stores` (was `restaurants`), table
  `public.products` (was `menu_items`), column `stores.category_type text`,
  column `products.product_attributes jsonb`, column `products.store_id`
  (was `restaurant_id`), column `order_items.product_id` (was
  `menu_item_id`), column `orders.store_id` (was `restaurant_id`), column
  `reviews.store_id` (was `restaurant_id`). RPC
  `public.checkout_place_order(...)` with all parameter names unchanged
  except any that said `restaurant`/`menu_item` (see step 3).

- [ ] **Step 1: Write the migration's rename statements**

```sql
-- Phase 1 of the multi-vertical marketplace spec (see
-- docs/superpowers/specs/2026-09-26-multi-vertical-marketplace-design.md):
-- generalizes the food-only restaurants/menu_items model into
-- category-agnostic stores/products. Renames carry RLS policies, indexes,
-- and FKs automatically (Postgres binds them by OID, not by re-parsing
-- the stored SQL text), so no policy needs to be rewritten here.

alter table public.restaurants rename to stores;
alter table public.menu_items rename to products;

alter table public.products rename column restaurant_id to store_id;
alter table public.orders rename column restaurant_id to store_id;
alter table public.reviews rename column restaurant_id to store_id;
alter table public.order_items rename column menu_item_id to product_id;

-- category_type: every existing row is a restaurant; new stores in later
-- phases will set this explicitly.
alter table public.stores add column category_type text;
update public.stores set category_type = 'restaurant';
alter table public.stores alter column category_type set not null;
alter table public.stores add constraint stores_category_type_check
  check (category_type in (
    'restaurant', 'grocery', 'convenience', 'alcohol', 'health', 'retail',
    'pet', 'flowers', 'baby', 'personal_care', 'electronics'
  ));

-- product_attributes replaces the restaurant-specific is_veg boolean so
-- future categories (pet/electronics/etc.) never need a schema migration
-- just to add a category-specific flag.
alter table public.products add column product_attributes jsonb not null default '{}'::jsonb;
update public.products set product_attributes = jsonb_build_object('is_veg', is_veg);
alter table public.products drop column is_veg;

-- avg_prep_minutes becomes nullable (spec section 3.1) -- only restaurants
-- set it going forward; other categories leave it null.
alter table public.stores alter column avg_prep_minutes drop not null;
```

- [ ] **Step 2: Rename the checkout RPC's renamed-column references**

Read the current function first: `supabase/migrations/00000000000018_order_delivery_note.sql`
defines `public.checkout_place_order`. Its body inserts into
`public.orders (customer_id, restaurant_id, delivery_address_id, ...)` and
`public.order_items (order_id, menu_item_id, ...)`. Append to the same new
migration file:

```sql
drop function if exists public.checkout_place_order(
  uuid, text, text, numeric, numeric, uuid, numeric, numeric, numeric, jsonb, text, text, numeric, timestamptz, text
);

create or replace function public.checkout_place_order(
  p_customer_id uuid,
  p_address_label text,
  p_address_line1 text,
  p_address_lat numeric,
  p_address_lng numeric,
  p_store_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_total numeric,
  p_items jsonb, -- array of {product_id, quantity, unit_price, special_instructions, options: [{option_id, group_name, option_name, price_delta_paise}]}
  p_payment_method text,
  p_payment_status text,
  p_payment_amount numeric,
  p_payment_paid_at timestamptz,
  p_delivery_note text default null
) returns table (order_id uuid, address_id uuid) as $$
declare
  v_address_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_order_item_id uuid;
  v_option jsonb;
begin
  insert into public.addresses (user_id, label, line1, lat, lng, is_default)
    values (
      p_customer_id,
      p_address_label,
      p_address_line1,
      p_address_lat,
      p_address_lng,
      false
    )
    returning id into v_address_id;

  insert into public.orders (customer_id, store_id, delivery_address_id, status, subtotal, delivery_fee, total, delivery_note)
    values (p_customer_id, p_store_id, v_address_id, 'placed', p_subtotal, p_delivery_fee, p_total, p_delivery_note)
    returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, product_id, quantity, unit_price, special_instructions)
      values (
        v_order_id,
        (v_item->>'product_id')::uuid,
        (v_item->>'quantity')::integer,
        (v_item->>'unit_price')::numeric,
        v_item->>'special_instructions'
      )
      returning id into v_order_item_id;

    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb))
    loop
      insert into public.order_item_options (order_item_id, menu_item_option_id, group_name, option_name, price_delta_paise)
        values (
          v_order_item_id,
          (v_option->>'option_id')::uuid,
          v_option->>'group_name',
          v_option->>'option_name',
          (v_option->>'price_delta_paise')::integer
        );
    end loop;
  end loop;

  insert into public.payments (order_id, method, status, amount, mock_reference, paid_at)
    values (
      v_order_id,
      p_payment_method,
      p_payment_status,
      p_payment_amount,
      'MOCK-' || left(v_order_id::text, 8),
      p_payment_paid_at
    );

  return query select v_order_id, v_address_id;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.checkout_place_order from public, anon, authenticated;
grant execute on function public.checkout_place_order to service_role;
```

- [ ] **Step 3: Apply the migration**

Run: `npx supabase db reset`
Expected: all 20 migrations apply cleanly, ending with "Finished supabase
db reset on branch main."

- [ ] **Step 4: Verify the rename in psql**

Run:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d public.stores" -c "\d public.products" -c "select category_type, count(*) from public.stores group by 1;"
```
Expected: `stores` and `products` both exist with the new columns
(`category_type`, `product_attributes`, `store_id`); every existing store
row shows `category_type = 'restaurant'`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00000000000020_stores_products_rename.sql
git commit -m "feat: rename restaurants/menu_items to stores/products, add category_type"
```

---

## Task 2: Shared libs — `lib/vendor-auth.ts`, `lib/vendor-option-auth.ts`, `lib/use-delivery-fee.ts`, `lib/cart-store.tsx`

**Files:**
- Modify: `lib/vendor-auth.ts`
- Modify: `lib/vendor-option-auth.ts`
- Modify: `lib/use-delivery-fee.ts`
- Modify: `lib/cart-store.tsx`

**Interfaces:**
- Consumes: `public.stores`/`public.products` from Task 1.
- Produces: `resolveVendorStore()` (renamed from `resolveVendorRestaurant`)
  returning `{ vendorId: string; storeId: string }`; `assertOwnsGroup`
  unchanged in name, its `restaurantId` parameter renamed to `storeId`;
  `useDeliveryFee(storeId: string | null)` (renamed from
  `useDeliveryFee(restaurantId)`); `useCart()`'s state shape uses
  `storeId`/`storeName` (renamed from `restaurantId`/`restaurantName`).
  Every task from here on imports these renamed names — get this task
  right before starting Task 3.

- [ ] **Step 1: Rename in `lib/vendor-auth.ts`**

Replace the whole file's content:
```typescript
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type VendorResolution =
  | { vendorId: string; storeId: string }
  | { error: string; status: number };

export async function resolveVendorStore(
  token: string | undefined
): Promise<VendorResolution> {
  if (!token) {
    return { error: "Not authenticated", status: 401 };
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: "Not authenticated", status: 401 };
  }
  const vendorId = userData.user.id;

  const { data: profile, error: profileError } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", vendorId)
    .single();
  if (profileError || !profile || profile.role !== "vendor") {
    return { error: "Not a vendor account", status: 403 };
  }

  const { data: store, error: storeError } = await supabaseServer
    .from("stores")
    .select("id")
    .eq("owner_id", vendorId)
    .single();
  if (storeError || !store) {
    return { error: "No store found for this vendor", status: 404 };
  }

  return { vendorId, storeId: store.id };
}

export function tokenFromRequest(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  return authHeader?.replace(/^Bearer\s+/i, "") ?? undefined;
}
```

- [ ] **Step 2: Rename in `lib/vendor-option-auth.ts`**

Read the current file, then rename its `restaurantId` parameter to
`storeId` and its query target from `menu_items` to `products` /
`restaurant_id` to `store_id`:
```typescript
export async function assertOwnsGroup(storeId: string, groupId: string): Promise<boolean> {
  const { data } = await supabaseServer
    .from("menu_item_option_groups")
    .select("id, products!inner(store_id)")
    .eq("id", groupId)
    .eq("products.store_id", storeId)
    .maybeSingle();
  return !!data;
}
```
(Keep every other function in the file, renaming their `restaurantId`
parameters and any `.eq("menu_items.restaurant_id", restaurantId)`-style
calls the same way — read the file fully before editing, since it has
more than one exported function.)

- [ ] **Step 3: Rename in `lib/use-delivery-fee.ts`**

Rename the exported hook's parameter and internal query:
```typescript
export function useDeliveryFee(storeId: string | null) {
  // ...
  .eq("id", storeId)
  // ...
}
```
Rename every internal `restaurantId` local variable to `storeId` to match.

- [ ] **Step 4: Rename in `lib/cart-store.tsx`**

This file's persisted shape (`restaurantId`, `restaurantName`) is read
from `localStorage` on load — rename every property to `storeId`/
`storeName` in the type definitions, the Zustand/context state, the
`addItem(restaurantId, restaurantName, item)` signature (rename params to
`storeId, storeName`), and the JSON-shape validation block (the
`!(parsed.restaurantId === null || ...)` checks). Since this changes the
persisted localStorage key's shape, also bump anything that reads
`localStorage.getItem("cart")` (or whatever key this file uses — check the
top of the file) to tolerate an old-shaped stored value by treating it as
invalid and resetting to empty (the existing invalid-shape fallback path
already does this — reuse it, don't add a new one).

- [ ] **Step 5: Verify no other file still imports the old names**

Run: `grep -rn "resolveVendorRestaurant\|restaurantId" lib/`
Expected: zero matches (everything in `lib/` now says `resolveVendorStore`/
`storeId`). Matches in `app/`/`components/` are expected here — they're
Task 3/6's job.

- [ ] **Step 6: Commit**

```bash
git add lib/vendor-auth.ts lib/vendor-option-auth.ts lib/use-delivery-fee.ts lib/cart-store.tsx
git commit -m "refactor: rename vendor-auth/cart-store restaurant references to store"
```

---

## Task 3: Vendor API routes

**Files:**
- Modify: `app/api/vendor/menu-items/route.ts`
- Modify: `app/api/vendor/menu-items/[id]/route.ts`
- Modify: `app/api/vendor/menu-items/[id]/option-groups/route.ts`
- Modify: `app/api/vendor/option-groups/[groupId]/route.ts`
- Modify: `app/api/vendor/option-groups/[groupId]/options/route.ts`
- Modify: `app/api/vendor/options/[optionId]/route.ts`
- Modify: `app/api/vendor/orders/route.ts`
- Modify: `app/api/vendor/orders/[id]/status/route.ts`
- Modify: `app/api/vendor/orders/[id]/reject/route.ts`
- Modify: `app/api/vendor/restaurant/route.ts`
- Modify: `app/api/auth/vendor-signup/route.ts`

**Interfaces:**
- Consumes: `resolveVendorStore()`, `.storeId` from Task 2; `public.stores`/
  `public.products` from Task 1.
- Produces: no new interfaces — these are leaf routes nothing else in this
  plan depends on.

- [ ] **Step 1: Rename every `resolveVendorRestaurant`/`.restaurantId` call site**

In each of the 9 vendor-orders/menu-items/option-groups/options files,
replace:
- `import { resolveVendorRestaurant, ... }` → `import { resolveVendorStore, ... }`
- `resolveVendorRestaurant(...)` → `resolveVendorStore(...)`
- `resolved.restaurantId` → `resolved.storeId`
- `.from("menu_items")` → `.from("products")`
- `.eq("restaurant_id", ...)` → `.eq("store_id", ...)`
- `restaurant_id: resolved.restaurantId` (insert payloads) → `store_id: resolved.storeId`

- [ ] **Step 2: `app/api/vendor/restaurant/route.ts`**

Rename `.from("restaurants")` → `.from("stores")`, its response key
`{ restaurant: data }` → `{ store: data }`, and every `resolved.restaurantId`
→ `resolved.storeId`. Since this route is the vendor's own store-profile
editor, also confirm it doesn't hardcode `category_type` anywhere — if it
does a full-row update, make sure it's not accidentally overwriting
`category_type` with `undefined` (read the route's PATCH/PUT body handling
before editing; if it spreads the request body directly into the update
call, explicitly exclude `category_type` from what a vendor can edit —
vendors don't choose their own category in this phase, seed data does).

- [ ] **Step 3: `app/api/auth/vendor-signup/route.ts`**

Rename its `.from("restaurants").insert(...)` call to `.from("stores")`,
and add `category_type: "restaurant"` to the inserted row (every
self-signed-up vendor through this phase's UI is still a restaurant — the
multi-category signup flow is out of scope for this plan, per spec
section 8).

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: all vendor API routes compile with zero TypeScript errors.

- [ ] **Step 5: Live verify — vendor flow end to end**

With `npx supabase db reset` and `npm run dev` running, repeat this
session's earlier verified sequence (sign in as `vendor.demo@foodhub.local`
/ `demo1234`, list `/api/vendor/orders`, accept and reject test orders) —
see this repo's own prior verification transcript for the exact curl
commands; the expected results are unchanged from before this plan
(order accept → `status: "accepted"`; reject → `status: "rejected"` +
payment `refunded`).

- [ ] **Step 6: Commit**

```bash
git add app/api/vendor app/api/auth/vendor-signup
git commit -m "refactor: rename vendor API routes to stores/products"
```

---

## Task 4: Admin API routes + internal notification-details route

**Files:**
- Modify: `app/api/admin/restaurants/route.ts`
- Modify: `app/api/admin/restaurants/[id]/suspend/route.ts`
- Modify: `app/api/admin/restaurants/[id]/unsuspend/route.ts`
- Modify: `app/api/internal/orders/[id]/notification-details/route.ts`

**Interfaces:**
- Consumes: `public.stores` from Task 1.
- Produces: no new interfaces.

- [ ] **Step 1: `app/api/admin/restaurants/route.ts`**

Rename `.from("restaurants")` → `.from("stores")`, response key
`{ restaurants: data }` → `{ stores: data }`.

- [ ] **Step 2: suspend/unsuspend routes**

Both files' `.from("restaurants")` → `.from("stores")`; no other logic
changes (they already look up by `id`, not `restaurant_id`).

- [ ] **Step 3: `app/api/internal/orders/[id]/notification-details/route.ts`**

This route's Supabase select currently reads
`"id, customer_id, total, status, addresses:delivery_address_id(label, line1), restaurants:restaurant_id(name)"`.
Rename to:
```typescript
.select(
  "id, customer_id, total, status, addresses:delivery_address_id(label, line1), stores:store_id(name)"
)
```
and rename the destructured `order.restaurants` → `order.stores` below it
(both the `Array.isArray` check and the `restaurant?.name` fallback).

- [ ] **Step 4: Build check**

Run: `npm run build`

- [ ] **Step 5: Live verify — admin + notification-details**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "select id from public.stores where category_type='restaurant' limit 1;"
```
Then hit `GET /api/admin/restaurants` (with a valid admin token) and
confirm it returns `{ stores: [...] }` with the same restaurant rows as
before. Then repeat this session's `notification-details` curl check
(accept an order, `GET /api/internal/orders/:id/notification-details`
with `X-Internal-Secret`) and confirm `restaurantName` in the JSON
response is still populated correctly (the JSON *key* name
`restaurantName` in the route's own response body stays as-is — only the
Supabase table alias changes internally; renaming the public JSON field
is out of scope for this plan since n8n workflow 03 already depends on
that exact key name).

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/restaurants app/api/internal/orders
git commit -m "refactor: rename admin/internal routes to stores"
```

---

## Task 5: Checkout route

**Files:**
- Modify: `app/api/cart/checkout/route.ts`

**Interfaces:**
- Consumes: `checkout_place_order(p_store_id, ...)` RPC from Task 1
  (parameter renamed from `p_restaurant_id`).
- Produces: no new interfaces (this is the app's payment/order entry
  point — its behavior, especially the payment-success-rate math, must
  not change at all in this task, only the names it uses to call the RPC).

- [ ] **Step 1: Rename table/column references**

- `restaurantId` (destructured from request body) → `storeId`
- `.from("restaurants")` → `.from("stores")`
- `.from("menu_items")` → `.from("products")`
- `item.restaurant_id !== restaurantId` (cross-store cart guard) →
  `item.store_id !== storeId`
- the RPC call's `p_restaurant_id: restaurantId` → `p_store_id: storeId`
- every `menuItemId`/`menu_item_id` local variable/property → `productId`/
  `product_id` (including the `orderItemsPayload` mapping's
  `menu_item_id: item.menuItemId` → `product_id: item.productId`)

Do **not** touch the payment-resolution block (`paymentSucceeds`,
`PAYMENT_SUCCESS_RATE`, `paymentStatus`) — it references no
restaurant/menu_item names and must stay byte-identical.

- [ ] **Step 2: Build check**

Run: `npm run build`

- [ ] **Step 3: Live verify — full checkout**

Repeat this session's earlier verified checkout sequence: sign up a test
customer, `POST /api/cart/checkout` against Demo Kitchen's `id` (now a row
in `stores`, `category_type = 'restaurant'`) and one of its products'
`id`s (now in `products`), with `paymentMethod: "mock_cod"`. Expected:
identical response shape `{"orderId": "...", "paymentStatus": "success"}`
as before this plan — if the shape or values differ, the rename broke
something.

- [ ] **Step 4: Commit**

```bash
git add app/api/cart/checkout/route.ts
git commit -m "refactor: rename checkout route to stores/products"
```

---

## Task 6: Customer UI, vendor UI, and n8n/docs references

**Files:**
- Modify: `app/customer/page.tsx`
- Move + modify: `app/customer/restaurants/[id]/page.tsx` →
  `app/customer/stores/[id]/page.tsx`
- Create: `app/customer/restaurants/[id]/page.tsx` (new, thin redirect stub)
- Modify: `app/customer/checkout/page.tsx`
- Modify: `components/CartPanel.tsx`
- Modify: `components/HeaderSearchBox.tsx`
- Modify: `components/ItemCustomizationModal.tsx`
- Modify: `components/MenuItemRow.tsx`
- Modify: `components/vendor/useVendorSession.ts`
- Modify: `app/vendor/dashboard/page.tsx`
- Modify: `app/vendor/menu/page.tsx`
- Modify: `n8n/workflows/04-delivery-partner-assignment.json`
- Modify: `docs/n8n-webhook-setup.md`

**Interfaces:**
- Consumes: `storeId`/`storeName` from `useCart()` (Task 2), `stores`/
  `products` tables (Task 1).
- Produces: `/customer/stores/[id]` as the canonical store-detail route;
  `/customer/restaurants/[id]` redirects there (kept for old links).

- [ ] **Step 1: Move the store detail page**

```bash
git mv app/customer/restaurants/[id]/page.tsx app/customer/stores/[id]/page.tsx
```
Then edit `app/customer/stores/[id]/page.tsx`: rename every
`restaurantId`/`.from("restaurants")`/`.from("menu_items")`/
`restaurant_id`/`menu_item_id` reference the same way as prior tasks. Its
`is_veg` display logic specifically must change from reading
`item.is_veg` to `item.product_attributes?.is_veg` (per Review Focus
above) — find every place the page renders a veg/non-veg badge and update
the field access, not just the query's `select(...)` string.

- [ ] **Step 2: Create the redirect stub**

```typescript
import { redirect } from "next/navigation";

export default async function LegacyRestaurantRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/customer/stores/${id}`);
}
```
Save as `app/customer/restaurants/[id]/page.tsx` (the directory was
emptied by the `git mv` above, so this recreates it as a redirect-only
route).

- [ ] **Step 3: `app/customer/page.tsx`**

Rename its `.from("restaurants")` query and every restaurant-card link
`href={`/customer/restaurants/${r.id}`}` → `href={`/customer/stores/${r.id}`}`
(new links should point at the canonical path directly, not bounce
through the redirect). Rename any `restaurant_id`/`restaurantId` locals
the same way as prior tasks.

- [ ] **Step 4: `app/customer/checkout/page.tsx`, `components/CartPanel.tsx`**

Both consume `useCart()`'s renamed `storeId`/`storeName` (Task 2) — update
every destructured usage (`const { storeId, storeName, ... } = useCart()`)
and any prop named `restaurantId` passed down to child components
(`useDeliveryFee(open ? storeId : null)` per Task 2's renamed hook
signature).

- [ ] **Step 5: `components/HeaderSearchBox.tsx`, `components/ItemCustomizationModal.tsx`, `components/MenuItemRow.tsx`**

Rename any `restaurantId`/`menuItemId` props and `is_veg` field access
(`MenuItemRow.tsx` almost certainly renders the veg/non-veg dot — update
it to read `product_attributes?.is_veg` per the Review Focus item above).
Component filenames stay as-is per Global Constraints.

- [ ] **Step 6: `components/vendor/useVendorSession.ts`, `app/vendor/dashboard/page.tsx`, `app/vendor/menu/page.tsx`**

Rename `.from("restaurants")` and every `restaurantId` local/state
variable to `storeId`, matching Task 2's `useVendorSession` consumers.

- [ ] **Step 7: n8n workflow 04 and its setup doc**

Open `n8n/workflows/04-delivery-partner-assignment.json`: it looks up a
restaurant's lat/lng directly from `restaurants` (per
`docs/n8n-webhook-setup.md`'s description of workflow 04). Rename its
Supabase REST call's table path from `restaurants` to `stores` (search
the JSON for `/rest/v1/restaurants` or a `resource`/`table` parameter
naming `restaurants`). Update `docs/n8n-webhook-setup.md`'s prose
wherever it says "restaurant" in a way that names the table specifically
(not general English usage like "the restaurant accepts the order," which
stays as-is — only literal table/column name mentions change).

- [ ] **Step 8: Build check**

Run: `npm run build`
Expected: zero errors, `/customer/stores/[id]` and
`/customer/restaurants/[id]` both listed as routes.

- [ ] **Step 9: Live verify — full customer flow + redirect**

With dev server running: load `/customer`, confirm restaurant cards link
to `/customer/stores/...`; load an old-style `/customer/restaurants/<id>`
URL directly and confirm it redirects to `/customer/stores/<id>`; confirm
a veg item still shows its veg badge correctly (this is the one place a
silent regression could hide per Review Focus — actually look at the
rendered page, don't just check the network response).

- [ ] **Step 10: Commit**

```bash
git add app/customer app/vendor components/CartPanel.tsx components/HeaderSearchBox.tsx components/ItemCustomizationModal.tsx components/MenuItemRow.tsx components/vendor/useVendorSession.ts n8n/workflows/04-delivery-partner-assignment.json docs/n8n-webhook-setup.md
git commit -m "refactor: rename customer/vendor UI and n8n workflow 04 to stores/products"
```

---

## Task 7: Full-branch verification and cleanup grep

**Files:** none created/modified — this task is verification-only.

**Interfaces:** none.

- [ ] **Step 1: Global leftover-reference grep**

```bash
grep -rn '"restaurants"\|'"'"'restaurants'"'"'\|restaurant_id\|"menu_items"\|'"'"'menu_items'"'"'\|menu_item_id' app lib components
```
Expected: zero matches. Any match here means a task above missed a file —
fix it before proceeding.

- [ ] **Step 2: Full local reset + build**

```bash
npx supabase db reset
npm run build
```
Expected: migration applies cleanly (21 migrations total), build succeeds
with all routes listed, including `/customer/stores/[id]` and
`/customer/restaurants/[id]`.

- [ ] **Step 3: End-to-end live smoke test (mirrors this session's earlier verified sequence)**

```bash
npm run dev &
# sign up a fresh customer via POST /api/auth/signup
# get customer + vendor.demo tokens via /auth/v1/token?grant_type=password
# POST /api/cart/checkout against a stores.id (category_type='restaurant') and one of its products.id
# POST /api/vendor/orders/:id/status (accept) -> confirm status "accepted"
# GET /api/internal/orders/:id/notification-details with X-Internal-Secret -> confirm correct email/amount/address
# place a second order, POST /api/vendor/orders/:id/reject -> confirm status "rejected" and payments.status "refunded"
```
Expected: every response identical in shape and values to this session's
pre-plan verification transcript. Any difference is a regression this
plan introduced.

- [ ] **Step 4: Update MEMORY.md**

Add an entry under the phase list (per this project's "Update CLAUDE
files" standing rule) recording: Marketplace Foundation phase complete,
`restaurants`/`menu_items` renamed to `stores`/`products`,
`category_type` added (all existing rows `'restaurant'`),
`/customer/stores/[id]` is now canonical with a redirect from the old
path, zero behavior change confirmed via the smoke test above. Note that
phases 2-5 (sidebar/category browsing, then per-category seed content)
are separate, not-yet-planned follow-ons per the spec's section 7.

- [ ] **Step 5: Final commit**

```bash
git add MEMORY.md
git commit -m "docs: record marketplace foundation phase completion"
```
