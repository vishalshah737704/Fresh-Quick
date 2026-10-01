# Order Visibility — Sub-project B (web Delivery + web Admin) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the deferred foundation (status colors, store pickup address, order timestamps, readable payment labels), then give the web Delivery portal an Active dashboard + History page with full order details, and the web Admin portal a four-screen sidebar (Overview, Orders, Vendors, Delivery Partners) with an order-detail page and add-vendor / add-partner forms.

**Architecture:** Foundation additions land in the existing client-safe modules `lib/order-status.ts` and `lib/order-detail.ts` plus one DB trigger that stamps `accepted_at` / `picked_up_at` / `delivered_at` whenever `orders.status` changes (covers all seven status writers without touching any route). Delivery gets two NEW endpoints (`/api/delivery/active`, `/api/delivery/history`) returning normalized `OrderDetail` objects passed through a pure redaction function (`lib/delivery-order-view.ts`) that enforces what a partner may see at each stage; the two legacy delivery endpoints stay byte-for-byte unchanged so the mobile app keeps working until sub-project D migrates it. Admin gets a nav-link array in `AdminShell`, new pages under `app/admin/(portal)/`, one summary-list endpoint, one detail endpoint, and two `POST` create endpoints that mirror the signup routes including auth-user rollback.

**Tech Stack:** Next.js 16 (App Router, TS) + Tailwind v4, Supabase (PostgREST embeds, local Docker), `node --test` (Node 24 type stripping — no new packages) for pure-logic tests, Playwright MCP for live verification.

**Spec:** [docs/superpowers/specs/2026-09-30-order-visibility-and-admin-management-design.md](../specs/2026-09-30-order-visibility-and-admin-management-design.md) (sections: Shared foundation, Delivery, Admin, Customer phone number, Verification). Sub-project A plan (style reference, done): [2026-09-30-order-visibility-sub-project-a.md](2026-09-30-order-visibility-sub-project-a.md).

**Branch:** `order-visibility-b`, created from `main` in the main checkout (no worktree — a worktree needs `npm ci`, i.e. a package install).

## Global Constraints

- 2-space indent, ES modules, `async/await` (no `.then()` chains), comments only for non-obvious WHY.
- No new npm packages (global rule). Pure-logic tests run with `node --no-warnings --test tests/*.test.mjs` (a bare `tests/` directory fails on Node 24) on `.mjs` files importing `.ts` modules directly; therefore any module under test (`lib/order-status.ts`, `lib/order-detail.ts`, `lib/delivery-order-view.ts`) must use only erasable TS syntax (no enums, no parameter properties) and only `import type` with **relative** paths from other project files (no `@/` alias, no runtime imports of other project files except relative `.ts` imports that are themselves erasable).
- Schema change in this sub-project is exactly one migration (`00000000000027_order_status_timestamps.sql`): three nullable `timestamptz` columns on `orders` + one `BEFORE UPDATE` trigger. No new RLS policy, no policy change (CLAUDE.md: never add unused RLS write policies; list existing policies before touching any table's policies — none are touched here). Apply with `npx supabase migration up`, **never** `db reset`.
- Store pickup address uses the existing `stores.address_id` FK (embed `addresses!address_id`). No schema change. A store with no address (every vendor created through `vendor-signup`, and every admin-created vendor) renders "Address not on file".
- Delivery privacy (spec + existing RLS `delivery_can_read_assigned_order_address`): a partner sees the recipient's phone and full drop-off address **only** while the order is `assigned` / `picked_up` and assigned to them. Available (`ready`, unassigned) cards and History cards must NOT carry recipient phone, email or address. Redaction is enforced server-side in `lib/delivery-order-view.ts`, not in the UI. Recipient **email** is never sent to a partner.
- Every new/changed order API for these roles returns normalized `OrderDetail` (`lib/order-detail.ts`) including `recipientPhone`; the admin orders **list** returns a purpose-built summary row (like `OrderListRow` for the customer list) and the admin **detail** endpoint returns full `OrderDetail`.
- Mobile compatibility: `GET /api/delivery/orders` and `GET /api/delivery/available-orders` are NOT modified in this sub-project (mobile `mobile/src/app/delivery/dashboard.tsx` and `mobile/lib/api.ts` call them with the old `{id,status,total,stores:{name}}` shape). Sub-project D migrates mobile to `/api/delivery/active` + `/api/delivery/history` and then deletes the two legacy endpoints. Record this in MEMORY.md at the end (Task 13).
- Route-group rule (CLAUDE.md): every new admin/delivery page lives under `app/admin/(portal)/` or `app/delivery/(portal)/`; login pages stay outside. Every new `"use client"` dynamic `[id]` page that fetches its own data needs a sibling `loading.tsx` (`app/admin/(portal)/orders/[id]/loading.tsx`).
- Routes/URLs stay stable: Delivery Dashboard stays `/delivery/dashboard` (login redirects point there), Admin Overview stays `/admin/dashboard`. New: `/delivery/history`, `/admin/orders`, `/admin/orders/[id]`, `/admin/vendors`, `/admin/delivery-partners`.
- Money: integer-paise arithmetic for any computed amount (`Math.round(x * 100)`); display DB `subtotal`/`delivery_fee`/`total`, never recompute them. Use `formatPaise`.
- Branding only via existing tokens (`brand-primary`, `brand-accent`, `brand-ink`, `brand-ink-muted`, `*-tint`, `*-text-safe`) plus stock Tailwind `-700` palette colors for status pills; white text on every pill must stay ≥ 4.5:1 contrast (use `-700` shades or `*-text-safe`, never `-500`/`-600`).
- Service-role client (`supabaseServer`) and `server-only` auth helpers only in server files (route handlers); `lib/order-detail.ts`, `lib/order-status.ts`, `lib/delivery-order-view.ts` must NOT import them.
- Tables are `stores`/`products` (renamed in migration 20).
- No `<a href>` for internal navigation — use `next/link` (`Link`).
- Any URL-derived redirect target logic is untouched (login pages not modified).
- Admin-created accounts: admin types email + temp password; `email_confirm: true`; vendor store created with `is_open: true` so it shows "Active" immediately (spec decision: "active immediately, no invite email"); validation via `validateSignupFields` / `isValidVehicleType` from `lib/signup-validation.ts`; on any failure after `auth.admin.createUser`, call `supabaseServer.auth.admin.deleteUser` (rollback).
- Lint: the repo has 12 pre-existing lint failures (not part of this work); every file this plan creates or edits must introduce **no new** lint errors (`npx eslint <file>` on each touched file; beware `react-hooks/set-state-in-effect` — load data via an async function called from the effect, never call `setState` synchronously in the effect body).
- Done = `npx tsc --noEmit` clean, `node --no-warnings --test tests/*.test.mjs` green, `npm run build` passes, live Playwright pass on **all four web login surfaces** (customer, vendor, delivery, admin) plus 320/390px phone-width checks on the new Delivery and Admin screens, final whole-branch review against the SPEC. Commit via `/commit` (named files only, never `git add -A`; never `--no-verify`). Announce multi-file edits before making them.
- Demo logins: `customer@foodhub.local` / `demo1234`; vendors `<store-slug>@foodhub.local` / `demo1234` (e.g. `dosa-corner@foodhub.local`); admin seeded by `scripts/seed.mjs` (see README ~line 89). No seeded delivery partner — sign up fresh on `/delivery/login`. Do not read `.env*` files or print keys. Playwright screenshots must be saved under the project root (they land in git-ignored `.playwright-mcp/`).

## Review Focus

1. A delivery partner's "available" card must never leak recipient phone/address (order not yet theirs); a History card must not leak phone/address either. Pinned by Task 3 tests (`redactForDelivery`), re-checked live in Task 7 by inspecting the raw `/api/delivery/active` JSON.
2. Store with no `address_id` (null embed) → pickup block shows "Address not on file", no crash. Pinned in Task 2 tests (`storeAddress: null`) and Task 5 card.
3. Timestamps are null on orders created before the migration and on statuses not yet reached; UI must render nothing (not "Invalid Date"). Pinned in Task 2 test + Task 1 DB check.
4. Admin creating a vendor/partner with an email that already exists → Supabase `createUser` error is surfaced to the form as an error message, no half-created rows left (rollback). Checked live in Task 12 (duplicate-email attempt) and the rollback path reviewed in Task 8.
5. Admin Overview "Active orders"/"Revenue" must treat `rejected` like `cancelled` (rejected orders are refunded) — the old dashboard only excluded `cancelled`. Pinned by a pure helper test in Task 9.
6. Admin orders table: an unassigned order has no partner → shows "—", not "null"; order with `stores` or partner embed returned as an array vs object (PostgREST shape) both normalize. Pinned in Task 8 normalizer tests.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/00000000000027_order_status_timestamps.sql` | Create | 3 nullable timestamp columns + status-change trigger |
| `lib/order-status.ts` | Modify | add `STATUS_COLOR` (pill classes per status) |
| `lib/order-detail.ts` | Modify | store address + timestamps in select / `OrderDetail`; `formatPayment` |
| `components/OrderDetailView.tsx` | Modify | colored status pill, payment label, timestamps block |
| `components/vendor/VendorOrderCard.tsx` | Modify | payment label via `formatPayment` |
| `lib/delivery-order-view.ts` | Create | pure `redactForDelivery(order, scope)` |
| `app/api/delivery/active/route.ts` | Create | `{ available, mine }` as redacted `OrderDetail[]` |
| `app/api/delivery/history/route.ts` | Create | `{ orders }` terminal orders, newest first, limited |
| `components/delivery/DeliveryOrderCard.tsx` | Create | card: store+pickup, recipient, phone, address, items, amount, actions |
| `components/delivery/DeliveryShell.tsx` | Modify | `NAV_LINKS` Dashboard / History |
| `app/delivery/(portal)/dashboard/page.tsx` | Modify | Active dashboard using `/api/delivery/active` |
| `app/delivery/(portal)/history/page.tsx` | Create | History list |
| `lib/admin-order-view.ts` | Create | pure admin-summary normalizer + overview KPI helpers |
| `app/api/admin/orders/route.ts` | Modify | summary rows |
| `app/api/admin/orders/[id]/route.ts` | Create | full `OrderDetail` + partner name |
| `app/api/admin/vendors/route.ts` | Create | `POST` create vendor account + store |
| `app/api/admin/delivery-partners/route.ts` | Modify | add `POST` (keep existing `GET`) |
| `components/admin/AdminShell.tsx` | Modify | `NAV_LINKS` Overview / Orders / Vendors / Delivery Partners |
| `app/admin/(portal)/dashboard/page.tsx` | Modify | Overview = KPIs only |
| `app/admin/(portal)/orders/page.tsx` | Create | orders table |
| `app/admin/(portal)/orders/[id]/page.tsx` + `loading.tsx` | Create | `OrderDetailView` + reassign |
| `app/admin/(portal)/vendors/page.tsx` | Create | vendors list + suspend + Add form |
| `app/admin/(portal)/delivery-partners/page.tsx` | Create | partners list + Add form |
| `tests/order-status.test.mjs`, `tests/order-detail.test.mjs` | Modify | foundation tests |
| `tests/delivery-order-view.test.mjs`, `tests/admin-order-view.test.mjs` | Create | redaction + admin helper tests |
| `MEMORY.md`, `CLAUDE.md`, `README.md`, `AGENTS.md` | Modify (Task 13) | record sub-project B |

---

### Task 1: Migration — order status timestamps

**Files:**
- Create: `supabase/migrations/00000000000027_order_status_timestamps.sql`

**Interfaces:**
- Produces: nullable columns `orders.accepted_at`, `orders.picked_up_at`, `orders.delivered_at` (`timestamptz`), maintained by trigger `orders_stamp_status_times`. Task 2 selects them.

- [ ] **Step 1: Create the branch**

Run: `git checkout -b order-visibility-b` (from `main`; first `git status -sb` — only `.claude/` and the `.MP4` may be untracked, plus this plan and the spec edit which must be committed first: `git add docs/superpowers/specs/2026-09-30-order-visibility-and-admin-management-design.md docs/superpowers/plans/2026-09-30-order-visibility-sub-project-b.md` then `/commit` "docs: add sub-project B plan; spec adds order status timestamps" — on `main`, before branching).

- [ ] **Step 2: Write the migration**

```sql
-- Sub-project B: when each order reached accepted / picked_up / delivered.
-- One BEFORE UPDATE trigger stamps the column on the status change itself,
-- so every writer (vendor/delivery/internal routes, admin, n8n) is covered
-- without editing any route. Old orders stay null (UI renders nothing).
alter table public.orders add column accepted_at timestamptz;
alter table public.orders add column picked_up_at timestamptz;
alter table public.orders add column delivered_at timestamptz;

create or replace function public.orders_stamp_status_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'accepted' and new.accepted_at is null then
      new.accepted_at := now();
    elsif new.status = 'picked_up' and new.picked_up_at is null then
      new.picked_up_at := now();
    elsif new.status = 'delivered' and new.delivered_at is null then
      new.delivered_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_stamp_status_times on public.orders;
create trigger orders_stamp_status_times
  before update of status on public.orders
  for each row execute function public.orders_stamp_status_times();
```

- [ ] **Step 3: Apply**

Run: `npx supabase migration up` (never `db reset`). Expected: applies `00000000000027_...` only.

- [ ] **Step 4: Verify the trigger live, inside a rolled-back transaction**

Find the DB container: `docker ps --format "{{.Names}}" | grep -i supabase_db`. Then (replace `<db>`):

```bash
docker exec -i <db> psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
begin;
create temp table t as select id, status from public.orders where status = 'placed' limit 1;
-- if no 'placed' order exists, pick any order and note its original status for rollback (the whole thing is rolled back anyway)
update public.orders set status = 'accepted' where id = (select id from t);
select status, accepted_at is not null as accepted_stamped, picked_up_at is null as pu_null, delivered_at is null as d_null from public.orders where id = (select id from t);
update public.orders set status = 'picked_up' where id = (select id from t);
update public.orders set status = 'delivered' where id = (select id from t);
select status, accepted_at is not null as a, picked_up_at is not null as p, delivered_at is not null as d from public.orders where id = (select id from t);
rollback;
SQL
```

Expected: first select `accepted_stamped = t, pu_null = t, d_null = t`; second select `a = t, p = t, d = t`. If no order with status `placed` exists, run the same with any order (the `rollback` discards everything). Also confirm old rows untouched: `select count(*) from public.orders where accepted_at is not null;` → `0` after the rollback.

- [ ] **Step 5: Commit** (`/commit`, named file only): `feat: stamp accepted/picked-up/delivered times on orders`

---

### Task 2: Foundation — status colors, store address, timestamps, payment labels

**Files:**
- Modify: `lib/order-status.ts` (append `STATUS_COLOR`)
- Modify: `lib/order-detail.ts` (select string, raw/normalized types, `normalizeOrderDetail`, new `formatPayment`)
- Modify: `components/OrderDetailView.tsx` (status pill color, `formatPayment`, store pickup line, timestamps block)
- Modify: `components/vendor/VendorOrderCard.tsx:36` (use `formatPayment`)
- Test: `tests/order-status.test.mjs`, `tests/order-detail.test.mjs`

**Interfaces:**
- Produces (used by Tasks 3, 5, 6, 8, 10):
  - `STATUS_COLOR: Record<OrderStatus, string>` — a Tailwind class string per status, e.g. `"bg-amber-700 text-white"`.
  - `OrderDetail` gains: `storeAddress: { label: string | null; lines: string[] } | null`, `acceptedAt: string | null`, `pickedUpAt: string | null`, `deliveredAt: string | null`.
  - `formatPayment(payment: { status: string; method: string } | null): string` — e.g. `"Paid · Card"`, `"Pending · Cash on delivery"`, `"Refunded · UPI"`, `"—"` for null; unknown values pass through unchanged.
  - `ORDER_DETAIL_SELECT` now also selects `accepted_at, picked_up_at, delivered_at` and `stores(name, store_address:addresses!address_id(label, line1, line2, city, state, pincode))`.

- [ ] **Step 1: Write failing tests**

Append to `tests/order-status.test.mjs` (add `STATUS_COLOR` to the import list):

```js
test("every status has a colour class with white text", () => {
  for (const status of ORDER_STATUSES) {
    const cls = STATUS_COLOR[status];
    assert.ok(typeof cls === "string" && cls.includes("text-white"), status);
    assert.ok(/\bbg-[a-z-]+(-700|-800|-900)?\b/.test(cls) || cls.includes("bg-brand-"), status);
  }
});

test("cancelled and rejected share the failure colour; delivered differs from them", () => {
  assert.equal(STATUS_COLOR.cancelled, STATUS_COLOR.rejected);
  assert.notEqual(STATUS_COLOR.delivered, STATUS_COLOR.cancelled);
});
```

Append to `tests/order-detail.test.mjs` (add `formatPayment` to the import list; reuse the file's existing `baseRaw` fixture):

```js
test("select string asks for store address and the three timestamps", () => {
  assert.match(ORDER_DETAIL_SELECT, /accepted_at/);
  assert.match(ORDER_DETAIL_SELECT, /picked_up_at/);
  assert.match(ORDER_DETAIL_SELECT, /delivered_at/);
  assert.match(ORDER_DETAIL_SELECT, /store_address:addresses!address_id/);
});

test("store address normalizes from object or array embed; null when absent", () => {
  const addr = { label: null, line1: "12 MG Road", line2: null, city: "Bengaluru", state: "KA", pincode: "560001" };
  const withObj = normalizeOrderDetail({ ...baseRaw, stores: { name: "S", store_address: addr } });
  assert.deepEqual(withObj.storeAddress, { label: null, lines: ["12 MG Road", "Bengaluru, KA 560001"] });
  const withArr = normalizeOrderDetail({ ...baseRaw, stores: [{ name: "S", store_address: [addr] }] });
  assert.deepEqual(withArr.storeAddress, withObj.storeAddress);
  const none = normalizeOrderDetail({ ...baseRaw, stores: { name: "S", store_address: null } });
  assert.equal(none.storeAddress, null);
});

test("timestamps pass through and default to null", () => {
  const stamped = normalizeOrderDetail({
    ...baseRaw,
    accepted_at: "2026-09-30T10:05:00Z",
    picked_up_at: "2026-09-30T10:30:00Z",
    delivered_at: "2026-09-30T10:50:00Z",
  });
  assert.equal(stamped.acceptedAt, "2026-09-30T10:05:00Z");
  assert.equal(stamped.pickedUpAt, "2026-09-30T10:30:00Z");
  assert.equal(stamped.deliveredAt, "2026-09-30T10:50:00Z");
  const old = normalizeOrderDetail(baseRaw);
  assert.equal(old.acceptedAt, null);
  assert.equal(old.pickedUpAt, null);
  assert.equal(old.deliveredAt, null);
});

test("formatPayment gives readable labels for every DB value", () => {
  assert.equal(formatPayment(null), "—");
  assert.equal(formatPayment({ status: "success", method: "mock_card" }), "Paid · Card");
  assert.equal(formatPayment({ status: "pending", method: "mock_cod" }), "Pending · Cash on delivery");
  assert.equal(formatPayment({ status: "failed", method: "mock_upi" }), "Failed · UPI");
  assert.equal(formatPayment({ status: "refunded", method: "mock_card" }), "Refunded · Card");
  assert.equal(formatPayment({ status: "weird", method: "other" }), "weird · other");
});
```

(If the existing fixture `baseRaw.stores` is `{ name: ... }`, the new keys default to missing — `first(raw.stores)?.store_address` must tolerate `undefined`.)

- [ ] **Step 2: Run to verify failure**

Run: `node --no-warnings --test tests/order-status.test.mjs tests/order-detail.test.mjs`
Expected: FAIL (`STATUS_COLOR` / `formatPayment` not exported; select string lacks fields).

- [ ] **Step 3: Implement `lib/order-status.ts`** — append:

```ts
// White text on every pill: all backgrounds are -700 shades (or the darkened
// brand "-text-safe" tokens) so contrast stays >= 4.5:1.
export const STATUS_COLOR: Record<OrderStatus, string> = {
  placed: "bg-slate-700 text-white",
  accepted: "bg-blue-700 text-white",
  preparing: "bg-amber-700 text-white",
  ready: "bg-teal-700 text-white",
  assigned: "bg-brand-primary-text-safe text-white",
  picked_up: "bg-brand-primary-text-safe text-white",
  delivered: "bg-green-700 text-white",
  cancelled: "bg-red-700 text-white",
  rejected: "bg-red-700 text-white",
};
```

- [ ] **Step 4: Implement `lib/order-detail.ts`**

Change the select (keep every existing field; only the `stores(...)` embed and the first line change):

```ts
export const ORDER_DETAIL_SELECT =
  "id, status, subtotal, delivery_fee, total, placed_at, accepted_at, picked_up_at, delivered_at, delivery_note, recipient_name, recipient_email, recipient_phone, delivery_partner_id, " +
  "stores(name, store_address:addresses!address_id(label, line1, line2, city, state, pincode)), " +
  "address:addresses!delivery_address_id(label, line1, line2, city, state, pincode), " +
  "payments(status, method), " +
  "order_items(id, quantity, unit_price, special_instructions, products(name, image_url), order_item_options(id, group_name, option_name))";
```

In `RawOrderDetail`: add `accepted_at: string | null; picked_up_at: string | null; delivered_at: string | null;` (make them optional `?:` so older fixtures typecheck) and change `stores` to
`OneOrMany<{ name: string; store_address?: OneOrMany<RawAddress> }>`.

In `OrderDetail`: add `storeAddress: { label: string | null; lines: string[] } | null; acceptedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null;`.

In `normalizeOrderDetail`, compute `const store = first(raw.stores); const storeAddress = first(store?.store_address);` and return `storeName: store?.name ?? "Unknown store"`, `storeAddress: storeAddress ? formatAddress(storeAddress) : null`, `acceptedAt: raw.accepted_at ?? null`, `pickedUpAt: raw.picked_up_at ?? null`, `deliveredAt: raw.delivered_at ?? null`. Keep `ORDER_LIST_SELECT` unchanged (its `stores(name)` embed is fine).

Add:

```ts
const PAYMENT_STATUS_LABEL: Record<string, string> = {
  success: "Paid",
  pending: "Pending",
  failed: "Failed",
  refunded: "Refunded",
};
const PAYMENT_METHOD_LABEL: Record<string, string> = {
  mock_card: "Card",
  mock_upi: "UPI",
  mock_cod: "Cash on delivery",
};

export function formatPayment(payment: { status: string; method: string } | null): string {
  if (!payment) return "—";
  const status = PAYMENT_STATUS_LABEL[payment.status] ?? payment.status;
  const method = PAYMENT_METHOD_LABEL[payment.method] ?? payment.method;
  return `${status} · ${method}`;
}
```

- [ ] **Step 5: Run tests** — `node --no-warnings --test tests/*.test.mjs` → all pass (previous 19 + new).

- [ ] **Step 6: Wire the UI**

`components/OrderDetailView.tsx`:
- import `STATUS_COLOR` (with `STATUS_LABEL`) and `formatPayment`; status pill `className` becomes `` `rounded-[var(--radius-pill)] px-3 py-1 text-sm font-medium ${STATUS_COLOR[order.status]}` ``.
- Payment tile: `{formatPayment(order.payment)}`.
- Under the header (below the "Order #… · date" line) add a small "Pickup from" block, only when `order.storeAddress` exists: `<p className="text-sm text-brand-ink-muted">Pickup: {order.storeAddress.lines.join(", ")}</p>`.
- After the totals section, add a timestamps list that renders only non-null entries (`Placed`, `Accepted`, `Picked up`, `Delivered` with `new Date(x).toLocaleString()`); render nothing if only `Placed` exists is NOT desired — always show `Placed`; skip the others when null.

`components/vendor/VendorOrderCard.tsx:36`: import `formatPayment` and render `Payment: {formatPayment(order.payment)}`.
Also grep the repo for other `payment.status}` / `payment.method}` raw renders (`grep -rn "payment\.\(status\|method\)" app components`) and fix any remaining display sites (known: `OrderDetailView.tsx`, `VendorOrderCard.tsx`; `app/customer/orders/[id]/page.tsx:88` is a logic comparison, leave it).

- [ ] **Step 7: Verify** — `npx tsc --noEmit`; `npx eslint lib/order-status.ts lib/order-detail.ts components/OrderDetailView.tsx components/vendor/VendorOrderCard.tsx` (no new errors); then live-check the `stores` → `addresses` embed actually resolves (it is the one PostgREST-hint risk): start/using the running dev server, open `/vendor/orders` (login `dosa-corner@foodhub.local` / `demo1234`) and confirm the page still loads orders without a 500 (the vendor API runs `ORDER_DETAIL_SELECT` with the service role). Also load `/customer/orders/<id>` as `customer@foodhub.local` and confirm the order still renders (customer reads under RLS; the store-address embed may legitimately be `null` there — that is fine, it must not error).

- [ ] **Step 8: Commit** (`/commit`, named files): `feat: status colors, store pickup address, order timestamps, readable payment labels`

---

### Task 3: Delivery redaction — `lib/delivery-order-view.ts`

**Files:**
- Create: `lib/delivery-order-view.ts`
- Test: `tests/delivery-order-view.test.mjs`

**Interfaces:**
- Consumes: `OrderDetail` type from `./order-detail.ts` (`import type`).
- Produces: `type DeliveryScope = "available" | "active" | "history"` and `redactForDelivery(order: OrderDetail, scope: DeliveryScope): OrderDetail` — returns a shallow copy:
  - always: `recipientEmail: ""`.
  - `available`: also `recipientName: ""`, `recipientPhone: ""`, `address: null`, `deliveryNote: null`.
  - `active`: recipient name/phone/address/deliveryNote kept.
  - `history`: `recipientPhone: ""`, `address: null`, `deliveryNote: null` (name kept).

- [ ] **Step 1: Failing test** `tests/delivery-order-view.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { redactForDelivery } from "../lib/delivery-order-view.ts";

const order = {
  id: "abcdef12-0000-0000-0000-000000000000",
  status: "assigned",
  placedAt: "2026-09-30T10:00:00Z",
  acceptedAt: null, pickedUpAt: null, deliveredAt: null,
  subtotal: 250, deliveryFee: 30, total: 280,
  deliveryNote: "ring bell",
  recipientName: "Asha", recipientEmail: "asha@example.com", recipientPhone: "+919876543210",
  storeName: "Dosa Corner",
  storeAddress: { label: null, lines: ["12 MG Road"] },
  deliveryPartnerId: "p1",
  address: { label: "Home", lines: ["1 Park St", "Pune 411001"] },
  payment: { status: "success", method: "mock_card" },
  items: [],
};

test("active keeps recipient name, phone, address and note but never the email", () => {
  const out = redactForDelivery(order, "active");
  assert.equal(out.recipientName, "Asha");
  assert.equal(out.recipientPhone, "+919876543210");
  assert.deepEqual(out.address, order.address);
  assert.equal(out.deliveryNote, "ring bell");
  assert.equal(out.recipientEmail, "");
});

test("available hides every recipient detail but keeps store, pickup address, items, amount", () => {
  const out = redactForDelivery({ ...order, status: "ready", deliveryPartnerId: null }, "available");
  assert.equal(out.recipientName, "");
  assert.equal(out.recipientPhone, "");
  assert.equal(out.recipientEmail, "");
  assert.equal(out.address, null);
  assert.equal(out.deliveryNote, null);
  assert.equal(out.storeName, "Dosa Corner");
  assert.deepEqual(out.storeAddress, order.storeAddress);
  assert.equal(out.total, 280);
});

test("history hides phone/address/note, keeps name", () => {
  const out = redactForDelivery({ ...order, status: "delivered" }, "history");
  assert.equal(out.recipientName, "Asha");
  assert.equal(out.recipientPhone, "");
  assert.equal(out.address, null);
  assert.equal(out.deliveryNote, null);
});

test("does not mutate its input", () => {
  const copy = structuredClone(order);
  redactForDelivery(order, "available");
  assert.deepEqual(order, copy);
});
```

- [ ] **Step 2:** `node --no-warnings --test tests/delivery-order-view.test.mjs` → FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
import type { OrderDetail } from "./order-detail";

export type DeliveryScope = "available" | "active" | "history";

// Server-side privacy gate mirroring the RLS policy
// delivery_can_read_assigned_order_address: a partner sees the recipient's
// phone and drop-off address only while the order is theirs and in flight.
export function redactForDelivery(order: OrderDetail, scope: DeliveryScope): OrderDetail {
  const base = { ...order, recipientEmail: "" };
  if (scope === "active") return base;
  if (scope === "history") {
    return { ...base, recipientPhone: "", address: null, deliveryNote: null };
  }
  return { ...base, recipientName: "", recipientPhone: "", address: null, deliveryNote: null };
}
```

- [ ] **Step 4:** run test → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit**: `feat: server-side redaction for delivery partner order views`

---

### Task 4: Delivery APIs — `/api/delivery/active` and `/api/delivery/history`

**Files:**
- Create: `app/api/delivery/active/route.ts`
- Create: `app/api/delivery/history/route.ts`

**Interfaces:**
- Consumes: `resolveDeliveryPartner`, `tokenFromRequest` (`@/lib/delivery-auth`); `ORDER_DETAIL_SELECT`, `normalizeOrderDetail`, `RawOrderDetail` (`@/lib/order-detail`); `redactForDelivery` (`@/lib/delivery-order-view`).
- Produces:
  - `GET /api/delivery/active` → `{ available: OrderDetail[]; mine: OrderDetail[] }`. `available` = status `ready`, `delivery_partner_id` null, oldest first, **only if the partner `is_online`** (else `[]`), redacted `"available"`. `mine` = this partner's orders with status in (`assigned`,`picked_up`), oldest first, redacted `"active"`.
  - `GET /api/delivery/history?limit=N` → `{ orders: OrderDetail[] }`: this partner's orders with status in (`delivered`,`cancelled`,`rejected`), `placed_at` descending, `limit` default 50, clamped to 1–100 (non-numeric → 50), redacted `"history"`.

- [ ] **Step 1: `active/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";
import {
  ORDER_DETAIL_SELECT,
  normalizeOrderDetail,
  type RawOrderDetail,
} from "@/lib/order-detail";
import { redactForDelivery } from "@/lib/delivery-order-view";

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
  if (partnerError || !partner) {
    return NextResponse.json({ error: "Failed to load partner" }, { status: 500 });
  }

  const { data: mineRows, error: mineError } = await supabaseServer
    .from("orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("delivery_partner_id", resolved.partnerId)
    .in("status", ["assigned", "picked_up"])
    .order("placed_at", { ascending: true });
  if (mineError) {
    return NextResponse.json({ error: "Failed to load your orders" }, { status: 500 });
  }

  let availableRows: unknown[] = [];
  if (partner.is_online) {
    const { data, error } = await supabaseServer
      .from("orders")
      .select(ORDER_DETAIL_SELECT)
      .eq("status", "ready")
      .is("delivery_partner_id", null)
      .order("placed_at", { ascending: true });
    if (error) {
      return NextResponse.json({ error: "Failed to load available orders" }, { status: 500 });
    }
    availableRows = data ?? [];
  }

  const toDetail = (row: unknown) => normalizeOrderDetail(row as RawOrderDetail);
  return NextResponse.json({
    available: availableRows.map((row) => redactForDelivery(toDetail(row), "available")),
    mine: (mineRows ?? []).map((row) => redactForDelivery(toDetail(row), "active")),
  });
}
```

- [ ] **Step 2: `history/route.ts`** — same imports; parse `limit`:

```ts
const raw = Number(request.nextUrl.searchParams.get("limit"));
const limit = Number.isInteger(raw) && raw >= 1 ? Math.min(raw, 100) : 50;
```

then `.eq("delivery_partner_id", resolved.partnerId).in("status", ["delivered", "cancelled", "rejected"]).order("placed_at", { ascending: false }).limit(limit)` and return `{ orders: rows.map((row) => redactForDelivery(normalizeOrderDetail(row as RawOrderDetail), "history")) }` with a 500 `"Failed to load history"` on error.

- [ ] **Step 3: Verify** — `npx tsc --noEmit`; `npx eslint app/api/delivery/active/route.ts app/api/delivery/history/route.ts`; `npm run build` (new routes must compile). Live behaviour is verified in Task 7 (needs a delivery session; do not read `.env`). Confirm the legacy `app/api/delivery/orders/route.ts` and `available-orders/route.ts` are untouched: `git diff --stat main -- app/api/delivery/orders app/api/delivery/available-orders` must be empty.
- [ ] **Step 4: Commit**: `feat: delivery active and history endpoints returning redacted OrderDetail`

---

### Task 5: Delivery portal — sidebar nav, order card, Active dashboard

**Files:**
- Create: `components/delivery/DeliveryOrderCard.tsx`
- Modify: `components/delivery/DeliveryShell.tsx` (nav links)
- Modify: `app/delivery/(portal)/dashboard/page.tsx` (rewrite data layer + list)

**Interfaces:**
- Consumes: `OrderDetail`, `formatPaise` (`@/lib/order-detail`); `STATUS_COLOR`, `STATUS_LABEL` (`@/lib/order-status`); `ItemThumb` (`@/components/ItemThumb`).
- Produces: `DeliveryOrderCard({ order, scope, busy, onClaim, onAdvance })` where `scope: "available" | "active" | "history"`; `onClaim?: () => void` (available), `onAdvance?: () => void` (active). Task 6 reuses it with `scope="history"` and no handlers.

- [ ] **Step 1: `DeliveryShell.tsx`** — mirror `components/vendor/VendorShell.tsx`: add `import Link from "next/link"; import { usePathname } from "next/navigation";`, `const pathname = usePathname();` and

```ts
const NAV_LINKS = [
  { href: "/delivery/dashboard", label: "Dashboard" },
  { href: "/delivery/history", label: "History" },
];
```

Replace the static "Dashboard" `<span>` with the `NAV_LINKS.map(...)` `Link` block copied from VendorShell (active when `pathname === link.href`, `onClick={() => setDrawerOpen(false)}`). Nothing else in the shell changes (online badge, profile, sign-out stay).

- [ ] **Step 2: `DeliveryOrderCard.tsx`** (client-safe presentational component, no data fetching). Layout, all text ≥ `text-base` for the main facts (user asked for less white-space-heavy / bigger type on operational screens):
  - Header row: `#{order.id.slice(0,8)}` bold, status pill (`STATUS_COLOR[order.status]`, label `STATUS_LABEL[order.status]`), amount `formatPaise(Math.round(order.total * 100))` right-aligned.
  - **Pickup** block (`bg-brand-accent-tint` rounded): "Pickup — {order.storeName}" and `order.storeAddress ? order.storeAddress.lines.join(", ") : "Address not on file"`.
  - If `scope === "available"`: show only a muted line "Customer details appear after you accept." (no recipient data exists in the payload).
  - If `scope === "active"`: **Drop-off** block (`bg-brand-primary-tint`): recipient name (bold), phone as `<a href={`tel:${phone}`}>` only when it starts with `+` else plain text, address label + all `address.lines`, and `Note: "…"` when `deliveryNote`. If `order.address` is null show "No delivery address on file".
  - If `scope === "history"`: one muted line `Delivered to {recipientName}` (status `delivered`) or the status label otherwise, plus the relevant timestamp: `deliveredAt` formatted with `toLocaleString()` if present else `placedAt`.
  - Items summary (all scopes): list of `ItemThumb` (size 40) + `{qty}× {name}` (options as muted comma list) — same pattern as `VendorOrderCard`. For `history` show a one-line summary instead: `{totalQty} item(s): name1, name2…` (truncate with `line-clamp-2`).
  - Actions: `scope === "available"` → "Accept" button (`onClaim`); `scope === "active"` → button labelled `Mark picked up` (status `assigned`) / `Mark delivered` (status `picked_up`) calling `onAdvance`. Both `disabled={busy}`.

  Use `Link`-free markup (no navigation). No hardcoded brand colors.

- [ ] **Step 3: Rewrite the dashboard page** `app/delivery/(portal)/dashboard/page.tsx`:
  - Keep: the `authHeader` helper, `isOnline`/`setIsOnline` from `useDeliverySessionContext`, geolocation effect, 15 s ping effect, `toggleOnline`, `claim`, `advance`, the 10 s polling effect, the page title bar, the online toggle bar and lat/lng inputs (unchanged).
  - Replace the two fetches with one: `const res = await fetch("/api/delivery/active", { headers })` → `setAvailable(body.available)`, `setMine(body.mine)`. Types: `useState<OrderDetail[]>([])`.
  - Remove the `addresses` state, `viewAddress`, `NEXT_LABEL` (the full address block replaces the "View address" button).
  - `loadOrders` must tolerate a failed poll: on a non-ok response keep the previous lists and `setError(body?.error ?? "Failed to refresh orders")` (do not silently swallow); clear the error on the next successful load.
  - Render: section "Your active deliveries" (cards with `scope="active"`) first, then "Available orders" (`scope="available"`; when the partner is offline show "Go online to see available orders." instead of "None right now."), laid out in a responsive single column on phones / two columns from `md`. Keep a per-order in-flight guard (`const [busyId, setBusyId] = useState<string | null>(null)`) so double-tapping Accept/Mark doesn't double-fire; pass `busy={busyId === order.id}`.
  - Dashboard shows active only — no delivered/cancelled/rejected anywhere on this page.

- [ ] **Step 4: Verify** — `npx tsc --noEmit`; `npx eslint components/delivery/DeliveryOrderCard.tsx components/delivery/DeliveryShell.tsx "app/delivery/(portal)/dashboard/page.tsx"` (no new errors — in particular no synchronous `setState` in effect bodies; the existing `useEffect(() => { loadOrders(); }, [])` pattern calls an async function and is the accepted shape — if the linter flags it, restructure with a `useCallback` + `void` call inside an async IIFE rather than disabling the rule).
- [ ] **Step 5: Commit**: `feat: delivery dashboard shows active orders with full pickup and drop-off details`

---

### Task 6: Delivery History page

**Files:**
- Create: `app/delivery/(portal)/history/page.tsx`

**Interfaces:**
- Consumes: `DeliveryOrderCard` (Task 5, `scope="history"`), `GET /api/delivery/history`.

- [ ] **Step 1: Implement** a `"use client"` page (same title bar style as the dashboard: `bg-brand-primary-text-safe` bar, `h1` "History"): fetch `/api/delivery/history` once on mount via an async `load()` called from the effect (no polling — history only changes when an order finishes; a "Refresh" button re-calls `load`). States: loading text, error message (`body?.error ?? "Failed to load history"`), empty state "No completed deliveries yet.", list of `DeliveryOrderCard scope="history"` newest first (the API already orders). A note under the heading: "Showing your 50 most recent finished orders." (matches the API default).
- [ ] **Step 2: Verify** — `npx tsc --noEmit`; `npx eslint "app/delivery/(portal)/history/page.tsx"`; `npm run build` (page + route group compile). Page lives under `(portal)` so `DeliveryShell` wraps it and the route-group rule holds.
- [ ] **Step 3: Commit**: `feat: delivery history page for finished orders`

---

### Task 7: Delivery live verification (Playwright)

**Files:** none (verification only; fix defects in the owning files and re-run).

- [ ] **Step 1:** ensure dev servers run (`node scripts/start.mjs --dev --skip-mobile` or the existing instances on :3000+; check `http://localhost:3000`). Use a **dev** server for iteration; the final production-build check is Task 13.
- [ ] **Step 2: Prepare data.** Sign up a fresh delivery partner at `/delivery/login` (signup form; e.g. `partner-b1@foodhub.local` / `demo1234`, vehicle bike) — delivery has no seeded account. As customer (`customer@foodhub.local` / `demo1234`) place two orders from `dosa-corner` (checkout needs the Phone field, e.g. `9876543210`); as `dosa-corner@foodhub.local` walk them to **ready** (Accept → Start preparing → Mark ready).
- [ ] **Step 3: Verify (record evidence for each):**
  1. Delivery login → lands on `/delivery/dashboard`; sidebar shows **Dashboard** and **History**; active link highlighted; on a 390px viewport the menu drawer opens and both links work.
  2. Partner **offline**: "Go online to see available orders." and `/api/delivery/active` (via `browser_evaluate` fetch with the Supabase session token from localStorage) returns `available: []`.
  3. Partner **online**: both ready orders appear under Available with store name, **pickup address or "Address not on file"** (Dosa Corner seed has an address — confirm which), items with thumbnails, amount. **Inspect the raw JSON: `recipientName`, `recipientPhone`, `recipientEmail` are `""`, `address` is `null`, `deliveryNote` is `null` for available orders.**
  4. Accept one → moves to "Your active deliveries" with recipient name, **phone as a `tel:` link**, full drop-off address block, note, items, amount; the old "View address" button is gone; raw JSON shows email `""`.
  5. "Mark picked up" then "Mark delivered" → order leaves the dashboard (active only) and appears on **History** with a status pill, items summary, delivered time; History JSON has `recipientPhone: ""`, `address: null`.
  6. Reject one order as vendor before it is ready, or cancel via DB, to see a rejected/cancelled entry only if the partner had it assigned (skip if not reachable — note it).
  7. Check the DB timestamps: the delivered order has `accepted_at`, `picked_up_at`, `delivered_at` set (re-use the `docker exec … psql` pattern from Task 1, read-only `select`).
  8. Widths 320 and 390: no horizontal scroll on Dashboard and History; buttons tappable; text not clipped.
  9. Console: no errors.
  10. Mobile-compat guard: `GET /api/delivery/orders` and `/api/delivery/available-orders` still return the legacy shape (unchanged diff, Task 4).
- [ ] **Step 4:** fix any defect found (each fix its own commit with the owning files named), re-verify the failing item. Screenshots only under the project root (`.playwright-mcp/`), then delete nothing outside that folder.

---

### Task 8: Admin APIs — orders summary/detail, create vendor, create partner

**Files:**
- Create: `lib/admin-order-view.ts` (pure)
- Create: `tests/admin-order-view.test.mjs`
- Modify: `app/api/admin/orders/route.ts`
- Create: `app/api/admin/orders/[id]/route.ts`
- Create: `app/api/admin/vendors/route.ts`
- Modify: `app/api/admin/delivery-partners/route.ts` (add `POST`, keep `GET` exactly)

**Interfaces:**
- Produces (`lib/admin-order-view.ts`, erasable TS, relative `import type` only):
  - `ADMIN_ORDER_SELECT = "id, status, total, placed_at, recipient_name, stores(name), partner:users!delivery_partner_id(full_name)"`
  - `type AdminOrderRow = { id: string; status: OrderStatus; total: number; placedAt: string; storeName: string; customerName: string; partnerName: string | null }`
  - `normalizeAdminOrderRow(raw: RawAdminOrderRow): AdminOrderRow` (handles object-or-array embeds; `partnerName` null when no partner)
  - `overviewStats(orders: { status: OrderStatus; total: number }[], vendorCount: number): { activeOrders: number; vendors: number; revenuePaise: number }` — active = not terminal (`delivered`/`cancelled`/`rejected`); revenue = Σ `Math.round(total*100)` over orders whose status is **not** `cancelled` or `rejected`.
- Endpoints:
  - `GET /api/admin/orders` → `{ orders: AdminOrderRow[] }` (optional `?status=` filter kept), newest first.
  - `GET /api/admin/orders/[id]` → `{ order: OrderDetail; partnerName: string | null }` (404 `Order not found`).
  - `POST /api/admin/vendors` body `{ email, password, fullName, storeName, lat, lng }` → `{ ok: true }`.
  - `POST /api/admin/delivery-partners` body `{ email, password, fullName, vehicleType? }` → `{ ok: true }`.

- [ ] **Step 1: Failing tests** `tests/admin-order-view.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAdminOrderRow, overviewStats } from "../lib/admin-order-view.ts";

const raw = {
  id: "abcdef12-0000-0000-0000-000000000000",
  status: "assigned",
  total: "280.00",
  placed_at: "2026-09-30T10:00:00Z",
  recipient_name: "Asha",
  stores: { name: "Dosa Corner" },
  partner: { full_name: "Ravi" },
};

test("normalizes object embeds", () => {
  assert.deepEqual(normalizeAdminOrderRow(raw), {
    id: raw.id, status: "assigned", total: 280, placedAt: raw.placed_at,
    storeName: "Dosa Corner", customerName: "Asha", partnerName: "Ravi",
  });
});

test("normalizes array embeds and a missing partner / store", () => {
  const out = normalizeAdminOrderRow({ ...raw, stores: [{ name: "S" }], partner: null });
  assert.equal(out.storeName, "S");
  assert.equal(out.partnerName, null);
  assert.equal(normalizeAdminOrderRow({ ...raw, stores: null, partner: [] }).storeName, "Unknown store");
  assert.equal(normalizeAdminOrderRow({ ...raw, partner: [] }).partnerName, null);
});

test("overview: rejected counts as finished and is excluded from revenue", () => {
  const stats = overviewStats(
    [
      { status: "placed", total: 100.1 },
      { status: "delivered", total: 200.2 },
      { status: "cancelled", total: 50 },
      { status: "rejected", total: 60 },
    ],
    3
  );
  assert.deepEqual(stats, { activeOrders: 1, vendors: 3, revenuePaise: 10010 + 20020 });
});
```

- [ ] **Step 2:** run → FAIL (module missing).
- [ ] **Step 3: Implement `lib/admin-order-view.ts`** exactly per the Interfaces block (`import type { OrderStatus } from "./order-status"`; define a local `first()` like `order-detail.ts`'s; `isTerminal` via a local list `["delivered","cancelled","rejected"]` to keep the module free of runtime imports). Run tests → PASS.
- [ ] **Step 4: Orders list route** — replace the select with `ADMIN_ORDER_SELECT`, keep `resolveAdmin`, keep the `status` filter and ordering, return `{ orders: (data as unknown as RawAdminOrderRow[]).map(normalizeAdminOrderRow) }`. (`customer_id` is no longer returned; the old dashboard page that used it is rewritten in Task 9–10.)
- [ ] **Step 5: Order detail route** `app/api/admin/orders/[id]/route.ts` (signature style: `{ params }: { params: Promise<{ id: string }> }`, `const { id } = await params;` like the reassign route): `resolveAdmin` → query `.from("orders").select(ORDER_DETAIL_SELECT).eq("id", id).maybeSingle()` → 404 `Order not found` if null; fetch partner name with a second query `supabaseServer.from("users").select("full_name").eq("id", detail.deliveryPartnerId).maybeSingle()` when `deliveryPartnerId` is set; return `{ order: normalizeOrderDetail(...), partnerName }`. The admin sees everything (email, phone, address) — no redaction.
- [ ] **Step 6: `POST /api/admin/vendors`** — copy the body of `app/api/auth/vendor-signup/route.ts`, with these differences only: (a) first lines `const resolved = await resolveAdmin(tokenFromRequest(request)); if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });`, (b) request JSON parse wrapped in try/catch returning 400 `Invalid request body`, (c) body field `storeName` instead of `restaurantName` (validate with `validateSignupFields(body, ["email","password","fullName","storeName"])`), (d) `cuisineTags` not accepted (stores get `cuisine_tags: []`), (e) the store insert uses `is_open: true`, (f) `lat`/`lng` same finite-number check, error `Invalid store location`. Keep the three rollback branches (`auth.admin.deleteUser`) exactly as in the signup route. Return `{ ok: true }`.
- [ ] **Step 7: `POST /api/admin/delivery-partners`** — add `export async function POST` to the existing file (keep the `GET` and imports; add `validateSignupFields, isValidVehicleType` import) mirroring `app/api/auth/delivery-signup/route.ts` plus the `resolveAdmin` guard and try/catch JSON parse. Same rollback branches.
- [ ] **Step 8: Verify** — `node --no-warnings --test tests/*.test.mjs`; `npx tsc --noEmit`; `npx eslint` on the touched files; `npm run build`. Rollback path review: read the diff of both POST routes and confirm every failure after `createUser` calls `deleteUser` before responding (no early `return` between createUser and the last insert without it). Live API behaviour is exercised via the UI in Task 12.
- [ ] **Step 9: Commit**: `feat: admin order summary/detail endpoints and create vendor/partner endpoints`

---

### Task 9: Admin shell nav + Overview (KPIs only)

**Files:**
- Modify: `components/admin/AdminShell.tsx`
- Modify: `app/admin/(portal)/dashboard/page.tsx` (becomes Overview)

**Interfaces:**
- Consumes: `overviewStats` (`@/lib/admin-order-view`), `GET /api/admin/orders` (summary rows), `GET /api/admin/restaurants`.

- [ ] **Step 1: `AdminShell.tsx`** — same `Link`/`usePathname` pattern as VendorShell:

```ts
const NAV_LINKS = [
  { href: "/admin/dashboard", label: "Overview" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/vendors", label: "Vendors" },
  { href: "/admin/delivery-partners", label: "Delivery Partners" },
];
```

Active when `pathname === link.href || pathname.startsWith(link.href + "/")` (so `/admin/orders/[id]` highlights Orders). Replace the static "Dashboard" span; nothing else changes.

- [ ] **Step 2: Rewrite the Overview page** to KPIs only: title bar "Overview"; three KPI tiles (Active orders, Vendors, Revenue — reuse the existing tile markup/colors from the old page) computed with `overviewStats(orders, vendors.length)`; revenue shown with `formatPaise(stats.revenuePaise)`. Remove the vendor table, the tabs, and all reassign/suspend code (they move to Tasks 10–11). Load via one async `load()` called from the effect; on failure show the error text (`body.error ?? "Failed to load overview"`), not blank tiles.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`; `npx eslint components/admin/AdminShell.tsx "app/admin/(portal)/dashboard/page.tsx"`.
- [ ] **Step 4: Commit**: `feat: admin sidebar navigation and KPI-only overview`

---

### Task 10: Admin Orders table + order detail page

**Files:**
- Create: `app/admin/(portal)/orders/page.tsx`
- Create: `app/admin/(portal)/orders/[id]/page.tsx`
- Create: `app/admin/(portal)/orders/[id]/loading.tsx`

**Interfaces:**
- Consumes: `AdminOrderRow` (`@/lib/admin-order-view`), `STATUS_COLOR`/`STATUS_LABEL`, `formatPaise`, `OrderDetailView`, `GET /api/admin/orders`, `GET /api/admin/orders/[id]`, `GET /api/admin/delivery-partners`, `POST /api/admin/orders/[id]/reassign`.

- [ ] **Step 1: Orders page** — table (inside `overflow-x-auto`): **Order** (`Link` to `/admin/orders/${id}`, text `#{id.slice(0,8)}`, styled as a link), **Customer** (`customerName`), **Store**, **Status** (colored pill), **Amount** (`formatPaise(Math.round(total*100))`), **Partner** (`partnerName ?? "—"`), **Placed** (`toLocaleString()`). Optional status filter `<select>` (All + the 9 statuses from `ORDER_STATUSES`) that re-fetches with `?status=`. Empty state "No orders yet." Error state shown inline. Table header uses the existing `bg-brand-ink text-white` style. Must be readable at 390px via horizontal scroll inside its own container only (page itself must not scroll horizontally).
- [ ] **Step 2: Detail page** (`"use client"`, `useParams<{ id: string }>()`): load once via async `load()` from the effect, with a "Back to orders" `Link`; render `<OrderDetailView order={order}>` and below it, when status is `assigned` or `picked_up`, the reassign control moved from the old dashboard: a `<select>` of **online** partners (`/api/admin/delivery-partners` rows with `is_online`, label `users?.full_name ?? user_id`) + "Reassign" button calling the existing reassign endpoint; show the endpoint's error text inline; on success re-run `load()`. Show "Delivery partner: {partnerName ?? "Unassigned"}" above the control. Not found → "Order not found." message. No polling needed.
- [ ] **Step 3: `loading.tsx`** — same skeleton as `app/customer/orders/[id]/loading.tsx` (CLAUDE.md rule).
- [ ] **Step 4: Verify** — `npx tsc --noEmit`; `npx eslint` on the three files; `npm run build`.
- [ ] **Step 5: Commit**: `feat: admin orders table and order detail page with reassign`

---

### Task 11: Admin Vendors and Delivery Partners pages with Add forms

**Files:**
- Create: `app/admin/(portal)/vendors/page.tsx`
- Create: `app/admin/(portal)/delivery-partners/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/restaurants` (rows `{ id, name, is_open, is_suspended, created_at }`), `POST /api/admin/restaurants/[id]/suspend|unsuspend`, `POST /api/admin/vendors`, `GET`/`POST /api/admin/delivery-partners`.

- [ ] **Step 1: Vendors page** — list table (**Name**, **Status** pill: Paused if `is_suspended` / Active if `is_open` / Pending otherwise — reuse the old dashboard's `vendorStatus` colors, **Action**: Suspend/Unsuspend button posting to the existing routes then reloading). Above/beside it an "Add vendor" button toggling a form: fields **Store name**, **Owner name**, **Email**, **Temporary password** (type=`text` so the admin can read and hand it over; helper text "Share this with the vendor — they can change it from their profile"), **Latitude**, **Longitude** (defaults `"12.9716"` / `"77.5946"` as in the vendor signup form). Submit → `POST /api/admin/vendors` with `{ email, password, fullName, storeName, lat: Number(lat), lng: Number(lng) }`; disable the button while pending (prevents double submit); on `!res.ok` show `body.error`; on success clear the form, close it, show "Vendor created" and reload the list. Label every input (`<label htmlFor>`).
- [ ] **Step 2: Partners page** — list (**Name**, **Status** Online/Offline pill, **Vehicle**) + the same Add pattern: **Full name**, **Email**, **Temporary password**, **Vehicle** (`<select>` of `bike, scooter, bicycle, car`, default bike) → `POST /api/admin/delivery-partners`.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`; `npx eslint` on both files; `npm run build`.
- [ ] **Step 4: Commit**: `feat: admin vendors and delivery partners pages with add forms`

---

### Task 12: Admin live verification + all-login-surface regression (Playwright)

**Files:** none (verification only; fix defects in the owning files).

- [ ] **Step 1:** Admin login (seeded account per README ~line 89) → lands on `/admin/dashboard`.
- [ ] **Step 2: Verify (record evidence):**
  1. Sidebar: Overview, Orders, Vendors, Delivery Partners; active highlight correct (including on `/admin/orders/[id]` → Orders); 390px drawer works.
  2. **Overview** shows only KPI tiles (no tables/tabs); Active orders / Vendors / Revenue match the Orders data (rejected/cancelled excluded from revenue; compare against `/admin/orders`).
  3. **Orders** table columns correct; unassigned shows "—"; status pills colored; status filter works; order number is a link to `/admin/orders/<id>`.
  4. **Order detail** renders the same full view as the customer's (items with photos, recipient name/email/phone, address, totals, readable payment label, store pickup address, timestamps for stages reached, none for stages not reached — "Invalid Date" must not appear); `loading.tsx` skeleton visible on slow navigation; for an `assigned`/`picked_up` order the reassign control lists online partners and reassigning works (use a second fresh partner from Task 7 if needed).
  5. **Add vendor**: create e.g. `Admin Test Bistro` / `admin-test-bistro@foodhub.local` / temp password → appears in Vendors as **Active**; log in at `/vendor/login` with that email/password → vendor portal works. **Duplicate email** attempt → form shows the error, no new store row appears (list count unchanged) and no orphan auth user (retry with the same email still errors "already registered", not a profile/FK error).
  6. **Add partner**: create `partner-admin-b@foodhub.local` → listed Offline; log in at `/delivery/login` → delivery portal works.
  7. Validation: empty/over-200-char fields and a non-numeric lat are rejected with a message, not a 500.
  8. 320 and 390px: no horizontal page scroll on all four admin screens + detail page; forms usable.
  9. Console: no errors.
- [ ] **Step 3: Regression across ALL web login surfaces** (route-group + RLS rule): log in fresh (cleared storage) as customer, vendor, delivery and admin in turn; each lands on its own dashboard with no hang; sign out and log in as a different role in the same tab — no stale role/session data. Customer order detail + list still render (store-address embed returns null/value without error).
- [ ] **Step 4:** fix defects (own commits), re-verify.

---

### Task 13: Docs, production-build check, final review

**Files:**
- Modify: `MEMORY.md`, `CLAUDE.md`, `README.md` (and `AGENTS.md` only if it needs a change — check it) — per the standing "Update CLAUDE files" rule, check each even if unchanged.

- [ ] **Step 1:** Final automated gate: `npx tsc --noEmit`; `cd mobile && npx tsc --noEmit` (shared code unchanged, but confirm); `node --no-warnings --test tests/*.test.mjs`; `npm run build`; `npx eslint` on every file this branch touched (no new errors vs `main`).
- [ ] **Step 2:** Add a `MEMORY.md` entry "Order visibility — sub-project B" (what shipped, the timestamp trigger decision and why a trigger, the new delivery endpoints and that legacy delivery endpoints remain for mobile until D, redaction rules, defects found/fixed, what mobile D must do: switch to `/api/delivery/active` + `/api/delivery/history`, delete the legacy two, mirror redaction expectations). Update `CLAUDE.md` project-status paragraph (one short paragraph) and add a project rule only if a real lesson emerged. Update `README.md` route list / portal descriptions for the new Delivery History and Admin screens; note the two new tables-free API routes. Remind in MEMORY.md that migration 27 exists (`npx supabase migration up`, never `db reset`).
- [ ] **Step 3:** Final whole-branch review against the **spec** (not just this plan) — dispatch a fresh reviewer over `git diff main...order-visibility-b`, explicitly checking: every Delivery/Admin bullet in the spec; privacy redaction; rollback paths; route-group placement; `loading.tsx`; lint on touched files; no lettered task headings; mobile endpoints untouched. Fix findings in their own commits.
- [ ] **Step 4:** Merge to local `main` after Vishal's go-ahead (fast-forward), delete nothing without asking. Do **not** push without the standing "Commit Work" phrase / Vishal's OK; if a push is requested and denied, report it, don't route around.
