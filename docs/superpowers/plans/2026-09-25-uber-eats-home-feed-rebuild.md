# Uber Eats-style redesign — Piece 2: Home/Feed Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real per-restaurant delivery fee + promo text (schema, vendor UI, checkout wiring), redesign the restaurant card, and give the customer home page a search dropdown, a sort/filter bar, and three curated carousel sections — matching Uber Eats' feed patterns within what this project's data can actually support.

**Architecture:** A small schema migration adds two columns to `restaurants`. Money flows through the existing integer-paise-at-computation, rupee-at-the-RPC-boundary pattern the checkout route already uses — no new pattern introduced. The home page (`app/customer/page.tsx`) already loads the full restaurant list client-side and derives cuisine-grouped carousels from it in-memory; the new sort/filter bar and curated carousels extend that same in-memory derivation, no new Supabase queries except the search dropdown's cross-restaurant dish lookup (new, since dish names aren't in the already-loaded restaurant list). Every new UI element reuses piece 1's established tokens/shape rules (8px radius, pill buttons, `bg-brand-accent/10` for tinted fills) and existing component patterns (`CuisineChip`'s active/inactive toggle styling, `CuisineCarouselRow`'s reusable row shell).

**Tech Stack:** Next.js 15 (App Router), Supabase (Postgres + PostgREST via `@supabase/supabase-js`), TypeScript, Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-09-25-uber-eats-home-feed-rebuild-design.md`

## Global Constraints

- New columns: `restaurants.delivery_fee_paise integer not null default 3000` (₹30, matches today's flat fee exactly), `restaurants.promo_text text` (nullable).
- All money arithmetic in integer paise until the Supabase RPC call boundary, where it converts to a rupee float — the exact pattern `app/api/cart/checkout/route.ts` already uses for `subtotal`/`total`. Never a raw float computation in between.
- No RLS policy changes: `restaurants` already has a public-read policy covering all columns; all writes to the new columns go through the existing service-role-backed `/api/vendor/restaurant` route, never a new client-side RLS write policy (per this project's standing rule against RLS write policies on service-role-only tables).
- **Ruling carried from planning** (the spec left this open): the sort/filter bar's **sort** control (Rating / Delivery fee / Prep time / Distance) reorders only the two flat-grid render paths (the selected-cuisine grid and the no-carousel-available flat-grid fallback) — it does **not** reorder the cuisine-grouped carousel rows or the three curated carousels (Popular near you / Offers near you / Quick delivery), which keep their own fixed ordering (distance for cuisine rows, rating for Popular, etc. — reordering "Popular near you" by delivery fee would defeat its purpose). The **"Under 30 min" filter**, by contrast, narrows the shared `searched` array itself (same as the existing `selectedCuisine` filter already does), so it does affect every carousel and grid downstream — a user filtering by prep time expects it to narrow everything, and this matches the existing filter precedent in the codebase.
- Colors/fonts/radius/shadow: follow piece 1's tokens exactly (`bg-brand-primary`, `bg-brand-accent/10`, `rounded-lg`, `rounded-full` for buttons, no default card shadows) — do not introduce new hex values or radii.
- `npm run build` must pass after every task, not just `tsc --noEmit`.

## Review Focus

- **`delivery_fee_paise` negative or non-numeric input from the vendor dashboard**: the PATCH route must reject a negative or non-finite `deliveryFeeRupees` (mirrors the existing `isOpen` boolean-type check's strictness) — a vendor typing `-5` or leaving the field non-numeric must not silently corrupt the stored fee or crash the route.
- **`expectedTotal` mismatch after a vendor changes their delivery fee mid-checkout**: the checkout route's existing `expectedTotal` guard (409 on mismatch) must still fire correctly now that the delivery fee is a variable per-restaurant value instead of a constant — a stale-price race here is exactly the class of bug the guard exists for, and the fee becoming variable is new surface for it.
- **A restaurant with `promo_text` set to an empty string vs. `null`**: the PATCH route's normalization (empty string → `null`) must actually run, or an empty-but-truthy string could render an empty badge on the card — this is called out in the spec but easy to skip in a fast implementation.
- **Dish-search query returning items from closed/suspended restaurants**: `menu_items` has no `is_open`/`is_suspended` awareness of its own restaurant — the dish-match query must join and filter on the parent restaurant's `is_open`/`is_suspended` (the home page's own restaurant list already excludes those), or the dropdown could route a customer straight to an unorderable restaurant.
- **Empty/loading states for the three new curated carousels and the sort/filter bar** when the restaurant list is empty or still loading — `app/customer/page.tsx` already has early returns for `restaurants === null` and `restaurants.length === 0`; the new sections must not render (or must render sensibly) before restaurants load, not throw on `undefined`.

---

## File Structure

- Create: `supabase/migrations/00000000000016_restaurant_delivery_fee_promo.sql`
- Create: `components/SortFilterBar.tsx` — new sort/filter toggle row
- Modify: `lib/order-constants.ts` — remove `DELIVERY_FEE_RUPEES` (superseded by the per-restaurant column; nothing references it as logic after Task 3)
- Modify: `app/api/vendor/restaurant/route.ts` — accept `deliveryFeeRupees`/`promoText` in the PATCH body
- Modify: `app/vendor/dashboard/page.tsx` — new fee/promo fields + save actions
- Modify: `app/api/cart/checkout/route.ts` — read `delivery_fee_paise` from the restaurant row instead of the constant
- Modify: `app/customer/checkout/page.tsx` — fetch and display the restaurant's real delivery fee
- Modify: `components/RestaurantCard.tsx` — metadata line + promo badge
- Modify: `components/CuisineCarouselRow.tsx` — local `Restaurant` type gains the two new fields
- Modify: `components/HeaderSearchBox.tsx` — dropdown with restaurant + dish matches
- Modify: `app/customer/page.tsx` — wire in the search dropdown's data, sort/filter bar, and three curated carousels

---

### Task 1: Schema migration — delivery fee and promo text

**Files:**
- Create: `supabase/migrations/00000000000016_restaurant_delivery_fee_promo.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `restaurants.delivery_fee_paise` (integer, not null, default 3000) and `restaurants.promo_text` (text, nullable) — consumed by every later task in this plan.

- [ ] **Step 1: Write the migration**

```sql
-- Uber Eats-style redesign piece 2: real per-restaurant delivery fee and
-- optional promo text, replacing the flat DELIVERY_FEE_RUPEES constant.
-- 3000 paise = Rs 30, matching today's flat fee exactly so every existing
-- restaurant's checkout total is unchanged until a vendor edits it.
alter table public.restaurants
  add column delivery_fee_paise integer not null default 3000,
  add column promo_text text;

alter table public.restaurants
  add constraint restaurants_delivery_fee_paise_check check (delivery_fee_paise >= 0);
```

- [ ] **Step 2: Apply to the running local Supabase stack**

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres < supabase/migrations/00000000000016_restaurant_delivery_fee_promo.sql`
Expected: `ALTER TABLE` then `ALTER TABLE` (the constraint), no errors.

- [ ] **Step 3: Record the migration as applied**

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "insert into supabase_migrations.schema_migrations (version, name) values ('00000000000016', 'restaurant_delivery_fee_promo');"`
Expected: `INSERT 0 1`.

- [ ] **Step 4: Verify existing restaurants got the default**

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "select delivery_fee_paise, promo_text from public.restaurants limit 3;"`
Expected: every row shows `delivery_fee_paise = 3000` and `promo_text` empty/null — confirms the default backfilled existing rows without a data migration.

- [ ] **Step 5: Verify a full `supabase db reset` replay also succeeds**

Run: `npx supabase db reset` (requires Docker Desktop running; this rebuilds the stack from every migration file in order, replaying `00000000000016` fresh rather than against an already-altered table)
Expected: reset completes with no SQL errors, ending in the usual "Finished supabase db reset" success output. This is a bigger operation than Step 2 — if the local stack is mid-use for other work, confirm before running (it resets all local data, not just this migration).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00000000000016_restaurant_delivery_fee_promo.sql
git commit -m "feat: add restaurants.delivery_fee_paise and promo_text columns"
```

---

### Task 2: Vendor dashboard fee/promo fields

**Files:**
- Modify: `app/api/vendor/restaurant/route.ts`
- Modify: `app/vendor/dashboard/page.tsx`

**Interfaces:**
- Consumes: `restaurants.delivery_fee_paise`/`promo_text` (Task 1).
- Produces: `PATCH /api/vendor/restaurant` accepting `{ deliveryFeeRupees?: number, promoText?: string | null }` in addition to its existing `{ isOpen?: boolean }`, returning the updated row under `{ restaurant }` (unchanged response shape) — consumed by Task 3's checkout page only insofar as it's the same restaurant row shape read there.

- [ ] **Step 1: Extend the PATCH route to accept and validate the new fields**

Replace `app/api/vendor/restaurant/route.ts`'s body-validation section (the route currently requires `isOpen` to be present and boolean; the new fields must be independently optional so a dashboard save of just the fee doesn't require re-sending `isOpen`):

```typescript
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";

export async function PATCH(request: NextRequest) {
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const body = await request.json();

  const update: Record<string, boolean | number | string | null> = {};

  if ("isOpen" in body) {
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
    update.is_open = body.isOpen;
  }

  if ("deliveryFeeRupees" in body) {
    const fee = Number(body.deliveryFeeRupees);
    if (!Number.isFinite(fee) || fee < 0) {
      return NextResponse.json(
        { error: "deliveryFeeRupees must be a non-negative number" },
        { status: 400 }
      );
    }
    update.delivery_fee_paise = Math.round(fee * 100);
  }

  if ("promoText" in body) {
    if (body.promoText !== null && typeof body.promoText !== "string") {
      return NextResponse.json({ error: "promoText must be a string or null" }, { status: 400 });
    }
    const trimmed = typeof body.promoText === "string" ? body.promoText.trim() : null;
    update.promo_text = trimmed === "" ? null : trimmed;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("restaurants")
    .update(update)
    .eq("id", resolved.restaurantId)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to update restaurant" }, { status: 500 });
  }
  return NextResponse.json({ restaurant: data });
}
```

- [ ] **Step 2: Verify the route rejects a negative fee**

Run: `npm run app:start` (or confirm the dev server is already running), then, as the seeded vendor (`vendor.demo@foodhub.local` / `demo1234`, using the same `authHeader()` pattern already in `app/vendor/dashboard/page.tsx`), send `PATCH /api/vendor/restaurant` with body `{"deliveryFeeRupees": -5}`.
Expected: HTTP 400, body `{"error":"deliveryFeeRupees must be a non-negative number"}`. This can be done via the browser's dev console with `fetch(...)` while logged into `/vendor/dashboard`, or via Playwright — either is acceptable, the point is confirming the 400 before wiring the UI in Step 3.

- [ ] **Step 3: Add the dashboard fields**

Replace `app/vendor/dashboard/page.tsx`'s full contents:

```typescript
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVendorSession } from "@/components/vendor/useVendorSession";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorDashboardPage() {
  const { loading, restaurantId } = useVendorSession();
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [deliveryFeeRupees, setDeliveryFeeRupees] = useState("");
  const [promoText, setPromoText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadRestaurant() {
      if (!restaurantId) return;
      const { data } = await supabase
        .from("restaurants")
        .select("is_open, delivery_fee_paise, promo_text")
        .eq("id", restaurantId)
        .single();
      setIsOpen(data?.is_open ?? null);
      setDeliveryFeeRupees(data ? (data.delivery_fee_paise / 100).toString() : "");
      setPromoText(data?.promo_text ?? "");
    }
    if (!loading) loadRestaurant();
  }, [loading, restaurantId]);

  async function toggleOpen() {
    if (isOpen === null) return;
    setActionError(null);
    const res = await fetch("/api/vendor/restaurant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ isOpen: !isOpen }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setActionError(body?.error ?? "Failed to update restaurant");
      return;
    }
    setIsOpen(body.restaurant.is_open);
  }

  async function saveFeeAndPromo() {
    setActionError(null);
    setSavedMessage(null);
    const fee = Number(deliveryFeeRupees);
    if (!Number.isFinite(fee) || fee < 0) {
      setActionError("Delivery fee must be a non-negative number");
      return;
    }
    const res = await fetch("/api/vendor/restaurant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ deliveryFeeRupees: fee, promoText: promoText.trim() || null }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setActionError(body?.error ?? "Failed to update restaurant");
      return;
    }
    setDeliveryFeeRupees((body.restaurant.delivery_fee_paise / 100).toString());
    setPromoText(body.restaurant.promo_text ?? "");
    setSavedMessage("Saved.");
  }

  if (loading) return <p>Loading…</p>;
  if (!restaurantId) {
    return (
      <p className="text-sm text-red-600">
        No restaurant is linked to this account. Contact support.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold text-brand-ink">Vendor dashboard</h1>
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3">
        <p className="text-sm">
          Restaurant is currently{" "}
          <span className="font-medium">{isOpen ? "open" : "closed"}</span>
        </p>
        <button
          onClick={toggleOpen}
          disabled={isOpen === null}
          className="rounded-full bg-brand-primary px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {isOpen ? "Close restaurant" : "Open restaurant"}
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3">
        <label className="text-sm font-medium text-brand-ink">Delivery fee (rupees)</label>
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
          value={deliveryFeeRupees}
          onChange={(e) => setDeliveryFeeRupees(e.target.value)}
        />
        <label className="text-sm font-medium text-brand-ink">Promo text (optional)</label>
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
          placeholder="e.g. 25% off ₹150+"
          value={promoText}
          onChange={(e) => setPromoText(e.target.value)}
        />
        <button
          onClick={saveFeeAndPromo}
          className="self-start rounded-full bg-brand-primary px-3 py-2 text-sm text-white"
        >
          Save
        </button>
        {savedMessage && <p className="text-sm text-brand-accent">{savedMessage}</p>}
      </div>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}
      <div className="flex gap-4">
        <Link href="/vendor/menu" className="rounded-lg bg-brand-accent/10 px-3 py-2 text-sm text-brand-ink">
          Manage menu
        </Link>
        <Link href="/vendor/orders" className="rounded-lg bg-brand-accent/10 px-3 py-2 text-sm text-brand-ink">
          Order queue
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Manually verify via the browser**

Log in at `/vendor/login` as `vendor.demo@foodhub.local` / `demo1234`, go to `/vendor/dashboard`, set delivery fee to `45` and promo text to `20% off ₹200+`, click Save.
Expected: "Saved." appears, and reloading the page shows the same values persisted (confirms the `select` in the `useEffect` reads back what was written).

- [ ] **Step 5: Verify empty promo text normalizes to `null`, not an empty string**

Clear the promo-text field entirely (so it's `""`) and click Save again.
Expected: "Saved." appears. Then verify directly:
Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "select promo_text is null as is_null, promo_text from public.restaurants where id = (select id from public.restaurants where name = 'Demo Kitchen');"`
Expected: `is_null = t` (true), not an empty-but-non-null string — confirms the route's `trimmed === "" ? null : trimmed` normalization actually ran, not just that the field visually cleared client-side. This matters because `RestaurantCard`'s promo badge in Task 4 checks `restaurant.promo_text &&`, which is falsy for both `""` and `null` in JS — so this bug wouldn't be visible from the card alone and needs this direct DB check.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/vendor/restaurant/route.ts app/vendor/dashboard/page.tsx
git commit -m "feat: add delivery fee and promo text fields to vendor dashboard"
```

---

### Task 3: Checkout wiring

**Files:**
- Modify: `app/api/cart/checkout/route.ts`
- Modify: `app/customer/checkout/page.tsx`
- Modify: `lib/order-constants.ts`

**Interfaces:**
- Consumes: `restaurants.delivery_fee_paise` (Task 1).
- Produces: nothing new — this task removes the last logic-usage of `DELIVERY_FEE_RUPEES` and replaces it with the per-restaurant value at both call sites.

- [ ] **Step 1: Remove `DELIVERY_FEE_RUPEES` from `lib/order-constants.ts`**

Replace the file's contents (removing just the first export, keeping the rest unchanged):

```typescript
// mock_card / mock_upi resolve randomly at this success rate; mock_cod
// always succeeds (paying on delivery can't fail at order time).
export const PAYMENT_SUCCESS_RATE = 0.8;

// Phase 4: vendor-drivable status chain. Each key maps to the one status
// a vendor may advance an order to next; statuses past "ready" belong to
// delivery/admin (Phase 5/6) and are not vendor-editable.
export const VENDOR_STATUS_TRANSITIONS: Record<string, string> = {
  placed: "accepted",
  accepted: "preparing",
  preparing: "ready",
};

// Phase 5: delivery-partner-drivable status chain. "assigned" is entered
// via the claim endpoint, not this map (claim is a special first
// transition guarded by its own ready+unassigned check, not a simple
// status->status lookup).
export const DELIVERY_STATUS_TRANSITIONS: Record<string, string> = {
  assigned: "picked_up",
  picked_up: "delivered",
};
```

- [ ] **Step 2: Wire the checkout route to the real fee**

In `app/api/cart/checkout/route.ts`, remove the `DELIVERY_FEE_RUPEES` import and replace the restaurant lookup and fee calculation:

Replace:
```typescript
import { DELIVERY_FEE_RUPEES, PAYMENT_SUCCESS_RATE } from "@/lib/order-constants";
```
with:
```typescript
import { PAYMENT_SUCCESS_RATE } from "@/lib/order-constants";
```

Replace:
```typescript
  const { data: restaurant, error: restaurantError } = await supabaseServer
    .from("restaurants")
    .select("id, is_open, is_suspended")
    .eq("id", restaurantId)
    .single();
```
with:
```typescript
  const { data: restaurant, error: restaurantError } = await supabaseServer
    .from("restaurants")
    .select("id, is_open, is_suspended, delivery_fee_paise")
    .eq("id", restaurantId)
    .single();
```

Replace:
```typescript
  const deliveryFeePaise = Math.round(DELIVERY_FEE_RUPEES * 100);
```
with:
```typescript
  const deliveryFeePaise = restaurant.delivery_fee_paise;
```

Replace:
```typescript
    p_delivery_fee: DELIVERY_FEE_RUPEES,
```
with:
```typescript
    p_delivery_fee: deliveryFeePaise / 100,
```

- [ ] **Step 3: Wire the checkout page to display the real fee**

Replace `app/customer/checkout/page.tsx`'s full contents:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { useAddress } from "@/lib/address-store";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const PAYMENT_METHODS = [
  { value: "mock_card", label: "Mock Card" },
  { value: "mock_upi", label: "Mock UPI" },
  { value: "mock_cod", label: "Cash on Delivery" },
] as const;

export default function CheckoutPage() {
  const router = useRouter();
  const { restaurantId, restaurantName, items, subtotal, clearCart } = useCart();
  const { lat, lng, label } = useAddress();
  const { userId, loading: sessionLoading } = useSession();

  const [paymentMethod, setPaymentMethod] =
    useState<(typeof PAYMENT_METHODS)[number]["value"]>("mock_card");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deliveryFeeRupees, setDeliveryFeeRupees] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadFee() {
      if (!restaurantId) return;
      const { data } = await supabase
        .from("restaurants")
        .select("delivery_fee_paise")
        .eq("id", restaurantId)
        .single();
      if (!cancelled) setDeliveryFeeRupees(data ? data.delivery_fee_paise / 100 : null);
    }
    loadFee();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  if (sessionLoading) {
    return <p className="text-gray-500">Loading…</p>;
  }

  if (!userId) {
    router.push("/customer/login?redirectTo=/customer/checkout");
    return null;
  }

  if (items.length === 0 || !restaurantId) {
    return <p className="text-gray-500">Your cart is empty.</p>;
  }

  if (deliveryFeeRupees === null) {
    return <p className="text-gray-500">Loading…</p>;
  }

  const total = subtotal + deliveryFeeRupees;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError("Session expired — please log in again");
        setSubmitting(false);
        return;
      }
      const res = await fetch("/api/cart/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({
          restaurantId,
          items: items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
          deliveryAddress: { label, lat, lng },
          paymentMethod,
          expectedTotal: total,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Checkout failed");
        setSubmitting(false);
        return;
      }
      if (result.paymentStatus === "success") {
        clearCart();
      }
      router.push(`/customer/orders/${result.orderId}`);
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-brand-ink">Checkout</h1>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-1 font-semibold text-brand-ink">Delivery address</h2>
            <p className="text-sm text-brand-ink-muted">{label}</p>
          </section>

          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-3 font-semibold text-brand-ink">Payment method</h2>
            <div className="flex flex-col gap-2">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                    paymentMethod === m.value
                      ? "border-brand-primary bg-brand-primary/5"
                      : "border-brand-ink-muted/15"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    checked={paymentMethod === m.value}
                    onChange={() => setPaymentMethod(m.value)}
                    className="accent-brand-primary"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </section>
        </div>

        <aside className="lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-3 font-semibold text-brand-ink">
              {items.length} item{items.length !== 1 ? "s" : ""} from {restaurantName}
            </h2>
            <div className="flex flex-col gap-1 border-t border-brand-ink-muted/10 pt-3 text-sm text-brand-ink-muted">
              <p>Subtotal: ₹{subtotal.toFixed(2)}</p>
              <p>Delivery fee: ₹{deliveryFeeRupees.toFixed(2)}</p>
              <p className="font-semibold text-brand-ink">Total: ₹{total.toFixed(2)}</p>
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

            <button
              disabled={submitting}
              onClick={handleSubmit}
              className="mt-4 w-full rounded-full bg-brand-primary px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Placing order…" : "Place order"}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify no remaining references to `DELIVERY_FEE_RUPEES`**

Run: `grep -rn "DELIVERY_FEE_RUPEES" app/ components/ lib/`
Expected: no output (empty).

- [ ] **Step 5: Manually verify checkout uses the real fee**

Using the vendor account from Task 2 (delivery fee set to ₹45), place a real order as a customer through that restaurant's checkout. Confirm the checkout page shows "Delivery fee: ₹45.00" and the total includes it, then confirm the placed order's stored fee matches:

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "select delivery_fee from public.orders order by created_at desc limit 1;"`
Expected: `45.00` (or `45`, depending on the column's numeric display), not `30.00`.

- [ ] **Step 6: Verify the `expectedTotal` guard still fires when the fee changes mid-checkout**

This reproduces the race the guard exists for, now with a variable fee instead of a constant: open the checkout page for a restaurant (so its client-computed `total` uses the fee value fetched in Step 3's `useEffect`), then — without reloading the checkout page — change that restaurant's delivery fee via `/vendor/dashboard` in a second tab, then submit the order from the still-open first tab.
Expected: HTTP 409 with `"Prices have changed since you added items to your cart. Please review your order."`, order NOT placed. This confirms the route's existing `Math.abs(expectedTotal - total) > 0.01` check still catches a stale total now that `total` depends on a value that can change between page-load and submit, not just menu-item price edits (the only case this guard previously had to catch).

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/order-constants.ts app/api/cart/checkout/route.ts app/customer/checkout/page.tsx
git commit -m "feat: wire checkout to each restaurant's real delivery fee"
```

---

### Task 4: Restaurant card redesign

**Files:**
- Modify: `components/RestaurantCard.tsx`
- Modify: `components/CuisineCarouselRow.tsx`

**Interfaces:**
- Consumes: `restaurants.delivery_fee_paise`/`promo_text` (Task 1).
- Produces: `RestaurantCard`'s `restaurant` prop type gains `delivery_fee_paise: number` and `promo_text: string | null`. `CuisineCarouselRow.tsx` declares its own separate local `Restaurant` type (not a shared import) and forwards its `restaurant` prop into `RestaurantCard` — its type must gain the same two fields in this task, or Task 7's build fails with a type error at that forwarding call, since TypeScript enforces `CuisineCarouselRow`'s own narrower declared type when passing `restaurant` onward, regardless of what the caller (`app/customer/page.tsx`) actually supplies at runtime. Consumed by every call site constructing this prop (`app/customer/page.tsx`'s grids and the three curated `CuisineCarouselRow` calls plus the cuisine-grouped ones, all in Task 7).

- [ ] **Step 1: Replace `RestaurantCard.tsx`**

```typescript
import Image from "next/image";
import Link from "next/link";

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  banner_url: string | null;
  delivery_fee_paise: number;
  promo_text: string | null;
};

export function RestaurantCard({
  restaurant,
  distanceKm,
}: {
  restaurant: Restaurant;
  distanceKm: number;
}) {
  const feeRupees = restaurant.delivery_fee_paise / 100;
  const feeLabel = feeRupees === 0 ? "₹0 Delivery Fee" : `₹${feeRupees.toFixed(0)} Delivery Fee`;

  return (
    <Link
      href={`/customer/restaurants/${restaurant.id}`}
      className="block overflow-hidden rounded-lg border border-brand-ink-muted/10 bg-brand-surface shadow-none transition-shadow hover:shadow-[0_3px_14px_-6px_rgba(0,0,0,0.18)]"
    >
      <div className="relative h-40 w-full bg-brand-accent/10">
        {restaurant.banner_url ? (
          <Image
            src={restaurant.banner_url}
            alt={restaurant.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">🍽️</div>
        )}
      </div>
      <div className="p-4">
        {restaurant.promo_text && (
          <span className="mb-1 inline-block rounded-full bg-brand-accent px-2 py-0.5 text-xs font-semibold text-brand-ink">
            {restaurant.promo_text}
          </span>
        )}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-brand-ink">{restaurant.name}</h3>
          <span className="text-sm text-brand-ink-muted">{distanceKm.toFixed(1)} km</span>
        </div>
        <p className="text-sm text-brand-ink-muted">{restaurant.cuisine_tags.join(", ")}</p>
        <p className="mt-1 text-xs text-brand-ink-muted">
          ⭐ {restaurant.rating.toFixed(1)} · {restaurant.avg_prep_minutes} min ·{" "}
          <span className={feeRupees === 0 ? "font-semibold text-brand-accent" : ""}>
            {feeLabel}
          </span>
        </p>
      </div>
    </Link>
  );
}
```

Note: the rating badge that previously overlaid the image (`absolute right-2 top-2 ... shadow`) is removed — rating now lives in the metadata line per the spec's "•"-delimited pattern. This also removes the one `shadow` (unadorned Tailwind base shadow class) that piece 1's radius/shadow audit didn't catch because it only searched for `shadow-sm|md|lg`, not bare `shadow` — flagging this as piece 1 drift now closed, not a new violation.

- [ ] **Step 2: Update `CuisineCarouselRow.tsx`'s local `Restaurant` type**

Replace `components/CuisineCarouselRow.tsx`'s type declaration:

```typescript
type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  banner_url: string | null;
  delivery_fee_paise: number;
  promo_text: string | null;
};
```

(only the type declaration changes — the rest of the file, including the component body and its `restaurants.length === 0 → null` guard, is unchanged.)

- [ ] **Step 3: Verify no remaining bare `shadow` class outside the two piece-1-approved exceptions**

Run: `grep -rn "\bshadow\b" app/ components/ --include="*.tsx"`
Expected: only `CartPanel.tsx` and `CartConflictDialog.tsx` (both `shadow-lg`, unaffected by this task) plus `RestaurantCard.tsx`'s own `hover:shadow-[...]` arbitrary-value class (which contains the substring "shadow" as part of `hover:shadow-[...]`, not a bare `shadow` class — inspect the grep output to confirm no unqualified `className="...shadow..."` remains).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: fails — `app/customer/page.tsx` still passes a `Restaurant` object (its own type, defined in that file) to `RestaurantCard`/`CuisineCarouselRow` without the two new fields, so TypeScript will report a type error there. This is expected; Task 7 updates that call site. Do not consider this task's build a gate — proceed to Task 7, which re-runs the build as its own gate covering the call site together with Tasks 5-6's changes (Tasks 5 and 6 also touch `app/customer/page.tsx` before that final build, so a clean build after Task 4 alone isn't achievable without duplicating Task 7's edits early).

- [ ] **Step 5: Commit**

```bash
git add components/RestaurantCard.tsx components/CuisineCarouselRow.tsx
git commit -m "feat: redesign restaurant card with fee/promo metadata line"
```

---

### Task 5: Search dropdown

**Files:**
- Modify: `components/HeaderSearchBox.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks in this plan.
- Produces: `HeaderSearchBox` gains two new required props, `restaurants: { id: string; name: string; cuisine_tags: string[] }[]` and (unchanged) `value`/`onChange` — consumed by `app/customer/page.tsx` in Task 7, which is the only call site.

- [ ] **Step 1: Replace `HeaderSearchBox.tsx`**

```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type RestaurantOption = { id: string; name: string; cuisine_tags: string[] };
type DishMatch = { id: string; name: string; restaurant_id: string; restaurant_name: string };

export function HeaderSearchBox({
  value,
  onChange,
  restaurants,
}: {
  value: string;
  onChange: (value: string) => void;
  restaurants: RestaurantOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dishMatches, setDishMatches] = useState<DishMatch[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = value.trim();
    if (query === "") {
      setDishMatches([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("menu_items")
        .select("id, name, restaurant_id, restaurants!inner(name, is_open, is_suspended)")
        .ilike("name", `%${query}%`)
        .eq("is_available", true)
        .eq("restaurants.is_open", true)
        .eq("restaurants.is_suspended", false)
        .limit(8);
      if (cancelled) return;
      const rows = (data ?? []) as unknown as {
        id: string;
        name: string;
        restaurant_id: string;
        restaurants: { name: string } | { name: string }[];
      }[];
      setDishMatches(
        rows.map((row) => ({
          id: row.id,
          name: row.name,
          restaurant_id: row.restaurant_id,
          restaurant_name: Array.isArray(row.restaurants) ? row.restaurants[0]?.name ?? "" : row.restaurants.name,
        }))
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const query = value.trim().toLowerCase();
  const restaurantMatches =
    query === ""
      ? []
      : restaurants
          .filter(
            (r) =>
              r.name.toLowerCase().includes(query) ||
              r.cuisine_tags.some((t) => t.toLowerCase().includes(query))
          )
          .slice(0, 8);

  const showDropdown = open && query !== "" && (restaurantMatches.length > 0 || dishMatches.length > 0 || true);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder="Search restaurants or cuisines"
        className="w-full rounded-full border border-brand-ink-muted/20 bg-brand-surface px-4 py-2 text-sm text-brand-ink placeholder:text-brand-ink-muted/60 focus:border-brand-primary focus:outline-none"
      />
      {showDropdown && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-brand-ink-muted/10 bg-brand-surface shadow-[0_3px_14px_-6px_rgba(0,0,0,0.18)]">
          {restaurantMatches.length > 0 && (
            <div>
              {restaurantMatches.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setOpen(false);
                    router.push(`/customer/restaurants/${r.id}`);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-brand-accent/10"
                >
                  {r.name} — {r.cuisine_tags.join(", ")}
                </button>
              ))}
            </div>
          )}
          {dishMatches.length > 0 && (
            <div className="border-t border-brand-ink-muted/10">
              {dishMatches.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    setOpen(false);
                    router.push(`/customer/restaurants/${d.restaurant_id}`);
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-brand-ink hover:bg-brand-accent/10"
                >
                  {d.name} <span className="text-brand-ink-muted">· {d.restaurant_name}</span>
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setOpen(false)}
            className="block w-full border-t border-brand-ink-muted/10 px-4 py-2 text-left text-sm font-medium text-brand-ink hover:bg-brand-accent/10"
          >
            Search for &quot;{value}&quot;
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: fails — `app/customer/page.tsx` still calls `<HeaderSearchBox value={...} onChange={...} />` without the new required `restaurants` prop, a TypeScript error. Expected at this point in the plan; Task 7 updates that call site. As with Task 4, do not treat this as a task-blocking failure — confirm the *reported error* is specifically the missing `restaurants` prop (not some other break), then proceed.

Run: `grep -n "restaurants: RestaurantOption\[\]" components/HeaderSearchBox.tsx`
Expected: one match, confirming the new prop's type declaration compiled into the file as written (a lighter-weight sanity check than a full build for this task alone).

- [ ] **Step 3: Commit**

```bash
git add components/HeaderSearchBox.tsx
git commit -m "feat: add live search dropdown with restaurant and dish matches"
```

---

### Task 6: Sort/filter bar

**Files:**
- Create: `components/SortFilterBar.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: 
  ```typescript
  export type SortOption = "distance" | "rating" | "deliveryFee" | "prepTime";
  export function SortFilterBar(props: {
    sortBy: SortOption;
    onSortByChange: (value: SortOption) => void;
    under30: boolean;
    onUnder30Toggle: (value: boolean) => void;
  }): JSX.Element
  ```
  — consumed by `app/customer/page.tsx` in Task 7, the only call site.

- [ ] **Step 1: Write `components/SortFilterBar.tsx`**

```typescript
export type SortOption = "distance" | "rating" | "deliveryFee" | "prepTime";

const SORT_LABELS: Record<SortOption, string> = {
  distance: "Distance",
  rating: "Rating",
  deliveryFee: "Delivery fee",
  prepTime: "Prep time",
};

export function SortFilterBar({
  sortBy,
  onSortByChange,
  under30,
  onUnder30Toggle,
}: {
  sortBy: SortOption;
  onSortByChange: (value: SortOption) => void;
  under30: boolean;
  onUnder30Toggle: (value: boolean) => void;
}) {
  function toggleSort(option: SortOption) {
    onSortByChange(sortBy === option ? "distance" : option);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => toggleSort("rating")}
        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
          sortBy === "rating"
            ? "border-brand-primary bg-brand-primary text-white"
            : "border-brand-ink-muted/20 bg-brand-surface text-brand-ink hover:border-brand-primary"
        }`}
      >
        Rating
      </button>
      <button
        onClick={() => toggleSort("deliveryFee")}
        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
          sortBy === "deliveryFee"
            ? "border-brand-primary bg-brand-primary text-white"
            : "border-brand-ink-muted/20 bg-brand-surface text-brand-ink hover:border-brand-primary"
        }`}
      >
        Delivery fee
      </button>
      <button
        onClick={() => onUnder30Toggle(!under30)}
        className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
          under30
            ? "border-brand-primary bg-brand-primary text-white"
            : "border-brand-ink-muted/20 bg-brand-surface text-brand-ink hover:border-brand-primary"
        }`}
      >
        Under 30 min
      </button>
      <select
        value={sortBy}
        onChange={(e) => onSortByChange(e.target.value as SortOption)}
        className="rounded-full border border-brand-ink-muted/20 bg-brand-surface px-4 py-2 text-sm text-brand-ink focus:border-brand-primary focus:outline-none"
      >
        {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
          <option key={option} value={option}>
            Sort: {SORT_LABELS[option]}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Verify the file compiles standalone**

Run: `npx tsc --noEmit components/SortFilterBar.tsx 2>&1 | grep -v "Cannot find module\|Cannot find name 'JSX'"`
Expected: no output — filters out the expected "cannot find module" noise from checking a single file outside the full project graph (no `tsconfig` context), while still surfacing any real syntax/type error within the file itself. (A full `npm run build` isn't meaningful yet since this component has no consumer until Task 7.)

- [ ] **Step 3: Commit**

```bash
git add components/SortFilterBar.tsx
git commit -m "feat: add sort/filter bar component"
```

---

### Task 7: Wire the home page — search data, sort/filter, curated carousels

**Files:**
- Modify: `app/customer/page.tsx`

**Interfaces:**
- Consumes: `RestaurantCard`'s new required props (Task 4), `HeaderSearchBox`'s new `restaurants` prop (Task 5), `SortFilterBar`/`SortOption` (Task 6).
- Produces: nothing new — this is the plan's integration point, the last task to touch shared interfaces.

- [ ] **Step 1: Replace `app/customer/page.tsx`**

```typescript
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAddress } from "@/lib/address-store";
import { haversineDistanceKm } from "@/lib/geo";
import { RestaurantCard } from "@/components/RestaurantCard";
import { HeroSearch } from "@/components/HeroSearch";
import { PromoBanner } from "@/components/PromoBanner";
import { CuisineChipRow } from "@/components/CuisineChipRow";
import { CuisineCarouselRow } from "@/components/CuisineCarouselRow";
import { HeaderSearchBox } from "@/components/HeaderSearchBox";
import { SortFilterBar, type SortOption } from "@/components/SortFilterBar";

type Restaurant = {
  id: string;
  name: string;
  cuisine_tags: string[];
  rating: number;
  avg_prep_minutes: number;
  is_open: boolean;
  lat: number;
  lng: number;
  banner_url: string | null;
  delivery_fee_paise: number;
  promo_text: string | null;
};

type Cuisine = {
  slug: string;
  label: string;
};

export default function CustomerHomePage() {
  const { lat, lng } = useAddress();
  const [restaurants, setRestaurants] = useState<Restaurant[] | null>(null);
  const [cuisines, setCuisines] = useState<Cuisine[]>([]);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("distance");
  const [under30, setUnder30] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data, error: fetchError }, { data: cuisineData }] = await Promise.all([
        supabase
          .from("restaurants")
          .select(
            "id, name, cuisine_tags, rating, avg_prep_minutes, is_open, lat, lng, banner_url, delivery_fee_paise, promo_text"
          )
          .eq("is_open", true)
          .eq("is_suspended", false),
        supabase.from("cuisine_taxonomy").select("slug, label").order("label"),
      ]);
      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setRestaurants(data ?? []);
      setCuisines(cuisineData ?? []);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-red-600">Couldn&apos;t load restaurants: {error}</p>;
  }

  if (restaurants === null) {
    return <p className="text-brand-ink-muted">Loading restaurants…</p>;
  }

  const withDistance = restaurants
    .map((r) => ({ r, distanceKm: haversineDistanceKm(lat, lng, r.lat, r.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);

  const labelBySlug = new Map(cuisines.map((c) => [c.slug, c.label.toLowerCase()]));

  const query = searchQuery.trim().toLowerCase();
  const matchesQuery = (r: Restaurant) =>
    query === "" ||
    r.name.toLowerCase().includes(query) ||
    r.cuisine_tags.some(
      (tag) => tag.toLowerCase().includes(query) || (labelBySlug.get(tag) ?? "").includes(query)
    );

  // "Under 30 min" narrows every downstream view (carousels, grids, curated
  // sections) — same precedent as selectedCuisine already narrowing
  // everything via `filtered`. See plan's Global Constraints for why this
  // differs from the sort dropdown, which only reorders the two flat-grid
  // paths below.
  const searched = withDistance.filter(
    ({ r }) => matchesQuery(r) && (!under30 || r.avg_prep_minutes < 30)
  );

  const filtered = searched.filter(
    ({ r }) => selectedCuisine === null || r.cuisine_tags.includes(selectedCuisine)
  );

  function applySort<T extends { r: Restaurant; distanceKm: number }>(rows: T[]): T[] {
    const sorted = [...rows];
    if (sortBy === "rating") sorted.sort((a, b) => b.r.rating - a.r.rating);
    else if (sortBy === "deliveryFee") sorted.sort((a, b) => a.r.delivery_fee_paise - b.r.delivery_fee_paise);
    else if (sortBy === "prepTime") sorted.sort((a, b) => a.r.avg_prep_minutes - b.r.avg_prep_minutes);
    // "distance" is already the incoming order (withDistance is pre-sorted).
    return sorted;
  }

  const sortedFiltered = applySort(filtered);
  const sortedSearched = applySort(searched);

  // Curated carousels — each derived from `searched` (post-filter,
  // pre-cuisine-selection), independent of the sort/filter bar's sort
  // choice per the plan's Global Constraints ruling.
  const popularNearYou = [...searched].sort((a, b) => b.r.rating - a.r.rating).slice(0, 10);
  const offersNearYou = searched.filter(({ r }) => r.promo_text !== null);
  const quickDelivery = searched.filter(({ r }) => r.avg_prep_minutes < 30).slice(0, 10);

  // Group by cuisine for the carousel view. A restaurant with multiple
  // cuisine_tags appears once per matching tag it has, not just its first.
  const byCuisine = cuisines.map((c) => ({
    cuisine: c,
    restaurants: searched
      .filter(({ r }) => r.cuisine_tags.includes(c.slug))
      .map(({ r, distanceKm }) => ({ restaurant: r, distanceKm })),
  }));

  // Restaurants with no cuisine tag matching any known taxonomy slug (e.g. a
  // freshly signed-up vendor with cuisine_tags: []) or a failed/empty
  // cuisine_taxonomy fetch must never silently vanish from the carousel
  // view — fall back to the flat grid whenever any searched restaurant
  // isn't represented in a single carousel row.
  const groupedIds = new Set(byCuisine.flatMap(({ restaurants }) => restaurants.map(({ restaurant }) => restaurant.id)));
  const hasUngroupedRestaurant = searched.some(({ r }) => !groupedIds.has(r.id));
  const useCarouselView = cuisines.length > 0 && !hasUngroupedRestaurant;

  return (
    <div className="flex flex-col gap-6">
      <HeroSearch />
      <PromoBanner message="Free delivery on your first order 🎉" />
      <HeaderSearchBox
        value={searchQuery}
        onChange={setSearchQuery}
        restaurants={restaurants.map((r) => ({ id: r.id, name: r.name, cuisine_tags: r.cuisine_tags }))}
      />
      <SortFilterBar sortBy={sortBy} onSortByChange={setSortBy} under30={under30} onUnder30Toggle={setUnder30} />
      <CuisineChipRow cuisines={cuisines} selected={selectedCuisine} onSelect={setSelectedCuisine} />
      <div id="restaurants" />
      {restaurants.length === 0 ? (
        <p className="text-brand-ink-muted">No open restaurants near you right now.</p>
      ) : selectedCuisine !== null ? (
        sortedFiltered.length === 0 ? (
          <p className="text-brand-ink-muted">No restaurants match that cuisine right now.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedFiltered.map(({ r, distanceKm }) => (
              <RestaurantCard key={r.id} restaurant={r} distanceKm={distanceKm} />
            ))}
          </div>
        )
      ) : searched.length === 0 ? (
        <p className="text-brand-ink-muted">
          No restaurants match &quot;{searchQuery}&quot;.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          <CuisineCarouselRow label="Popular near you" restaurants={popularNearYou} />
          <CuisineCarouselRow label="Offers near you" restaurants={offersNearYou} />
          <CuisineCarouselRow label="Quick delivery" restaurants={quickDelivery} />
          {useCarouselView ? (
            byCuisine.map(({ cuisine, restaurants: rows }) => (
              <CuisineCarouselRow key={cuisine.slug} label={cuisine.label} restaurants={rows} />
            ))
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortedSearched.map(({ r, distanceKm }) => (
                <RestaurantCard key={r.id} restaurant={r} distanceKm={distanceKm} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

Note: the three curated `CuisineCarouselRow` calls render unconditionally alongside the existing carousel/grid branch — `CuisineCarouselRow` already returns `null` when its `restaurants` array is empty (existing behavior, unchanged), so "Offers near you" simply doesn't appear when no restaurant has `promo_text` set, satisfying the spec's requirement without new conditional logic.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build succeeds with no errors — this is the first clean build since Task 4, now that every call site (this file) supplies the new props Tasks 4-6 introduced.

- [ ] **Step 3: Verify the "Under 30 min" filter narrows every section**

Manually: on `/customer`, toggle "Under 30 min" and confirm restaurant counts drop consistently across the curated carousels, the cuisine-grouped rows, and the flat-grid fallback (if triggered) — not just one of them. This confirms the Global Constraints ruling was implemented as a filter on `searched` (shared by all) rather than accidentally scoped to only one render path.

- [ ] **Step 4: Verify the sort dropdown does NOT reorder curated/cuisine carousels**

Manually: set "Sort: Delivery fee", confirm the flat-grid/selected-cuisine-grid view reorders by fee, but "Popular near you" stays ordered by rating and the cuisine-grouped rows stay ordered by distance — confirming sort was scoped only to `sortedFiltered`/`sortedSearched`, not applied to `popularNearYou`/`offersNearYou`/`quickDelivery`/`byCuisine`.

- [ ] **Step 5: Commit**

```bash
git add app/customer/page.tsx
git commit -m "feat: wire search dropdown, sort/filter bar, and curated carousels into home page"
```

---

### Task 8: Full smoke test — search, filters, and money-path re-verification

**Files:**
- None modified — verification only, extending piece 1's established smoke-test pattern to this piece's new functional surface (search, filters, checkout money path) in addition to a visual pass.

**Interfaces:**
- Consumes: the completed Tasks 1-7.
- Produces: a pass/fail confirmation this plan's Testing Plan requires.

- [ ] **Step 1: Start the app**

Follow `docs/DEPLOYMENT.md` section 3 (Docker Desktop running, `.env.local` populated), then `npm run app:start` (or `app:start:dev`). Confirm `http://localhost:3000` returns HTTP 200.

- [ ] **Step 2: Dish search end-to-end**

Find a menu item name that exists on exactly one restaurant and doesn't share words with that restaurant's own name or cuisine tags (e.g. `/vendor/menu`'s item list for the seeded demo vendor, or query directly: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -c "select name, restaurant_id from menu_items limit 5;"`). On `/customer`, type that dish name into the search box and confirm it appears under the dish-match group in the dropdown (not the restaurant-match group), and clicking it navigates to the correct restaurant.

- [ ] **Step 3: Dish search excludes closed/suspended restaurants**

As the seeded admin (`admin@foodhub.local` / `admin-demo-password`), suspend the restaurant used in Step 2 (`/admin/dashboard`'s Suspend button). Repeat the same dish search.
Expected: that dish no longer appears in the dropdown's dish-match group — confirms the `restaurants.is_open`/`is_suspended` join filter in Task 5's query actually excludes it, not just that the query runs. Un-suspend the restaurant afterward to restore prior state for any further testing.

- [ ] **Step 4: Full 4-surface visual smoke test**

Same pattern as piece 1's Task 4: screenshot `/customer` (now showing the search bar, sort/filter bar, and up to 3 new curated carousels plus the existing cuisine rows), a restaurant detail page, `/vendor/dashboard` (now showing the fee/promo fields), `/delivery/dashboard`, and `/admin/dashboard`, at 1280×800 and 390×844. Confirm legibility and correct token usage (no piece-1 regressions — this piece only added new elements, didn't touch piece 1's token files).

- [ ] **Step 5: Confirm no leftover references to the old flat-fee behavior**

Run: `grep -rn "DELIVERY_FEE_RUPEES\|3000 paise\|flat.*delivery" app/ components/ lib/ --include="*.ts" --include="*.tsx"`
Expected: no output, or only comments that clearly describe historical context (e.g. Task 1's migration comment mentioning "matching today's flat fee" is fine since it's in a `.sql` file this grep doesn't scan) — confirms Task 3's removal was complete and nothing silently reintroduced the constant.

- [ ] **Step 6: Commit (only if Step 4 found a real regression)**

If a real visual regression was found and fixed:
```bash
git add -A
git commit -m "fix: address regression found in home/feed rebuild smoke test"
```
If no regressions were found, skip this step.
