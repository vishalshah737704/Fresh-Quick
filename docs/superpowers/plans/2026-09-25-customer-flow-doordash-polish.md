# Customer Flow DoorDash-Style Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the DoorDash-style visual system to checkout, order tracking, and login/signup, and fix the home page's carousel/grid density so rows don't leave blank whitespace and pack more cards per row, matching doordash.com's dense layout.

**Architecture:** Every change is presentation/layout only inside existing pages and one new purely-presentational component (`OrderStatusTimeline`). No cart, checkout API, auth, or order-polling logic is touched — every `useState`/`useEffect`/`fetch`/handler in the three touched pages stays byte-identical; only their returned JSX and Tailwind classes change.

**Tech Stack:** Next.js App Router (client components), Tailwind CSS, existing `brand-*` theme tokens, no new npm dependencies.

**Spec:** [docs/superpowers/specs/2026-09-25-customer-flow-doordash-polish-design.md](../specs/2026-09-25-customer-flow-doordash-polish-design.md)

## Global Constraints

- No cart/checkout/auth/order-status logic changes — this is a presentation-layer-only plan (spec's explicit scope boundary).
- `getSafeRedirect` in `app/customer/login/page.tsx` must stay byte-identical — a 3-round security fix from Phase 3, per CLAUDE.md's standing rule. Any edit to that file must diff-check this function is unchanged.
- No new npm dependencies.
- Checkout stays single-page (no step wizard) — wizard flow is explicitly deferred to the future mobile app.
- Order tracking has no map library — the coordinate readout is styled as a placeholder box, not replaced with a real map.
- Run `npm run build` after every task, per standing project rule (not just `tsc --noEmit`).
- Money display stays `.toFixed(2)` everywhere it currently appears — this plan doesn't touch price math, only surrounding layout.

## Review Focus

- **Checkout's existing error states must still render inside the new two-column layout** — `sessionLoading`, `!userId` redirect, empty-cart guard, and the `error` state after a failed submit all currently return early with a single `<p>`; the new two-column JSX must not break any of these early returns or silently swallow the `error` message inside the new summary card.
- **Order tracking's `payment.status === "failed"` branch and the `cancelled` order status must both still short-circuit correctly** — the new `OrderStatusTimeline` component only handles the 4 non-terminal-failure statuses; a `cancelled` order or a failed payment must never attempt to render a timeline step for a status the component doesn't define.
- **`OrderStatusTimeline`'s 8-to-4 status mapping must be total** — every value of the existing 8-value `OrderStatus` type (`placed, accepted, preparing, ready, assigned, picked_up, delivered, cancelled`) needs a defined mapping or an explicit cancelled special-case; an unmapped status must not crash the component or render nothing.
- **Login/signup's `mode` toggle (login vs signup) must still show/hide the "Full name" field correctly inside the re-skinned card** — this is existing conditional JSX (`{mode === "signup" && (...)}`) that must survive the wrapper-only restyle.
- **Home page's density fix must not reintroduce the "silently drop restaurants" bug fixed in the prior plan's final review** — the `useCarouselView` fallback logic (`app/customer/page.tsx:106-108`) must stay intact; narrowing card width/gap in `CuisineCarouselRow` must not touch that page's grouping/fallback logic at all.

---

## File Structure

- **Modify** `app/customer/checkout/page.tsx` — two-column layout, payment-method selectable cards, sticky order-summary card. All existing state/handlers/guards unchanged.
- **Modify** `app/customer/orders/[id]/page.tsx` — adds `OrderStatusTimeline`, restyles the coordinate readout as a map-placeholder box, restyles the order summary as a card. All existing state/polling/guards unchanged.
- **Create** `components/OrderStatusTimeline.tsx` — new presentational component, props `{ status: OrderStatus }` where `OrderStatus` is the same 8-value union already defined in `app/customer/orders/[id]/page.tsx`.
- **Modify** `app/customer/login/page.tsx` — wraps the existing form in a card container. `getSafeRedirect`, `handleLogin`, `handleSignup`, and every input's `value`/`onChange` stay byte-identical; only the outer `<div>`'s class and wrapping change.
- **Modify** `components/CuisineCarouselRow.tsx` — narrower card width (`w-64` → `w-56`) and tighter gap (`gap-4` → `gap-3`). No logic change (still returns `null` on an empty list).
- **Modify** `app/customer/page.tsx:123,140` — flat-grid breakpoints gain `xl:grid-cols-4`. No change to the surrounding grouping/fallback logic (lines 72-108 untouched).

---

### Task 1: `OrderStatusTimeline` component

**Files:**
- Create: `components/OrderStatusTimeline.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `OrderStatusTimeline` — props `{ status: "placed" | "accepted" | "preparing" | "ready" | "assigned" | "picked_up" | "delivered" | "cancelled" }`. Task 3 imports and renders it as `<OrderStatusTimeline status={order.status} />`.

This task addresses two Review Focus items: the status mapping must be total across all 8 values, and `cancelled` must be a special case the component itself refuses to draw a 4-step tracker for (the caller in Task 3 is also responsible for not rendering this component at all when payment failed — see Task 3 — but this component defends its own `cancelled` input independently, since it is a reusable unit that should not crash if reused elsewhere later).

- [ ] **Step 1: Write the component**

```tsx
type OrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "cancelled";

const STEPS = ["Placed", "Preparing", "On the way", "Delivered"] as const;

// Total mapping across all 8 real order statuses onto the 4 display steps.
// Every OrderStatus value except "cancelled" appears on the right-hand side
// exactly once via one of these keys.
const STEP_INDEX: Record<Exclude<OrderStatus, "cancelled">, number> = {
  placed: 0,
  accepted: 0,
  preparing: 1,
  ready: 1,
  assigned: 2,
  picked_up: 2,
  delivered: 3,
};

export function OrderStatusTimeline({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        Order cancelled
      </div>
    );
  }

  const currentIndex = STEP_INDEX[status];

  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((label, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={label} className="flex flex-1 items-center gap-2 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  complete || active
                    ? "bg-brand-primary text-white"
                    : "bg-brand-ink-muted/15 text-brand-ink-muted"
                }`}
              >
                {complete ? "✓" : index + 1}
              </div>
              <span
                className={`text-xs ${
                  active ? "font-semibold text-brand-ink" : "text-brand-ink-muted"
                }`}
              >
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 ${
                  complete ? "bg-brand-primary" : "bg-brand-ink-muted/15"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds (component isn't wired in yet, but must type-check standalone).

- [ ] **Step 3: Manual verification of the total mapping**

Confirm by inspection that `STEP_INDEX`'s type annotation
(`Record<Exclude<OrderStatus, "cancelled">, number>`) makes TypeScript
itself reject a missing key — temporarily delete the `delivered: 3,` line
locally, run `npm run build`, confirm it fails with a TypeScript error
about a missing property, then restore the line and confirm `npm run
build` passes again. This proves the mapping is enforced total by the
compiler, not just by convention.

- [ ] **Step 4: Commit**

```bash
git add components/OrderStatusTimeline.tsx
git commit -m "feat: add OrderStatusTimeline component"
```

---

### Task 2: Checkout page — two-column layout with sticky summary card

**Files:**
- Modify: `app/customer/checkout/page.tsx` (full file — see below)

**Interfaces:**
- Consumes: `useCart()`, `useAddress()`, `useSession()` — all existing, unchanged imports/usage.
- Produces: nothing new consumed by later tasks.

This task addresses the Review Focus item on checkout's early-return states: `sessionLoading`, `!userId` (redirect), and the empty-cart guard are all preserved exactly as separate early `return` statements before the two-column JSX, and the `error` state is rendered inside the new summary card rather than dropped.

- [ ] **Step 1: Rewrite `app/customer/checkout/page.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart-store";
import { useAddress } from "@/lib/address-store";
import { useSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
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

  const total = subtotal + DELIVERY_FEE_RUPEES;

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
          <section className="rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-4 shadow-sm">
            <h2 className="mb-1 font-semibold text-brand-ink">Delivery address</h2>
            <p className="text-sm text-brand-ink-muted">{label}</p>
          </section>

          <section className="rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-4 shadow-sm">
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
          <section className="rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-4 shadow-sm">
            <h2 className="mb-3 font-semibold text-brand-ink">
              {items.length} item{items.length !== 1 ? "s" : ""} from {restaurantName}
            </h2>
            <div className="flex flex-col gap-1 border-t border-brand-ink-muted/10 pt-3 text-sm text-brand-ink-muted">
              <p>Subtotal: ₹{subtotal.toFixed(2)}</p>
              <p>Delivery fee: ₹{DELIVERY_FEE_RUPEES.toFixed(2)}</p>
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

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 3: Manual verification**

With the app running (`npm run app:start`, Docker + Supabase already up):
- Add items to a cart, log out if logged in, click Checkout — confirm the `sessionLoading` → `!userId` redirect to `/customer/login?redirectTo=/customer/checkout` still happens (existing behavior, unmodified).
- Log in, land back on checkout with cart intact — confirm two-column layout renders (address + payment on the left, sticky summary on the right on desktop), payment method cards are clickable and show the active border, error text appears in the summary card if you simulate a failure (e.g. temporarily disconnect Supabase and attempt submit, or trust the code path since `error` state is unchanged).
- Complete checkout with Mock Card — confirm redirect to the order confirmation page still happens.
- At 390×844 mobile viewport, confirm the layout stacks to one column and the summary card doesn't overlap anything.

- [ ] **Step 4: Commit**

```bash
git add app/customer/checkout/page.tsx
git commit -m "feat: single-page two-column checkout layout with sticky summary card"
```

---

### Task 3: Order confirmation/tracking page — status timeline + map-placeholder box

**Files:**
- Modify: `app/customer/orders/[id]/page.tsx` (full file — see below)

**Interfaces:**
- Consumes: `OrderStatusTimeline` (Task 1) — `{ status }` prop, same `OrderStatus` union already defined in this file.
- Produces: nothing new consumed by later tasks.

This task addresses the Review Focus item on the `payment.status === "failed"` and `cancelled` short-circuits: the existing `payment.status === "failed"` branch is untouched and still returns before any timeline render; `OrderStatusTimeline` itself handles `cancelled` (Task 1), so this page passes `order.status` straight through without needing its own additional `cancelled` branch.

- [ ] **Step 1: Rewrite `app/customer/orders/[id]/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";

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

const SHOW_LOCATION_FOR: OrderStatus[] = ["assigned", "picked_up"];

export default function OrderConfirmationPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const TERMINAL_STATUSES: OrderStatus[] = ["delivered", "cancelled"];

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

      // Stop polling if order reached a terminal status
      if (TERMINAL_STATUSES.includes(o.status)) {
        if (interval) clearInterval(interval);
      }

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
    interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [params.id]);

  if (error) {
    return <p className="text-red-600">Couldn&apos;t load order: {error}</p>;
  }

  if (!order || !payment) {
    return <p className="text-gray-500">Loading order…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-ink">Order #{order.id.slice(0, 8)}</h1>
      {payment.status === "failed" ? (
        <p className="text-red-600">
          Payment failed. Your order was not placed — please try checking out
          again.
        </p>
      ) : (
        <>
          <section className="rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-4 shadow-sm">
            <OrderStatusTimeline status={order.status} />
            <p className="mt-3 text-sm text-brand-ink-muted">{STATUS_LABEL[order.status]}</p>
          </section>

          {partnerLocation?.current_lat != null && partnerLocation?.current_lng != null && (
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-brand-ink-muted/25 bg-brand-ink-muted/5 px-4 py-8 text-center">
              <span className="text-2xl">📍</span>
              <p className="text-sm font-medium text-brand-ink">
                {partnerLocation.current_lat.toFixed(4)}, {partnerLocation.current_lng.toFixed(4)}
              </p>
              {partnerLocation.last_ping_at && (
                <p className="text-xs text-brand-ink-muted">
                  Updated {new Date(partnerLocation.last_ping_at).toLocaleTimeString()}
                </p>
              )}
              <p className="mt-1 text-xs text-brand-ink-muted/70">
                Live map coming soon — showing raw coordinates for now.
              </p>
            </div>
          )}

          <section className="rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-4 shadow-sm text-sm text-brand-ink-muted">
            <p>Total: ₹{order.total.toFixed(2)}</p>
            <p>Payment: {payment.status} ({payment.method})</p>
          </section>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds, no type errors.

- [ ] **Step 3: Manual verification**

With the app running:
- Place a fresh order, land on its confirmation page — confirm the status timeline renders with "Placed" as the active step, the order-summary card shows total/payment, and polling still works (status label updates if you advance the order as the vendor in another tab).
- As the vendor, advance the same order through accepted → preparing → ready — confirm the timeline's active/complete steps update correctly at each stage without a page reload (existing 3s poll).
- As the delivery partner, claim and advance the order through assigned/picked_up — confirm the timeline reaches "On the way" and the coordinate placeholder box appears (with a partner online and pinging location).
- Advance to delivered — confirm the timeline shows all 4 steps complete and polling stops (existing terminal-status behavior, unmodified).
- Directly navigate to an order you know has `payment.status === "failed"` (or trust the unmodified code path) — confirm the failed-payment message still renders instead of any timeline.

- [ ] **Step 4: Commit**

```bash
git add "app/customer/orders/[id]/page.tsx"
git commit -m "feat: order tracking status timeline and map-placeholder coordinate box"
```

---

### Task 4: Login/signup page re-skin

**Files:**
- Modify: `app/customer/login/page.tsx:60-104` (JSX only — `getSafeRedirect`, `handleLogin`, `handleSignup`, and the `Suspense` wrapper at the bottom of the file are untouched)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new consumed elsewhere.

This task addresses two Review Focus items: `getSafeRedirect` must stay byte-identical (verified in Step 3 below via direct comparison), and the `mode === "signup"` conditional full-name field must still show/hide correctly inside the new card wrapper.

- [ ] **Step 1: Replace only the returned JSX of `LoginForm`**

In `app/customer/login/page.tsx`, replace lines 60-104 (the `return (...)` block of the `LoginForm` function — everything from `<div className="mx-auto max-w-sm">` through its closing `</div>`) with:

```tsx
  return (
    <div className="mx-auto max-w-sm rounded-xl border border-brand-ink-muted/10 bg-brand-surface p-6 shadow-sm">
      <h1 className="mb-4 text-xl font-bold text-brand-ink">
        {mode === "login" ? "Log in" : "Sign up"}
      </h1>
      <div className="flex flex-col gap-2">
        {mode === "signup" && (
          <input
            className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 focus:border-brand-primary focus:outline-none"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        )}
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 focus:border-brand-primary focus:outline-none"
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 focus:border-brand-primary focus:outline-none"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={submitting}
          onClick={mode === "login" ? handleLogin : handleSignup}
          className="rounded-full bg-brand-primary px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Sign up"}
        </button>
        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="text-sm text-brand-ink-muted underline"
        >
          {mode === "login" ? "Need an account? Sign up" : "Have an account? Log in"}
        </button>
      </div>
    </div>
  );
```

The only change from the original is the outer `<div>`'s class string
(`mx-auto max-w-sm` → `mx-auto max-w-sm rounded-xl border
border-brand-ink-muted/10 bg-brand-surface p-6 shadow-sm`) — every input,
button, handler reference, and the `mode === "signup"` conditional are
copied verbatim.

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Verify `getSafeRedirect` is byte-identical**

Run: `git diff app/customer/login/page.tsx | grep -A 10 "function getSafeRedirect"`
Expected: no output (the diff should show zero changed lines inside
`getSafeRedirect`'s function body — only the JSX block below it changed).

- [ ] **Step 4: Manual verification**

With the app running:
- Navigate to `/customer/login?redirectTo=/customer/checkout` directly — confirm the card renders with border/shadow, log in with a valid test account, confirm redirect to `/customer/checkout` still works (same-origin `redirectTo` path).
- Navigate to `/customer/login?redirectTo=https://evil.example.com` — confirm login still redirects to `/customer` (the existing off-origin fallback), not to the attacker URL.
- Click "Need an account? Sign up" — confirm the "Full name" field appears above Email, click "Have an account? Log in" — confirm it disappears again.

- [ ] **Step 5: Commit**

```bash
git add app/customer/login/page.tsx
git commit -m "style: re-skin login/signup card, no logic change"
```

---

### Task 5: Home page density fix — narrower carousel cards + wider grid breakpoint

**Files:**
- Modify: `components/CuisineCarouselRow.tsx:27` (class-only change)
- Modify: `app/customer/page.tsx:123,140` (class-only change)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new consumed elsewhere.

This task addresses the Review Focus item on not reintroducing the silent-drop bug: only the Tailwind width/gap classes on the card wrapper and grid change; lines 72-108 of `app/customer/page.tsx` (the `withDistance`/`searched`/`filtered`/`byCuisine`/`useCarouselView` computation) are not touched at all.

- [ ] **Step 1: Narrow `CuisineCarouselRow`'s card width and gap**

In `components/CuisineCarouselRow.tsx`, change line 25 from:

```tsx
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
```

to:

```tsx
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
```

And change line 27 from:

```tsx
          <div key={restaurant.id} className="w-64 shrink-0 snap-start">
```

to:

```tsx
          <div key={restaurant.id} className="w-56 shrink-0 snap-start">
```

- [ ] **Step 2: Add a fourth grid breakpoint to both flat-grid renders in `app/customer/page.tsx`**

Change line 123 from:

```tsx
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
```

to:

```tsx
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
```

Change line 140 from:

```tsx
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
```

to:

```tsx
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Manual verification**

With the app running, at a desktop-width viewport (≥1536px, to trigger
`xl:`):
- Load `/customer` with no cuisine filter — confirm carousel rows show
  narrower, tighter-packed cards than before, and a cuisine with only 1-2
  restaurants no longer leaves a large empty gap next to its card(s).
- Click a cuisine chip to trigger the flat-grid fallback — confirm 4
  columns now render on a wide viewport instead of stopping at 3.
- Confirm the silent-drop fallback still works: this is unchanged logic,
  but re-run the previous plan's live check if practical (a restaurant
  outside any cuisine still falls back to the flat grid) — if not
  practical to re-trigger live, confirm by reading the diff that lines
  72-108 of `app/customer/page.tsx` are untouched.

- [ ] **Step 5: Commit**

```bash
git add components/CuisineCarouselRow.tsx app/customer/page.tsx
git commit -m "style: denser carousel cards and wider grid breakpoint on customer home page"
```

---

### Task 6: End-to-end live verification and whole-branch review

**Files:** none (verification-only task)

**Interfaces:** none.

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: succeeds with zero errors/warnings introduced by this work.

- [ ] **Step 2: Playwright walkthrough — desktop**

Drive the running app with Playwright, full flow in one pass:
- `/customer`: confirm denser carousel rows and (via a chip click) the
  4-column grid fallback.
- Browse into a restaurant, add 2+ items, go to checkout: confirm the
  two-column layout, payment-method card selection, and sticky summary.
- Complete checkout with Mock Card: confirm redirect to the order
  confirmation page, the status timeline renders at "Placed", and the
  summary card shows the correct total.
- If practical, advance the order through the vendor/delivery dashboards
  in parallel tabs and confirm the timeline updates through each step to
  "Delivered".
- Visit `/customer/login` directly (logged out): confirm the re-skinned
  card, toggle signup/login, confirm the full-name field's conditional
  visibility.

- [ ] **Step 3: Playwright walkthrough — mobile (390×844)**

Repeat the checkout and order-tracking flow at the mobile viewport used
throughout this project: confirm checkout stacks to one column with the
summary card below the address/payment sections (not overlapping), and
the order-tracking timeline/coordinate box/summary stack sensibly without
horizontal overflow.

- [ ] **Step 4: `getSafeRedirect` diff re-check**

Run: `git diff main -- app/customer/login/page.tsx | grep -A 10 "function getSafeRedirect"`
Expected: no output — confirms the whole branch, not just Task 4's own
commit, leaves this function untouched.

- [ ] **Step 5: Update project memory docs**

Update `CLAUDE.md`, `MEMORY.md`, `README.md` per the project's standing
"Update CLAUDE files" rule: record this as a new completed entry
(customer-flow DoorDash-style polish — checkout, order tracking, login
re-skin, home-page density), noting the new `OrderStatusTimeline`
component and its total status-mapping pattern as a reusable convention
if another status-driven UI needs the same treatment later.

- [ ] **Step 6: Final commit**

```bash
git add CLAUDE.md MEMORY.md README.md
git commit -m "docs: record customer-flow DoorDash-style polish completion"
```
