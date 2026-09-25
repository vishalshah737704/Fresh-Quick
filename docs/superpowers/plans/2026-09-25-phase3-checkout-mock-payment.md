# Phase 3 — Checkout + Mock Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in customer can check out their Phase 2 cart: pick a
payment method, submit, have the order+order_items+payment created and the
payment resolved synchronously (mock — no n8n yet), and see an order
confirmation page that polls for status until it settles. Minimal
email/password login+signup is added since nothing has built it yet and
checkout requires a real `customer_id`.

**Architecture:** Checkout writes go through a server-side Next.js API
route (`/api/cart/checkout`) using the Supabase **service-role** client
(bypasses RLS, never exposed to the browser) — this is where prices,
availability, and restaurant-open status get re-validated from the
database rather than trusted from the client cart, per the Phase 2 final
review's carried-forward requirement. Mock payment resolution happens
**synchronously inside that same route** (no n8n dependency yet — Phase 7
will later replace this in-process resolution with the real
n8n-driven async flow, "Order Placed" / "Payment Mock Confirmation"
workflows from spec §5, without changing the checkout UI or API contract).
Auth uses Supabase Auth directly: signup goes through a server route (so
`public.users` gets created alongside `auth.users` in one controlled step),
login is a direct client-side `supabase.auth.signInWithPassword` call.

**Tech Stack:** Next.js API routes, `@supabase/supabase-js` (both the
existing anon browser client and a new service-role server client),
existing cart/address stores from Phase 2.

**Spec:** [docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md](../specs/2026-09-24-food-delivery-platform-design.md)

## Global Constraints

- Checkout must re-validate from the database, never trust the client
  cart: restaurant must be `is_open = true`, each menu item must be
  `is_available = true`, and `unit_price` must be read fresh from
  `menu_items.price` at checkout time — not the price the cart captured
  when the item was added (Phase 2 final review finding, carried forward).
- Cart stays single-restaurant only — checkout must reject (not silently
  fix) a cart that somehow references more than one restaurant.
- `orders.total = subtotal + delivery_fee` is a DB-enforced invariant
  (Phase 1) — the checkout route must compute both correctly server-side
  or the insert will fail loudly, not silently produce a wrong total.
- The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) must only ever be
  read in server-side code (API routes), never imported into any file a
  client component could bundle.
- No n8n dependency for this phase — payment resolution is synchronous,
  in-process, inside the checkout API route.
- Branding stays isolated to `lib/branding.ts` + Tailwind tokens — no
  hardcoded brand name/color in any new component.

## Review Focus

- Cart with items whose price changed since being added (e.g. vendor
  edits price between add-to-cart and checkout — not directly triggerable
  through UI yet since Phase 4 doesn't exist, but testable via direct DB
  update) — checkout must charge the current DB price, not the stale
  client-side cart price.
- Checkout attempted with an empty cart, or with a restaurant that's since
  gone `is_open = false` — must be rejected with a clear message, not
  produce a broken order.
- Checkout attempted while not logged in — must redirect to login (and
  ideally return to checkout after), never silently create an order with
  a null/wrong customer_id.
- Payment failure path — order must end up in a state a customer can see
  and understand (not left stuck as ambiguous "placed" with no
  indication anything went wrong), and the failed order must not be
  payable-again through the same broken row (a fresh checkout attempt
  should be a new order, not a mutation of the failed one).
- Double-submit of the checkout button (e.g. slow network, impatient
  click) — must not create two orders for one cart submission.

---

### Task 1: Service-role server client + order constants

**Files:**
- Create: `lib/supabase-server.ts`, `lib/order-constants.ts`

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` from
  `.env.local`.
- Produces: `supabaseServer` client (service-role, **server-only** —
  Task 4's API route imports this) from `lib/supabase-server.ts`;
  `DELIVERY_FEE_RUPEES: number` and `PAYMENT_SUCCESS_RATE: number`
  constants from `lib/order-constants.ts`, both consumed by Task 4.

- [ ] **Step 1: Write `lib/supabase-server.ts`**

```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseServer = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

- [ ] **Step 2: Install the `server-only` package**

```bash
npm install server-only
```

(This package throws a build error if a file importing it is ever pulled
into a client bundle — a hard guard against the service-role key leaking
to the browser, on top of the file naturally only being imported from API
routes.)

- [ ] **Step 3: Write `lib/order-constants.ts`**

```ts
export const DELIVERY_FEE_RUPEES = 30;

// mock_card / mock_upi resolve randomly at this success rate; mock_cod
// always succeeds (paying on delivery can't fail at order time).
export const PAYMENT_SUCCESS_RATE = 0.8;
```

- [ ] **Step 4: Verify the server-only guard works**

Temporarily add `import { supabaseServer } from "@/lib/supabase-server";`
to the top of `app/customer/page.tsx` (a client component), run
`npm run build`, confirm it fails with an error mentioning `server-only`
(proves the guard works), then remove that temporary import and confirm
`npm run build` succeeds again cleanly.

- [ ] **Step 5: Commit**

```bash
git add lib/supabase-server.ts lib/order-constants.ts package.json package-lock.json
git commit -m "feat: add service-role server client and order constants"
```

---

### Task 2: Minimal auth — signup + login

**Files:**
- Create: `app/api/auth/signup/route.ts`, `app/customer/login/page.tsx`,
  `lib/auth.ts`

**Interfaces:**
- Consumes: `supabaseServer` (Task 1), `supabase` (Phase 1 anon client).
- Produces: `POST /api/auth/signup` endpoint; `useSession()` hook from
  `lib/auth.ts` exporting `{ userId: string | null; loading: boolean }`,
  consumed by Task 3 (checkout page) and Task 6 (checkout button gate) to
  know if the customer is logged in.

- [ ] **Step 1: Write `app/api/auth/signup/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const { email, password, fullName } = await request.json();

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
    .insert({ id: created.user.id, role: "customer", full_name: fullName });

  if (profileError) {
    // Roll back the auth user so a half-created account can't linger.
    await supabaseServer.auth.admin.deleteUser(created.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Write `lib/auth.ts`**

```ts
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useSession() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setUserId(data.session?.user.id ?? null);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUserId(session?.user.id ?? null);
      }
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { userId, loading };
}
```

- [ ] **Step 3: Write `app/customer/login/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/customer";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleLogin() {
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.push(redirectTo);
  }

  async function handleSignup() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName }),
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
        {mode === "login" ? "Log in" : "Sign up"}
      </h1>
      <div className="flex flex-col gap-2">
        {mode === "signup" && (
          <input
            className="rounded border px-2 py-1"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
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
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify signup + login manually**

`npm run dev`, open `http://localhost:3000/customer/login`, switch to
"Sign up", fill in a test email/password/name, submit. Expected: redirected
to `/customer` (default `redirectTo`), and `npx supabase db query "select id, role, full_name from public.users where full_name = 'Test Customer';"`
shows one row with `role = 'customer'`.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/signup/route.ts app/customer/login/page.tsx lib/auth.ts
git commit -m "feat: add minimal customer signup and login"
```

---

### Task 3: Checkout API route

**Files:**
- Create: `app/api/cart/checkout/route.ts`

**Interfaces:**
- Consumes: `supabaseServer` (Task 1), `DELIVERY_FEE_RUPEES` /
  `PAYMENT_SUCCESS_RATE` (Task 1).
- Produces: `POST /api/cart/checkout` accepting
  ```ts
  type CheckoutRequest = {
    customerId: string;
    restaurantId: string;
    items: { menuItemId: string; quantity: number }[];
    deliveryAddress: { label: string; lat: number; lng: number };
    paymentMethod: "mock_card" | "mock_upi" | "mock_cod";
  };
  ```
  and returning `{ orderId: string; paymentStatus: "success" | "failed" }`
  on 200, or `{ error: string }` on 4xx. Consumed by Task 4 (checkout page).

- [ ] **Step 1: Write `app/api/cart/checkout/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { DELIVERY_FEE_RUPEES, PAYMENT_SUCCESS_RATE } from "@/lib/order-constants";

type CheckoutRequestItem = { menuItemId: string; quantity: number };

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    customerId,
    restaurantId,
    items,
    deliveryAddress,
    paymentMethod,
  }: {
    customerId: string;
    restaurantId: string;
    items: CheckoutRequestItem[];
    deliveryAddress: { label: string; lat: number; lng: number };
    paymentMethod: "mock_card" | "mock_upi" | "mock_cod";
  } = body;

  if (!customerId || !restaurantId || !items?.length || !deliveryAddress) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { data: restaurant, error: restaurantError } = await supabaseServer
    .from("restaurants")
    .select("id, is_open")
    .eq("id", restaurantId)
    .single();

  if (restaurantError || !restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }
  if (!restaurant.is_open) {
    return NextResponse.json({ error: "Restaurant is currently closed" }, { status: 409 });
  }

  const menuItemIds = items.map((i) => i.menuItemId);
  const { data: menuItems, error: menuError } = await supabaseServer
    .from("menu_items")
    .select("id, restaurant_id, price, is_available")
    .in("id", menuItemIds);

  if (menuError || !menuItems || menuItems.length !== menuItemIds.length) {
    return NextResponse.json({ error: "One or more menu items not found" }, { status: 404 });
  }

  for (const item of menuItems) {
    if (item.restaurant_id !== restaurantId) {
      return NextResponse.json(
        { error: "Cart contains items from more than one restaurant" },
        { status: 409 }
      );
    }
    if (!item.is_available) {
      return NextResponse.json(
        { error: "One or more items are no longer available" },
        { status: 409 }
      );
    }
  }

  const priceById = new Map(menuItems.map((m) => [m.id, Number(m.price)]));
  const subtotal = items.reduce(
    (sum, item) => sum + (priceById.get(item.menuItemId) ?? 0) * item.quantity,
    0
  );
  const total = subtotal + DELIVERY_FEE_RUPEES;

  const { data: address, error: addressError } = await supabaseServer
    .from("addresses")
    .insert({
      user_id: customerId,
      label: deliveryAddress.label,
      line1: deliveryAddress.label,
      lat: deliveryAddress.lat,
      lng: deliveryAddress.lng,
      is_default: false,
    })
    .select("id")
    .single();

  if (addressError || !address) {
    return NextResponse.json({ error: "Failed to save delivery address" }, { status: 500 });
  }

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .insert({
      customer_id: customerId,
      restaurant_id: restaurantId,
      delivery_address_id: address.id,
      status: "placed",
      subtotal,
      delivery_fee: DELIVERY_FEE_RUPEES,
      total,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Failed to create order" }, { status: 500 });
  }

  const orderItemRows = items.map((item) => ({
    order_id: order.id,
    menu_item_id: item.menuItemId,
    quantity: item.quantity,
    unit_price: priceById.get(item.menuItemId) ?? 0,
  }));

  const { error: orderItemsError } = await supabaseServer
    .from("order_items")
    .insert(orderItemRows);

  if (orderItemsError) {
    return NextResponse.json({ error: "Failed to save order items" }, { status: 500 });
  }

  // Mock payment resolution — synchronous, in-process (no n8n yet).
  // mock_cod always succeeds; mock_card/mock_upi resolve randomly.
  const paymentSucceeds =
    paymentMethod === "mock_cod" || Math.random() < PAYMENT_SUCCESS_RATE;
  const paymentStatus = paymentSucceeds ? "success" : "failed";

  const { error: paymentError } = await supabaseServer.from("payments").insert({
    order_id: order.id,
    method: paymentMethod,
    status: paymentStatus,
    amount: total,
    mock_reference: `MOCK-${order.id.slice(0, 8)}`,
    paid_at: paymentSucceeds ? new Date().toISOString() : null,
  });

  if (paymentError) {
    return NextResponse.json({ error: "Failed to record payment" }, { status: 500 });
  }

  if (!paymentSucceeds) {
    await supabaseServer
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", order.id);
  }

  return NextResponse.json({ orderId: order.id, paymentStatus });
}
```

- [ ] **Step 2: Verify with a direct curl call**

Get a real customer id and menu item id from Task 2's test signup and
Phase 1's seed data:
```bash
npx supabase db query "select id from public.users where role='customer' limit 1;"
```
Then:
```bash
curl -s -X POST http://localhost:3000/api/cart/checkout \
  -H "Content-Type: application/json" \
  -d '{"customerId":"<customer id from above>","restaurantId":"33333333-3333-3333-3333-333333333333","items":[{"menuItemId":"44444444-4444-4444-4444-444444444444","quantity":1}],"deliveryAddress":{"label":"Test","lat":19.076,"lng":72.8777},"paymentMethod":"mock_cod"}'
```
Expected: `{"orderId":"...","paymentStatus":"success"}` (mock_cod always
succeeds). Then verify:
```bash
npx supabase db query "select status, subtotal, delivery_fee, total from public.orders order by placed_at desc limit 1;"
```
Expected: `status=placed`, `subtotal=220`, `delivery_fee=30`, `total=250`.

- [ ] **Step 3: Commit**

```bash
git add app/api/cart/checkout/route.ts
git commit -m "feat: add checkout API route with server-side re-validation and mock payment"
```

---

### Task 4: Checkout page

**Files:**
- Create: `app/customer/checkout/page.tsx`

**Interfaces:**
- Consumes: `useCart()` (Phase 2), `useAddress()` (Phase 2), `useSession()`
  (Task 2), `POST /api/cart/checkout` (Task 3).
- Produces: `/customer/checkout` route. Redirects to
  `/customer/orders/[id]` (Task 5) on success.

- [ ] **Step 1: Write `app/customer/checkout/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { useAddress } from "@/lib/address-store";
import { useSession } from "@/lib/auth";
import { DELIVERY_FEE_RUPEES } from "@/lib/order-constants";

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

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cart/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: userId,
          restaurantId,
          items: items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
          deliveryAddress: { label, lat, lng },
          paymentMethod,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error ?? "Checkout failed");
        setSubmitting(false);
        return;
      }
      clearCart();
      router.push(`/customer/orders/${result.orderId}`);
    } catch {
      setError("Network error — please try again");
      setSubmitting(false);
    }
  }

  const total = subtotal + DELIVERY_FEE_RUPEES;

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Checkout</h1>
      <p className="mb-2 text-sm text-gray-600">
        {items.length} item{items.length !== 1 ? "s" : ""} from {restaurantName}
      </p>
      <p className="mb-4 text-sm text-gray-600">Delivering to: {label}</p>

      <div className="mb-4 flex flex-col gap-2">
        <p className="font-medium">Payment method</p>
        {PAYMENT_METHODS.map((m) => (
          <label key={m.value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="paymentMethod"
              checked={paymentMethod === m.value}
              onChange={() => setPaymentMethod(m.value)}
            />
            {m.label}
          </label>
        ))}
      </div>

      <div className="mb-4 border-t border-gray-200 pt-2 text-sm">
        <p>Subtotal: ₹{subtotal.toFixed(2)}</p>
        <p>Delivery fee: ₹{DELIVERY_FEE_RUPEES.toFixed(2)}</p>
        <p className="font-semibold">Total: ₹{total.toFixed(2)}</p>
      </div>

      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

      <button
        disabled={submitting}
        onClick={handleSubmit}
        className="rounded bg-brand-primary px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? "Placing order…" : "Place order"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify the login redirect**

Log out (clear the session via `supabase.auth.signOut()` in the browser
console, or use a private browsing window), navigate to
`http://localhost:3000/customer/checkout` with items in the cart.
Expected: redirected to `/customer/login?redirectTo=/customer/checkout`.

- [ ] **Step 3: Commit**

```bash
git add app/customer/checkout/page.tsx
git commit -m "feat: add checkout page with payment method selection"
```

---

### Task 5: Order confirmation page

**Files:**
- Create: `app/customer/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `supabase` (anon client), `useParams()`.
- Produces: `/customer/orders/[id]` route showing live-polled order status.

- [ ] **Step 1: Write `app/customer/orders/[id]/page.tsx`**

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
};

type PaymentView = {
  status: "pending" | "success" | "failed";
  method: string;
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

export default function OrderConfirmationPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [{ data: o, error: oErr }, { data: p, error: pErr }] =
        await Promise.all([
          supabase.from("orders").select("id, status, total").eq("id", params.id).single(),
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
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Using the order id from Task 3's curl test, open
`http://localhost:3000/customer/orders/<order id>`. Expected: shows
"Order placed — waiting for restaurant", total ₹250.00, "Payment: success
(mock_cod)".

- [ ] **Step 3: Commit**

```bash
git add app/customer/orders/
git commit -m "feat: add order confirmation page with status polling"
```

---

### Task 6: Wire checkout entry point + end-to-end verification

**Files:**
- Modify: `components/CartPanel.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: a "Checkout" button in the cart panel linking to
  `/customer/checkout`.

- [ ] **Step 1: Read the current `components/CartPanel.tsx` and add a checkout button**

Add a `<Link href="/customer/checkout">` button inside the expanded panel
(after the "Clear cart" button), styled consistently with the rest of the
panel:

```tsx
import Link from "next/link";
```

(add this import at the top), and inside the expanded `{open && (...)}`
block, after the "Clear cart" button:

```tsx
          <Link
            href="/customer/checkout"
            className="mt-2 block rounded bg-brand-primary px-3 py-2 text-center text-sm text-white"
          >
            Checkout
          </Link>
```

- [ ] **Step 2: End-to-end verification — happy path**

`npm run dev`. In a fresh browser session: sign up a new customer, browse
to Demo Kitchen, add "Paneer Butter Masala" to cart, open the cart panel,
click "Checkout", select "Cash on Delivery" (deterministic success),
click "Place order". Expected: redirected to the order confirmation page
showing "Order placed — waiting for restaurant", "Payment: success
(mock_cod)", cart panel is now empty/hidden.

- [ ] **Step 3: End-to-end verification — restaurant-closed rejection (Review Focus item)**

```bash
npx supabase db query "update public.restaurants set is_open = false where id = '33333333-3333-3333-3333-333333333333';"
```
Repeat the checkout flow (add item, go to checkout, place order). Expected:
error message "Restaurant is currently closed" shown on the checkout page,
no order created. Restore afterward:
```bash
npx supabase db query "update public.restaurants set is_open = true where id = '33333333-3333-3333-3333-333333333333';"
```

- [ ] **Step 4: End-to-end verification — stale price re-validation (Review Focus item)**

Add "Veg Fried Rice" (₹150.00) to cart. Before checking out, change its
price in the DB:
```bash
npx supabase db query "update public.menu_items set price = 999 where id = '55555555-5555-5555-5555-555555555555';"
```
Complete checkout. Expected: the order's `subtotal`/`total` reflect ₹999
(the current DB price), not the ₹150 the cart displayed — confirm via
`npx supabase db query "select subtotal, total from public.orders order by placed_at desc limit 1;"`.
Restore the price afterward:
```bash
npx supabase db query "update public.menu_items set price = 150 where id = '55555555-5555-5555-5555-555555555555';"
```

- [ ] **Step 5: Commit**

```bash
git add components/CartPanel.tsx
git commit -m "feat: wire checkout entry point into cart panel"
```
