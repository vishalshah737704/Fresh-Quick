# Checkout: recipient details, payment-method fields, and real n8n payment/notification wiring

Date: 2026-09-28
Status: approved, ready for implementation plan

## 1. Problem

Reported against `/customer/checkout` (screenshots attached in conversation):

1. The persistent cart sidebar shows its own "Checkout" button at the same
   time the checkout page's own "Place order" button is visible — redundant,
   confusing on the checkout page itself.
2. Checkout only shows the account's global address label — it never asks
   for a delivery recipient's **name** and **email**, which can differ from
   the logged-in account (ordering for someone else).
3. The payment-method radio buttons (Mock Card / Mock UPI / Cash on
   Delivery) collect no actual payment-method-specific information.
4. "Place order" is enabled immediately, before any of the above mandatory
   information exists. Payment is resolved in-process, synchronously,
   never touching the n8n workflows already authored for this
   (`n8n/workflows/01-order-placed.json`,
   `02-payment-mock-confirmation.json`) — those exist only as
   `_untested_reference_only` hand-authored JSON, never wired live.
5. The vendor gets no notification of a new order beyond noticing it in
   their dashboard's Orders tab (which already live-shows new orders,
   Phase 4) — `01-order-placed.json`'s restaurant-notify step is a bare
   `noOp` placeholder.

## 2. Decisions (confirmed with Vishal via AskUserQuestion)

- Cart sidebar's "Checkout" button hides specifically on
  `/customer/checkout` (stays visible elsewhere).
- Payment fields: Mock Card collects number + expiry + cardholder name;
  Mock UPI collects a UPI ID; Cash on Delivery collects nothing extra.
- Only non-sensitive, masked payment info is ever persisted (e.g.
  `"Card •••• 4242"`, `"UPI name@bank"`, `"Cash on Delivery"`) — never a
  full card number, expiry, or CVV, even fake ones.
- Payment resolution moves from in-process synchronous mock logic onto
  the existing DB-trigger n8n workflows (01 + 02), with the checkout API
  route polling the `payments` row until n8n's callback resolves it,
  preserving today's synchronous UX (user still waits on the checkout
  page for a result) without redesigning n8n into a request/response API.
- **Fallback**: if n8n doesn't resolve payment within a short timeout
  (not running, webhook misconfigured, etc.), the checkout route falls
  back to today's in-process random-outcome resolution rather than
  hanging or hard-failing the order. This is a deliberate compatibility
  shim, not a permanent design — see §7.
- Name/Email fields pre-fill from the logged-in account, editable.
- Vendor notification: n8n's `01-order-placed.json` gets a real step
  (replacing its `noOp` placeholder) that calls a new internal API route
  to insert a row into a new `notifications` table, so the notification
  is a verifiable database fact, not just an n8n execution log entry.

## 3. Schema changes (new migration)

```sql
alter table public.orders
  add column recipient_name text not null default '',
  add column recipient_email text not null default '';
-- defaults dropped after backfill in the same migration (existing seed
-- orders get the customer's own name/email as a reasonable backfill).

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id),
  channel text not null default 'vendor_new_order',
  message text not null,
  created_at timestamptz not null default now()
);
-- RLS: owner-only read (vendor can read notifications for their own
-- restaurant_id, same pattern as existing vendor RLS on orders/menu
-- items). Insert only via service-role (the internal API route), no
-- client-side write policy — per the standing RLS-write-policy rule in
-- CLAUDE.md.
```

`payments.mock_reference` (already exists, currently unused by any
writer) is reused to store the masked payment string. No new column.

## 4. `place_order` RPC

Gains two new required params: `p_recipient_name text`,
`p_recipient_email text`. Both validated non-empty server-side (defense
in depth beyond the client-side required-field check).

## 5. Checkout API route (`/api/cart/checkout`)

1. Validates `recipientName`, `recipientEmail` (non-empty, email format),
   and payment-method-specific fields server-side (card number
   digits-only + length, expiry not in the past, UPI id format) —
   mirrors the client validation, never trusts it alone.
2. Builds the masked `mock_reference` string server-side from the
   submitted payment fields (never stores the raw card number/expiry).
3. Calls `place_order` RPC with the new params — inserts `orders` +
   `payments` (status `pending`) rows in one transaction as today.
4. The DB insert triggers (once configured per
   `docs/n8n-webhook-setup.md`) n8n workflow 01 (order-placed →
   vendor notification) and, via the `payments` insert, workflow 02
   (mock payment confirmation → calls back to
   `/api/internal/payments/[id]/result`, already implemented).
5. Route polls the `payments` row (e.g. every 400ms, up to 10s) for a
   non-`pending` status.
   - Resolved by n8n in time → use that status.
   - Timeout → fall back to today's in-process
     `PAYMENT_SUCCESS_RATE`-based resolution (§2 decision), resolve the
     payment row directly, and proceed exactly as today's synchronous
     path does.
6. Response shape unchanged (`orderId`, `paymentStatus`) — no client
   changes needed beyond what's in this spec.

## 6. New internal route: `/api/internal/orders/[id]/notify-vendor`

- POST, guarded by the existing `X-Internal-Secret` header pattern (same
  as `/api/internal/payments/[id]/result`).
- Looks up the order's `restaurant_id`, inserts a `notifications` row
  with a generated message (e.g. `"New order #<short-id> — 2 items,
  ₹290.00"`).
- Called by n8n workflow 01's replacement node.

## 7. `01-order-placed.json` / `02-payment-mock-confirmation.json` changes

- `01`: replace the `noOp` "Notify Restaurant (placeholder)" node with an
  HTTP Request node calling §6's route. Update `_untested_reference_only`
  → still true until someone actually runs this against a live n8n
  instance and confirms it (per this repo's own hard-learned lesson: a
  workflow JSON that "looks right" is not verified until driven live).
- `02`: unchanged logic. Both workflows remain hand-authored JSON in this
  plan — actually importing/activating them in a running n8n instance
  and wiring the Supabase DB webhooks is implementation-plan work, not
  something this spec can verify from a design doc.

## 8. Checkout page UI (`app/customer/checkout/page.tsx`)

- New "Contact details" section above/alongside delivery address: Name
  (text), Email (text, `type="email"`), pre-filled from
  `session.user.email` and `public.users.full_name` (fetched once on
  mount), editable.
- Payment method section: each method's radio option expands its own
  fields inline when selected (matches the existing card-like layout in
  the screenshots).
  - Mock Card: Card number (client-formats as `#### #### #### ####`,
    16 digits required), Expiry (`MM/YY`, must not be in the past),
    Cardholder name.
  - Mock UPI: UPI ID (`^[\w.\-]+@[\w]+$`-style check).
  - Cash on Delivery: no fields.
- "Place order" `disabled` when: recipient name empty, email fails a
  basic format check, or the active payment method's required fields
  aren't all valid. Validation runs client-side for UX responsiveness;
  §5 point 1 re-validates server-side regardless.

## 9. `CartPanel.tsx` (sidebar)

- Reads `usePathname()`; the "Checkout" `Link` renders only when
  `pathname !== "/customer/checkout"`.

## 10. Testing plan

- `npm run build` (existing rule: catches missing-Suspense-style issues
  `tsc` alone won't).
- Live Playwright pass: fill checkout form for each of the 3 payment
  methods, confirm Place order stays disabled until valid, confirm order
  places successfully with n8n **not** running (fallback path — this is
  the realistic local-dev case unless n8n is explicitly started) and,
  time permitting, with n8n running and webhooks configured per
  `docs/n8n-webhook-setup.md` (n8n-confirmed path).
- Query `notifications` table after a successful order to confirm a row
  was inserted (only possible in the n8n-running case, or by curling the
  new internal route directly to prove the route itself works
  independent of n8n).
- Confirm cart sidebar's Checkout button is absent on `/customer/checkout`
  and present elsewhere (e.g. a restaurant page with items in cart).

## 11. Explicitly out of scope

- Real payment gateway integration (this stays 100% mock, per existing
  project convention).
- Real email/push delivery for the vendor notification — it's a DB row,
  not an actual email/SMS (matches "log/simulate" per Vishal's answer).
- Changing how the delivery address itself is picked (still the existing
  global address-store picker, not a new per-order address form).
