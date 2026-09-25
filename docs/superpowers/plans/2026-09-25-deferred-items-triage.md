# Deferred Items Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every open item on MEMORY.md's "Known deferred items" list except the two explicitly out of scope (no-action-needed PostGIS indexing, and a full automated test suite — a separate undertaking).

**Architecture:** No new subsystems. Each task is a self-contained fix to an existing flow (an RLS migration, a small API route, a UI tweak). Tasks are independent of each other except Task 1 (RLS baseline read) informs Task 2's migration numbering. Order tasks so DB migrations land before the UI/route work that assumes them.

**Tech Stack:** Next.js App Router + TypeScript, Supabase Postgres (self-hosted, migrations in `supabase/migrations/`), existing `supabaseServer` service-role client (`lib/supabase-server.ts`), existing `resolveVendorRestaurant`/`tokenFromRequest` auth helpers.

**Spec:** No new design spec — this triage was scoped directly in chat brainstorming against `MEMORY.md`'s deferred-items list and `CLAUDE.md`'s existing RLS rules. Those two files are the source of truth for constraints.

## Global Constraints

- Any code touching money (prices, subtotal, delivery fee, total) must use integer-paise/integer-cent arithmetic or the exact pattern already used in `app/api/cart/checkout/route.ts` — never plain float multiplication.
- Run `npm run build` (not just `tsc --noEmit`) before marking any task done.
- Before adding any RLS policy to a table, list that table's *existing* policies first (grep every migration file for the table name) — never add a new policy in isolation.
- Never add an RLS write policy on a table that is only ever written through a service-role API route.
- Never write an RLS policy whose own `USING` clause queries the same table it's defined on.
- API routes that create/read data on a user's behalf must derive identity from a verified `Authorization: Bearer <token>` header (via `supabaseServer.auth.getUser(token)`), never a client-supplied id.
- Migration files are numbered sequentially; the next free number is `00000000000011`. If two tasks in this plan both add migrations, the second implementer must check what number the first actually used and increment from there (don't hardcode a number that might collide).
- Live verification for anything touching RLS or login-adjacent reads must drive a real browser (Playwright), not just curl against service-role routes — curl bypasses RLS entirely.

## Review Focus

- A vendor opening their restaurant with zero available menu items — the toggle must refuse this, not silently open an empty menu to customers.
- A delivery partner reading another partner's assigned customer's address by guessing/replaying an order id not assigned to them — the new address-read policy must scope strictly to `orders.delivery_partner_id = auth.uid()`.
- A customer whose order reaches `delivered`/`cancelled` mid-poll — the confirmation page's interval must actually clear, not just skip one tick and keep firing.
- The checkout RPC failing partway (e.g., a payment failure) — must still leave the order in a consistent state (existing "cancel on payment failure" behavior must be preserved inside the transaction, not silently dropped).
- Geolocation permission denied/unavailable in the browser — the ping loop must fall back to the existing manual lat/lng inputs, not throw or silently stop pinging.

---

### Task 1: Tighten `reviews` table RLS read policy

**Files:**
- Create: `supabase/migrations/00000000000011_reviews_rls.sql`

**Interfaces:**
- Produces: no new tables/columns. Downstream tasks don't depend on this one; it's independent.

- [ ] **Step 1: Confirm no other migration already touches `reviews`**

Run: `grep -rn "reviews" supabase/migrations/`
Expected: only `00000000000001_core_schema.sql` (table def + the stub policy at line 121). If any other file already touches `reviews`, stop and re-check MEMORY.md before proceeding — the premise may be stale (this happened with `order_items` during planning; it was already fixed in migration 7).

- [ ] **Step 2: Write the migration**

```sql
-- Close the Phase 1 stub: reviews had `using (true)` letting anon/any
-- authenticated user read every review row including customer_id.
-- No review-writing feature exists yet (table has zero rows), so this
-- is a minimal tightening to authenticated-only, matching the pattern
-- other un-built-out tables use before their owning feature ships.
-- Full owner/public-scoped policy is still deferred until a real
-- review feature is built (see MEMORY.md).
drop policy "stub_allow_authenticated_read" on public.reviews;

create policy "stub_allow_authenticated_read_reviews" on public.reviews
  for select using (auth.role() = 'authenticated');
```

- [ ] **Step 3: Apply and verify**

Run: `npx supabase db reset` (requires Docker Desktop running)
Then: `select policyname, qual from pg_policies where tablename = 'reviews';`
Expected: one policy, `stub_allow_authenticated_read_reviews`, qual `(auth.role() = 'authenticated'::text)`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00000000000011_reviews_rls.sql
git commit -m "fix: tighten reviews table RLS from anon-readable to authenticated-only"
```

---

### Task 2: Verify `order_items` RLS (already fixed — confirmation only)

MEMORY.md's deferred list said `order_items` still had the Phase 1 permissive stub. Investigation during planning found this was already closed in `supabase/migrations/00000000000007_vendor_rls.sql:62-79` (policies `owner_can_read_own_order_items` and `vendor_can_read_own_restaurant_order_items`). No code change needed — just confirm and correct the stale doc entry.

**Files:**
- Modify: `MEMORY.md` (remove the stale deferred-item line)

**Interfaces:** none.

- [ ] **Step 1: Confirm the policies exist**

Run: `grep -n "order_items" supabase/migrations/00000000000007_vendor_rls.sql`
Expected: both `owner_can_read_own_order_items` and `vendor_can_read_own_restaurant_order_items` policies present, and confirm no leftover permissive stub remains (`grep -n "order_items" supabase/migrations/*.sql` should show the Phase 1 stub was dropped, not just shadowed).

- [ ] **Step 2: Update MEMORY.md**

Find the line: `` `order_items` table still has the fully-permissive Phase 1 stub RLS policy... `` under "Known deferred items" and replace it with a note that it was already closed in Phase 4/migration 7, discovered stale during this triage.

- [ ] **Step 3: Commit**

```bash
git add MEMORY.md
git commit -m "docs: correct stale order_items RLS deferred-item entry (already fixed in migration 7)"
```

---

### Task 3: Vendor open/close restaurant toggle

**Files:**
- Create: `app/api/vendor/restaurant/route.ts`
- Modify: `app/vendor/dashboard/page.tsx`
- Test: manual (see Step 5) — no automated test harness exists in this repo yet (see Global Constraints/MEMORY.md); verify via `npm run build` + live browser check.

**Interfaces:**
- Consumes: `resolveVendorRestaurant(tokenFromRequest(request))` from `lib/vendor-auth` (same as `app/api/vendor/menu-items/route.ts`), `supabaseServer` from `lib/supabase-server`.
- Produces: `PATCH /api/vendor/restaurant` accepting `{ isOpen: boolean }`, returning `{ restaurant: {...} }` on success or `{ error: string }` on failure (400 if opening with zero available menu items, matching the error-shape convention used by `app/api/vendor/menu-items/[id]/route.ts`).

- [ ] **Step 1: Write the route**

```typescript
// app/api/vendor/restaurant/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";

export async function PATCH(request: NextRequest) {
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const body = await request.json();
  if (typeof body.isOpen !== "boolean") {
    return NextResponse.json({ error: "isOpen must be a boolean" }, { status: 400 });
  }

  if (body.isOpen) {
    const { count, error: countError } = await supabaseServer
      .from("menu_items")
      .select("id", { count: "exact", head: true })
      .eq("restaurant_id", resolved.restaurantId)
      .eq("is_available", true);
    if (countError) {
      return NextResponse.json({ error: "Failed to check menu items" }, { status: 500 });
    }
    if (!count || count === 0) {
      return NextResponse.json(
        { error: "Add at least one available menu item before opening" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabaseServer
    .from("restaurants")
    .update({ is_open: body.isOpen })
    .eq("id", resolved.restaurantId)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to update restaurant" }, { status: 500 });
  }
  return NextResponse.json({ restaurant: data });
}
```

- [ ] **Step 2: Read `app/vendor/dashboard/page.tsx` in full before editing**

It currently has no restaurant-open-state fetch/toggle. Add: fetch the restaurant's `is_open` (reuse whatever the page already uses to identify the vendor's restaurant — check how `app/vendor/menu/page.tsx` resolves the vendor's restaurant id/token, and mirror that pattern here, don't invent a new one), a toggle button, and a `PATCH /api/vendor/restaurant` call on click, with the returned `error` displayed on failure (matching the existing error-surfacing pattern from Phase 8 used elsewhere in the vendor UI, e.g. `app/vendor/menu/page.tsx`'s availability-toggle error handling).

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 4: Live-verify**

With Docker Desktop running and `npx supabase start` + `.env.local` set up (see README.md/HANDOFF_2.md), `npm run dev`, log in as the seeded vendor, try opening with zero available items (expect the 400 error surfaced in the UI), mark one item available, retry (expect success), confirm the restaurant now appears in `/customer` browse.

- [ ] **Step 5: Commit**

```bash
git add app/api/vendor/restaurant/route.ts app/vendor/dashboard/page.tsx
git commit -m "feat: add vendor open/close restaurant toggle"
```

---

### Task 4: Delivery partner can view assigned customer's address

**Files:**
- Create: `supabase/migrations/00000000000012_delivery_address_read.sql` (or next free number after Task 1's — check first)
- Create: `app/api/delivery/orders/[id]/address/route.ts`
- Modify: `app/delivery/dashboard/page.tsx`

**Interfaces:**
- Produces: `GET /api/delivery/orders/[id]/address` returning `{ address: {...} }` for the partner's own assigned/picked_up order, 403/404 otherwise.

- [ ] **Step 1: List existing policies on `addresses` and `orders` before adding**

Run: `grep -n "addresses" supabase/migrations/*.sql` and `grep -n "delivery_partner_id" supabase/migrations/*.sql`
Confirm current state matches `00000000000008_delivery_rls.sql:15-29` as reported (partner self-read, customer-can-read-assigned-partner-location scoped to `assigned`/`picked_up`, delivery-can-read-own-assigned-orders). No existing policy grants delivery partners `addresses` access.

- [ ] **Step 2: Write the migration, scoped like the existing location-share policy**

```sql
-- Delivery partner can read the delivery address for an order currently
-- assigned to them, scoped to active statuses only (mirrors the
-- customer_can_read_assigned_partner_location expiry pattern in
-- migration 8 — access ends once the order is no longer active).
create policy "delivery_can_read_assigned_order_address" on public.addresses
  for select using (
    exists (
      select 1 from public.orders
      where orders.delivery_address_id = addresses.id
        and orders.delivery_partner_id = auth.uid()
        and orders.status in ('assigned', 'picked_up')
    )
  );
```

Adjust the FK column name to match the actual `orders` schema (check `orders` table definition in `00000000000001_core_schema.sql` for the exact address FK column name before writing this — it may not be literally `delivery_address_id`).

- [ ] **Step 3: Write the route**

```typescript
// app/api/delivery/orders/[id]/address/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
// import whatever delivery-partner token-resolution helper the existing
// app/api/delivery/orders/[id]/status/route.ts uses — read that file
// first and copy its auth pattern exactly, don't invent a new one.

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // resolve delivery partner identity the same way status/route.ts does
  // ... (copy pattern)
  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("delivery_address_id, delivery_partner_id, status")
    .eq("id", id)
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  // compare order.delivery_partner_id to the resolved partner id; 403 if mismatch
  const { data: address, error: addressError } = await supabaseServer
    .from("addresses")
    .select("*")
    .eq("id", order.delivery_address_id)
    .single();
  if (addressError || !address) {
    return NextResponse.json({ error: "Address not found" }, { status: 404 });
  }
  return NextResponse.json({ address });
}
```

Since this route reads via `supabaseServer` (service-role), it bypasses RLS itself — the RLS policy in Step 2 is what matters for direct PostgREST access with the partner's own anon-key token, which is the actual attack surface this closes. The route still needs its own ownership check (`order.delivery_partner_id` must equal the authenticated partner) since service-role bypasses RLS.

- [ ] **Step 4: Wire into dashboard UI**

In `app/delivery/dashboard/page.tsx`, for each assigned/picked-up order in the partner's own-orders list, add a "View address" action that calls the new route and displays the result (or an error).

- [ ] **Step 5: Run build, apply migration, live-verify**

Run: `npm run build` then `npx supabase db reset`.
Live-verify in a real browser: partner A claims an order, can see its address; confirm partner B (a second delivery account, offline/not assigned to that order) gets 403/404 both from the UI and from a direct PostgREST call with their own token (curl with partner B's anon-key session token against `.../rest/v1/addresses?id=eq.<the address id>` should return zero rows).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_delivery_address_read.sql app/api/delivery/orders/[id]/address/route.ts app/delivery/dashboard/page.tsx
git commit -m "feat: let delivery partner view assigned order's delivery address"
```

---

### Task 5: Geolocation fallback for delivery location ping

**Files:**
- Modify: `app/delivery/dashboard/page.tsx:29-30` (state), `:53-63` (ping effect), `:118-131` (inputs)

**Interfaces:** none new — internal to this file.

- [ ] **Step 1: Add a geolocation-attempt effect**

Near the existing `lat`/`lng` state (currently defaulted to `"12.9716"`/`"77.5946"`), add an effect that runs once on mount (or when going online) and tries `navigator.geolocation.getCurrentPosition`, updating `lat`/`lng` state on success and leaving the manual defaults untouched on failure/unavailability:

```typescript
useEffect(() => {
  if (!online || typeof navigator === "undefined" || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setLat(String(position.coords.latitude));
      setLng(String(position.coords.longitude));
    },
    () => {
      // permission denied or unavailable — keep existing manual values
    },
    { timeout: 5000 }
  );
}, [online]);
```

The existing manual `<input>` fields stay — this only pre-fills them; the partner can still override manually, and the existing 15s ping interval (lines 53-63) keeps sending whatever `lat`/`lng` state currently holds, unchanged.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: no errors.

- [ ] **Step 3: Live-verify**

In a real browser, go online as a delivery partner, grant location permission when prompted — confirm the lat/lng inputs populate from the browser's actual location. Then deny/block permission in another test and confirm the manual defaults remain usable and pinging still works.

- [ ] **Step 4: Commit**

```bash
git add app/delivery/dashboard/page.tsx
git commit -m "feat: prefill delivery location ping from navigator.geolocation when available"
```

---

### Task 6: Stop polling once order reaches a terminal status

**Files:**
- Modify: `app/customer/orders/[id]/page.tsx:55-98`

**Interfaces:** none new — internal to this file.

- [ ] **Step 1: Read the current polling effect in full (lines 55-98) before editing**

Identify the exact `setInterval(load, 3000)` call (line 93) and the `load()` function's shape (what it sets `order` state to).

- [ ] **Step 2: Gate the interval on terminal status**

Define a terminal-status set and check it both before scheduling the next poll and inside the interval callback itself, clearing the interval once a terminal state is reached:

```typescript
const TERMINAL_STATUSES = ["delivered", "cancelled"];
// ...inside the effect, after each load():
if (order && TERMINAL_STATUSES.includes(order.status)) {
  clearInterval(interval);
}
```

Adjust to match the actual variable names/status field already used in the file (read it first — don't assume `order.status` is the exact accessor without confirming).

- [ ] **Step 3: Run build**

Run: `npm run build`

- [ ] **Step 4: Live-verify**

In a real browser, open the network tab, watch an order reach `delivered` (or manually flip status via admin dashboard reassignment/vendor status chain in another tab), confirm polling requests stop firing after that point.

- [ ] **Step 5: Commit**

```bash
git add "app/customer/orders/[id]/page.tsx"
git commit -m "fix: stop order confirmation polling once order reaches a terminal status"
```

---

### Task 7: Shared signup validation helper (vendor + delivery)

**Files:**
- Create: `lib/signup-validation.ts`
- Modify: `app/api/auth/vendor-signup/route.ts`
- Modify: `app/api/auth/delivery-signup/route.ts`

**Interfaces:**
- Produces: `validateSignupFields(body: Record<string, unknown>, required: string[]): string | null` returning an error message or `null` if valid — checks presence, type (string), and length bounds (1-200 chars) for each required field. Also exports `VEHICLE_TYPES = ["bike", "scooter", "bicycle", "car"] as const` and `isValidVehicleType(v: unknown): v is typeof VEHICLE_TYPES[number]`.

- [ ] **Step 1: Read both existing signup routes in full first**

`app/api/auth/vendor-signup/route.ts` and `app/api/auth/delivery-signup/route.ts` — confirm the exact current validation (or lack of it) and the exact rollback-on-failure pattern (`deleteUser` call) before extracting, so the helper's signature matches how both routes will actually call it.

- [ ] **Step 2: Write the helper**

```typescript
// lib/signup-validation.ts
export const VEHICLE_TYPES = ["bike", "scooter", "bicycle", "car"] as const;

export function isValidVehicleType(v: unknown): v is (typeof VEHICLE_TYPES)[number] {
  return typeof v === "string" && (VEHICLE_TYPES as readonly string[]).includes(v);
}

export function validateSignupFields(
  body: Record<string, unknown>,
  required: string[]
): string | null {
  for (const field of required) {
    const value = body[field];
    if (typeof value !== "string" || value.trim().length === 0) {
      return `${field} is required`;
    }
    if (value.length > 200) {
      return `${field} must be under 200 characters`;
    }
  }
  return null;
}
```

- [ ] **Step 3: Wire into `vendor-signup/route.ts`**

Add `validateSignupFields(body, ["email", "password", "fullName", "restaurantName"])` (adjust field list to match what the route actually reads) right after `body = await request.json()`, returning 400 with the error message if non-null, before any user-creation call.

- [ ] **Step 4: Wire into `delivery-signup/route.ts`**

Same pattern with `["email", "password", "fullName"]`, plus: if the route accepts a `vehicleType` field, validate it with `isValidVehicleType` and reject with 400 if present-but-invalid (don't require it if it's currently optional — check the route first).

- [ ] **Step 5: Run build**

Run: `npm run build`

- [ ] **Step 6: Live-verify**

`curl` both signup routes with an empty `fullName`, a 500-character `fullName`, and (delivery) an invalid `vehicleType` like `"spaceship"` — confirm all return 400 with a clear message instead of either succeeding or 500ing.

- [ ] **Step 7: Commit**

```bash
git add lib/signup-validation.ts app/api/auth/vendor-signup/route.ts app/api/auth/delivery-signup/route.ts
git commit -m "feat: add shared signup field validation for vendor and delivery signup"
```

---

### Task 8: Re-check `is_open`/`is_suspended` on customer restaurant menu page

**Files:**
- Modify: `app/customer/restaurants/[id]/page.tsx:31` (query) and wherever ordering/cart-add actions render on that page.

**Interfaces:** none new.

- [ ] **Step 1: Read the current query and full page**

Current select is `id, name` only (line 31) with no `is_open`/`is_suspended` check, per investigation. Read the full file to see how menu items are rendered and where "add to cart" actions live.

- [ ] **Step 2: Extend the query, mirroring `app/customer/page.tsx:28-32`**

```typescript
.from("restaurants")
.select("id, name, cuisine_tags, rating, avg_prep_minutes, is_open, lat, lng, is_suspended")
.eq("id", restaurantId)
.single();
```

(Keep whatever additional columns the page already selects beyond `id, name` — this only adds `is_open`/`is_suspended` to the existing select, not a full rewrite.)

- [ ] **Step 3: Gate ordering UI on the fetched flags**

If `!restaurant.is_open || restaurant.is_suspended`, render a banner ("This restaurant is currently closed" / "unavailable") and disable/hide add-to-cart controls on that page. Checkout's own server-side re-validation (Phase 3) already blocks the order regardless — this is a UI-only improvement so the customer sees it before trying.

- [ ] **Step 4: Run build**

Run: `npm run build`

- [ ] **Step 5: Live-verify**

As admin, suspend a restaurant; visit its menu page directly by URL as a customer (not via the browse list) — confirm the banner shows and add-to-cart is disabled. Unsuspend and confirm normal behavior returns.

- [ ] **Step 6: Commit**

```bash
git add "app/customer/restaurants/[id]/page.tsx"
git commit -m "fix: show closed/suspended banner on restaurant menu page instead of silently allowing browse"
```

---

### Task 9: Standardize currency display to `.toFixed(2)`

**Files:**
- Modify: `app/vendor/orders/page.tsx:85`
- Modify: `app/vendor/menu/page.tsx:133`
- Modify: `app/admin/dashboard/page.tsx:99`
- Modify: `app/delivery/dashboard/page.tsx:139,157`

**Interfaces:** none new — purely display formatting.

- [ ] **Step 1: Fix each raw `₹{value}` usage**

At each listed line, change `₹{value}` to `₹{value.toFixed(2)}` (adjust the exact expression to match what's actually there — e.g. `₹{order.total}` → `₹{order.total.toFixed(2)}`, `₹{item.price}` → `₹{item.price.toFixed(2)}`). If any of these values can be `null`/`undefined` per their type, guard with `(value ?? 0).toFixed(2)` rather than letting it throw.

- [ ] **Step 2: Run build**

Run: `npm run build`

- [ ] **Step 3: Live-verify**

Visit vendor orders, vendor menu, admin dashboard, and delivery dashboard pages in a browser; confirm every currency figure now shows exactly two decimal places.

- [ ] **Step 4: Commit**

```bash
git add app/vendor/orders/page.tsx app/vendor/menu/page.tsx app/admin/dashboard/page.tsx app/delivery/dashboard/page.tsx
git commit -m "fix: standardize currency display to two decimal places across vendor/admin/delivery pages"
```

---

### Task 10: Checkout atomicity via Postgres RPC

**Files:**
- Create: `supabase/migrations/00000000000013_checkout_rpc.sql` (or next free number — check what Tasks 1/4 actually used first)
- Modify: `app/api/cart/checkout/route.ts:114-191`

**Interfaces:**
- Produces: Postgres function `checkout_place_order(...)` callable via `supabaseServer.rpc("checkout_place_order", {...})`, returning the created order id (and enough info for the route to still do its existing post-insert work, e.g. triggering payment resolution).

- [ ] **Step 1: Read `app/api/cart/checkout/route.ts` in full before touching it**

This file is security-reviewed Phase 3 code (verified session-token auth, price re-validation, reprice guard). Confirm the exact 4 insert shapes (address, order, order_items, payment) at lines 114-181, and the conditional cancel-on-payment-failure logic at 183-191, so the RPC's SQL matches exactly what's inserted today — this task changes *how* the inserts happen, not *what* they insert or any of the pre-insert validation (which stays in the route, in TypeScript, unchanged).

- [ ] **Step 2: Write the RPC migration**

```sql
-- Wraps the checkout route's 4 sequential inserts (address, order,
-- order_items, payment) in a single transaction so a partial failure
-- can't orphan rows. Pre-insert validation (price re-check, reprice
-- guard, restaurant-open check) stays in the TypeScript route — this
-- function only performs the already-validated writes atomically.
create or replace function public.checkout_place_order(
  p_customer_id uuid,
  p_address jsonb,
  p_restaurant_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_total numeric,
  p_items jsonb, -- array of {menu_item_id, quantity, unit_price}
  p_payment_method text
) returns table (order_id uuid, address_id uuid) as $$
declare
  v_address_id uuid;
  v_order_id uuid;
  v_item jsonb;
begin
  insert into public.addresses (customer_id, line1, line2, lat, lng, label)
    values (
      p_customer_id,
      p_address->>'line1',
      p_address->>'line2',
      (p_address->>'lat')::numeric,
      (p_address->>'lng')::numeric,
      p_address->>'label'
    )
    returning id into v_address_id;

  insert into public.orders (customer_id, restaurant_id, delivery_address_id, subtotal, delivery_fee, total, status)
    values (p_customer_id, p_restaurant_id, v_address_id, p_subtotal, p_delivery_fee, p_total, 'placed')
    returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price)
      values (
        v_order_id,
        (v_item->>'menu_item_id')::uuid,
        (v_item->>'quantity')::integer,
        (v_item->>'unit_price')::numeric
      );
  end loop;

  insert into public.payments (order_id, method, status, amount)
    values (v_order_id, p_payment_method, 'pending', p_total);

  return query select v_order_id, v_address_id;
end;
$$ language plpgsql security definer set search_path = '';
```

Adjust every column name/table shape to match the *actual* schema (read `00000000000001_core_schema.sql`'s `addresses`/`orders`/`order_items`/`payments` definitions first — don't assume the column names above are exactly right; this is a starting shape, not verified against the real DDL). `security definer` is required since this function must succeed for a customer's own anon-key/authenticated session under RLS that currently only allows service-role writes to these tables — grant `execute` explicitly rather than relying on default PUBLIC execute:

```sql
revoke execute on function public.checkout_place_order from public;
grant execute on function public.checkout_place_order to authenticated;
```

- [ ] **Step 3: Update the route to call the RPC**

Replace the 4 separate `.insert()` calls (lines 114-181) with one `await supabaseServer.rpc("checkout_place_order", {...})` call, keeping every existing pre-insert validation step (price re-check, restaurant-open check, reprice guard) exactly as-is beforehand. After the RPC call, keep the existing post-insert payment-resolution logic (the mock payment resolve step) and the conditional cancel-on-failure logic (lines 183-191) — payment resolution stays outside the transaction since it's a synchronous mock step that decides the payment's *final* status, not a write that needs to be atomic with the order creation itself. On payment failure, the existing code already updates `orders.status` to `cancelled` — keep that as a separate follow-up update after the RPC returns, unchanged from current behavior.

- [ ] **Step 4: Run build**

Run: `npm run build`

- [ ] **Step 5: Apply migration and live-verify**

Run: `npx supabase db reset`
Live-verify a full checkout in a real browser (place a real order, confirm it appears correctly for the customer/vendor/admin), and verify the failure path still works: force a payment failure (however the existing mock payment logic allows forcing one — check the Phase 3 plan/route for how failures are simulated) and confirm the order still ends up `cancelled` with no orphaned `order_items`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/*_checkout_rpc.sql app/api/cart/checkout/route.ts
git commit -m "fix: wrap checkout's 4 sequential inserts in a Postgres RPC transaction"
```

---

### Task 11: Vendor order queue filter/sort by status

**Files:**
- Modify: `app/vendor/orders/page.tsx`

**Interfaces:** none new — internal to this file.

- [ ] **Step 1: Read the file in full (93 lines)**

Confirm `loadOrders()` (lines 32-36) and the render block (lines 62-89) and the `NEXT_LABEL` map (lines 16-20) that drives the action button per status.

- [ ] **Step 2: Add a status filter and sort control**

Add local state for a selected status filter (`"all"` default) and a sort toggle (oldest/newest first by `placed_at`, oldest-first already implied by current API order per investigation). Render a `<select>` above the order list populated from the same status values `NEXT_LABEL` already knows about, plus `"all"`. Filter the `orders` array client-side by the selected status before rendering, and reverse the array for newest-first when that sort option is selected. No API/route change needed — purely client-side over the already-fetched list.

- [ ] **Step 3: Run build**

Run: `npm run build`

- [ ] **Step 4: Live-verify**

As a vendor with orders in multiple statuses, filter by each status in a real browser, confirm the list narrows correctly; toggle sort order, confirm order flips.

- [ ] **Step 5: Commit**

```bash
git add app/vendor/orders/page.tsx
git commit -m "feat: add status filter and sort toggle to vendor order queue"
```

---

### Task 12: Vendor menu item edit form

**Files:**
- Modify: `app/vendor/menu/page.tsx`

**Interfaces:**
- Consumes: existing `PATCH /api/vendor/menu-items/[id]` route, which already accepts `{ name, description, category, isVeg, isAvailable, imageUrl, price }` (confirmed in `app/api/vendor/menu-items/[id]/route.ts:28-51` — no route change needed).

- [ ] **Step 1: Read `app/vendor/menu/page.tsx` in full (155 lines)**

Confirm the current list render (lines 127-152: name, `₹{item.price}`, availability toggle, delete) and how the availability toggle already calls the PATCH route (lines 67-71), to match that exact fetch/error-handling pattern for the new edit form.

- [ ] **Step 2: Add an inline edit form per item**

Add an "Edit" toggle per menu item row that reveals input fields for `name`, `description`, `category`, `isVeg` (checkbox), `price` (number input, validated `> 0` client-side before submit — the route itself also validates), and `imageUrl`. On submit, call the existing `PATCH /api/vendor/menu-items/[id]` route with only the changed fields (matching the route's partial-update behavior — it only updates fields present in the body), display the route's `error` on failure exactly like the availability toggle already does, and refresh the item list on success.

- [ ] **Step 3: Run build**

Run: `npm run build`

- [ ] **Step 4: Live-verify**

As a vendor, edit an item's name/price/description/veg flag/image URL in a real browser, confirm it saves and displays correctly; try an invalid image host URL and confirm the route's existing 400 error surfaces in the form.

- [ ] **Step 5: Commit**

```bash
git add app/vendor/menu/page.tsx
git commit -m "feat: add inline edit form for vendor menu items"
```

---

### Task 13: Auto-refresh delivery dashboard's available-orders list

**Files:**
- Modify: `app/delivery/dashboard/page.tsx:37-51`

**Interfaces:** none new — internal to this file.

- [ ] **Step 1: Read the current `loadOrders()` and its single-run effect (lines 37-51)**

Confirm it fetches both `/api/delivery/available-orders` and `/api/delivery/orders` via `Promise.all`, currently only on initial load.

- [ ] **Step 2: Add a polling interval, mirroring the existing ping effect's shape (lines 53-63)**

```typescript
useEffect(() => {
  if (!online) return;
  const interval = setInterval(loadOrders, 10000);
  return () => clearInterval(interval);
}, [online]);
```

Only poll while the partner is online (matches the existing ping effect's gating) — an offline partner can't claim orders anyway, so there's no need to refresh the list for them.

- [ ] **Step 3: Run build**

Run: `npm run build`

- [ ] **Step 4: Live-verify**

With a delivery partner dashboard open and online, have a vendor mark a new order `ready` in another tab; confirm the available-orders list picks it up within ~10s without the partner doing anything.

- [ ] **Step 5: Commit**

```bash
git add app/delivery/dashboard/page.tsx
git commit -m "feat: auto-refresh delivery dashboard available-orders list while online"
```

---

## Explicitly out of scope (confirmed with user, no task needed)

- **No spatial/PostGIS indexing** — MEMORY.md's own note says "revisit if query patterns show it's needed at scale"; no bug exists today, adding an index now would be speculative.
- **No automated test suite** — a genuinely separate, larger undertaking (choosing a framework, writing coverage for 8 phases of existing untested code) rather than a small triage item; out of scope for this pass.
