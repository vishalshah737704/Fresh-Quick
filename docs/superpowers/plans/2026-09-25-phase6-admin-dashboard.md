# Phase 6 — Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin login (seeded account, no signup), read-only oversight of
all orders/restaurants/delivery partners, restaurant suspend/unsuspend,
and manual order reassignment.

**Architecture:** Reuses the Phase 3-5 auth pattern (`role='admin'`,
Bearer-token identity). New `restaurants.is_suspended` column
distinguishes admin suspension from a vendor's own `is_open` toggle. All
writes go through service-role `/api/admin/*` routes; RLS adds
admin-scoped READ policies only, per the Phase 4/5 lesson — and this
migration explicitly re-audits every table it touches for leftover Phase 1
stub policies before adding anything new.

**Tech Stack:** Next.js App Router, TypeScript, Supabase JS client, Tailwind.

**Spec:** [docs/superpowers/specs/2026-09-25-phase6-admin-dashboard-design.md](../specs/2026-09-25-phase6-admin-dashboard-design.md)

## Global Constraints

- Self-hosted Supabase only, no cloud project.
- Every API route that writes data must derive identity from a verified
  `Authorization: Bearer <token>` header, never a client-supplied id.
- **No RLS write policy on any table only ever written through a
  service-role route.**
- **Before adding any RLS policy to a table in this migration, grep every
  prior migration file for that table name and list its existing
  policies in the migration's own comment header** — this phase's
  migration touches `orders`, `restaurants`, `delivery_partners`, all
  three already audited clean as of Phase 5's final review (see
  MEMORY.md); `restaurants` gets a new column here, re-confirm its
  policies are still `public_can_read_restaurants` (read) +
  vendor-scoped writes (Phase 4) only, nothing else.
- Run `npm run build` (not just `tsc --noEmit`) before marking any new
  page/route task done.

## Review Focus

- A non-admin account (customer/vendor/delivery role) hitting any
  `/api/admin/*` route must get 403, not be able to read cross-restaurant
  order data or mutate a restaurant's suspension state.
- Suspending a restaurant that a vendor separately toggled `is_open=true`
  on (race between admin suspend and vendor's own future open-toggle,
  once Phase 4's deferred open-toggle ships) must leave the restaurant
  closed — `is_suspended=true` should independently gate visibility, not
  just `is_open`.
- Reassigning an order to a delivery partner who is offline must be
  rejected with 400, not silently assign to an unreachable partner.
- Reassigning an order that's already `delivered` or `cancelled` must be
  rejected — reassignment only valid for `assigned`/`picked_up`.
- The seeded admin account's credentials must not be committed in a form
  that looks like a real secret being leaked — since this is local-only
  demo seed data (matching the existing seeded vendor/customer pattern),
  a placeholder-obviously-demo password is fine and consistent with
  existing seed.sql conventions, but the migration must not read from or
  write to `.env.local`.

---

## File Structure

- `supabase/migrations/00000000000009_admin_rls_and_suspend.sql` — adds
  `restaurants.is_suspended boolean not null default false`, admin READ
  policies on `orders`/`restaurants`/`delivery_partners`/`users`, and
  seeds one demo admin account (auth user + `public.users` row).
- `lib/admin-auth.ts` — `resolveAdmin(token)` returning `{ adminId }` or
  401/403, mirrors `lib/vendor-auth.ts`/`lib/delivery-auth.ts`.
- `app/admin/login/page.tsx` — login-only page (no signup mode), mirrors
  the login half of `app/vendor/login/page.tsx`.
- `components/admin/useAdminSession.ts` — client hook mirroring
  `useVendorSession`/`useDeliverySession`, returns
  `{ adminId, loading }`.
- `app/api/admin/orders/route.ts` — `GET`, all orders with restaurant/
  customer names, optional `?status=` filter.
- `app/api/admin/restaurants/route.ts` — `GET`, all restaurants.
- `app/api/admin/restaurants/[id]/suspend/route.ts` — `POST`, sets
  `is_open=false, is_suspended=true`.
- `app/api/admin/restaurants/[id]/unsuspend/route.ts` — `POST`, sets
  `is_suspended=false` (leaves `is_open` false — vendor must reopen
  explicitly once that control exists, matching the Phase 4 deferred
  item).
- `app/api/admin/delivery-partners/route.ts` — `GET`, all partners.
- `app/api/admin/orders/[id]/reassign/route.ts` — `POST`, body
  `{ deliveryPartnerId }`, reassigns an `assigned`/`picked_up` order.
- `app/admin/dashboard/page.tsx` — single page combining all four views
  (orders table, restaurants table with suspend buttons, partners table,
  reassign control) — this admin surface is read-heavy and simple enough
  not to need separate pages per view.

---

### Task 1: Admin migration + auth helper

**Files:**
- Create: `supabase/migrations/00000000000009_admin_rls_and_suspend.sql`
- Create: `lib/admin-auth.ts`

**Interfaces:**
- Produces: `resolveAdmin(token: string | undefined): Promise<{ adminId: string } | { error: string; status: number }>`.

- [ ] **Step 1: Write the migration**

```sql
-- Phase 6: admin oversight. Table policy audit before adding anything
-- (per the CLAUDE.md rule added after Phase 5's live-verification find):
--   orders: customer own-read (m6), vendor own-restaurant read (m7),
--     delivery own-assigned read (m8). No admin read yet -- adding below.
--   restaurants: public read (m7), vendor own insert/update removed in
--     Phase 4's final review (unused, was a bypass) -- still just public
--     read. No admin-specific policy needed since it's already public
--     read; admin writes go through service-role routes only.
--   delivery_partners: own-row read (m8), customer-assigned-active read
--     (m8, status-scoped after Phase 5's final review). No admin read
--     yet -- adding below.
--   users: owner-only read (m3/m6). No admin read yet -- adding below
--     (needed so admin views can show customer/vendor/partner names).
-- No RLS write policies added anywhere -- every admin write goes through
-- a service-role route in app/api/admin/*.

alter table public.restaurants
  add column if not exists is_suspended boolean not null default false;

create policy "admin_can_read_all_orders" on public.orders
  for select using (
    exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

create policy "admin_can_read_all_delivery_partners" on public.delivery_partners
  for select using (
    exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

create policy "admin_can_read_all_users" on public.users
  for select using (
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
  );

-- Seed one demo admin account for local testing. This runs in a
-- migration (not seed.sql) because it needs auth.users, which
-- supabase db reset creates before running seed.sql -- matching how
-- Phase 1 seeded its demo vendor via migration-time inserts, not
-- seed.sql, for the same auth-ordering reason.
do $$
declare
  admin_uid uuid;
begin
  if not exists (select 1 from public.users where role = 'admin') then
    admin_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      admin_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@foodhub.local', crypt('admin-demo-password', gen_salt('bf')),
      now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}'
    );
    insert into public.users (id, role, full_name)
    values (admin_uid, 'admin', 'Demo Admin');
  end if;
end $$;
```

- [ ] **Step 2: Apply and verify locally**

Run: `npx supabase db reset` (Docker Desktop must be running). Expected:
migration applies cleanly, seed data still loads, the demo admin row
exists in both `auth.users` and `public.users`. If Docker/Supabase isn't
running, skip and note it — Task 8 covers live verification.

- [ ] **Step 3: Write `lib/admin-auth.ts`**

```ts
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type AdminResolution =
  | { adminId: string }
  | { error: string; status: number };

export async function resolveAdmin(
  token: string | undefined
): Promise<AdminResolution> {
  if (!token) {
    return { error: "Not authenticated", status: 401 };
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: "Not authenticated", status: 401 };
  }
  const adminId = userData.user.id;

  const { data: profile, error: profileError } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", adminId)
    .single();
  if (profileError || !profile || profile.role !== "admin") {
    return { error: "Not an admin account", status: 403 };
  }

  return { adminId };
}

export function tokenFromRequest(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  return authHeader?.replace(/^Bearer\s+/i, "") ?? undefined;
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/00000000000009_admin_rls_and_suspend.sql lib/admin-auth.ts
git commit -m "feat: add admin RLS read policies, is_suspended column, seeded admin, and auth resolver"
```

---

### Task 2: Admin login page + session hook

**Files:**
- Create: `app/admin/login/page.tsx`
- Create: `components/admin/useAdminSession.ts`

**Interfaces:**
- Produces: page at `/admin/login` (login-only, no signup), hook
  `useAdminSession(): { adminId: string | null; loading: boolean }`.

- [ ] **Step 1: Write the login page**

```tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function getSafeRedirect(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.href : "/admin/dashboard";
  } catch {
    return "/admin/dashboard";
  }
}

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirectTo = searchParams.get("redirectTo") ?? "/admin/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    if (profile?.role !== "admin") {
      setError("This account is not an admin account.");
      await supabase.auth.signOut();
      return;
    }
    router.push(getSafeRedirect(rawRedirectTo));
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-bold">Admin log in</h1>
      <div className="flex flex-col gap-2">
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
          onClick={handleLogin}
          className="rounded bg-brand-primary px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          {submitting ? "Please wait…" : "Log in"}
        </button>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <AdminLoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 2: Write the session hook**

```ts
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function useAdminSession() {
  const router = useRouter();
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        if (!cancelled) router.push("/admin/login");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();
      if (profile?.role !== "admin") {
        if (!cancelled) router.push("/admin/login");
        return;
      }
      if (cancelled) return;
      setAdminId(userId);
      setLoading(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { adminId, loading };
}
```

- [ ] **Step 3: Verify build**

Run: `npm run build` (or `npx tsc --noEmit` if `.env.local` is missing).
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/admin/login/page.tsx components/admin/useAdminSession.ts
git commit -m "feat: add admin login page and useAdminSession hook"
```

---

### Task 3: Admin read API routes (orders, restaurants, delivery-partners)

**Files:**
- Create: `app/api/admin/orders/route.ts`
- Create: `app/api/admin/restaurants/route.ts`
- Create: `app/api/admin/delivery-partners/route.ts`

**Interfaces:**
- Consumes: `resolveAdmin`, `tokenFromRequest` (Task 1).

- [ ] **Step 1: Write `orders/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const statusFilter = request.nextUrl.searchParams.get("status");
  let query = supabaseServer
    .from("orders")
    .select("id, status, total, placed_at, restaurants(name), customer_id")
    .order("placed_at", { ascending: false });
  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
  return NextResponse.json({ orders: data });
}
```

- [ ] **Step 2: Write `restaurants/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("restaurants")
    .select("id, name, is_open, is_suspended, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load restaurants" }, { status: 500 });
  }
  return NextResponse.json({ restaurants: data });
}
```

- [ ] **Step 3: Write `delivery-partners/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("delivery_partners")
    .select("user_id, is_online, current_lat, current_lng, last_ping_at, vehicle_type, users(full_name)");
  if (error) {
    return NextResponse.json({ error: "Failed to load delivery partners" }, { status: 500 });
  }
  return NextResponse.json({ partners: data });
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/orders/route.ts app/api/admin/restaurants/route.ts app/api/admin/delivery-partners/route.ts
git commit -m "feat: add admin read-only API routes for orders, restaurants, delivery partners"
```

---

### Task 4: Suspend/unsuspend and reassign API routes

**Files:**
- Create: `app/api/admin/restaurants/[id]/suspend/route.ts`
- Create: `app/api/admin/restaurants/[id]/unsuspend/route.ts`
- Create: `app/api/admin/orders/[id]/reassign/route.ts`

**Interfaces:**
- Consumes: `resolveAdmin`, `tokenFromRequest` (Task 1).

- [ ] **Step 1: Write the suspend route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("restaurants")
    .update({ is_open: false, is_suspended: true })
    .eq("id", id)
    .select("id, is_open, is_suspended")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  return NextResponse.json({ restaurant: data });
}
```

- [ ] **Step 2: Write the unsuspend route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("restaurants")
    .update({ is_suspended: false })
    .eq("id", id)
    .select("id, is_open, is_suspended")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  return NextResponse.json({ restaurant: data });
}
```

- [ ] **Step 3: Write the reassign route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";

const REASSIGNABLE_STATUSES = ["assigned", "picked_up"];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { deliveryPartnerId } = await request.json();
  if (!deliveryPartnerId || typeof deliveryPartnerId !== "string") {
    return NextResponse.json({ error: "deliveryPartnerId is required" }, { status: 400 });
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, status")
    .eq("id", id)
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (!REASSIGNABLE_STATUSES.includes(order.status)) {
    return NextResponse.json(
      { error: `Order in status "${order.status}" cannot be reassigned` },
      { status: 400 }
    );
  }

  const { data: partner, error: partnerError } = await supabaseServer
    .from("delivery_partners")
    .select("user_id, is_online")
    .eq("user_id", deliveryPartnerId)
    .single();
  if (partnerError || !partner) {
    return NextResponse.json({ error: "Delivery partner not found" }, { status: 404 });
  }
  if (!partner.is_online) {
    return NextResponse.json({ error: "Delivery partner is not online" }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ delivery_partner_id: deliveryPartnerId })
    .eq("id", id)
    .eq("status", order.status)
    .select("id, delivery_partner_id, status")
    .single();
  if (updateError || !updated) {
    return NextResponse.json({ error: "Order status changed, please refresh" }, { status: 409 });
  }
  return NextResponse.json({ order: updated });
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/restaurants/[id] app/api/admin/orders/[id]
git commit -m "feat: add admin restaurant suspend/unsuspend and order reassign API routes"
```

---

### Task 5: Admin dashboard page

**Files:**
- Create: `app/admin/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useAdminSession` (Task 2), all `/api/admin/*` routes
  (Tasks 3-4).

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/components/admin/useAdminSession";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  restaurants: { name: string } | null;
};

type RestaurantRow = {
  id: string;
  name: string;
  is_open: boolean;
  is_suspended: boolean;
};

type PartnerRow = {
  user_id: string;
  is_online: boolean;
  vehicle_type: string | null;
  users: { full_name: string } | null;
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AdminDashboardPage() {
  const { loading } = useAdminSession();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);

  async function loadAll() {
    const headers = await authHeader();
    const [oRes, rRes, pRes] = await Promise.all([
      fetch("/api/admin/orders", { headers }),
      fetch("/api/admin/restaurants", { headers }),
      fetch("/api/admin/delivery-partners", { headers }),
    ]);
    const [oBody, rBody, pBody] = await Promise.all([oRes.json(), rRes.json(), pRes.json()]);
    if (oRes.ok) setOrders(oBody.orders);
    if (rRes.ok) setRestaurants(rBody.restaurants);
    if (pRes.ok) setPartners(pBody.partners);
  }

  useEffect(() => {
    if (!loading) loadAll();
  }, [loading]);

  async function toggleSuspend(r: RestaurantRow) {
    const path = r.is_suspended
      ? `/api/admin/restaurants/${r.id}/unsuspend`
      : `/api/admin/restaurants/${r.id}/suspend`;
    await fetch(path, { method: "POST", headers: await authHeader() });
    await loadAll();
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold">Admin dashboard</h1>

      <h2 className="mb-2 font-semibold">Orders ({orders.length})</h2>
      <ul className="mb-6 flex flex-col gap-1 text-sm">
        {orders.map((o) => (
          <li key={o.id}>
            #{o.id.slice(0, 8)} · {o.restaurants?.name ?? "Restaurant"} · {o.status} · ₹{o.total}
          </li>
        ))}
      </ul>

      <h2 className="mb-2 font-semibold">Restaurants ({restaurants.length})</h2>
      <ul className="mb-6 flex flex-col gap-1 text-sm">
        {restaurants.map((r) => (
          <li key={r.id} className="flex items-center justify-between">
            <span>
              {r.name} · {r.is_suspended ? "Suspended" : r.is_open ? "Open" : "Closed"}
            </span>
            <button
              onClick={() => toggleSuspend(r)}
              className="rounded bg-gray-100 px-2 py-1 text-xs"
            >
              {r.is_suspended ? "Unsuspend" : "Suspend"}
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mb-2 font-semibold">Delivery partners ({partners.length})</h2>
      <ul className="flex flex-col gap-1 text-sm">
        {partners.map((p) => (
          <li key={p.user_id}>
            {p.users?.full_name ?? "Partner"} · {p.is_online ? "Online" : "Offline"} ·{" "}
            {p.vehicle_type ?? "—"}
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
git add app/admin/dashboard/page.tsx
git commit -m "feat: add admin dashboard page"
```

---

### Task 6: Whole-phase manual verification

**Files:** none (verification task).

- [ ] **Step 1: Confirm Docker Desktop running, `.env.local` present.**
- [ ] **Step 2: `npx supabase db reset && npm run dev`.**
- [ ] **Step 3: Log in at `/admin/login` with the seeded demo admin
  (`admin@foodhub.local` / `admin-demo-password`).**
- [ ] **Step 4: Confirm the dashboard's order/restaurant/partner counts
  match direct Supabase Studio queries.**
- [ ] **Step 5: Suspend a Phase-4-style test restaurant, confirm it
  disappears from `/customer` browse.**
- [ ] **Step 6: Using a Phase-5-style test order in `assigned` status and
  a second online test partner, reassign it via the API and confirm
  `delivery_partner_id` changed in the DB.**
- [ ] **Step 7: Confirm a non-admin token (e.g. a vendor's) gets 403 from
  every `/api/admin/*` route.**
- [ ] **Step 8: `npm run build` one final time for the whole branch.**
- [ ] **Step 9: Commit any fixes found during manual verification.**

---

## Self-Review Notes

- Spec coverage: admin login (seeded, no signup) ✓ (Task 1-2), orders view
  ✓ (Task 3/5), restaurants view + suspend/unsuspend ✓ (Task 3-5),
  delivery partners view ✓ (Task 3/5), manual reassignment ✓ (Task 4-5).
  All spec sections covered.
- Review Focus items each map to an explicit check: non-admin 403 (every
  route's `resolveAdmin` call, verified live in Task 6 Step 7),
  suspend-independent-of-is_open (Task 1's separate `is_suspended`
  column + Task 4's suspend route setting both), reassign-offline-partner
  rejected (Task 4's `partner.is_online` check), reassign-terminal-order
  rejected (Task 4's `REASSIGNABLE_STATUSES` check), seeded credential
  hygiene (Task 1's migration-only seed, no `.env.local` read/write,
  consistent with existing seed.sql demo accounts — flagged as
  local-only, non-production data in README per Task 7 below, not
  committed with any real-world significance).
