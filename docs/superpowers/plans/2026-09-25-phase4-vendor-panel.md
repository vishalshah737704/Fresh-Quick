# Phase 4 — Restaurant/Vendor Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor signup/login, menu CRUD, incoming order queue, and
accept/prepare/ready status controls, scoped by RLS to the vendor's own
restaurant.

**Architecture:** Reuses the Phase 3 auth pattern exactly (Supabase Auth +
`public.users.role`, Bearer-token-derived identity on every write route).
`restaurants.owner_id` (already in schema) is the vendor-restaurant link —
no schema change there. New migration adds vendor-scoped RLS policies and
closes the `order_items` permissive-read gap. New `/app/vendor/*` pages and
`/api/vendor/*` routes mirror the shape of `/app/customer/*` and
`/api/cart/checkout`.

**Tech Stack:** Next.js App Router, TypeScript, Supabase JS client, Tailwind.

**Spec:** [docs/superpowers/specs/2026-09-25-phase4-vendor-panel-design.md](../specs/2026-09-25-phase4-vendor-panel-design.md)

## Global Constraints

- Self-hosted Supabase only, no cloud project.
- Any code touching money (prices) must use integer-paise arithmetic, never
  plain float multiplication.
- Every API route that writes data on a vendor's behalf must derive vendor
  identity from a verified `Authorization: Bearer <token>` header via
  `supabaseServer.auth.getUser(token)` — never a client-supplied id.
- Any redirect target taken from a URL query param must be validated via
  `new URL(raw, window.location.origin)` + origin check, returning
  `url.href` (never reassembled parts). Reuse `getSafeRedirect` pattern from
  `app/customer/login/page.tsx`.
- Run `npm run build` (not just `tsc --noEmit`) before marking any new
  page/route task done.
- Menu item images are a plain URL text field — no Storage upload this
  phase.

## Review Focus

- A vendor without a restaurant yet (shouldn't happen post-signup, but a
  stale/malformed session) hitting `/vendor/dashboard` should see a clear
  "no restaurant" state, not a crash on `.single()` with no rows.
- A vendor attempting to edit/delete a menu item belonging to a *different*
  restaurant (crafted request, not just UI-hidden) must be rejected
  server-side (RLS + explicit ownership check in the API route), not just
  hidden in the UI.
- A vendor attempting to advance an order's status out of sequence (e.g.
  `placed` straight to `ready`, or backwards `preparing` to `accepted`)
  must be rejected with 400, not silently applied.
- A vendor attempting to advance the status of an order belonging to
  *another* vendor's restaurant must be rejected (RLS + ownership check),
  not leak or mutate another restaurant's order.
- Vendor signup with an email already used by an existing customer account
  must surface Supabase Auth's duplicate-email error, not silently create a
  second `public.users` row or crash on the profile insert's PK conflict.

---

## File Structure

- `supabase/migrations/00000000000007_vendor_rls.sql` — new migration:
  vendor-scoped RLS on `restaurants`, `menu_items`, `orders`, `order_items`;
  drops the old permissive `order_items` stub policy.
- `lib/order-constants.ts` — add `VENDOR_STATUS_TRANSITIONS` map (modify).
- `app/api/auth/vendor-signup/route.ts` — new signup route (auth user +
  `public.users` role=vendor + `public.restaurants` row), mirrors
  `app/api/auth/signup/route.ts`.
- `app/vendor/login/page.tsx` — login/signup UI, mirrors
  `app/customer/login/page.tsx` but posts to the vendor signup route and
  collects restaurant fields in signup mode.
- `lib/vendor-auth.ts` — small server-side helper
  `resolveVendorRestaurant(token)` used by every `/api/vendor/*` route to
  turn a Bearer token into `{ vendorId, restaurantId }` or a 401/404.
- `app/api/vendor/menu-items/route.ts` — `GET` (list vendor's items),
  `POST` (create).
- `app/api/vendor/menu-items/[id]/route.ts` — `PATCH` (update),
  `DELETE`.
- `app/api/vendor/orders/route.ts` — `GET` (list vendor restaurant's
  orders + items, newest first).
- `app/api/vendor/orders/[id]/status/route.ts` — `POST` (advance status
  along the fixed chain).
- `app/vendor/dashboard/page.tsx` — vendor shell: restaurant name/status
  toggle + nav to menu/orders.
- `app/vendor/menu/page.tsx` — menu CRUD UI.
- `app/vendor/orders/page.tsx` — order queue UI with status-advance
  buttons.
- `components/vendor/useVendorSession.ts` — client hook, mirrors
  `lib/auth.ts`'s `useSession` but also fetches the caller's `role` and
  redirects to `/vendor/login` if not a vendor.

---

### Task 1: Vendor RLS migration

**Files:**
- Create: `supabase/migrations/00000000000007_vendor_rls.sql`

**Interfaces:**
- Produces: RLS policies only, no new tables/columns. Every later task's
  Supabase queries (browser client, anon key, session-scoped) rely on these
  policies to see only the vendor's own rows.

- [ ] **Step 1: Write the migration**

```sql
-- Phase 4: vendor-scoped RLS. Vendors may read/write only rows tied to a
-- restaurant they own (restaurants.owner_id = auth.uid()).

-- restaurants: vendor can read/update/insert their own row(s).
drop policy if exists "stub_allow_authenticated_read" on public.restaurants;
create policy "public_can_read_restaurants" on public.restaurants
  for select using (true);
create policy "vendor_can_insert_own_restaurant" on public.restaurants
  for insert with check (auth.uid() = owner_id);
create policy "vendor_can_update_own_restaurant" on public.restaurants
  for update using (auth.uid() = owner_id);

-- menu_items: public read (unchanged), vendor can write only their own
-- restaurant's items.
drop policy if exists "stub_allow_authenticated_read" on public.menu_items;
create policy "public_can_read_menu_items" on public.menu_items
  for select using (true);
create policy "vendor_can_insert_own_menu_items" on public.menu_items
  for insert with check (
    exists (
      select 1 from public.restaurants
      where restaurants.id = menu_items.restaurant_id
      and restaurants.owner_id = auth.uid()
    )
  );
create policy "vendor_can_update_own_menu_items" on public.menu_items
  for update using (
    exists (
      select 1 from public.restaurants
      where restaurants.id = menu_items.restaurant_id
      and restaurants.owner_id = auth.uid()
    )
  );
create policy "vendor_can_delete_own_menu_items" on public.menu_items
  for delete using (
    exists (
      select 1 from public.restaurants
      where restaurants.id = menu_items.restaurant_id
      and restaurants.owner_id = auth.uid()
    )
  );

-- orders: customers already own-read (Phase 3); add vendor own-restaurant
-- read + status-only update.
create policy "vendor_can_read_own_restaurant_orders" on public.orders
  for select using (
    exists (
      select 1 from public.restaurants
      where restaurants.id = orders.restaurant_id
      and restaurants.owner_id = auth.uid()
    )
  );
create policy "vendor_can_update_own_restaurant_orders" on public.orders
  for update using (
    exists (
      select 1 from public.restaurants
      where restaurants.id = orders.restaurant_id
      and restaurants.owner_id = auth.uid()
    )
  );

-- order_items: close the Phase 1 permissive stub. Customers may read line
-- items of their own orders; vendors may read line items of orders placed
-- against a restaurant they own.
drop policy if exists "stub_allow_authenticated_read" on public.order_items;
create policy "owner_can_read_own_order_items" on public.order_items
  for select using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
      and orders.customer_id = auth.uid()
    )
  );
create policy "vendor_can_read_own_restaurant_order_items" on public.order_items
  for select using (
    exists (
      select 1 from public.orders
      join public.restaurants on restaurants.id = orders.restaurant_id
      where orders.id = order_items.order_id
      and restaurants.owner_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply and verify locally**

Run: `npx supabase db reset` (Docker Desktop must be running first).
Expected: migration applies cleanly, seed data still loads, no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00000000000007_vendor_rls.sql
git commit -m "feat(db): add vendor-scoped RLS policies, close order_items read gap"
```

---

### Task 2: Vendor status-transition constants + vendor-auth helper

**Files:**
- Modify: `lib/order-constants.ts`
- Create: `lib/vendor-auth.ts`

**Interfaces:**
- Produces: `VENDOR_STATUS_TRANSITIONS: Record<string, string>` mapping
  each allowed *current* status to its single allowed *next* status
  (`placed -> accepted -> preparing -> ready`). Produces
  `resolveVendorRestaurant(token: string): Promise<{ vendorId: string; restaurantId: string } | { error: string; status: number }>`
  used by every `/api/vendor/*` route (Task 4+).

- [ ] **Step 1: Add the transition map**

Append to `lib/order-constants.ts`:

```ts
// Phase 4: vendor-drivable status chain. Each key maps to the one status
// a vendor may advance an order to next; statuses past "ready" belong to
// delivery/admin (Phase 5/6) and are not vendor-editable.
export const VENDOR_STATUS_TRANSITIONS: Record<string, string> = {
  placed: "accepted",
  accepted: "preparing",
  preparing: "ready",
};
```

- [ ] **Step 2: Write `lib/vendor-auth.ts`**

```ts
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type VendorResolution =
  | { vendorId: string; restaurantId: string }
  | { error: string; status: number };

export async function resolveVendorRestaurant(
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

  const { data: restaurant, error: restaurantError } = await supabaseServer
    .from("restaurants")
    .select("id")
    .eq("owner_id", vendorId)
    .single();
  if (restaurantError || !restaurant) {
    return { error: "No restaurant found for this vendor", status: 404 };
  }

  return { vendorId, restaurantId: restaurant.id };
}

export function tokenFromRequest(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  return authHeader?.replace(/^Bearer\s+/i, "") ?? undefined;
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/order-constants.ts lib/vendor-auth.ts
git commit -m "feat: add vendor status-transition map and vendor-auth resolver"
```

---

### Task 3: Vendor signup API route

**Files:**
- Create: `app/api/auth/vendor-signup/route.ts`
- Test manually (no automated test suite exists in this repo yet, per
  MEMORY.md — verification is the manual step below, matching every prior
  phase's pattern).

**Interfaces:**
- Consumes: `supabaseServer` from `lib/supabase-server.ts`.
- Produces: `POST /api/auth/vendor-signup` accepting
  `{ email, password, fullName, restaurantName, cuisineTags: string[], lat: number, lng: number }`,
  returning `{ ok: true }` or `{ error: string }`.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const { email, password, fullName, restaurantName, cuisineTags, lat, lng } =
    await request.json();

  if (!email || !password || !fullName || !restaurantName) {
    return NextResponse.json(
      { error: "email, password, fullName, and restaurantName are required" },
      { status: 400 }
    );
  }
  if (
    typeof lat !== "number" || !Number.isFinite(lat) ||
    typeof lng !== "number" || !Number.isFinite(lng)
  ) {
    return NextResponse.json({ error: "Invalid restaurant location" }, { status: 400 });
  }
  const tags: string[] = Array.isArray(cuisineTags) ? cuisineTags : [];

  const { data: created, error: createError } =
    await supabaseServer.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message ?? "Failed to create account" },
      { status: 400 }
    );
  }

  const { error: profileError } = await supabaseServer
    .from("users")
    .insert({ id: created.user.id, role: "vendor", full_name: fullName });

  if (profileError) {
    await supabaseServer.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: restaurantError } = await supabaseServer
    .from("restaurants")
    .insert({
      owner_id: created.user.id,
      name: restaurantName,
      cuisine_tags: tags,
      lat,
      lng,
      is_open: false,
    });

  if (restaurantError) {
    await supabaseServer.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: restaurantError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, then `curl` (or the UI in Task 5) a POST to
`/api/auth/vendor-signup` with a fresh email.
Expected: `{ "ok": true }`; Supabase Studio shows a new `users` row with
`role='vendor'` and a matching `restaurants` row with `is_open=false`.

- [ ] **Step 3: Commit**

```bash
git add app/api/auth/vendor-signup/route.ts
git commit -m "feat: add vendor signup API route"
```

---

### Task 4: Vendor login/signup page

**Files:**
- Create: `app/vendor/login/page.tsx`
- Modify: none

**Interfaces:**
- Consumes: `supabase` from `lib/supabase.ts`, `POST /api/auth/vendor-signup`
  (Task 3), cuisine tag list fetched client-side from `cuisine_taxonomy`
  table (public read, already RLS-open per migration 3).
- Produces: page at `/vendor/login`, redirects to `/vendor/dashboard` on
  success via the same `getSafeRedirect` pattern as
  `app/customer/login/page.tsx`.

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function getSafeRedirect(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.href : "/vendor/dashboard";
  } catch {
    return "/vendor/dashboard";
  }
}

function VendorLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirectTo = searchParams.get("redirectTo") ?? "/vendor/dashboard";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [restaurantName, setRestaurantName] = useState("");
  const [lat, setLat] = useState("12.9716");
  const [lng, setLng] = useState("77.5946");
  const [cuisineOptions, setCuisineOptions] = useState<{ slug: string; label: string }[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("cuisine_taxonomy")
      .select("slug, label")
      .then(({ data }) => setCuisineOptions(data ?? []));
  }, []);

  function toggleTag(slug: string) {
    setSelectedTags((prev) =>
      prev.includes(slug) ? prev.filter((t) => t !== slug) : [...prev, slug]
    );
  }

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setSubmitting(false);
      setError(signInError.message);
      return;
    }
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user.id;
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", userId)
      .single();
    setSubmitting(false);
    if (profile?.role !== "vendor") {
      setError("This account is not a vendor account.");
      await supabase.auth.signOut();
      return;
    }
    router.push(getSafeRedirect(rawRedirectTo));
  }

  async function handleSignup() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/vendor-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        fullName,
        restaurantName,
        cuisineTags: selectedTags,
        lat: Number(lat),
        lng: Number(lng),
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setSubmitting(false);
      setError(body.error ?? "Signup failed");
      return;
    }
    await handleLogin();
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-bold">
        {mode === "login" ? "Vendor log in" : "Vendor sign up"}
      </h1>
      <div className="flex flex-col gap-2">
        {mode === "signup" && (
          <>
            <input
              className="rounded border px-2 py-1"
              placeholder="Your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
            <input
              className="rounded border px-2 py-1"
              placeholder="Restaurant name"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {cuisineOptions.map((c) => (
                <button
                  type="button"
                  key={c.slug}
                  onClick={() => toggleTag(c.slug)}
                  className={`rounded px-2 py-1 text-xs ${
                    selectedTags.includes(c.slug)
                      ? "bg-brand-primary text-white"
                      : "bg-gray-100"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="w-1/2 rounded border px-2 py-1"
                placeholder="Latitude"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
              <input
                className="w-1/2 rounded border px-2 py-1"
                placeholder="Longitude"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </div>
          </>
        )}
        <input
          className="rounded border px-2 py-1"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="rounded border px-2 py-1"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={submitting}
          onClick={mode === "login" ? handleLogin : handleSignup}
          className="rounded bg-brand-primary px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="text-sm text-gray-500 underline"
        >
          {mode === "login" ? "New restaurant? Sign up" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

export default function VendorLoginPage() {
  return (
    <Suspense fallback={null}>
      <VendorLoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: succeeds, no missing-Suspense-boundary error (the `useSearchParams`
call is already wrapped, matching the Phase 3 fix).

- [ ] **Step 3: Commit**

```bash
git add app/vendor/login/page.tsx
git commit -m "feat: add vendor login/signup page"
```

---

### Task 5: `useVendorSession` hook

**Files:**
- Create: `components/vendor/useVendorSession.ts`

**Interfaces:**
- Consumes: `supabase` from `lib/supabase.ts`.
- Produces: `useVendorSession(): { vendorId: string | null; restaurantId: string | null; loading: boolean }`,
  used by every `/app/vendor/*` page (Tasks 6, 7, 8) to guard access and
  redirect non-vendors to `/vendor/login`.

- [ ] **Step 1: Write the hook**

```ts
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function useVendorSession() {
  const router = useRouter();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        if (!cancelled) router.push("/vendor/login");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();
      if (profile?.role !== "vendor") {
        if (!cancelled) router.push("/vendor/login");
        return;
      }
      const { data: restaurant } = await supabase
        .from("restaurants")
        .select("id")
        .eq("owner_id", userId)
        .single();
      if (cancelled) return;
      setVendorId(userId);
      setRestaurantId(restaurant?.id ?? null);
      setLoading(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { vendorId, restaurantId, loading };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/vendor/useVendorSession.ts
git commit -m "feat: add useVendorSession client hook"
```

---

### Task 6: Menu-items API routes (list/create/update/delete)

**Files:**
- Create: `app/api/vendor/menu-items/route.ts`
- Create: `app/api/vendor/menu-items/[id]/route.ts`

**Interfaces:**
- Consumes: `resolveVendorRestaurant`, `tokenFromRequest` from
  `lib/vendor-auth.ts` (Task 2).
- Produces: `GET/POST /api/vendor/menu-items`,
  `PATCH/DELETE /api/vendor/menu-items/[id]`.

- [ ] **Step 1: Write the list/create route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("menu_items")
    .select("*")
    .eq("restaurant_id", resolved.restaurantId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load menu items" }, { status: 500 });
  }
  return NextResponse.json({ items: data });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { name, description, price, category, isVeg, imageUrl } = await request.json();
  if (!name || typeof price !== "number" || !Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "name and a positive price are required" }, { status: 400 });
  }
  const pricePaise = Math.round(price * 100);
  const { data, error } = await supabaseServer
    .from("menu_items")
    .insert({
      restaurant_id: resolved.restaurantId,
      name,
      description: description ?? null,
      price: pricePaise / 100,
      category: category ?? null,
      is_veg: Boolean(isVeg),
      image_url: imageUrl ?? null,
    })
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to create menu item" }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}
```

- [ ] **Step 2: Write the update/delete route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";

async function assertOwnsItem(restaurantId: string, itemId: string) {
  const { data, error } = await supabaseServer
    .from("menu_items")
    .select("id")
    .eq("id", itemId)
    .eq("restaurant_id", restaurantId)
    .single();
  return !error && !!data;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsItem(resolved.restaurantId, id))) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }
  const body = await request.json();
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name;
  if (typeof body.description === "string") update.description = body.description;
  if (typeof body.category === "string") update.category = body.category;
  if (typeof body.isVeg === "boolean") update.is_veg = body.isVeg;
  if (typeof body.isAvailable === "boolean") update.is_available = body.isAvailable;
  if (typeof body.imageUrl === "string") update.image_url = body.imageUrl;
  if (typeof body.price === "number") {
    if (!Number.isFinite(body.price) || body.price <= 0) {
      return NextResponse.json({ error: "price must be positive" }, { status: 400 });
    }
    update.price = Math.round(body.price * 100) / 100;
  }

  const { data, error } = await supabaseServer
    .from("menu_items")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to update menu item" }, { status: 500 });
  }
  return NextResponse.json({ item: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  if (!(await assertOwnsItem(resolved.restaurantId, id))) {
    return NextResponse.json({ error: "Menu item not found" }, { status: 404 });
  }
  const { error } = await supabaseServer.from("menu_items").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Failed to delete menu item" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/vendor/menu-items
git commit -m "feat: add vendor menu-items CRUD API routes"
```

---

### Task 7: Vendor menu page UI

**Files:**
- Create: `app/vendor/menu/page.tsx`

**Interfaces:**
- Consumes: `useVendorSession` (Task 5), `supabase.auth.getSession()` for
  the Bearer token, `/api/vendor/menu-items*` (Task 6).

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVendorSession } from "@/components/vendor/useVendorSession";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category: string | null;
  is_veg: boolean;
  is_available: boolean;
  image_url: string | null;
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorMenuPage() {
  const { loading } = useVendorSession();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadItems() {
    const res = await fetch("/api/vendor/menu-items", { headers: await authHeader() });
    const body = await res.json();
    if (res.ok) setItems(body.items);
  }

  useEffect(() => {
    if (!loading) loadItems();
  }, [loading]);

  async function addItem() {
    setError(null);
    const priceNumber = Number(price);
    if (!name || !Number.isFinite(priceNumber) || priceNumber <= 0) {
      setError("Name and a positive price are required");
      return;
    }
    const res = await fetch("/api/vendor/menu-items", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ name, price: priceNumber, imageUrl: imageUrl || undefined }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Failed to add item");
      return;
    }
    setName("");
    setPrice("");
    setImageUrl("");
    await loadItems();
  }

  async function toggleAvailable(item: MenuItem) {
    await fetch(`/api/vendor/menu-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ isAvailable: !item.is_available }),
    });
    await loadItems();
  }

  async function deleteItem(id: string) {
    await fetch(`/api/vendor/menu-items/${id}`, {
      method: "DELETE",
      headers: await authHeader(),
    });
    await loadItems();
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold">Menu</h1>
      <div className="mb-6 flex flex-col gap-2 rounded border p-3">
        <input
          className="rounded border px-2 py-1"
          placeholder="Item name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="rounded border px-2 py-1"
          placeholder="Price (rupees)"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
        <input
          className="rounded border px-2 py-1"
          placeholder="Image URL (optional)"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          onClick={addItem}
          className="rounded bg-brand-primary px-3 py-2 text-sm text-white"
        >
          Add item
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between rounded border p-2">
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-sm text-gray-500">
                ₹{item.price} · {item.is_available ? "Available" : "Unavailable"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => toggleAvailable(item)}
                className="rounded bg-gray-100 px-2 py-1 text-xs"
              >
                {item.is_available ? "Mark unavailable" : "Mark available"}
              </button>
              <button
                onClick={() => deleteItem(item.id)}
                className="rounded bg-red-100 px-2 py-1 text-xs text-red-700"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/vendor/menu/page.tsx
git commit -m "feat: add vendor menu CRUD page"
```

---

### Task 8: Orders API routes (list + status advance)

**Files:**
- Create: `app/api/vendor/orders/route.ts`
- Create: `app/api/vendor/orders/[id]/status/route.ts`

**Interfaces:**
- Consumes: `resolveVendorRestaurant`, `tokenFromRequest` (Task 2),
  `VENDOR_STATUS_TRANSITIONS` (Task 2).

- [ ] **Step 1: Write the list route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, status, subtotal, delivery_fee, total, placed_at, order_items(id, quantity, unit_price, menu_items(name))")
    .eq("restaurant_id", resolved.restaurantId)
    .order("placed_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
  return NextResponse.json({ orders: data });
}
```

- [ ] **Step 2: Write the status-advance route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorRestaurant, tokenFromRequest } from "@/lib/vendor-auth";
import { VENDOR_STATUS_TRANSITIONS } from "@/lib/order-constants";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveVendorRestaurant(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, status, restaurant_id")
    .eq("id", id)
    .eq("restaurant_id", resolved.restaurantId)
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const nextStatus = VENDOR_STATUS_TRANSITIONS[order.status];
  if (!nextStatus) {
    return NextResponse.json(
      { error: `Order in status "${order.status}" cannot be advanced by a vendor` },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ status: nextStatus })
    .eq("id", id)
    .select("id, status")
    .single();
  if (updateError || !updated) {
    return NextResponse.json({ error: "Failed to update order status" }, { status: 500 });
  }
  return NextResponse.json({ order: updated });
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/vendor/orders
git commit -m "feat: add vendor order-queue list and status-advance API routes"
```

---

### Task 9: Vendor orders page UI + dashboard shell

**Files:**
- Create: `app/vendor/orders/page.tsx`
- Create: `app/vendor/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useVendorSession` (Task 5), `/api/vendor/orders*` (Task 8).

- [ ] **Step 1: Write the orders page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVendorSession } from "@/components/vendor/useVendorSession";

type OrderItem = { id: string; quantity: number; unit_price: number; menu_items: { name: string } | null };
type Order = {
  id: string;
  status: string;
  total: number;
  placed_at: string;
  order_items: OrderItem[];
};

const NEXT_LABEL: Record<string, string> = {
  placed: "Accept",
  accepted: "Start preparing",
  preparing: "Mark ready",
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorOrdersPage() {
  const { loading } = useVendorSession();
  const [orders, setOrders] = useState<Order[]>([]);

  async function loadOrders() {
    const res = await fetch("/api/vendor/orders", { headers: await authHeader() });
    const body = await res.json();
    if (res.ok) setOrders(body.orders);
  }

  useEffect(() => {
    if (!loading) loadOrders();
  }, [loading]);

  async function advance(orderId: string) {
    await fetch(`/api/vendor/orders/${orderId}/status`, {
      method: "POST",
      headers: await authHeader(),
    });
    await loadOrders();
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold">Orders</h1>
      <ul className="flex flex-col gap-3">
        {orders.map((order) => (
          <li key={order.id} className="rounded border p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                Order #{order.id.slice(0, 8)} · {order.status}
              </p>
              {NEXT_LABEL[order.status] && (
                <button
                  onClick={() => advance(order.id)}
                  className="rounded bg-brand-primary px-2 py-1 text-xs text-white"
                >
                  {NEXT_LABEL[order.status]}
                </button>
              )}
            </div>
            <ul className="mt-2 text-sm text-gray-600">
              {order.order_items.map((item) => (
                <li key={item.id}>
                  {item.quantity}× {item.menu_items?.name ?? "Item"}
                </li>
              ))}
            </ul>
            <p className="mt-1 text-sm font-medium">₹{order.total}</p>
          </li>
        ))}
        {orders.length === 0 && <p className="text-sm text-gray-500">No orders yet.</p>}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Write the dashboard shell**

```tsx
"use client";

import Link from "next/link";
import { useVendorSession } from "@/components/vendor/useVendorSession";

export default function VendorDashboardPage() {
  const { loading, restaurantId } = useVendorSession();

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
      <h1 className="mb-4 text-xl font-bold">Vendor dashboard</h1>
      <div className="flex gap-4">
        <Link href="/vendor/menu" className="rounded bg-gray-100 px-3 py-2 text-sm">
          Manage menu
        </Link>
        <Link href="/vendor/orders" className="rounded bg-gray-100 px-3 py-2 text-sm">
          Order queue
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: succeeds, no console errors.

- [ ] **Step 4: Commit**

```bash
git add app/vendor/orders/page.tsx app/vendor/dashboard/page.tsx
git commit -m "feat: add vendor orders page and dashboard shell"
```

---

### Task 10: Whole-phase manual verification

**Files:** none (verification task).

- [ ] **Step 1: Confirm Docker Desktop running, `.env.local` present** (see
  HANDOFF_1.md for how to regenerate it if missing).

- [ ] **Step 2: `npx supabase db reset && npm run dev`**

- [ ] **Step 3: Sign up a new vendor at `/vendor/login`, add a menu item,
  toggle it available.**

- [ ] **Step 4: As a customer, place an order against that restaurant
  (Phase 2/3 flow) — note the restaurant will need `is_open` set to `true`
  first; toggle it via Supabase Studio or a follow-up "restaurant open"
  toggle if one exists.**

- [ ] **Step 5: Back in the vendor orders queue, confirm the order
  appears, advance it accepted → preparing → ready, confirm each click
  updates status in Supabase Studio.**

- [ ] **Step 6: `npm run build` one final time for the whole branch.**

- [ ] **Step 7: Commit any fixes found during manual verification.**

---

## Self-Review Notes

- Spec coverage: vendor login ✓ (Task 4), menu CRUD ✓ (Tasks 6-7), order
  queue ✓ (Task 8-9), status controls ✓ (Task 8-9), vendor signup ✓ (Task
  3-4), RLS/`order_items` gap ✓ (Task 1). All spec sections covered.
- Review Focus items each map to an explicit check: no-restaurant state
  (Task 9 dashboard), cross-restaurant menu edit (Task 6
  `assertOwnsItem` + RLS), out-of-sequence status (Task 8
  `VENDOR_STATUS_TRANSITIONS` lookup), cross-restaurant status update
  (Task 8 `.eq("restaurant_id", ...)` guard), duplicate vendor email
  (Task 3, reuses the same Supabase Auth error surface Phase 3 already
  relies on for customers).
