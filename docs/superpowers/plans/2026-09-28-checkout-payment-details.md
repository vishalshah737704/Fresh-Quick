# Checkout Recipient Details, Payment Fields & n8n Payment/Notification Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Checkout collects recipient name/email and payment-method-specific
fields, gates "Place order" on their validity, resolves mock payment via the
existing (but never-activated) n8n workflows with a same-behavior fallback,
and notifies the vendor of a new order via a real database row — while
removing the redundant cart-sidebar "Checkout" button on the checkout page
itself.

**Architecture:** One new migration adds two `orders` columns, a
`notifications` table, fixes a payload bug in the existing `n8n_notify()`
trigger function (it currently sends an empty body, so the n8n webhooks that
already fire on every insert carry no usable data), and replaces
`checkout_place_order` with a new signature that inserts payments as
`pending` instead of pre-resolved. The checkout API route validates the new
fields, calls the new RPC, then polls the `payments` row briefly for an
n8n-driven resolution before falling back to today's in-process random
outcome — reusing one shared resolution function so both paths behave
identically. The checkout page gains recipient/payment form fields with
client-side validation gating the submit button; the cart sidebar hides its
own "Checkout" link on the checkout route.

**Tech Stack:** Next.js App Router (TypeScript), Supabase Postgres (RPC +
RLS + `pg_net` DB webhooks already wired), n8n (hand-authored workflow JSON,
not yet imported/activated in a live instance).

**Spec:** `docs/superpowers/specs/2026-09-28-checkout-payment-details-design.md`

## Global Constraints

- All money fields stay in exact-numeric Rupees as the existing schema
  already uses (`orders.total`, `payments.amount` are `numeric`, not
  integer-paise — this codebase's "integer-paise" rule applies to
  *application-layer arithmetic*, e.g. `Math.round(x * 100)`, not to how
  Postgres stores the already-rounded value; follow the existing pattern in
  `app/api/cart/checkout/route.ts`, don't invent a new one).
- Never persist a full card number, expiry, or CVV anywhere — client keeps
  them in component state only, server computes and stores only the masked
  `mock_reference` string.
- Any new RLS policy must be read-only for the vendor side (`notifications`
  insert is service-role only, per this repo's standing
  no-unused-write-policy rule in `CLAUDE.md`).
- `drop function if exists` before `create or replace function` whenever a
  function's parameter list changes (this repo's own hard-learned Postgres
  lesson — `create or replace` alone leaves the old overload live and
  ambiguous).
- Run `npm run build` (not just `tsc --noEmit`) before calling any UI task
  done — this repo has hit a build-only failure `tsc` missed before.
- Never call the `/api/internal/*` routes from a browser client; they're
  guarded by `verifyInternalSecret`, and any new one must call it first,
  like every existing internal route does.

## Review Focus

- **Card number submitted with spaces/dashes from the formatted input**
  (e.g. `"4242 4242 4242 4242"`) — validation must strip non-digits before
  checking length, or every real user's input fails a naive `length===16`
  check.
- **Payment method switched after filling one method's fields, then
  submitted** — stale fields from the previously-selected method (e.g. a
  half-typed UPI ID) must not leak into the masked reference or validation
  state for the newly-selected method.
- **n8n not running locally (the default dev state)** — checkout must still
  complete via the timeout fallback, not hang for the full poll window on
  every single order or surface a raw timeout error to the customer.
- **Recipient email left as the pre-filled account email but the account
  has no `full_name` set** (a freshly-signed-up customer) — the name field
  must start empty and still block submit, not silently pass validation
  with `"undefined"` or `"null"` as a string.
- **Order placed successfully but payment ultimately fails** (existing
  behavior, still true after this change) — order must still end up
  `cancelled`, exercised by a fallback-path test with `mock_card` forced to
  the failure branch, not just the already-covered `mock_cod`-always-succeeds
  case.

---

### Task 1: Migration — recipient columns, notifications table, fixed webhook payload, new `checkout_place_order`

**Files:**
- Create: `supabase/migrations/00000000000023_checkout_recipient_and_pending_payment.sql`
- Modify: `supabase/seed.sql:1-10` (only if a demo row needs
  `recipient_name`/`recipient_email` backfilled — see Step 6)

**Interfaces:**
- Produces: `public.checkout_place_order(p_customer_id uuid, p_recipient_name
  text, p_recipient_email text, p_address_label text, p_address_line1 text,
  p_address_lat numeric, p_address_lng numeric, p_store_id uuid, p_subtotal
  numeric, p_delivery_fee numeric, p_total numeric, p_items jsonb,
  p_payment_method text, p_payment_amount numeric, p_payment_reference text,
  p_delivery_note text default null) returns table (order_id uuid, address_id
  uuid, payment_id uuid)` — payment is always inserted with `status =
  'pending'`, `paid_at = null`.
- Produces: `public.notifications` table (`id uuid`, `order_id uuid`,
  `restaurant_id uuid`, `channel text default 'vendor_new_order'`, `message
  text`, `created_at timestamptz default now()`), readable by the owning
  vendor only, writable only by `service_role`.
- Produces: fixed `public.n8n_notify()` that includes the triggering row as
  `record` in the POST body (was previously always `'{}'::jsonb`).

- [ ] **Step 1: Write the migration file's schema changes**

```sql
-- supabase/migrations/00000000000023_checkout_recipient_and_pending_payment.sql

-- Recipient details: the person receiving the order can differ from the
-- logged-in account (ordering for someone else). Backfill existing rows
-- from the account's own name/email so the not-null constraint can apply
-- immediately without breaking existing seed orders.
alter table public.orders add column recipient_name text;
alter table public.orders add column recipient_email text;

update public.orders o
set recipient_name = coalesce(u.full_name, 'Unknown'),
    recipient_email = 'unknown@foodhub.local'
from public.users u
where u.id = o.customer_id and o.recipient_name is null;

alter table public.orders alter column recipient_name set not null;
alter table public.orders alter column recipient_email set not null;

-- Vendor-notification table: a real database fact instead of only an n8n
-- execution log. Insert-only via service-role (see notes on RLS below).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.stores(id) on delete cascade,
  channel text not null default 'vendor_new_order',
  message text not null,
  created_at timestamptz not null default now()
);

create index idx_notifications_restaurant_id on public.notifications (restaurant_id);

alter table public.notifications enable row level security;

-- Read-only for the owning vendor. No insert/update/delete policy: every
-- write goes through the service-role-backed
-- /api/internal/orders/[id]/notify-vendor route (Task 3), never a direct
-- client write, per this repo's standing RLS rule (CLAUDE.md).
create policy "vendor_can_read_own_notifications" on public.notifications
  for select using (
    exists (
      select 1 from public.stores
      where stores.id = notifications.restaurant_id
      and stores.owner_id = auth.uid()
    )
  );

-- Fix: n8n_notify() has sent an empty body since Phase 7 -- every webhook
-- fires but n8n's workflows read `$json.body.record...`, which was always
-- undefined. Rebuild the body from the triggering row so the
-- already-wired triggers (created in 00000000000015_n8n_webhooks.sql)
-- actually carry usable data.
create or replace function public.n8n_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := tg_argv[0],
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'record', to_jsonb(new)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', current_setting('app.n8n_internal_secret', true)
    ),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;
```

- [ ] **Step 2: Write the new `checkout_place_order` in the same file**

```sql
drop function if exists public.checkout_place_order(
  uuid, text, text, numeric, numeric, uuid, numeric, numeric, numeric,
  jsonb, text, text, numeric, timestamptz, text
);

create or replace function public.checkout_place_order(
  p_customer_id uuid,
  p_recipient_name text,
  p_recipient_email text,
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
  p_payment_amount numeric,
  p_payment_reference text,
  p_delivery_note text default null
) returns table (order_id uuid, address_id uuid, payment_id uuid) as $$
declare
  v_address_id uuid;
  v_order_id uuid;
  v_payment_id uuid;
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

  insert into public.orders (customer_id, recipient_name, recipient_email, store_id, delivery_address_id, status, subtotal, delivery_fee, total, delivery_note)
    values (p_customer_id, p_recipient_name, p_recipient_email, p_store_id, v_address_id, 'placed', p_subtotal, p_delivery_fee, p_total, p_delivery_note)
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
      'pending',
      p_payment_amount,
      p_payment_reference,
      null
    )
    returning id into v_payment_id;

  return query select v_order_id, v_address_id, v_payment_id;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.checkout_place_order from public, anon, authenticated;
grant execute on function public.checkout_place_order to service_role;
```

- [ ] **Step 3: Run the migration locally**

Run: `npx supabase db reset`
Expected: migration `00000000000023_checkout_recipient_and_pending_payment.sql`
listed as applied, seed completes with no errors (the backfill `update`
only touches pre-existing rows inserted with the old RPC shape during
seeding, if any — the seed data creates orders through direct
`public.orders` inserts, not through the RPC, so check `supabase/seed.sql`
for any `insert into public.orders` that will now fail the new not-null
columns).

- [ ] **Step 4: Check seed.sql for direct `orders` inserts needing the new columns**

Run: `grep -n "insert into public.orders" supabase/seed.sql`

If any results appear, add `recipient_name` and `recipient_email` to that
insert's column list and values (e.g. reuse the seeded customer's own name
and a `@foodhub.local` email, consistent with this file's existing demo
data conventions) — append the columns, don't edit unrelated columns in
the same statement.

- [ ] **Step 5: Re-run reset to confirm seed.sql changes (if any) apply cleanly**

Run: `npx supabase db reset`
Expected: no errors, exits with `Reset local database.` message.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00000000000023_checkout_recipient_and_pending_payment.sql supabase/seed.sql
git commit -m "feat: add recipient details, notifications table, pending-payment RPC, fix n8n webhook payload"
```

---

### Task 2: Shared mock-payment resolution helper

**Files:**
- Create: `lib/mock-payment.ts`
- Modify: `app/api/internal/payments/[id]/result/route.ts`

**Interfaces:**
- Consumes: `supabaseServer` from `@/lib/supabase-server`.
- Produces: `applyPaymentResult(paymentId: string, status: "success" |
  "failed"): Promise<{ ok: true; orderId: string } | { ok: false; reason:
  string }>` — updates the `payments` row (only if currently `pending`),
  sets `paid_at` on success, cancels the parent order (only if currently
  `placed`) on failure. Used by both the existing internal result route and
  Task 6's checkout-route fallback, so both paths share one code path for
  "how a resolved payment is written."

- [ ] **Step 1: Write `lib/mock-payment.ts`**

```typescript
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";

export type PaymentApplyResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: string };

// Applies a resolved mock-payment outcome: marks the payment row (only if
// still pending) and, on failure, cancels the parent order (only if still
// placed). Shared by the n8n-callback route and the in-process fallback
// path so "what happens when payment resolves" has exactly one
// implementation regardless of which path decided the outcome.
export async function applyPaymentResult(
  paymentId: string,
  status: "success" | "failed"
): Promise<PaymentApplyResult> {
  const { data: payment, error: paymentError } = await supabaseServer
    .from("payments")
    .update({
      status,
      paid_at: status === "success" ? new Date().toISOString() : null,
    })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id, order_id, status")
    .single();

  if (paymentError || !payment) {
    return { ok: false, reason: "Payment is not pending" };
  }

  if (status === "failed") {
    const { error: cancelError } = await supabaseServer
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", payment.order_id)
      .eq("status", "placed");
    if (cancelError) {
      console.error("Failed to cancel order after payment failure:", payment.order_id, cancelError);
    }
  }

  return { ok: true, orderId: payment.order_id };
}
```

- [ ] **Step 2: Refactor the internal result route to use it**

Replace the body of `app/api/internal/payments/[id]/result/route.ts`'s
`POST` handler from the `supabaseServer.from("payments").update(...)` block
onward with:

```typescript
import { applyPaymentResult } from "@/lib/mock-payment";
// (keep the existing imports for NextRequest, NextResponse, verifyInternalSecret)

// ... after the existing status validation (status !== "success" && status !== "failed") ...

  const result = await applyPaymentResult(id, status);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({ payment: { id, status } });
```

- [ ] **Step 3: Run the build to confirm no type errors**

Run: `npm run build`
Expected: succeeds, no TypeScript errors in either file.

- [ ] **Step 4: Commit**

```bash
git add lib/mock-payment.ts app/api/internal/payments/[id]/result/route.ts
git commit -m "refactor: extract shared mock-payment resolution helper"
```

---

### Task 3: New internal route — vendor notification

**Files:**
- Create: `app/api/internal/orders/[id]/notify-vendor/route.ts`
- Test: manual curl in Step 3 (this route has no browser-facing caller to
  drive through Playwright; verify it directly)

**Interfaces:**
- Consumes: `verifyInternalSecret` from `@/lib/internal-auth`,
  `supabaseServer` from `@/lib/supabase-server`.
- Produces: `POST /api/internal/orders/[id]/notify-vendor` — inserts one row
  into `public.notifications` for the order's `store_id`, returns
  `{ notification: { id, order_id, restaurant_id, message } }`.

- [ ] **Step 1: Write the route**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyInternalSecret } from "@/lib/internal-auth";

// Called by n8n's "01 - Order Placed" workflow once an order insert is
// confirmed as status = 'placed'. Writes a real notifications row so the
// vendor-facing "new order" alert is a verifiable database fact, not just
// an n8n execution log entry (spec section 6).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;

  const { data: order, error: orderError } = await supabaseServer
    .from("orders")
    .select("id, store_id, total, order_items(quantity)")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const itemCount = (order.order_items ?? []).reduce((sum, i) => sum + i.quantity, 0);
  const shortId = order.id.slice(0, 8);
  const message = `New order #${shortId} — ${itemCount} item${itemCount === 1 ? "" : "s"}, ₹${Number(order.total).toFixed(2)}`;

  const { data: notification, error: insertError } = await supabaseServer
    .from("notifications")
    .insert({
      order_id: order.id,
      restaurant_id: order.store_id,
      channel: "vendor_new_order",
      message,
    })
    .select("id, order_id, restaurant_id, message")
    .single();

  if (insertError || !notification) {
    return NextResponse.json({ error: "Failed to write notification" }, { status: 500 });
  }

  return NextResponse.json({ notification });
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: succeeds, new route listed in the route table output.

- [ ] **Step 3: Verify live with curl (requires `npx supabase start` running and an existing order id)**

Run:
```bash
ORDER_ID=$(psql "$(grep DB_URL .env.local | cut -d= -f2)" -tAc "select id from orders limit 1")
curl -s -X POST "http://localhost:3000/api/internal/orders/$ORDER_ID/notify-vendor" \
  -H "X-Internal-Secret: $(grep N8N_INTERNAL_SECRET .env.local | cut -d= -f2)" \
  -H "Content-Type: application/json"
```
Expected: `{"notification":{"id":"...","order_id":"...","restaurant_id":"...","message":"New order #........ — N items, ₹...."}}`

If `.env.local` doesn't define `N8N_INTERNAL_SECRET` yet, set one (any
random string) and restart `npm run dev` before this step — the route
can't be tested without it, and Task 6's fallback code needs it defined
too.

- [ ] **Step 4: Commit**

```bash
git add app/api/internal/orders/[id]/notify-vendor/route.ts
git commit -m "feat: add internal route to write vendor new-order notifications"
```

---

### Task 4: n8n workflow — replace placeholder notify node

**Files:**
- Modify: `n8n/workflows/01-order-placed.json`

**Interfaces:**
- Consumes: the `/api/internal/orders/[id]/notify-vendor` route from Task 3.
- Produces: no code interface — this is workflow configuration consumed
  only by an n8n instance, not by the Next.js app.

- [ ] **Step 1: Replace the `noOp` node with an HTTP Request node**

Edit `n8n/workflows/01-order-placed.json`, replacing the
`"notify-restaurant"` node object with:

```json
    {
      "id": "notify-restaurant",
      "name": "Notify Restaurant (write notification row)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [680, 220],
      "parameters": {
        "method": "POST",
        "url": "={{$env.APP_BASE_URL}}/api/internal/orders/{{$json[\"body\"][\"record\"][\"id\"]}}/notify-vendor",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "X-Internal-Secret", "value": "={{$env.N8N_INTERNAL_SECRET}}" },
            { "name": "Content-Type", "value": "application/json" }
          ]
        }
      },
      "notes": "Calls the internal route added in this plan's Task 3, which writes a real public.notifications row -- see docs/n8n-webhook-setup.md for APP_BASE_URL/N8N_INTERNAL_SECRET env requirements inside the n8n container."
    }
```

- [ ] **Step 2: Update the file's trailing note**

The file ends with:
```json
  "_untested_reference_only": true,
  "_note": "Hand-authored to n8n's export JSON shape; never imported into or run against a real n8n instance. See docs/superpowers/specs/2026-09-25-phase7-n8n-automation-design.md."
```

Leave `_untested_reference_only: true` as-is — it stays true until someone
actually imports this into a running n8n instance and confirms it end to
end (this plan's Task 9 does that, if n8n is available in this
environment; otherwise it's confirmed at Task 6's fallback level only, and
this flag must NOT be flipped to false without that live check, per this
repo's own standing rule about not trusting an untested claim).

- [ ] **Step 3: Validate the JSON is well-formed**

Run: `python -c "import json; json.load(open('n8n/workflows/01-order-placed.json'))"`
Expected: no output (valid JSON), exits 0.

- [ ] **Step 4: Commit**

```bash
git add n8n/workflows/01-order-placed.json
git commit -m "feat: wire 01-order-placed workflow's vendor notification to the real internal route"
```

---

### Task 5: Payment field validation + masking helpers

**Files:**
- Create: `lib/payment-fields.ts`

**Interfaces:**
- Produces:
  - `type PaymentMethod = "mock_card" | "mock_upi" | "mock_cod"`
  - `type CardFields = { cardNumber: string; expiry: string; cardholderName: string }`
  - `type UpiFields = { upiId: string }`
  - `validateCardFields(fields: CardFields): string | null` — returns an
    error message, or `null` if valid.
  - `validateUpiFields(fields: UpiFields): string | null`
  - `buildMaskedReference(method: PaymentMethod, cardFields: CardFields,
    upiFields: UpiFields): string` — e.g. `"Card •••• 4242"`, `"UPI
    name@bank"`, `"Cash on Delivery"`.
  - Used by both the checkout page (Task 7, for enabling "Place order") and
    the checkout API route (Task 6, for server-side re-validation and
    building the stored `mock_reference`) — same functions, same file,
    imported both client- and server-side (pure functions, no I/O, safe in
    both contexts).

- [ ] **Step 1: Write `lib/payment-fields.ts`**

```typescript
export type PaymentMethod = "mock_card" | "mock_upi" | "mock_cod";

export type CardFields = {
  cardNumber: string;
  expiry: string; // "MM/YY"
  cardholderName: string;
};

export type UpiFields = {
  upiId: string;
};

// Strips spaces/dashes before checking -- the UI formats the input as the
// user types, but validation (client AND server) must accept that
// formatted string, not just a raw 16-digit run.
function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

export function validateCardFields(fields: CardFields): string | null {
  const digits = digitsOnly(fields.cardNumber);
  if (digits.length !== 16) {
    return "Card number must be 16 digits";
  }
  const match = /^(\d{2})\/(\d{2})$/.exec(fields.expiry.trim());
  if (!match) {
    return "Expiry must be in MM/YY format";
  }
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) {
    return "Expiry month must be between 01 and 12";
  }
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return "Card has expired";
  }
  if (fields.cardholderName.trim().length === 0) {
    return "Cardholder name is required";
  }
  return null;
}

export function validateUpiFields(fields: UpiFields): string | null {
  if (!/^[\w.\-]+@[\w]+$/.test(fields.upiId.trim())) {
    return "Enter a valid UPI ID, e.g. name@bank";
  }
  return null;
}

export function buildMaskedReference(
  method: PaymentMethod,
  cardFields: CardFields,
  upiFields: UpiFields
): string {
  if (method === "mock_card") {
    const digits = digitsOnly(cardFields.cardNumber);
    return `Card •••• ${digits.slice(-4)}`;
  }
  if (method === "mock_upi") {
    return `UPI ${upiFields.upiId.trim()}`;
  }
  return "Cash on Delivery";
}

export function validateRecipientEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Enter a valid email address";
  }
  return null;
}
```

- [ ] **Step 2: Run the build**

Run: `npm run build`
Expected: succeeds (this file isn't imported anywhere yet, so it just
needs to type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add lib/payment-fields.ts
git commit -m "feat: add shared payment field validation and masking helpers"
```

---

### Task 6: Checkout API route — recipient/payment validation, pending-payment RPC call, poll + fallback

**Files:**
- Modify: `app/api/cart/checkout/route.ts`

**Interfaces:**
- Consumes: `validateCardFields`, `validateUpiFields`, `validateRecipientEmail`,
  `buildMaskedReference` from `@/lib/payment-fields`; `applyPaymentResult`
  from `@/lib/mock-payment`; the new `checkout_place_order` RPC shape from
  Task 1.
- Produces: same response shape as today (`{ orderId, paymentStatus }`) —
  no client-visible interface change beyond the new required request body
  fields.

- [ ] **Step 1: Add new request body fields and validate them**

In `app/api/cart/checkout/route.ts`, extend the destructured body type and
add validation right after the existing `deliveryNote` validation block
(after the line computing `normalizedDeliveryNote`):

```typescript
import { validateCardFields, validateUpiFields, validateRecipientEmail, buildMaskedReference, type CardFields, type UpiFields } from "@/lib/payment-fields";
import { applyPaymentResult } from "@/lib/mock-payment";
```

Add `recipientName`, `recipientEmail`, `cardFields`, `upiFields` to the
destructured body (typed as `string`, `string`, `CardFields | undefined`,
`UpiFields | undefined`), then:

```typescript
  const normalizedRecipientName = typeof recipientName === "string" ? recipientName.trim() : "";
  if (normalizedRecipientName.length === 0) {
    return NextResponse.json({ error: "Recipient name is required" }, { status: 400 });
  }
  const emailError = validateRecipientEmail(typeof recipientEmail === "string" ? recipientEmail : "");
  if (emailError) {
    return NextResponse.json({ error: emailError }, { status: 400 });
  }

  let paymentFieldError: string | null = null;
  if (paymentMethod === "mock_card") {
    paymentFieldError = validateCardFields(cardFields ?? { cardNumber: "", expiry: "", cardholderName: "" });
  } else if (paymentMethod === "mock_upi") {
    paymentFieldError = validateUpiFields(upiFields ?? { upiId: "" });
  }
  if (paymentFieldError) {
    return NextResponse.json({ error: paymentFieldError }, { status: 400 });
  }

  const maskedReference = buildMaskedReference(
    paymentMethod,
    cardFields ?? { cardNumber: "", expiry: "", cardholderName: "" },
    upiFields ?? { upiId: "" }
  );
```

- [ ] **Step 2: Replace the payment-resolution + RPC call block**

Replace the existing block that starts with
`// Mock payment resolution — synchronous, in-process (no n8n yet).` through
the end of the RPC call and the `if (!paymentSucceeds)` cancel block, with:

```typescript
  const { data: rpcRows, error: rpcError } = await supabaseServer.rpc("checkout_place_order", {
    p_customer_id: customerId,
    p_recipient_name: normalizedRecipientName,
    p_recipient_email: recipientEmail.trim(),
    p_address_label: deliveryAddress.label,
    p_address_line1: deliveryAddress.label,
    p_address_lat: deliveryAddress.lat,
    p_address_lng: deliveryAddress.lng,
    p_store_id: storeId,
    p_subtotal: subtotal,
    p_delivery_fee: deliveryFeePaise / 100,
    p_total: total,
    p_items: orderItemsPayload,
    p_payment_method: paymentMethod,
    p_payment_amount: total,
    p_payment_reference: maskedReference,
    p_delivery_note: normalizedDeliveryNote,
  });

  if (rpcError || !rpcRows || !rpcRows[0]) {
    return NextResponse.json({ error: "Failed to place order" }, { status: 500 });
  }

  const order = { id: rpcRows[0].order_id as string };
  const paymentId = rpcRows[0].payment_id as string;

  // Poll briefly for n8n to resolve the payment via
  // /api/internal/payments/[id]/result (workflow 02). If it doesn't
  // resolve in time -- most commonly because n8n isn't running locally,
  // which is the default dev state -- fall back to the same in-process
  // random-outcome logic Phase 3 always used, applied through the same
  // applyPaymentResult() helper the n8n callback route uses, so behavior
  // is identical either way.
  const POLL_INTERVAL_MS = 400;
  const POLL_TIMEOUT_MS = 10_000;
  let paymentStatus: "success" | "failed" | null = null;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const { data: paymentRow } = await supabaseServer
      .from("payments")
      .select("status")
      .eq("id", paymentId)
      .single();
    if (paymentRow && paymentRow.status !== "pending") {
      paymentStatus = paymentRow.status as "success" | "failed";
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  if (paymentStatus === null) {
    const fallbackSucceeds =
      paymentMethod === "mock_cod" || Math.random() < PAYMENT_SUCCESS_RATE;
    const fallbackStatus = fallbackSucceeds ? "success" : "failed";
    const applied = await applyPaymentResult(paymentId, fallbackStatus);
    paymentStatus = applied.ok ? fallbackStatus : "failed";
  }
```

- [ ] **Step 3: Update the final response to use the resolved status**

The route's final line should remain:

```typescript
  return NextResponse.json({ orderId: order.id, paymentStatus });
```

(unchanged — `paymentStatus` is now always resolved to `"success"` or
`"failed"` by the block above, never left as `null`).

- [ ] **Step 4: Run the build**

Run: `npm run build`
Expected: succeeds, no TypeScript errors (in particular, confirm
`PAYMENT_SUCCESS_RATE` is still imported from `@/lib/order-constants` at
the top of the file — it's reused in the fallback branch above).

- [ ] **Step 5: Manual test — order with mock_cod, no n8n running**

With the local dev stack up (`npm run app:start`, no n8n container
running), place a cash-on-delivery test order through the existing
checkout flow (Task 7 hasn't added the new required fields yet, so
temporarily hardcode `recipientName`/`recipientEmail` values in the
request body via a curl call to `/api/cart/checkout` directly, using a
valid session token, `paymentMethod: "mock_cod"`):

Expected: response after roughly 10 seconds (the full poll timeout, since
nothing will ever resolve the pending payment without n8n) with
`paymentStatus: "success"` (COD always succeeds even via the fallback
branch).

- [ ] **Step 6: Manual test — forced payment failure cancels the order**

Temporarily edit `lib/order-constants.ts`, changing
`PAYMENT_SUCCESS_RATE` from `0.8` to `0`. Restart the dev server, place a
`mock_card` test order the same way as Step 5 (no n8n running, so the
fallback always decides). Expected: response has `paymentStatus: "failed"`.
Then confirm via SQL (`select status from orders where id = '<orderId>'`)
that the order's status is `cancelled`, not left as `placed`. Revert
`PAYMENT_SUCCESS_RATE` back to `0.8` and restart the dev server before
continuing.

- [ ] **Step 7: Commit**

```bash
git add app/api/cart/checkout/route.ts
git commit -m "feat: validate recipient/payment fields, poll n8n payment resolution with fallback"
```

---

### Task 7: Checkout page UI — recipient fields, payment method fields, gated submit

**Files:**
- Modify: `app/customer/checkout/page.tsx`

**Interfaces:**
- Consumes: `validateCardFields`, `validateUpiFields`, `validateRecipientEmail`
  from `@/lib/payment-fields`; `supabase` from `@/lib/supabase` (for
  `auth.getSession()` email and a `public.users` select for `full_name`).
- Produces: no new exports — this is the page component itself.

- [ ] **Step 1: Add recipient name/email state, pre-filled on mount**

Add near the other `useState` calls:

```typescript
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardholderName, setCardholderName] = useState("");
  const [upiId, setUpiId] = useState("");
```

Add a `useEffect` (import `useEffect` from `"react"` alongside the
existing `useState` import) that runs once `userId` is available:

```typescript
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    async function loadProfile() {
      const { data: sessionData } = await supabase.auth.getSession();
      const email = sessionData.session?.user.email ?? "";
      const { data: profile } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", userId)
        .single();
      if (cancelled) return;
      setRecipientEmail(email);
      setRecipientName(profile?.full_name ?? "");
    }
    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [userId]);
```

- [ ] **Step 2: Compute validation state and gate the submit button**

Add, right before the `return (` statement:

```typescript
  const recipientNameError = recipientName.trim().length === 0 ? "Name is required" : null;
  const recipientEmailError = validateRecipientEmail(recipientEmail);
  const paymentFieldError =
    paymentMethod === "mock_card"
      ? validateCardFields({ cardNumber, expiry: cardExpiry, cardholderName })
      : paymentMethod === "mock_upi"
        ? validateUpiFields({ upiId })
        : null;
  const canPlaceOrder =
    !recipientNameError && !recipientEmailError && !paymentFieldError;
```

- [ ] **Step 3: Pass the new fields in the checkout POST body**

In `handleSubmit`, add to the `body: JSON.stringify({ ... })` object:

```typescript
          recipientName: recipientName.trim(),
          recipientEmail: recipientEmail.trim(),
          cardFields: paymentMethod === "mock_card" ? { cardNumber, expiry: cardExpiry, cardholderName } : undefined,
          upiFields: paymentMethod === "mock_upi" ? { upiId } : undefined,
```

- [ ] **Step 4: Add the recipient fields section to the JSX**

Insert a new `<section>` before the existing "Delivery address" section
(same styling pattern):

```tsx
          <section className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
            <h2 className="mb-3 font-semibold text-brand-ink">Contact details</h2>
            <div className="flex flex-col gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-ink">Name</label>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                  placeholder="Who's this order for?"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-brand-ink">Email</label>
                <input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                  placeholder="Where should order updates go?"
                />
              </div>
            </div>
          </section>
```

- [ ] **Step 5: Add conditional payment fields inside the Payment method section**

Inside the existing `{PAYMENT_METHODS.map((m) => ( ... ))}` block, after
the closing `</label>` for each method's radio row, add a sibling
conditional block (still inside the `.map()`'s returned fragment — wrap
the existing `<label>` and this new block in a `<div key={m.value}>`
instead of putting `key` on the `<label>` directly):

```tsx
              {PAYMENT_METHODS.map((m) => (
                <div key={m.value}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
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
                    <span className="text-lg">{m.icon}</span>
                    <span className="font-medium text-brand-ink">{m.label}</span>
                  </label>
                  {paymentMethod === m.value && m.value === "mock_card" && (
                    <div className="mt-2 flex flex-col gap-2 border-t border-brand-ink-muted/10 pt-2">
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="Card number (16 digits)"
                        className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          placeholder="MM/YY"
                          className="w-24 rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                        />
                        <input
                          type="text"
                          value={cardholderName}
                          onChange={(e) => setCardholderName(e.target.value)}
                          placeholder="Cardholder name"
                          className="flex-1 rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  )}
                  {paymentMethod === m.value && m.value === "mock_upi" && (
                    <div className="mt-2 border-t border-brand-ink-muted/10 pt-2">
                      <input
                        type="text"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        placeholder="UPI ID, e.g. name@bank"
                        className="w-full rounded border border-brand-ink-muted/15 px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </div>
              ))}
```

- [ ] **Step 6: Gate the "Place order" button**

Change:

```tsx
            <button
              disabled={submitting}
              onClick={handleSubmit}
```

to:

```tsx
            <button
              disabled={submitting || !canPlaceOrder}
              onClick={handleSubmit}
```

- [ ] **Step 7: Run the build**

Run: `npm run build`
Expected: succeeds. If a Suspense-boundary or hook-order error appears,
double check the new `useEffect` is placed alongside the other hooks
(before any early `return` in the component), not after one of the
`if (...) return ...` guards — hooks must run unconditionally.

- [ ] **Step 8: Live Playwright verification — all 3 payment methods**

With `npm run app:start` up, log in as the seeded demo customer, add an
item to cart, go to `/customer/checkout`, and for each payment method:

1. Confirm "Place order" is disabled with the method selected but its
   fields empty (or, for `mock_cod`, confirm it's enabled as soon as
   name/email are filled, since COD has no extra fields).
2. Fill valid fields for that method, confirm "Place order" becomes
   enabled.
3. Click it, confirm the order confirmation page loads
   (`/customer/orders/[id]`).

Expected: all three methods complete successfully (COD/success cases;
card/UPI may land on either success or failed per the 80% mock rate --
either outcome is correct behavior, just confirm the button was gated and
the request completed, not that it always succeeds).

- [ ] **Step 9: Commit**

```bash
git add app/customer/checkout/page.tsx
git commit -m "feat: add recipient and payment-method fields to checkout, gate Place order on validity"
```

---

### Task 8: Cart sidebar — hide Checkout button on the checkout page

**Files:**
- Modify: `components/CartPanel.tsx`

**Interfaces:**
- Consumes: `usePathname` from `next/navigation` (already used the same
  way in `components/SidebarNav.tsx` — follow that exact import pattern).

- [ ] **Step 1: Add the pathname check**

Add the import:

```typescript
import { usePathname } from "next/navigation";
```

Inside the `CartPanel` component function, add near the top (alongside the
existing `useCart()`/`useState` calls):

```typescript
  const pathname = usePathname();
  const isOnCheckoutPage = pathname === "/customer/checkout";
```

- [ ] **Step 2: Conditionally render the Checkout link**

Wrap the existing `<Link href="/customer/checkout" ...>Checkout</Link>` in:

```tsx
        {!isOnCheckoutPage && (
          <Link
            href="/customer/checkout"
            className="mt-2 block rounded-full bg-brand-primary px-3 py-2 text-center text-sm font-semibold text-white"
          >
            Checkout
          </Link>
        )}
```

- [ ] **Step 3: Run the build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 4: Live Playwright verification**

Navigate to a restaurant page with an item in cart — confirm the sidebar's
"Checkout" button is visible. Navigate to `/customer/checkout` — confirm
it's gone and only the page's own "Place order" button remains.

- [ ] **Step 5: Commit**

```bash
git add components/CartPanel.tsx
git commit -m "fix: hide redundant cart-sidebar Checkout button on the checkout page itself"
```

---

### Task 9: Whole-flow verification (n8n running, if available)

**Files:** none (verification only)

- [ ] **Step 1: Check whether n8n can be started in this environment**

Run: `docker ps -a | grep n8n` and check
`docs/n8n-webhook-setup.md` section 1 for the confirmed-working docker run
command.

If n8n cannot be started here (no Docker access, or it's genuinely out of
scope for this session), skip to Step 5 and note in the commit message
that this task's n8n-running path was not verified live in this
environment — do not claim it was.

- [ ] **Step 2: Start n8n and import both workflows**

Follow `docs/n8n-webhook-setup.md` to start the container with
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` and the correct `SUPABASE_URL`
(`host.docker.internal`, not `127.0.0.1` — this repo's own documented
Phase 7 lesson). Import `n8n/workflows/01-order-placed.json` and
`02-payment-mock-confirmation.json`, activate both.

- [ ] **Step 3: Set `app.n8n_internal_secret` in Postgres**

Run (via `psql` against the local Supabase instance, per
`docs/n8n-webhook-setup.md`):
```sql
alter database postgres set app.n8n_internal_secret = '<the same value as N8N_INTERNAL_SECRET in .env.local>';
```
Reconnect/restart Postgrest or reset the session for the setting to take
effect if the docs call for it.

- [ ] **Step 4: Place a live order and confirm n8n resolves it (not the fallback)**

Place a `mock_card` order through the UI. Immediately query:
```sql
select status from payments order by id desc limit 1;
```
while the checkout request is still in flight (within the 10s poll
window). Expected: the payment resolves to `success` or `failed` within
roughly 2 seconds (workflow 02's simulated gateway delay), well under the
10s fallback timeout — confirming n8n resolved it, not the fallback path.

Then query:
```sql
select * from notifications order by created_at desc limit 1;
```
Expected: one row referencing the just-placed order's id, with a message
matching the format from Task 3.

- [ ] **Step 5: Update `_untested_reference_only` if Steps 1-4 passed live**

If (and only if) Step 4's live check passed, edit both
`n8n/workflows/01-order-placed.json` and
`n8n/workflows/02-payment-mock-confirmation.json`, changing
`"_untested_reference_only": true` to `"_untested_reference_only": false`
and updating each file's `"_note"` field to record the date this was
confirmed live and against what environment.

If Step 1 determined n8n couldn't be run in this environment, leave both
files' `_untested_reference_only` as `true` — this is the honest outcome,
not a failure of this task.

- [ ] **Step 6: Commit**

```bash
git add n8n/workflows/01-order-placed.json n8n/workflows/02-payment-mock-confirmation.json
git commit -m "docs: confirm n8n order-placed/payment-confirmation workflows verified live"
```

(Skip this commit entirely if Step 5 made no file changes.)

---

### Task 10: Update project memory docs

**Files:**
- Modify: `CLAUDE.md`
- Modify: `MEMORY.md`

- [ ] **Step 1: Add a MEMORY.md entry**

Add a new bullet under the phase-status section (matching the existing
style of recent entries) summarizing: recipient name/email capture,
payment-method-specific fields with masked-only storage, the fixed
`n8n_notify()` empty-body bug, the poll+fallback payment resolution
design, the new `notifications` table, and whether Task 9's live n8n
verification actually ran in this session (be exact — don't claim "verified
live" if Task 9 was skipped).

- [ ] **Step 2: Add a CLAUDE.md rule if Task 9 uncovered anything new**

If the live n8n check (Task 9) surfaced any additional gotcha beyond the
`n8n_notify()` empty-body bug already documented in Task 1 (which itself
is worth a CLAUDE.md bullet, since it's exactly the kind of
"looked-right-on-paper, never driven live" bug this project's CLAUDE.md
already tracks several of), add it as a new bullet in the existing
project-specific-rules list, following the file's established format
(rule, **Why:**, concrete incident).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md MEMORY.md
git commit -m "docs: record checkout payment/notification changes in project memory"
```
