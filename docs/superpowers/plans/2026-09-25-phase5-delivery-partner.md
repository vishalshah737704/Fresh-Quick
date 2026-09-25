# Phase 5 — Delivery Partner App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delivery partner signup/login, online/offline toggle, self-claim
of ready orders, status updates (assigned→picked_up→delivered), location
ping, and a customer-side location readout — reusing the Phase 3/4 auth
and status-transition patterns.

**Architecture:** `delivery_partners` table (already in schema) holds
partner state; `orders.delivery_partner_id` is the assignment link.
Self-claim replaces admin-assignment (Phase 6 doesn't exist yet — see
spec's Ruling section). New `/app/delivery/*` pages and `/api/delivery/*`
routes mirror the shape of `/app/vendor/*` and `/api/vendor/*` from
Phase 4, including its lesson: no RLS write policy is added for any table
only ever written through a service-role route.

**Tech Stack:** Next.js App Router, TypeScript, Supabase JS client, Tailwind.

**Spec:** [docs/superpowers/specs/2026-09-25-phase5-delivery-partner-design.md](../specs/2026-09-25-phase5-delivery-partner-design.md)

## Global Constraints

- Self-hosted Supabase only, no cloud project.
- Every API route that writes data on a delivery partner's behalf must
  derive identity from a verified `Authorization: Bearer <token>` header
  via `supabaseServer.auth.getUser(token)` — never a client-supplied id.
- **No RLS write policy (insert/update/delete) on any table that is only
  ever written through a service-role API route** — Phase 4's final
  review found three such policies were a live direct-PostgREST bypass.
  Only add RLS write policies for tables a client genuinely writes to
  directly (none in this phase — every write in this plan goes through a
  service-role route). RLS read policies are fine and expected.
- Run `npm run build` (not just `tsc --noEmit`) before marking any new
  page/route task done.
- No Google Maps API key — location display is a numeric lat/lng readout,
  not a rendered map.

## Review Focus

- A delivery partner attempting to claim an order that's already been
  claimed by someone else (race) must get a 409, not silently overwrite
  the other partner's claim.
- A delivery partner attempting to claim an order that isn't `ready` yet
  (e.g. still `preparing`) must be rejected with 400.
- A delivery partner attempting to advance the status of an order that
  isn't assigned to them must be rejected — ownership check via
  `delivery_partner_id = caller`, not just UI-hidden.
- An offline delivery partner attempting to claim an order must be
  rejected server-side, not just have the claim button hidden client-side.
- A customer viewing another customer's order-confirmation page (crafted
  URL) must not see that other customer's assigned partner's live
  location — the existing owner-only `orders` RLS (Phase 3) already
  blocks the order row itself; the new delivery-partner-location read
  policy must be scoped the same way (only via a customer's own order).

---

## File Structure

- `supabase/migrations/00000000000008_delivery_rls.sql` — RLS read
  policies for `delivery_partners` (self-read/update own row; customer
  can read the partner assigned to their own order) and a policy comment
  explaining why no write policies exist (all writes go through
  service-role routes, per Global Constraints).
- `lib/order-constants.ts` — add `DELIVERY_STATUS_TRANSITIONS` map
  (modify).
- `app/api/auth/delivery-signup/route.ts` — signup route (auth user +
  `public.users` role=delivery + `public.delivery_partners` row), mirrors
  `app/api/auth/vendor-signup/route.ts`.
- `app/delivery/login/page.tsx` — login/signup UI, mirrors
  `app/vendor/login/page.tsx` but collects vehicle type instead of
  restaurant fields.
- `lib/delivery-auth.ts` — server-side helper `resolveDeliveryPartner(token)`
  returning `{ partnerId }` or a 401/403, mirrors `lib/vendor-auth.ts`.
- `components/delivery/useDeliverySession.ts` — client hook mirroring
  `components/vendor/useVendorSession.ts`, returns
  `{ partnerId, isOnline, loading }`.
- `app/api/delivery/toggle-online/route.ts` — `POST`, flips
  `delivery_partners.is_online`.
- `app/api/delivery/ping/route.ts` — `POST`, updates the caller's own
  `current_lat/current_lng/last_ping_at`.
- `app/api/delivery/available-orders/route.ts` — `GET`, lists unassigned
  `ready` orders (available for any online partner to claim).
- `app/api/delivery/orders/route.ts` — `GET`, lists orders assigned to
  the caller.
- `app/api/delivery/orders/[id]/claim/route.ts` — `POST`, claims an order.
- `app/api/delivery/orders/[id]/status/route.ts` — `POST`, advances
  status along the fixed chain, ownership-scoped to the caller.
- `app/delivery/dashboard/page.tsx` — online/offline toggle, ping
  interval, available-orders list with claim buttons, assigned-orders
  list with status-advance buttons — combined into one page (this app
  surface is simpler than the vendor panel's menu+orders split).
- `app/customer/orders/[id]/page.tsx` — modify: extend the existing poll
  to also show the assigned partner's lat/lng once status is `assigned`
  or later.

---

### Task 1: Delivery RLS migration + status-transition constant + delivery-auth helper

**Files:**
- Create: `supabase/migrations/00000000000008_delivery_rls.sql`
- Modify: `lib/order-constants.ts`
- Create: `lib/delivery-auth.ts`

**Interfaces:**
- Produces: `DELIVERY_STATUS_TRANSITIONS: Record<string, string>` (
  `assigned -> picked_up`, `picked_up -> delivered`). Produces
  `resolveDeliveryPartner(token: string | undefined): Promise<{ partnerId: string } | { error: string; status: number }>`.

- [ ] **Step 1: Write the migration**

```sql
-- Phase 5: delivery-partner RLS. No write policies here — every write to
-- delivery_partners and orders (for delivery purposes) goes through a
-- service-role API route (see lib/delivery-auth.ts and app/api/delivery/*),
-- matching the Phase 4 lesson that an unused RLS write policy is a live
-- direct-PostgREST bypass, not defense in depth.

create policy "delivery_can_read_own_partner_row" on public.delivery_partners
  for select using (auth.uid() = user_id);

create policy "customer_can_read_assigned_partner_location" on public.delivery_partners
  for select using (
    exists (
      select 1 from public.orders
      where orders.delivery_partner_id = delivery_partners.user_id
      and orders.customer_id = auth.uid()
    )
  );

create policy "delivery_can_read_own_assigned_orders" on public.orders
  for select using (auth.uid() = delivery_partner_id);
```

- [ ] **Step 2: Apply and verify locally**

Run: `npx supabase db reset` (Docker Desktop must be running).
Expected: migration applies cleanly, seed data still loads, no errors. If
Docker/Supabase isn't running in this environment, skip this step and
note it in your report — it'll be covered by Task 8's whole-phase
verification.

- [ ] **Step 3: Append the transition map**

Append to `lib/order-constants.ts`:

```ts
// Phase 5: delivery-partner-drivable status chain. "assigned" is entered
// via the claim endpoint, not this map (claim is a special first
// transition guarded by its own ready+unassigned check, not a simple
// status->status lookup).
export const DELIVERY_STATUS_TRANSITIONS: Record<string, string> = {
  assigned: "picked_up",
  picked_up: "delivered",
};
```

- [ ] **Step 4: Write `lib/delivery-auth.ts`**

```ts
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

type DeliveryResolution =
  | { partnerId: string }
  | { error: string; status: number };

export async function resolveDeliveryPartner(
  token: string | undefined
): Promise<DeliveryResolution> {
  if (!token) {
    return { error: "Not authenticated", status: 401 };
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: "Not authenticated", status: 401 };
  }
  const partnerId = userData.user.id;

  const { data: profile, error: profileError } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", partnerId)
    .single();
  if (profileError || !profile || profile.role !== "delivery") {
    return { error: "Not a delivery partner account", status: 403 };
  }

  const { data: partnerRow, error: partnerError } = await supabaseServer
    .from("delivery_partners")
    .select("user_id")
    .eq("user_id", partnerId)
    .single();
  if (partnerError || !partnerRow) {
    return { error: "No delivery partner profile found", status: 404 };
  }

  return { partnerId };
}

export function tokenFromRequest(request: Request): string | undefined {
  const authHeader = request.headers.get("authorization");
  return authHeader?.replace(/^Bearer\s+/i, "") ?? undefined;
}
```

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00000000000008_delivery_rls.sql lib/order-constants.ts lib/delivery-auth.ts
git commit -m "feat: add delivery-partner RLS read policies, status map, and auth resolver"
```

---

### Task 2: Delivery signup API route + login/signup page

**Files:**
- Create: `app/api/auth/delivery-signup/route.ts`
- Create: `app/delivery/login/page.tsx`

**Interfaces:**
- Consumes: `supabaseServer` from `lib/supabase-server.ts`, `supabase`
  from `lib/supabase.ts`.
- Produces: `POST /api/auth/delivery-signup` accepting
  `{ email, password, fullName, vehicleType }`, returning `{ ok: true }`
  or `{ error }`. Page at `/delivery/login`, redirects to
  `/delivery/dashboard` on success.

- [ ] **Step 1: Write the signup route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const { email, password, fullName, vehicleType } = await request.json();

  if (!email || !password || !fullName) {
    return NextResponse.json(
      { error: "email, password, and fullName are required" },
      { status: 400 }
    );
  }

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
    .insert({ id: created.user.id, role: "delivery", full_name: fullName });

  if (profileError) {
    await supabaseServer.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const { error: partnerError } = await supabaseServer
    .from("delivery_partners")
    .insert({
      user_id: created.user.id,
      is_online: false,
      vehicle_type: typeof vehicleType === "string" ? vehicleType : null,
    });

  if (partnerError) {
    await supabaseServer.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: partnerError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write the login/signup page**

```tsx
"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

function getSafeRedirect(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin ? url.href : "/delivery/dashboard";
  } catch {
    return "/delivery/dashboard";
  }
}

function DeliveryLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawRedirectTo = searchParams.get("redirectTo") ?? "/delivery/dashboard";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [vehicleType, setVehicleType] = useState("bike");
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
    if (profile?.role !== "delivery") {
      setError("This account is not a delivery partner account.");
      await supabase.auth.signOut();
      return;
    }
    router.push(getSafeRedirect(rawRedirectTo));
  }

  async function handleSignup() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/delivery-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName, vehicleType }),
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
        {mode === "login" ? "Delivery partner log in" : "Delivery partner sign up"}
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
            <select
              className="rounded border px-2 py-1"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
            >
              <option value="bike">Bike</option>
              <option value="scooter">Scooter</option>
              <option value="bicycle">Bicycle</option>
              <option value="car">Car</option>
            </select>
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
          {mode === "login" ? "New partner? Sign up" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

export default function DeliveryLoginPage() {
  return (
    <Suspense fallback={null}>
      <DeliveryLoginForm />
    </Suspense>
  );
}
```

- [ ] **Step 3: Run the build**

Run: `npm run build` (or `npx tsc --noEmit` if `.env.local` is missing in
this worktree — note which in your report).
Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add app/api/auth/delivery-signup/route.ts app/delivery/login/page.tsx
git commit -m "feat: add delivery partner signup route and login/signup page"
```

---

### Task 3: `useDeliverySession` hook

**Files:**
- Create: `components/delivery/useDeliverySession.ts`

**Interfaces:**
- Produces: `useDeliverySession(): { partnerId: string | null; isOnline: boolean; loading: boolean }`.

- [ ] **Step 1: Write the hook**

```ts
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export function useDeliverySession() {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) {
        if (!cancelled) router.push("/delivery/login");
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .single();
      if (profile?.role !== "delivery") {
        if (!cancelled) router.push("/delivery/login");
        return;
      }
      const { data: partner } = await supabase
        .from("delivery_partners")
        .select("is_online")
        .eq("user_id", userId)
        .single();
      if (cancelled) return;
      setPartnerId(userId);
      setIsOnline(partner?.is_online ?? false);
      setLoading(false);
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return { partnerId, isOnline, loading };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/delivery/useDeliverySession.ts
git commit -m "feat: add useDeliverySession client hook"
```

---

### Task 4: Delivery API routes — toggle-online, ping, available-orders, my-orders

**Files:**
- Create: `app/api/delivery/toggle-online/route.ts`
- Create: `app/api/delivery/ping/route.ts`
- Create: `app/api/delivery/available-orders/route.ts`
- Create: `app/api/delivery/orders/route.ts`

**Interfaces:**
- Consumes: `resolveDeliveryPartner`, `tokenFromRequest` (Task 1).

- [ ] **Step 1: Write `toggle-online/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";

export async function POST(request: NextRequest) {
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data: current, error: currentError } = await supabaseServer
    .from("delivery_partners")
    .select("is_online")
    .eq("user_id", resolved.partnerId)
    .single();
  if (currentError || !current) {
    return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  }
  const { data, error } = await supabaseServer
    .from("delivery_partners")
    .update({ is_online: !current.is_online })
    .eq("user_id", resolved.partnerId)
    .select("is_online")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "Failed to toggle online status" }, { status: 500 });
  }
  return NextResponse.json({ isOnline: data.is_online });
}
```

- [ ] **Step 2: Write `ping/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";

export async function POST(request: NextRequest) {
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { lat, lng } = await request.json();
  if (
    typeof lat !== "number" || !Number.isFinite(lat) ||
    typeof lng !== "number" || !Number.isFinite(lng)
  ) {
    return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
  }
  const { error } = await supabaseServer
    .from("delivery_partners")
    .update({ current_lat: lat, current_lng: lng, last_ping_at: new Date().toISOString() })
    .eq("user_id", resolved.partnerId);
  if (error) {
    return NextResponse.json({ error: "Failed to record ping" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Write `available-orders/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data: partner, error: partnerError } = await supabaseServer
    .from("delivery_partners")
    .select("is_online")
    .eq("user_id", resolved.partnerId)
    .single();
  if (partnerError || !partner?.is_online) {
    return NextResponse.json({ orders: [] });
  }
  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, status, total, placed_at, restaurants(name)")
    .eq("status", "ready")
    .is("delivery_partner_id", null)
    .order("placed_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "Failed to load available orders" }, { status: 500 });
  }
  return NextResponse.json({ orders: data });
}
```

- [ ] **Step 4: Write `orders/route.ts`** (the partner's own assigned orders)

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";

export async function GET(request: NextRequest) {
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, status, total, placed_at, restaurants(name)")
    .eq("delivery_partner_id", resolved.partnerId)
    .order("placed_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load your orders" }, { status: 500 });
  }
  return NextResponse.json({ orders: data });
}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add app/api/delivery/toggle-online app/api/delivery/ping app/api/delivery/available-orders app/api/delivery/orders/route.ts
git commit -m "feat: add delivery toggle-online, ping, and order-listing API routes"
```

---

### Task 5: Claim and status-advance API routes

**Files:**
- Create: `app/api/delivery/orders/[id]/claim/route.ts`
- Create: `app/api/delivery/orders/[id]/status/route.ts`

**Interfaces:**
- Consumes: `resolveDeliveryPartner`, `tokenFromRequest` (Task 1),
  `DELIVERY_STATUS_TRANSITIONS` (Task 1).

- [ ] **Step 1: Write the claim route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data: partner, error: partnerError } = await supabaseServer
    .from("delivery_partners")
    .select("is_online")
    .eq("user_id", resolved.partnerId)
    .single();
  if (partnerError || !partner?.is_online) {
    return NextResponse.json({ error: "You must be online to claim an order" }, { status: 403 });
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ delivery_partner_id: resolved.partnerId, status: "assigned" })
    .eq("id", id)
    .eq("status", "ready")
    .is("delivery_partner_id", null)
    .select("id, status")
    .single();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: "Order is no longer available to claim" },
      { status: 409 }
    );
  }

  return NextResponse.json({ order: updated });
}
```

- [ ] **Step 2: Write the status-advance route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";
import { DELIVERY_STATUS_TRANSITIONS } from "@/lib/order-constants";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, status, delivery_partner_id")
    .eq("id", id)
    .eq("delivery_partner_id", resolved.partnerId)
    .single();
  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const nextStatus = DELIVERY_STATUS_TRANSITIONS[order.status];
  if (!nextStatus) {
    return NextResponse.json(
      { error: `Order in status "${order.status}" cannot be advanced by a delivery partner` },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabaseServer
    .from("orders")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("delivery_partner_id", resolved.partnerId)
    .eq("status", order.status)
    .select("id, status")
    .single();
  if (updateError || !updated) {
    return NextResponse.json({ error: "Order status changed, please refresh" }, { status: 409 });
  }
  return NextResponse.json({ order: updated });
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/delivery/orders
git commit -m "feat: add delivery order-claim and status-advance API routes"
```

---

### Task 6: Delivery dashboard page

**Files:**
- Create: `app/delivery/dashboard/page.tsx`

**Interfaces:**
- Consumes: `useDeliverySession` (Task 3), all `/api/delivery/*` routes
  (Tasks 4-5).

- [ ] **Step 1: Write the page**

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDeliverySession } from "@/components/delivery/useDeliverySession";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  restaurants: { name: string } | null;
};

const NEXT_LABEL: Record<string, string> = {
  assigned: "Mark picked up",
  picked_up: "Mark delivered",
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function DeliveryDashboardPage() {
  const { loading, isOnline: initialOnline } = useDeliverySession();
  const [online, setOnline] = useState(false);
  const [available, setAvailable] = useState<OrderRow[]>([]);
  const [mine, setMine] = useState<OrderRow[]>([]);
  const [lat, setLat] = useState("12.9716");
  const [lng, setLng] = useState("77.5946");

  useEffect(() => {
    if (!loading) setOnline(initialOnline);
  }, [loading, initialOnline]);

  async function loadOrders() {
    const headers = await authHeader();
    const [availRes, mineRes] = await Promise.all([
      fetch("/api/delivery/available-orders", { headers }),
      fetch("/api/delivery/orders", { headers }),
    ]);
    const availBody = await availRes.json();
    const mineBody = await mineRes.json();
    if (availRes.ok) setAvailable(availBody.orders);
    if (mineRes.ok) setMine(mineBody.orders);
  }

  useEffect(() => {
    if (!loading) loadOrders();
  }, [loading]);

  useEffect(() => {
    if (!online) return;
    const interval = setInterval(async () => {
      await fetch("/api/delivery/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ lat: Number(lat), lng: Number(lng) }),
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [online, lat, lng]);

  async function toggleOnline() {
    const res = await fetch("/api/delivery/toggle-online", {
      method: "POST",
      headers: await authHeader(),
    });
    const body = await res.json();
    if (res.ok) setOnline(body.isOnline);
    await loadOrders();
  }

  async function claim(orderId: string) {
    await fetch(`/api/delivery/orders/${orderId}/claim`, {
      method: "POST",
      headers: await authHeader(),
    });
    await loadOrders();
  }

  async function advance(orderId: string) {
    await fetch(`/api/delivery/orders/${orderId}/status`, {
      method: "POST",
      headers: await authHeader(),
    });
    await loadOrders();
  }

  if (loading) return <p>Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-bold">Delivery dashboard</h1>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={toggleOnline}
          className={`rounded px-3 py-2 text-sm text-white ${
            online ? "bg-green-600" : "bg-gray-400"
          }`}
        >
          {online ? "Online" : "Offline"} — tap to toggle
        </button>
        {online && (
          <div className="flex gap-1 text-xs">
            <input
              className="w-20 rounded border px-1"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
            <input
              className="w-20 rounded border px-1"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
        )}
      </div>

      <h2 className="mb-2 font-semibold">Available orders</h2>
      <ul className="mb-6 flex flex-col gap-2">
        {available.map((o) => (
          <li key={o.id} className="flex items-center justify-between rounded border p-2">
            <span>
              #{o.id.slice(0, 8)} · {o.restaurants?.name ?? "Restaurant"} · ₹{o.total}
            </span>
            <button
              onClick={() => claim(o.id)}
              className="rounded bg-brand-primary px-2 py-1 text-xs text-white"
            >
              Claim
            </button>
          </li>
        ))}
        {available.length === 0 && <p className="text-sm text-gray-500">None right now.</p>}
      </ul>

      <h2 className="mb-2 font-semibold">Your deliveries</h2>
      <ul className="flex flex-col gap-2">
        {mine.map((o) => (
          <li key={o.id} className="flex items-center justify-between rounded border p-2">
            <span>
              #{o.id.slice(0, 8)} · {o.status} · ₹{o.total}
            </span>
            {NEXT_LABEL[o.status] && (
              <button
                onClick={() => advance(o.id)}
                className="rounded bg-brand-primary px-2 py-1 text-xs text-white"
              >
                {NEXT_LABEL[o.status]}
              </button>
            )}
          </li>
        ))}
        {mine.length === 0 && <p className="text-sm text-gray-500">No deliveries yet.</p>}
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
git add app/delivery/dashboard/page.tsx
git commit -m "feat: add delivery dashboard page"
```

---

### Task 7: Customer order page — show assigned partner's location

**Files:**
- Modify: `app/customer/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: existing `supabase` client and polling loop already in this
  file (no new dependency).

- [ ] **Step 1: Extend the order query and add a location readout**

Modify the `load()` function's order query to also select
`delivery_partner_id`, and when status is `assigned`, `picked_up`, or
`delivered` and a partner is assigned, fetch that partner's
`current_lat`/`current_lng`/`last_ping_at` from `delivery_partners` (a
second `.select()` alongside the existing two, using `Promise.all`) and
render it. Full updated file:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type OrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "cancelled";

type OrderView = {
  id: string;
  status: OrderStatus;
  total: number;
  delivery_partner_id: string | null;
};

type PaymentView = {
  status: "pending" | "success" | "failed";
  method: string;
};

type PartnerLocation = {
  current_lat: number | null;
  current_lng: number | null;
  last_ping_at: string | null;
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Order placed — waiting for restaurant",
  accepted: "Restaurant accepted your order",
  preparing: "Restaurant is preparing your order",
  ready: "Order ready for pickup",
  assigned: "Delivery partner assigned",
  picked_up: "Order picked up — on the way",
  delivered: "Delivered",
  cancelled: "Order cancelled",
};

const SHOW_LOCATION_FOR: OrderStatus[] = ["assigned", "picked_up", "delivered"];

export default function OrderConfirmationPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: o, error: oErr }, { data: p, error: pErr }] =
        await Promise.all([
          supabase
            .from("orders")
            .select("id, status, total, delivery_partner_id")
            .eq("id", params.id)
            .single(),
          supabase
            .from("payments")
            .select("status, method")
            .eq("order_id", params.id)
            .single(),
        ]);
      if (cancelled) return;
      if (oErr || pErr) {
        setError((oErr ?? pErr)?.message ?? "Failed to load order");
        return;
      }
      setOrder(o);
      setPayment(p);

      if (o.delivery_partner_id && SHOW_LOCATION_FOR.includes(o.status)) {
        const { data: loc } = await supabase
          .from("delivery_partners")
          .select("current_lat, current_lng, last_ping_at")
          .eq("user_id", o.delivery_partner_id)
          .single();
        if (!cancelled) setPartnerLocation(loc ?? null);
      } else if (!cancelled) {
        setPartnerLocation(null);
      }
    }

    load();
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [params.id]);

  if (error) {
    return <p className="text-red-600">Couldn&apos;t load order: {error}</p>;
  }

  if (!order || !payment) {
    return <p className="text-gray-500">Loading order…</p>;
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Order #{order.id.slice(0, 8)}</h1>
      {payment.status === "failed" ? (
        <p className="text-red-600">
          Payment failed. Your order was not placed — please try checking out
          again.
        </p>
      ) : (
        <>
          <p className="mb-2">{STATUS_LABEL[order.status]}</p>
          <p className="text-sm text-gray-600">Total: ₹{order.total.toFixed(2)}</p>
          <p className="text-sm text-gray-600">
            Payment: {payment.status} ({payment.method})
          </p>
          {partnerLocation?.current_lat != null && partnerLocation?.current_lng != null && (
            <p className="mt-2 text-sm text-gray-600">
              Delivery partner location: {partnerLocation.current_lat.toFixed(4)},{" "}
              {partnerLocation.current_lng.toFixed(4)}
              {partnerLocation.last_ping_at &&
                ` (updated ${new Date(partnerLocation.last_ping_at).toLocaleTimeString()})`}
            </p>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add app/customer/orders/[id]/page.tsx
git commit -m "feat: show assigned delivery partner's location on the order page"
```

---

### Task 8: Whole-phase manual verification

**Files:** none (verification task).

- [ ] **Step 1: Confirm Docker Desktop running, `.env.local` present.**
- [ ] **Step 2: `npx supabase db reset && npm run dev`.**
- [ ] **Step 3: Sign up a delivery partner at `/delivery/login`, toggle
  online.**
- [ ] **Step 4: Using a Phase-4-style vendor test order advanced to
  `ready`, confirm it appears in "Available orders", claim it.**
- [ ] **Step 5: Advance it picked_up → delivered from the delivery
  dashboard.**
- [ ] **Step 6: Send a location ping (automatic via the 15s interval, or
  call the API directly), confirm the customer's order page
  (`/customer/orders/[id]`) shows the lat/lng readout once status is
  `assigned` or later.**
- [ ] **Step 7: `npm run build` one final time for the whole branch.**
- [ ] **Step 8: Commit any fixes found during manual verification.**

---

## Self-Review Notes

- Spec coverage: delivery login/signup ✓ (Task 2), online/offline toggle
  ✓ (Task 4/6), self-claim assignment ✓ (Task 5/6 — replaces
  admin-assignment per the spec's Ruling), status updates ✓ (Task 5/6),
  location ping ✓ (Task 4/6), customer-side location display ✓ (Task 7).
  All spec sections covered.
- Review Focus items each map to an explicit check: claim race (Task 5's
  `.eq("status","ready").is("delivery_partner_id", null)` guard),
  non-ready claim (same guard), cross-partner status update (Task 5's
  `.eq("delivery_partner_id", resolved.partnerId)` on both select and
  update), offline claim (Task 5's online check before the claim
  update), cross-customer location leak (Task 1's RLS policy scoped via
  `orders.customer_id = auth.uid()`, plus Task 7's query only ever runs
  for the signed-in customer's own order id from the URL param — the
  existing Phase 3 owner-only `orders` RLS blocks a customer from ever
  loading another customer's order row in the first place, so the
  location sub-query is unreachable for a foreign order).
