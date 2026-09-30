# Order Visibility — Sub-project A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the shared order-detail foundation, the 6-step customer timeline, full customer order list/detail, and a redesigned, fuller vendor orders board (web).

**Architecture:** One client-safe module (`lib/order-status.ts`) owns status type/labels/timeline mapping. One client-safe module (`lib/order-detail.ts`) owns the PostgREST select strings, the normalized `OrderDetail` type and `normalizeOrderDetail`. A shared `OrderDetailView` component renders a normalized order; customer pages query Supabase directly under RLS, the vendor API route queries with the service role behind `resolveVendorStore` and returns the same normalized shape. Sub-projects B (delivery/admin), C (n8n email), D (mobile + manuals) reuse these modules.

**Tech Stack:** Next.js 16 (App Router, TS) + Tailwind v4, Supabase (PostgREST embeds), `node --test` (Node 24 type stripping — no new packages) for pure-logic tests, Playwright MCP for live verification.

**Spec:** [docs/superpowers/specs/2026-09-30-order-visibility-and-admin-management-design.md](../specs/2026-09-30-order-visibility-and-admin-management-design.md) (sections: Shared foundation, Customer, Vendor).

## Global Constraints

- 2-space indent, ES modules, `async/await` (no `.then()` chains), comments only for non-obvious WHY.
- No new npm packages (global rule: installs need approval). Tests run with `node --test` on `.mjs` files importing `.ts` modules directly; therefore `lib/order-status.ts`, `lib/order-detail.ts`, `lib/image-url.ts` must use only erasable TS syntax (no enums, no parameter properties) and only `import type` from other project files using relative paths (no `@/` alias, no runtime imports from other project files).
- One schema change only: `orders.recipient_phone text not null` (Task 2A, migration 26). No new RLS policy (CLAUDE.md forbids unused RLS write policies); the existing customer/vendor/delivery read policies on `orders` already cover the new column.
- Phone rules (decided with the user): required at checkout; Indian 10-digit mobile (optional `+91`/`91`/`0` prefix, starts 6-9), stored normalized as `+91XXXXXXXXXX`; existing orders are backfilled with the literal placeholder `Not provided` (column NOT NULL, no DB CHECK). The UI must treat any value not starting with `+` as plain text (no `tel:` link). Checkout fields are never prefilled (CLAUDE.md: name/email/address must not persist across sessions).
- Mobile checkout gets the phone field in THIS sub-project (not D): otherwise the app's checkout would 400 once the API requires a phone. Mobile is type-checked only (`cd mobile && npx tsc --noEmit`); no device/simulator run exists, and the final report must say so.
- Money: integer paise arithmetic for any computed amount; DB numeric values (`unit_price`, `subtotal`, `delivery_fee`, `total`) are rupees as returned by PostgREST.
- Branding only via existing tokens (`brand-primary`, `brand-accent`, `brand-bg`, `brand-surface`, `brand-ink`, `brand-ink-muted`, `*-tint`, `*-text-safe`); no hardcoded brand colors.
- Every `"use client"` dynamic `[id]` page needs a sibling `loading.tsx` (already exists for `app/customer/orders/[id]`).
- Service-role client (`supabaseServer`) only in server files; `lib/order-detail.ts` must NOT import it.
- Tables are `stores`/`products` (renamed in migration 20), not restaurants/menu_items.
- Image URLs are rendered with `next/image` only if `isAllowedImageUrl()` passes (host `images.pexels.com`).
- Done = `npx tsc --noEmit` clean, `node --test tests/` green, `npm run build` passes, live Playwright pass on customer + vendor portals. Commit via `/commit` (named files only, never `git add -A`). Announce multi-file edits before making them (global rule).

## Review Focus

1. Order with no delivery address (`delivery_address_id` null / address embed null) → shows "No delivery address on file", no crash. Pinned in Task 2 test.
2. Product with `image_url` null or a non-allowlisted host → placeholder block, not a `next/image` runtime throw. Pinned in Task 2 test (`isAllowedImageUrl`) and Task 4 (`ItemThumb` guard).
3. Order item whose product was deleted (`products` null) → falls back to "Item", no crash. Pinned in Task 2 test.
4. Blank/whitespace `special_instructions` / `delivery_note` → not rendered as an empty quote. Pinned in Task 2 test.
5. Displayed line totals: `unit_price` already includes option price deltas (checkout route computes `(basePaise + deltaPaise) / 100`), so `unit_price × qty` is the true line total; still display DB `subtotal`/`delivery_fee`/`total`, never recompute them. Checked live in Task 9.
7. Phone: `"98765 43210"`, `"+91 98765-43210"`, `"09876543210"` all normalize to `+919876543210`; `"12345"`, `"5876543210"` (starts with 5), 11 digits, letters, blank are rejected. Backfilled `Not provided` renders as plain text, never a broken `tel:` link. Pinned in Task 2A tests; web and mobile validators are kept byte-identical by a sync test.
6. Failed-payment order on customer detail keeps its "payment failed" message; cancelled/rejected keep the red banner and no timeline. Checked live in Task 9.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/order-status.ts` | Create | `OrderStatus` type, terminal check, labels, customer messages, 6-step timeline mapping |
| `lib/order-detail.ts` | Create | Select strings, raw/normalized types, `normalizeOrderDetail`, `normalizeOrderListRow`, `formatPaise`, `lineTotalPaise` |
| `supabase/migrations/00000000000026_recipient_phone.sql` | Create | `orders.recipient_phone` column + backfill + `checkout_place_order` with `p_recipient_phone` |
| `lib/phone.ts` | Create | `normalizeIndianMobile`, `validateRecipientPhone` (web/server) |
| `mobile/lib/phone.ts` | Create | Byte-identical copy for the Expo app (sync-tested) |
| `tests/phone.test.mjs` | Create | Phone validation + web/mobile sync test |
| `app/api/cart/checkout/route.ts` | Modify (Task 2A) | Validate + pass `recipientPhone` |
| `app/customer/checkout/page.tsx` | Modify (Task 2A) | Phone input, validation, request body |
| `mobile/src/app/customer/checkout.tsx` | Modify (Task 2A) | Phone input, validation, request body |
| `tests/order-status.test.mjs` | Create | Timeline/status logic tests |
| `tests/order-detail.test.mjs` | Create | Normalization + money + image-host tests |
| `components/OrderStatusTimeline.tsx` | Modify | 6 steps, uses `lib/order-status.ts` |
| `components/ItemThumb.tsx` | Create | Guarded product thumbnail |
| `components/OrderDetailView.tsx` | Create | Full order body (recipient, address, items, totals, payment) |
| `app/customer/orders/[id]/page.tsx` | Modify | One detail query, renders `OrderDetailView` |
| `app/customer/orders/page.tsx` | Modify | Rich list cards with thumbnails |
| `app/api/vendor/orders/route.ts` | Modify | Returns normalized `OrderDetail[]` |
| `components/vendor/VendorOrderCard.tsx` | Create | Board card (big type, colors, items with photos) |
| `components/vendor/VendorOrderModal.tsx` | Create | Full-detail dialog |
| `app/vendor/(portal)/orders/page.tsx` | Modify | Board layout, 10s polling, modal wiring |

Mobile `mobile/lib/order-status.ts` is intentionally NOT touched here (sub-project D).

---

### Task 1: Status module + branch setup

**Files:**
- Create: `lib/order-status.ts`
- Test: `tests/order-status.test.mjs`

**Interfaces:**
- Produces: `type OrderStatus`; `ORDER_STATUSES: readonly OrderStatus[]`; `isTerminalStatus(status: OrderStatus): boolean`; `STATUS_LABEL: Record<OrderStatus,string>` (short pill text); `STATUS_MESSAGE: Record<OrderStatus,string>` (customer sentence); `TIMELINE_STEPS` (6 labels); `type TimelineStatus`; `TIMELINE_STEP_INDEX: Record<TimelineStatus, number>`.

- [ ] **Step 1: Create the branch**

Run: `git switch -c order-visibility-a`
Note for executor: CLAUDE.md prefers a worktree per phase, but a fresh worktree has no `node_modules` and `npm ci` needs the user's approval. Ask the user once which they want; default to this branch in the main checkout.

- [ ] **Step 2: Write the failing test**

Create `tests/order-status.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  ORDER_STATUSES,
  TERMINAL_STATUSES,
  STATUS_LABEL,
  STATUS_MESSAGE,
  TIMELINE_STEPS,
  TIMELINE_STEP_INDEX,
  isTerminalStatus,
} from "../lib/order-status.ts";

test("timeline has the 6 agreed steps in order", () => {
  assert.deepEqual([...TIMELINE_STEPS], [
    "Placed",
    "Accepted",
    "Preparing",
    "Ready",
    "On the way",
    "Delivered",
  ]);
});

test("accepted is its own step, after placed", () => {
  assert.equal(TIMELINE_STEP_INDEX.placed, 0);
  assert.equal(TIMELINE_STEP_INDEX.accepted, 1);
});

test("every non-cancelled/rejected status maps to a valid step", () => {
  for (const status of ORDER_STATUSES) {
    if (status === "cancelled" || status === "rejected") {
      assert.equal(TIMELINE_STEP_INDEX[status], undefined);
      continue;
    }
    const index = TIMELINE_STEP_INDEX[status];
    assert.ok(Number.isInteger(index) && index >= 0 && index < TIMELINE_STEPS.length, status);
  }
});

test("happy-path chain never moves backwards on the timeline", () => {
  const chain = ["placed", "accepted", "preparing", "ready", "assigned", "picked_up", "delivered"];
  const indices = chain.map((s) => TIMELINE_STEP_INDEX[s]);
  for (let i = 1; i < indices.length; i += 1) {
    assert.ok(indices[i] >= indices[i - 1], `${chain[i]} went backwards`);
  }
  assert.equal(TIMELINE_STEP_INDEX.assigned, 4);
  assert.equal(TIMELINE_STEP_INDEX.picked_up, 4);
  assert.equal(TIMELINE_STEP_INDEX.delivered, 5);
});

test("terminal statuses", () => {
  assert.deepEqual([...TERMINAL_STATUSES].sort(), ["cancelled", "delivered", "rejected"]);
  assert.equal(isTerminalStatus("delivered"), true);
  assert.equal(isTerminalStatus("preparing"), false);
});

test("labels and messages exist for every status", () => {
  for (const status of ORDER_STATUSES) {
    assert.ok(STATUS_LABEL[status], `label ${status}`);
    assert.ok(STATUS_MESSAGE[status], `message ${status}`);
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test tests/order-status.test.mjs`
Expected: FAIL (cannot find module `../lib/order-status.ts`).

- [ ] **Step 4: Write the implementation**

Create `lib/order-status.ts`:

```ts
export type OrderStatus =
  | "placed"
  | "accepted"
  | "preparing"
  | "ready"
  | "assigned"
  | "picked_up"
  | "delivered"
  | "cancelled"
  | "rejected";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "placed",
  "accepted",
  "preparing",
  "ready",
  "assigned",
  "picked_up",
  "delivered",
  "cancelled",
  "rejected",
];

export const TERMINAL_STATUSES: readonly OrderStatus[] = ["delivered", "cancelled", "rejected"];

export function isTerminalStatus(status: OrderStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: "Placed",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  assigned: "Out for delivery",
  picked_up: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const STATUS_MESSAGE: Record<OrderStatus, string> = {
  placed: "Order placed — waiting for restaurant",
  accepted: "Restaurant accepted your order",
  preparing: "Restaurant is preparing your order",
  ready: "Order ready for pickup",
  assigned: "Delivery partner assigned",
  picked_up: "Order picked up — on the way",
  delivered: "Delivered",
  cancelled: "Order cancelled",
  rejected: "Restaurant rejected your order — payment refunded",
};

export const TIMELINE_STEPS = [
  "Placed",
  "Accepted",
  "Preparing",
  "Ready",
  "On the way",
  "Delivered",
] as const;

export type TimelineStatus = Exclude<OrderStatus, "cancelled" | "rejected">;

// Typed over the narrowed union so the compiler rejects any future status
// that isn't explicitly mapped (cancelled/rejected are handled as banners).
export const TIMELINE_STEP_INDEX: Record<TimelineStatus, number> = {
  placed: 0,
  accepted: 1,
  preparing: 2,
  ready: 3,
  assigned: 4,
  picked_up: 4,
  delivered: 5,
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/order-status.test.mjs` then `npx tsc --noEmit`
Expected: all tests PASS; tsc clean.

- [ ] **Step 6: Commit**

Run `/commit` staging only `lib/order-status.ts` and `tests/order-status.test.mjs`. Message: `feat: add shared order-status module with 6-step timeline mapping`.

---

### Task 2: Order-detail module

**Files:**
- Create: `lib/order-detail.ts`
- Test: `tests/order-detail.test.mjs`

**Interfaces:**
- Consumes: `OrderStatus` (type only, from `./order-status`).
- Produces:
  - `ORDER_DETAIL_SELECT: string`, `ORDER_LIST_SELECT: string`
  - `type OrderDetail`, `type OrderDetailItem`, `type OrderListRow`, `type RawOrderDetail`, `type RawOrderListRow`
  - `normalizeOrderDetail(raw: RawOrderDetail): OrderDetail`
  - `normalizeOrderListRow(raw: RawOrderListRow): OrderListRow`
  - `formatPaise(paise: number): string` → `"₹123.45"`
  - `lineTotalPaise(unitPrice: number, quantity: number): number`
  - `cleanText(value: string | null | undefined): string | null` (trim; blank → null)

- [ ] **Step 1: Write the failing test**

Create `tests/order-detail.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  ORDER_DETAIL_SELECT,
  cleanText,
  formatPaise,
  lineTotalPaise,
  normalizeOrderDetail,
  normalizeOrderListRow,
} from "../lib/order-detail.ts";
import { isAllowedImageUrl } from "../lib/image-url.ts";

const baseRaw = {
  id: "abcdef12-0000-0000-0000-000000000000",
  status: "placed",
  subtotal: 250,
  delivery_fee: 30,
  total: 280,
  placed_at: "2026-09-30T10:00:00Z",
  delivery_note: "  ring bell  ",
  recipient_name: "Asha",
  recipient_email: "asha@example.com",
  recipient_phone: "+919876543210",
  delivery_partner_id: null,
  stores: { name: "Spice Hub" },
  address: {
    label: "Home",
    line1: "12 MG Road",
    line2: null,
    city: "Pune",
    state: "MH",
    pincode: "411001",
  },
  payments: [{ status: "success", method: "mock_card" }],
  order_items: [
    {
      id: "i1",
      quantity: 2,
      unit_price: 125.5,
      special_instructions: "   ",
      products: { name: "Paneer Tikka", image_url: "https://images.pexels.com/photos/1.jpeg" },
      order_item_options: [{ id: "o1", group_name: "Spice", option_name: "Hot" }],
    },
  ],
};

test("select string embeds the relations the UI needs", () => {
  for (const part of ["stores(name)", "addresses!delivery_address_id", "payments(", "order_items(", "order_item_options("]) {
    assert.ok(ORDER_DETAIL_SELECT.includes(part), part);
  }
});

test("normalizes a full order", () => {
  const order = normalizeOrderDetail(baseRaw);
  assert.equal(order.storeName, "Spice Hub");
  assert.equal(order.recipientName, "Asha");
  assert.equal(order.recipientPhone, "+919876543210");
  assert.equal(normalizeOrderDetail({ ...baseRaw, recipient_phone: "" }).recipientPhone, "Not provided");
  assert.equal(order.total, 280);
  assert.equal(order.deliveryNote, "ring bell");
  assert.deepEqual(order.address?.lines, ["12 MG Road", "Pune, MH 411001"]);
  assert.equal(order.address?.label, "Home");
  assert.deepEqual(order.payment, { status: "success", method: "mock_card" });
  assert.equal(order.items[0].name, "Paneer Tikka");
  assert.equal(order.items[0].imageUrl, "https://images.pexels.com/photos/1.jpeg");
  assert.deepEqual(order.items[0].options, [{ id: "o1", groupName: "Spice", optionName: "Hot" }]);
});

test("missing address -> null (Review Focus 1)", () => {
  assert.equal(normalizeOrderDetail({ ...baseRaw, address: null }).address, null);
});

test("deleted product -> fallback name, null image (Review Focus 3)", () => {
  const raw = {
    ...baseRaw,
    order_items: [{ ...baseRaw.order_items[0], products: null }],
  };
  const item = normalizeOrderDetail(raw).items[0];
  assert.equal(item.name, "Item");
  assert.equal(item.imageUrl, null);
});

test("blank instructions and note -> null (Review Focus 4)", () => {
  const order = normalizeOrderDetail({ ...baseRaw, delivery_note: "   " });
  assert.equal(order.deliveryNote, null);
  assert.equal(order.items[0].specialInstructions, null);
  assert.equal(cleanText(undefined), null);
  assert.equal(cleanText(" x "), "x");
});

test("accepts object or array forms for embeds and no payment", () => {
  const asObjects = normalizeOrderDetail({
    ...baseRaw,
    stores: [{ name: "Spice Hub" }],
    payments: { status: "pending", method: "mock_upi" },
  });
  assert.equal(asObjects.storeName, "Spice Hub");
  assert.equal(asObjects.payment?.status, "pending");
  assert.equal(normalizeOrderDetail({ ...baseRaw, payments: [] }).payment, null);
});

test("address with only line1 has no stray separators", () => {
  const order = normalizeOrderDetail({
    ...baseRaw,
    address: { label: null, line1: "5 Lane", line2: null, city: null, state: null, pincode: null },
  });
  assert.deepEqual(order.address?.lines, ["5 Lane"]);
});

test("money helpers use integer paise", () => {
  assert.equal(lineTotalPaise(125.5, 2), 25100);
  assert.equal(lineTotalPaise(0.1, 3), 30);
  assert.equal(formatPaise(28000), "₹280.00");
  assert.equal(formatPaise(25100), "₹251.00");
});

test("list row normalization", () => {
  const row = normalizeOrderListRow({
    id: "x1",
    status: "delivered",
    total: 99,
    placed_at: "2026-09-30T10:00:00Z",
    stores: { name: "Spice Hub" },
    order_items: [
      { id: "a", quantity: 1, products: { name: "Dosa", image_url: null } },
      { id: "b", quantity: 3, products: null },
    ],
  });
  assert.equal(row.storeName, "Spice Hub");
  assert.equal(row.itemCount, 4);
  assert.equal(row.items[1].name, "Item");
});

test("image host guard rejects unknown hosts and http (Review Focus 2)", () => {
  assert.equal(isAllowedImageUrl("https://images.pexels.com/photos/1.jpeg"), true);
  assert.equal(isAllowedImageUrl("https://evil.example.com/a.jpg"), false);
  assert.equal(isAllowedImageUrl("http://images.pexels.com/a.jpg"), false);
  assert.equal(isAllowedImageUrl("not a url"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/order-detail.test.mjs`
Expected: FAIL (cannot find module `../lib/order-detail.ts`).

- [ ] **Step 3: Write the implementation**

Create `lib/order-detail.ts`:

```ts
import type { OrderStatus } from "./order-status";

// `addresses!delivery_address_id` pins the embed to the orders->addresses FK.
export const ORDER_DETAIL_SELECT =
  "id, status, subtotal, delivery_fee, total, placed_at, delivery_note, recipient_name, recipient_email, recipient_phone, delivery_partner_id, " +
  "stores(name), " +
  "address:addresses!delivery_address_id(label, line1, line2, city, state, pincode), " +
  "payments(status, method), " +
  "order_items(id, quantity, unit_price, special_instructions, products(name, image_url), order_item_options(id, group_name, option_name))";

export const ORDER_LIST_SELECT =
  "id, status, total, placed_at, stores(name), order_items(id, quantity, products(name, image_url))";

type OneOrMany<T> = T | T[] | null;

type RawAddress = {
  label: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
};

export type RawOrderDetail = {
  id: string;
  status: OrderStatus;
  subtotal: number | string;
  delivery_fee: number | string;
  total: number | string;
  placed_at: string;
  delivery_note: string | null;
  recipient_name: string;
  recipient_email: string;
  recipient_phone: string;
  delivery_partner_id: string | null;
  stores: OneOrMany<{ name: string }>;
  address: OneOrMany<RawAddress>;
  payments: OneOrMany<{ status: string; method: string }>;
  order_items: {
    id: string;
    quantity: number;
    unit_price: number | string;
    special_instructions: string | null;
    products: OneOrMany<{ name: string; image_url: string | null }>;
    order_item_options: { id: string; group_name: string; option_name: string }[];
  }[];
};

export type RawOrderListRow = {
  id: string;
  status: OrderStatus;
  total: number | string;
  placed_at: string;
  stores: OneOrMany<{ name: string }>;
  order_items: {
    id: string;
    quantity: number;
    products: OneOrMany<{ name: string; image_url: string | null }>;
  }[];
};

export type OrderDetailItem = {
  id: string;
  quantity: number;
  unitPrice: number;
  specialInstructions: string | null;
  name: string;
  imageUrl: string | null;
  options: { id: string; groupName: string; optionName: string }[];
};

export type OrderDetail = {
  id: string;
  status: OrderStatus;
  placedAt: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryNote: string | null;
  recipientName: string;
  recipientEmail: string;
  recipientPhone: string;
  storeName: string;
  deliveryPartnerId: string | null;
  address: { label: string | null; lines: string[] } | null;
  payment: { status: string; method: string } | null;
  items: OrderDetailItem[];
};

export type OrderListRow = {
  id: string;
  status: OrderStatus;
  total: number;
  placedAt: string;
  storeName: string;
  itemCount: number;
  items: { id: string; name: string; imageUrl: string | null }[];
};

function first<T>(value: OneOrMany<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function lineTotalPaise(unitPrice: number, quantity: number): number {
  return Math.round(unitPrice * 100) * quantity;
}

export function formatPaise(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function formatAddress(raw: RawAddress): { label: string | null; lines: string[] } | null {
  const cityLine = [
    [cleanText(raw.city), cleanText(raw.state)].filter(Boolean).join(", "),
    cleanText(raw.pincode),
  ]
    .filter(Boolean)
    .join(" ");
  const lines = [cleanText(raw.line1), cleanText(raw.line2), cityLine || null].filter(
    (line): line is string => Boolean(line)
  );
  if (lines.length === 0) return null;
  return { label: cleanText(raw.label), lines };
}

export function normalizeOrderDetail(raw: RawOrderDetail): OrderDetail {
  const address = first(raw.address);
  const payment = first(raw.payments);
  return {
    id: raw.id,
    status: raw.status,
    placedAt: raw.placed_at,
    subtotal: Number(raw.subtotal),
    deliveryFee: Number(raw.delivery_fee),
    total: Number(raw.total),
    deliveryNote: cleanText(raw.delivery_note),
    recipientName: raw.recipient_name,
    recipientEmail: raw.recipient_email,
    recipientPhone: cleanText(raw.recipient_phone) ?? "Not provided",
    storeName: first(raw.stores)?.name ?? "Unknown store",
    deliveryPartnerId: raw.delivery_partner_id,
    address: address ? formatAddress(address) : null,
    payment: payment ? { status: payment.status, method: payment.method } : null,
    items: raw.order_items.map((item) => {
      const product = first(item.products);
      return {
        id: item.id,
        quantity: item.quantity,
        unitPrice: Number(item.unit_price),
        specialInstructions: cleanText(item.special_instructions),
        name: product?.name ?? "Item",
        imageUrl: product?.image_url ?? null,
        options: item.order_item_options.map((option) => ({
          id: option.id,
          groupName: option.group_name,
          optionName: option.option_name,
        })),
      };
    }),
  };
}

export function normalizeOrderListRow(raw: RawOrderListRow): OrderListRow {
  return {
    id: raw.id,
    status: raw.status,
    total: Number(raw.total),
    placedAt: raw.placed_at,
    storeName: first(raw.stores)?.name ?? "Unknown store",
    itemCount: raw.order_items.reduce((sum, item) => sum + item.quantity, 0),
    items: raw.order_items.map((item) => {
      const product = first(item.products);
      return { id: item.id, name: product?.name ?? "Item", imageUrl: product?.image_url ?? null };
    }),
  };
}
```

- [ ] **Step 4: Run tests and type-check**

Run: `node --test tests/` then `npx tsc --noEmit`
Expected: all PASS; tsc clean.

- [ ] **Step 5: Commit**

`/commit` staging `lib/order-detail.ts`, `tests/order-detail.test.mjs`. Message: `feat: add normalized order-detail module shared by portals`. (The live DB check of this select happens at the end of Task 2A, once `recipient_phone` exists in the database.)

---

### Task 2A: Customer phone number (DB + API + web checkout + mobile checkout)

**Files:**
- Create: `supabase/migrations/00000000000026_recipient_phone.sql`
- Create: `lib/phone.ts`, `mobile/lib/phone.ts` (byte-identical)
- Test: `tests/phone.test.mjs`
- Modify: `app/api/cart/checkout/route.ts`, `app/customer/checkout/page.tsx`, `mobile/src/app/customer/checkout.tsx`

**Interfaces:**
- Produces: `normalizeIndianMobile(input: string): string | null` (returns `+91XXXXXXXXXX` or null); `validateRecipientPhone(input: string): string | null` (error text or null); RPC param `p_recipient_phone text`; request body field `recipientPhone: string` on `POST /api/cart/checkout`; column `orders.recipient_phone text not null`.

- [ ] **Step 1: Write the failing test**

Create `tests/phone.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeIndianMobile, validateRecipientPhone } from "../lib/phone.ts";

test("valid formats normalize to +91XXXXXXXXXX", () => {
  for (const input of ["9876543210", "98765 43210", "+91 98765-43210", "09876543210", "919876543210", "(98765) 43210"]) {
    assert.equal(normalizeIndianMobile(input), "+919876543210", input);
    assert.equal(validateRecipientPhone(input), null, input);
  }
});

test("invalid numbers are rejected", () => {
  for (const input of ["", "   ", "12345", "5876543210", "98765432101", "abcdefghij", "+1 9876543210", "98765 4321"]) {
    assert.equal(normalizeIndianMobile(input), null, input);
    assert.match(validateRecipientPhone(input) ?? "", /valid 10-digit Indian mobile/, input);
  }
});

test("web and mobile validators are byte-identical", () => {
  const web = readFileSync(new URL("../lib/phone.ts", import.meta.url), "utf8");
  const mobile = readFileSync(new URL("../mobile/lib/phone.ts", import.meta.url), "utf8");
  assert.equal(mobile, web);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/phone.test.mjs`
Expected: FAIL (cannot find `../lib/phone.ts`).

- [ ] **Step 3: Implement the validator (web copy, then identical mobile copy)**

Create `lib/phone.ts`:

```ts
// Indian mobile: optional +91 / 91 / 0 prefix, then 10 digits starting 6-9.
// Keep mobile/lib/phone.ts byte-identical (tests/phone.test.mjs enforces it).
export function normalizeIndianMobile(input: string): string | null {
  const compact = input.replace(/[\s\-().]/g, "");
  const match = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(compact);
  return match ? `+91${match[1]}` : null;
}

export function validateRecipientPhone(input: string): string | null {
  return normalizeIndianMobile(input) ? null : "Enter a valid 10-digit Indian mobile number";
}
```

Copy it exactly: `cp lib/phone.ts mobile/lib/phone.ts`.

- [ ] **Step 4: Run tests**

Run: `node --test tests/`
Expected: all PASS.

- [ ] **Step 5: Write the migration**

Create `supabase/migrations/00000000000026_recipient_phone.sql`:

```sql
-- Customer phone number captured at checkout so vendors, delivery partners,
-- admins and n8n can reach the recipient. Existing orders get the literal
-- placeholder 'Not provided' (same precedent as migration 23's recipient
-- backfill) so the column can be NOT NULL; the UI treats any value that
-- doesn't start with '+' as plain text.
alter table public.orders add column recipient_phone text;
update public.orders set recipient_phone = 'Not provided' where recipient_phone is null;
alter table public.orders alter column recipient_phone set not null;

-- Appending a parameter changes the function's identity, so the old
-- signature must be dropped (create or replace would leave an ambiguous
-- overload and break the revoke/grant below).
drop function if exists public.checkout_place_order(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, uuid,
  numeric, numeric, numeric, jsonb, text, numeric, text, text
);

create or replace function public.checkout_place_order(
  p_customer_id uuid,
  p_recipient_name text,
  p_recipient_email text,
  p_recipient_phone text,
  p_address_label text,
  p_address_line1 text,
  p_address_line2 text,
  p_address_city text,
  p_address_state text,
  p_address_pincode text,
  p_address_lat numeric,
  p_address_lng numeric,
  p_store_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_total numeric,
  p_items jsonb,
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
  insert into public.addresses (user_id, label, line1, line2, city, state, pincode, lat, lng, is_default)
    values (
      p_customer_id,
      p_address_label,
      p_address_line1,
      p_address_line2,
      p_address_city,
      p_address_state,
      p_address_pincode,
      p_address_lat,
      p_address_lng,
      false
    )
    returning id into v_address_id;

  insert into public.orders (customer_id, recipient_name, recipient_email, recipient_phone, store_id, delivery_address_id, status, subtotal, delivery_fee, total, delivery_note)
    values (p_customer_id, p_recipient_name, p_recipient_email, p_recipient_phone, p_store_id, v_address_id, 'placed', p_subtotal, p_delivery_fee, p_total, p_delivery_note)
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

Executor check before applying: confirm migration 24's body is still the latest definition (`grep -ln checkout_place_order supabase/migrations/*` shows 24 is the last) and that the body above matches it line for line apart from the phone additions.

Apply: `npx supabase db reset` (local stack only; this also re-runs seed). Then verify with psql: `select column_name, is_nullable from information_schema.columns where table_name='orders' and column_name='recipient_phone';` → `NO`; and `select proname, pronargs from pg_proc where proname='checkout_place_order';` → exactly one row, `pronargs = 21`.

- [ ] **Step 6: Checkout API route**

In `app/api/cart/checkout/route.ts`: add `import { validateRecipientPhone, normalizeIndianMobile } from "@/lib/phone";`; add `recipientPhone` to the destructured body and its type (`recipientPhone: string;`); after the email validation block (after the `if (emailError) {...}`), add:

```ts
  const phoneError = validateRecipientPhone(typeof recipientPhone === "string" ? recipientPhone : "");
  if (phoneError) {
    return NextResponse.json({ error: phoneError }, { status: 400 });
  }
  const normalizedRecipientPhone = normalizeIndianMobile(recipientPhone) as string;
```

and in the `rpc("checkout_place_order", {...})` args add, right after `p_recipient_email`:

```ts
    p_recipient_phone: normalizedRecipientPhone,
```

- [ ] **Step 7: Web checkout page**

In `app/customer/checkout/page.tsx`: import `validateRecipientPhone` from `@/lib/phone`; add `const [recipientPhone, setRecipientPhone] = useState("");` beside the email state; add `const recipientPhoneError = validateRecipientPhone(recipientPhone);` beside `recipientEmailError`; add `!recipientPhoneError &&` to `canPlaceOrder`; add `recipientPhone: recipientPhone.trim(),` to the JSON body after `recipientEmail`; add `recipientPhone,` to the `setCheckoutHandler` effect dependency list; and add this block inside the "Contact details" section right after the Email `<div>`:

```tsx
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-ink">Phone</label>
              <input
                type="tel"
                inputMode="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                className={`w-full rounded border px-3 py-2 text-sm ${
                  recipientPhone
                    ? "border-brand-ink-muted/15"
                    : "border-brand-primary/30 bg-brand-primary-tint"
                }`}
                placeholder="10-digit mobile number"
              />
              {recipientPhone && recipientPhoneError && (
                <p className="mt-1 text-xs text-red-600">{recipientPhoneError}</p>
              )}
            </div>
```

- [ ] **Step 8: Mobile checkout screen**

In `mobile/src/app/customer/checkout.tsx`: add `import { validateRecipientPhone } from "../../../lib/phone";`; add `const [recipientPhone, setRecipientPhone] = useState("");` beside the email state (state hooks must stay above the early returns, like the others); add `const recipientPhoneError = validateRecipientPhone(recipientPhone);` beside `recipientEmailError`; add `!recipientPhoneError &&` to `canPlaceOrder`; add `recipientPhone: recipientPhone.trim(),` to the request body after `recipientEmail`; and after the Email `<TextInput .../>` inside "Contact details" add:

```tsx
          <Text style={styles.label}>Phone</Text>
          <TextInput
            style={styles.input}
            value={recipientPhone}
            onChangeText={setRecipientPhone}
            keyboardType="phone-pad"
            placeholder="10-digit mobile number"
          />
          {recipientPhone.length > 0 && recipientPhoneError && (
            <Text style={styles.errorText}>{recipientPhoneError}</Text>
          )}
```

Do not prefill phone (unlike email/name, which mobile prefills from the profile): there is no stored phone, and CLAUDE.md forbids persisting checkout fields.

- [ ] **Step 9: Verify**

Run: `node --test tests/`, `npx tsc --noEmit`, `cd mobile && npx tsc --noEmit`.
Expected: all clean.
Live API (app running, customer token): POST `/api/cart/checkout` with a valid body but `recipientPhone: "12345"` → 400 with the phone message; omit `recipientPhone` → 400; valid `"98765 43210"` → 200 and `select recipient_phone from orders order by placed_at desc limit 1;` returns `+919876543210`.
Live UI (Playwright, customer portal): Checkout shows Phone under Email; Place order is disabled until the phone is valid; placing an order succeeds.
Live DB select check (was Task 2 Step 5): as the seeded customer, run `supabase.from("orders").select(<ORDER_DETAIL_SELECT>).limit(1)` in the browser console (or curl against `http://127.0.0.1:54321/rest/v1/orders` with the customer's access token and anon key from `.env.local`, without printing the key). Expected: HTTP 200 with `address`, `payments`, `recipient_phone`, and `order_items.products.image_url` populated. If PostgREST rejects `addresses!delivery_address_id`, list the orders foreign keys with `select conname from pg_constraint where conrelid='public.orders'::regclass and contype='f';` and adjust the hint (and the substring asserted in `tests/order-detail.test.mjs`).

- [ ] **Step 10: Commit**

`/commit` staging the migration, both `phone.ts` files, `tests/phone.test.mjs`, the checkout route, and the web and mobile checkout files (announce this multi-file commit first). Message: `feat: capture customer phone at checkout on web and mobile`.

---

### Task 3: 6-step OrderStatusTimeline

**Files:**
- Modify: `components/OrderStatusTimeline.tsx` (whole file)

**Interfaces:**
- Consumes: `OrderStatus`, `TIMELINE_STEPS`, `TIMELINE_STEP_INDEX` from `@/lib/order-status`.
- Produces: `OrderStatusTimeline({ status }: { status: OrderStatus })` (same export and props as before).

- [ ] **Step 1: Replace the file**

```tsx
import { TIMELINE_STEPS, TIMELINE_STEP_INDEX, type OrderStatus } from "@/lib/order-status";

export function OrderStatusTimeline({ status }: { status: OrderStatus }) {
  if (status === "cancelled") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        Order cancelled
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
        Restaurant rejected your order — payment refunded
      </div>
    );
  }

  const currentIndex = TIMELINE_STEP_INDEX[status];

  return (
    <ol className="flex items-start gap-1">
      {TIMELINE_STEPS.map((label, index) => {
        const complete = index < currentIndex;
        const active = index === currentIndex;
        return (
          <li key={label} className="flex flex-1 items-start gap-1 last:flex-none">
            <div className="flex w-14 flex-col items-center gap-1 text-center sm:w-16">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  complete
                    ? "bg-brand-accent-text-safe text-white"
                    : active
                    ? "bg-brand-primary-text-safe text-white"
                    : "bg-brand-ink-muted/20 text-brand-ink-muted"
                }`}
              >
                {complete ? "✓" : index + 1}
              </div>
              <span
                className={`text-[11px] leading-tight sm:text-xs ${
                  active ? "font-semibold text-brand-ink" : "text-brand-ink-muted"
                }`}
              >
                {label}
              </span>
            </div>
            {index < TIMELINE_STEPS.length - 1 && (
              <div
                className={`mt-3.5 h-0.5 flex-1 ${
                  complete ? "bg-brand-accent" : "bg-brand-ink-muted/20"
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

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean. Then temporarily delete the `delivered: 5,` line in `lib/order-status.ts`, run `npx tsc --noEmit`, expect a compile error in that file, and restore the line.

- [ ] **Step 3: Commit**

`/commit` staging `components/OrderStatusTimeline.tsx`. Message: `feat: customer timeline shows vendor acceptance as its own step (6 steps)`.

---

### Task 4: ItemThumb + OrderDetailView

**Files:**
- Create: `components/ItemThumb.tsx`
- Create: `components/OrderDetailView.tsx`

**Interfaces:**
- Consumes: `OrderDetail` and helpers from `@/lib/order-detail`; `STATUS_LABEL` from `@/lib/order-status`; `isAllowedImageUrl` from `@/lib/image-url`.
- Produces:
  - `ItemThumb({ url, name, size }: { url: string | null; name: string; size?: number })` (default size 56)
  - `OrderDetailView({ order, children }: { order: OrderDetail; children?: ReactNode })` — `children` renders in an actions slot at the bottom.

- [ ] **Step 1: Create `components/ItemThumb.tsx`**

```tsx
import Image from "next/image";
import { isAllowedImageUrl } from "@/lib/image-url";

// next/image throws on hosts missing from next.config remotePatterns, so
// anything not on the allowlist (or missing) gets a placeholder block.
export function ItemThumb({
  url,
  name,
  size = 56,
}: {
  url: string | null;
  name: string;
  size?: number;
}) {
  if (url && isAllowedImageUrl(url)) {
    return (
      <Image
        src={url}
        alt={name}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-[var(--radius-card)] object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[var(--radius-card)] bg-brand-accent/10"
    />
  );
}
```

- [ ] **Step 2: Create `components/OrderDetailView.tsx`**

```tsx
import type { ReactNode } from "react";
import { ItemThumb } from "@/components/ItemThumb";
import { formatPaise, lineTotalPaise, type OrderDetail } from "@/lib/order-detail";
import { STATUS_LABEL } from "@/lib/order-status";

function rupees(amount: number): string {
  return formatPaise(Math.round(amount * 100));
}

export function OrderDetailView({
  order,
  children,
}: {
  order: OrderDetail;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 text-brand-ink">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lg font-semibold">{order.storeName}</p>
          <p className="text-sm text-brand-ink-muted">
            Order #{order.id.slice(0, 8)} · {new Date(order.placedAt).toLocaleString()}
          </p>
        </div>
        <span className="rounded-[var(--radius-pill)] bg-brand-ink px-3 py-1 text-sm font-medium text-white">
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      <section className="rounded-[var(--radius-card)] bg-brand-primary-tint p-4">
        <h3 className="mb-1 text-sm font-semibold text-brand-primary-text-safe">Deliver to</h3>
        <p className="font-medium">{order.recipientName}</p>
        <p className="text-sm text-brand-ink-muted">{order.recipientEmail}</p>
        <p className="text-sm text-brand-ink-muted">
          {order.recipientPhone.startsWith("+") ? (
            <a href={`tel:${order.recipientPhone}`} className="underline">
              {order.recipientPhone}
            </a>
          ) : (
            order.recipientPhone
          )}
        </p>
        {order.address ? (
          <div className="mt-2 text-sm">
            {order.address.label && <p className="font-medium">{order.address.label}</p>}
            {order.address.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-brand-ink-muted">No delivery address on file</p>
        )}
        {order.deliveryNote && (
          <p className="mt-2 text-sm">
            <span className="font-medium">Note:</span> &quot;{order.deliveryNote}&quot;
          </p>
        )}
      </section>

      <section className="rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface p-4">
        <h3 className="mb-3 text-sm font-semibold text-brand-ink-muted">
          Items ({order.items.reduce((sum, item) => sum + item.quantity, 0)})
        </h3>
        <ul className="flex flex-col gap-3">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start gap-3">
              <ItemThumb url={item.imageUrl} name={item.name} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {item.quantity}× {item.name}
                </p>
                {item.options.length > 0 && (
                  <p className="text-sm text-brand-ink-muted">
                    {item.options.map((option) => option.optionName).join(", ")}
                  </p>
                )}
                {item.specialInstructions && (
                  <p className="text-sm text-brand-ink-muted">
                    &quot;{item.specialInstructions}&quot;
                  </p>
                )}
              </div>
              <p className="shrink-0 font-medium">
                {formatPaise(lineTotalPaise(item.unitPrice, item.quantity))}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-[var(--radius-card)] bg-brand-accent-tint p-3">
          <p className="text-xs font-medium text-brand-accent-text-safe">Subtotal</p>
          <p className="text-base font-semibold">{rupees(order.subtotal)}</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-brand-accent-tint p-3">
          <p className="text-xs font-medium text-brand-accent-text-safe">Delivery fee</p>
          <p className="text-base font-semibold">{rupees(order.deliveryFee)}</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-brand-accent-tint p-3">
          <p className="text-xs font-medium text-brand-accent-text-safe">Total</p>
          <p className="text-lg font-bold">{rupees(order.total)}</p>
        </div>
        <div className="rounded-[var(--radius-card)] bg-brand-primary-tint p-3">
          <p className="text-xs font-medium text-brand-primary-text-safe">Payment</p>
          <p className="text-base font-semibold">
            {order.payment ? `${order.payment.status} (${order.payment.method})` : "—"}
          </p>
        </div>
      </section>

      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: clean. (Visual check happens in Tasks 5 and 8 where the component is first rendered.)

- [ ] **Step 4: Commit**

`/commit` staging both files. Message: `feat: add shared OrderDetailView and guarded ItemThumb components`.

---

### Task 5: Customer order detail page

**Files:**
- Modify: `app/customer/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `ORDER_DETAIL_SELECT`, `normalizeOrderDetail`, `OrderDetail`, `RawOrderDetail` (`@/lib/order-detail`); `STATUS_MESSAGE`, `isTerminalStatus`, `OrderStatus` (`@/lib/order-status`); `OrderDetailView`, `OrderStatusTimeline`.

- [ ] **Step 1: Replace imports, types and the load function**

Replace lines 1–113 (imports through the end of the `useEffect`) with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useRoleGuard } from "@/lib/auth";
import { OrderStatusTimeline } from "@/components/OrderStatusTimeline";
import { OrderDetailView } from "@/components/OrderDetailView";
import {
  ORDER_DETAIL_SELECT,
  normalizeOrderDetail,
  type OrderDetail,
  type RawOrderDetail,
} from "@/lib/order-detail";
import { STATUS_MESSAGE, isTerminalStatus } from "@/lib/order-status";

type PartnerLocation = {
  current_lat: number | null;
  current_lng: number | null;
  last_ping_at: string | null;
};

const SHOW_LOCATION_FOR = ["assigned", "picked_up"];

export default function OrderConfirmationPage() {
  const params = useParams<{ id: string }>();
  const { ready } = useRoleGuard("customer", "/customer/login");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [partnerLocation, setPartnerLocation] = useState<PartnerLocation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    async function load() {
      const { data, error: loadError } = await supabase
        .from("orders")
        .select(ORDER_DETAIL_SELECT)
        .eq("id", params.id)
        .single();
      if (cancelled) return;
      if (loadError || !data) {
        setError(loadError?.message ?? "Failed to load order");
        return;
      }
      const detail = normalizeOrderDetail(data as unknown as RawOrderDetail);
      setOrder(detail);

      // Stop polling if order reached a terminal status
      if (isTerminalStatus(detail.status) && interval) clearInterval(interval);

      if (detail.deliveryPartnerId && SHOW_LOCATION_FOR.includes(detail.status)) {
        const { data: loc } = await supabase
          .from("delivery_partners")
          .select("current_lat, current_lng, last_ping_at")
          .eq("user_id", detail.deliveryPartnerId)
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
  }, [ready, params.id]);
```

- [ ] **Step 2: Replace the render section**

Replace everything from `if (!ready) {` to the end of the file with:

```tsx
  if (!ready) {
    return <p className="text-gray-500">Loading…</p>;
  }

  if (error) {
    return <p className="text-red-600">Couldn&apos;t load order: {error}</p>;
  }

  if (!order) {
    return <p className="text-gray-500">Loading order…</p>;
  }

  const paymentFailed = order.payment?.status === "failed";

  return (
    <div className="-m-4 flex flex-col gap-6 bg-brand-bg pb-6">
      <div className="flex flex-col items-center gap-2 bg-brand-ink px-6 pb-14 pt-8 text-center">
        <span className="text-3xl">
          {paymentFailed || order.status === "cancelled" || order.status === "rejected"
            ? "ℹ️"
            : "✅"}
        </span>
        <h1 className="text-2xl font-bold text-white">Order #{order.id.slice(0, 8)}</h1>
      </div>
      <div className="flex flex-col gap-6 px-6">
        {paymentFailed ? (
          <p className="text-red-600">
            Payment failed. Your order was not placed — please try checking out
            again.
          </p>
        ) : (
          <>
            <section className="-mt-14 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow-lg">
              <OrderStatusTimeline status={order.status} />
              <p className="mt-3 text-sm text-brand-ink-muted">{STATUS_MESSAGE[order.status]}</p>
            </section>

            {partnerLocation?.current_lat != null && partnerLocation?.current_lng != null && (
              <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-brand-ink-muted/25 bg-brand-ink-muted/5 px-4 py-8 text-center">
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

            <OrderDetailView order={order} />
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: clean.
Live (Playwright, customer portal on port 3000): log in as the seeded customer (credentials in `README.md`/`scripts/seed.mjs`, not `.env`), open an existing order → timeline shows 6 steps; items with photos, recipient, address, subtotal/fee/total, payment all render; take a screenshot. Open a `rejected` or `cancelled` order if one exists (else `update orders set status='rejected'` via psql on a throwaway order and revert) → red banner, no steps.

- [ ] **Step 4: Commit**

`/commit` staging this file. Message: `feat: customer order detail shows items, address and totals`.

---

### Task 6: Customer orders list

**Files:**
- Modify: `app/customer/orders/page.tsx`

**Interfaces:**
- Consumes: `ORDER_LIST_SELECT`, `normalizeOrderListRow`, `formatPaise`, `OrderListRow`, `RawOrderListRow` (`@/lib/order-detail`); `STATUS_LABEL` (`@/lib/order-status`); `ItemThumb`.

- [ ] **Step 1: Replace imports, types, label map and data load**

Replace lines 1–55 with:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/auth";
import { ItemThumb } from "@/components/ItemThumb";
import {
  ORDER_LIST_SELECT,
  formatPaise,
  normalizeOrderListRow,
  type OrderListRow,
  type RawOrderListRow,
} from "@/lib/order-detail";
import { STATUS_LABEL } from "@/lib/order-status";

const MAX_THUMBS = 4;

export default function CustomerOrdersPage() {
  const router = useRouter();
  const { userId, loading: sessionLoading } = useSession();
  const [orders, setOrders] = useState<OrderListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading || !userId) return;
    let cancelled = false;
    async function load() {
      const { data, error: fetchError } = await supabase
        .from("orders")
        .select(ORDER_LIST_SELECT)
        .eq("customer_id", userId)
        .order("placed_at", { ascending: false });
      if (cancelled) return;
      if (fetchError) {
        setError("Couldn't load your orders.");
        return;
      }
      setOrders(((data as unknown as RawOrderListRow[]) ?? []).map(normalizeOrderListRow));
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [userId, sessionLoading]);
```

- [ ] **Step 2: Replace the list rendering**

Replace the `<div className="flex flex-col gap-3">…</div>` block (the `orders?.map` list) with:

```tsx
      <div className="flex flex-col gap-3">
        {orders?.map((order) => (
          <Link
            key={order.id}
            href={`/customer/orders/${order.id}`}
            className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface p-4 hover:bg-brand-accent/5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-brand-ink">{order.storeName}</p>
                <p className="text-xs text-brand-ink-muted">
                  #{order.id.slice(0, 8)} · {new Date(order.placedAt).toLocaleString()}
                </p>
              </div>
              <span className="shrink-0 rounded-[var(--radius-pill)] bg-brand-primary-tint px-3 py-1 text-xs font-semibold text-brand-primary-text-safe">
                {STATUS_LABEL[order.status]}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {order.items.slice(0, MAX_THUMBS).map((item) => (
                  <ItemThumb key={item.id} url={item.imageUrl} name={item.name} size={44} />
                ))}
                {order.items.length > MAX_THUMBS && (
                  <span className="text-sm text-brand-ink-muted">
                    +{order.items.length - MAX_THUMBS}
                  </span>
                )}
                <span className="text-sm text-brand-ink-muted">
                  {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="font-semibold text-brand-ink">
                {formatPaise(Math.round(order.total * 100))}
              </p>
            </div>
          </Link>
        ))}
      </div>
```

- [ ] **Step 2b: Verify**

Run: `npx tsc --noEmit`
Expected: clean.
Live (Playwright): customer → sidebar "Orders" → list shows store, #id, date, status pill, thumbnails, total; click a card → lands on the detail page from Task 5 (screenshot both).

- [ ] **Step 3: Commit**

`/commit` staging this file. Message: `feat: customer orders list shows status pill, item thumbnails and total`.

---

### Task 7: Vendor orders API returns the normalized shape

**Files:**
- Modify: `app/api/vendor/orders/route.ts`

**Interfaces:**
- Consumes: `resolveVendorStore`, `tokenFromRequest` (`@/lib/vendor-auth`); `ORDER_DETAIL_SELECT`, `normalizeOrderDetail`, `RawOrderDetail` (`@/lib/order-detail`).
- Produces: `GET /api/vendor/orders` → `{ orders: OrderDetail[] }` (camelCase, see `lib/order-detail.ts`), filtered by the vendor's `store_id`, newest first.

- [ ] **Step 1: Replace the file**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";
import {
  ORDER_DETAIL_SELECT,
  normalizeOrderDetail,
  type RawOrderDetail,
} from "@/lib/order-detail";

export async function GET(request: NextRequest) {
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const { data, error } = await supabaseServer
    .from("orders")
    .select(ORDER_DETAIL_SELECT)
    .eq("store_id", resolved.storeId)
    .order("placed_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "Failed to load orders" }, { status: 500 });
  }
  const orders = (data as unknown as RawOrderDetail[]).map(normalizeOrderDetail);
  return NextResponse.json({ orders });
}
```

- [ ] **Step 2: Verify live**

Run: `npx tsc --noEmit`. Then, with the app running and a vendor session token (log in via Playwright and read the access token from `localStorage`, do not print secrets beyond the test), `curl -H "Authorization: Bearer <token>" http://localhost:3001/api/vendor/orders` (use the vendor port if running `--all-roles`, else 3000).
Expected: 200; each order has `recipientName`, `recipientEmail`, `recipientPhone`, `address.lines`, `items[].imageUrl`, `payment`. Without a token: 401. With a customer token: 403.

NOTE: this intentionally changes the response shape from snake_case to camelCase; the only consumer is `app/vendor/(portal)/orders/page.tsx`, rewritten in Task 8. Verify with `grep -rn "api/vendor/orders\"" app components` (exact string `/api/vendor/orders"` or with backtick-less fetch) that no other caller reads the old shape; `/api/vendor/orders/[id]/status` and `/reject` are different routes and unaffected.

- [ ] **Step 3: Commit**

Do NOT commit here. Decided with the user: Tasks 7 and 8 are done back-to-back and committed together (the vendor page is broken between them). The single commit is made at the end of Task 8.

---

### Task 8: Vendor orders board redesign

**Files:**
- Create: `components/vendor/VendorOrderCard.tsx`
- Create: `components/vendor/VendorOrderModal.tsx`
- Modify: `app/vendor/(portal)/orders/page.tsx` (whole file)

**Interfaces:**
- Consumes: `OrderDetail`, `formatPaise` (`@/lib/order-detail`); `OrderDetailView`, `ItemThumb`; `supabase` for the session token.
- Produces:
  - `VendorOrderCard({ order, onOpen, onAdvance, onReject }: { order: OrderDetail; onOpen: () => void; onAdvance: () => void; onReject: () => void })`
  - `NEXT_LABEL: Record<string,string>` exported from `VendorOrderCard.tsx` (status → button text)
  - `VendorOrderModal({ order, onClose, onAdvance, onReject }: { order: OrderDetail; onClose: () => void; onAdvance: () => void; onReject: () => void })`

- [ ] **Step 1: Create `components/vendor/VendorOrderCard.tsx`**

```tsx
import { ItemThumb } from "@/components/ItemThumb";
import { formatPaise, type OrderDetail } from "@/lib/order-detail";

export const NEXT_LABEL: Record<string, string> = {
  placed: "Accept order",
  accepted: "Start preparing",
  preparing: "Mark ready",
};

export function VendorOrderCard({
  order,
  onOpen,
  onAdvance,
  onReject,
}: {
  order: OrderDetail;
  onOpen: () => void;
  onAdvance: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="text-lg font-bold text-brand-ink">#{order.id.slice(0, 8)}</p>
        <p className="text-lg font-bold text-brand-ink">
          {formatPaise(Math.round(order.total * 100))}
        </p>
      </div>

      <div className="rounded-lg bg-brand-primary-tint p-2 text-base">
        <p className="font-semibold text-brand-ink">For: {order.recipientName}</p>
        <p className="text-brand-ink-muted">Phone: {order.recipientPhone}</p>
        {order.address ? (
          <p className="text-brand-ink-muted">{order.address.lines.join(", ")}</p>
        ) : (
          <p className="text-brand-ink-muted">No delivery address on file</p>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {order.items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 text-base text-brand-ink">
            <ItemThumb url={item.imageUrl} name={item.name} size={48} />
            <div className="min-w-0">
              <p className="font-medium">
                {item.quantity}× {item.name}
              </p>
              {item.options.length > 0 && (
                <p className="text-sm text-brand-ink-muted">
                  {item.options.map((option) => option.optionName).join(", ")}
                </p>
              )}
              {item.specialInstructions && (
                <p className="text-sm text-brand-ink-muted">
                  &quot;{item.specialInstructions}&quot;
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {order.deliveryNote && (
        <p className="text-base text-brand-ink-muted">Note: &quot;{order.deliveryNote}&quot;</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {order.status === "placed" && (
          <button
            onClick={onReject}
            className="rounded-full border border-red-600 px-4 py-2 text-sm font-medium text-red-600"
          >
            Reject
          </button>
        )}
        {NEXT_LABEL[order.status] && (
          <button
            onClick={onAdvance}
            className="rounded-full bg-brand-primary-text-safe px-4 py-2 text-sm font-semibold text-white"
          >
            {NEXT_LABEL[order.status]}
          </button>
        )}
        <button
          onClick={onOpen}
          className="ml-auto text-sm font-medium text-brand-primary-text-safe underline"
        >
          Full details
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `components/vendor/VendorOrderModal.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { OrderDetailView } from "@/components/OrderDetailView";
import { NEXT_LABEL } from "@/components/vendor/VendorOrderCard";
import type { OrderDetail } from "@/lib/order-detail";

export function VendorOrderModal({
  order,
  onClose,
  onAdvance,
  onReject,
}: {
  order: OrderDetail;
  onClose: () => void;
  onAdvance: () => void;
  onReject: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${order.id.slice(0, 8)} details`}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[var(--radius-card)] bg-brand-bg p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-3 flex justify-end">
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full px-3 py-1 text-lg text-brand-ink-muted hover:bg-brand-ink-muted/10"
          >
            ✕
          </button>
        </div>
        <OrderDetailView order={order}>
          {order.status === "placed" && (
            <button
              onClick={onReject}
              className="rounded-full border border-red-600 px-4 py-2 text-sm font-medium text-red-600"
            >
              Reject
            </button>
          )}
          {NEXT_LABEL[order.status] && (
            <button
              onClick={onAdvance}
              className="rounded-full bg-brand-primary-text-safe px-4 py-2 text-sm font-semibold text-white"
            >
              {NEXT_LABEL[order.status]}
            </button>
          )}
        </OrderDetailView>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace `app/vendor/(portal)/orders/page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { OrderDetail } from "@/lib/order-detail";
import { VendorOrderCard } from "@/components/vendor/VendorOrderCard";
import { VendorOrderModal } from "@/components/vendor/VendorOrderModal";

const KANBAN_STATUSES = ["placed", "accepted", "preparing", "ready"] as const;
type KanbanStatus = (typeof KANBAN_STATUSES)[number];

const COLUMN_LABEL: Record<KanbanStatus, string> = {
  placed: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
};

const COLUMN_HEADER_CLASS: Record<KanbanStatus, string> = {
  placed: "bg-brand-primary-text-safe text-white",
  accepted: "bg-brand-ink text-white",
  preparing: "bg-brand-accent-text-safe text-white",
  ready: "bg-gray-500 text-white",
};

const COLUMN_BODY_CLASS: Record<KanbanStatus, string> = {
  placed: "bg-brand-primary-tint",
  accepted: "bg-brand-ink-tint",
  preparing: "bg-brand-accent-tint",
  ready: "bg-gray-100",
};

const POLL_MS = 10000;

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorOrdersPage() {
  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);

  const loadOrders = useCallback(async () => {
    const res = await fetch("/api/vendor/orders", { headers: await authHeader() });
    const body = await res.json();
    if (res.ok) setOrders(body.orders);
  }, []);

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, POLL_MS);
    return () => clearInterval(interval);
  }, [loadOrders]);

  async function act(orderId: string, path: "status" | "reject", failure: string) {
    setError(null);
    const res = await fetch(`/api/vendor/orders/${orderId}/${path}`, {
      method: "POST",
      headers: await authHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? failure);
      return;
    }
    await loadOrders();
  }

  const advance = (orderId: string) => act(orderId, "status", "Failed to update order status");
  const reject = (orderId: string) => act(orderId, "reject", "Failed to reject order");

  function ordersForColumn(status: KanbanStatus) {
    return orders
      .filter((order) => order.status === status)
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());
  }

  const openOrder = orders.find((order) => order.id === openOrderId) ?? null;

  return (
    <div>
      <h1 className="mb-4 font-heading text-3xl text-brand-ink">Orders</h1>
      {error && <p className="mb-3 text-base text-red-600">{error}</p>}
      {orders.length === 0 ? (
        <p className="text-base text-brand-ink-muted">No orders yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {KANBAN_STATUSES.map((status) => {
            const columnOrders = ordersForColumn(status);
            return (
              <div
                key={status}
                className={`flex flex-col gap-3 rounded-[var(--radius-card)] p-3 ${COLUMN_BODY_CLASS[status]}`}
              >
                <h2
                  className={`rounded-[var(--radius-pill)] px-3 py-2 text-center text-base font-semibold ${COLUMN_HEADER_CLASS[status]}`}
                >
                  {COLUMN_LABEL[status]} ({columnOrders.length})
                </h2>
                {columnOrders.length === 0 && (
                  <p className="rounded-lg border border-dashed border-brand-ink-muted/30 p-4 text-center text-base text-brand-ink-muted">
                    Nothing here yet
                  </p>
                )}
                {columnOrders.map((order) => (
                  <VendorOrderCard
                    key={order.id}
                    order={order}
                    onOpen={() => setOpenOrderId(order.id)}
                    onAdvance={() => advance(order.id)}
                    onReject={() => reject(order.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
      {openOrder && (
        <VendorOrderModal
          order={openOrder}
          onClose={() => setOpenOrderId(null)}
          onAdvance={() => advance(openOrder.id)}
          onReject={() => reject(openOrder.id)}
        />
      )}
    </div>
  );
}
```

Note: if the modal's order leaves the board (e.g. rejected → status `rejected`), `openOrder` is still found in `orders` (API returns all statuses) so the modal stays open showing the new status with no action buttons; closing is the user's call. After "Mark ready" the modal also stays open, which is acceptable.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit` then `npm run build`.
Expected: both pass.
Live (Playwright, vendor portal): log in as the seeded vendor → Orders board: columns New/Accepted/Preparing/Ready; cards show order #, total, "For: <recipient>", address, item thumbnails, notes; larger type, no large empty areas (screenshot at 1440px and 390px width); click "Full details" → dialog opens with `OrderDetailView`, Escape and backdrop click close it. Place a fresh customer order (customer portal) → it appears in New within ~10s without refresh.

- [ ] **Step 5: Commit**

`/commit` staging `app/api/vendor/orders/route.ts` (Task 7), `components/vendor/VendorOrderCard.tsx`, `components/vendor/VendorOrderModal.tsx`, `app/vendor/(portal)/orders/page.tsx`. Message: `feat: vendor orders board with full order details, photos and polling`.

---

### Task 9: End-to-end live verification and docs

**Files:**
- Modify: `MEMORY.md`, `CLAUDE.md` (only if a new gotcha was found), `README.md`/`AGENTS.md` only if they describe the changed behavior (per the "Update CLAUDE files" rule check each; change only what needs it).

- [ ] **Step 1: Full checks**

Run: `node --test tests/`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
Expected: all pass. Report exact output of any failure; do not work around it.

- [ ] **Step 2: Accept → customer sync (spec Vendor bullet 1)**

Run all roles: `npm run app:start:all-roles` (customer 3000, vendor 3001). As customer, place an order (card or COD so payment succeeds). As vendor, click "Accept order". On the customer order page confirm, within ~3s and without reload, the timeline's "Accepted" step becomes active (step 2 of 6) and the message reads "Restaurant accepted your order". If n8n is running, confirm workflow 03 executed for this order (n8n executions list) — if n8n is not running, say so explicitly rather than skipping silently.

- [ ] **Step 3: Review Focus checks**

- Review Focus 5: on an order with options, compare sum of displayed line totals + delivery fee to the displayed total. If they differ, note it in MEMORY.md and change `OrderDetailView` line price to show per-unit price only (`{item.quantity}× @ {price}`) — do not recompute totals.
- Review Focus 7: place a new order with phone `98765 43210` → customer detail, vendor card and vendor dialog show `+919876543210` (tappable `tel:` link in the detail view); a pre-migration order shows `Not provided` as plain text. Also run `cd mobile && npx tsc --noEmit` one final time and state in the report that mobile was type-checked only (no device/simulator run).
- Review Focus 6: a payment-failed order shows the failure message; a rejected order (vendor "Reject" on a placed order) shows the red banner and refund wording.
- Review Focus 1: psql `update public.orders set delivery_address_id = null where id = '<throwaway order>'` only if the column allows null; if NOT NULL, record that in the test notes and skip.

- [ ] **Step 4: Update project docs**

Add a MEMORY.md entry "Order visibility — sub-project A" (what shipped, live-verification results, defects found). Note that mobile `lib/order-status.ts` still has the 4-step mapping until sub-project D. Check `CLAUDE.md`, `README.md`, `AGENTS.md` for stale statements (e.g. anything describing the 4-step timeline); edit only those needing it.

- [ ] **Step 5: Final review and merge**

Run `/review` on the branch diff. Then use `superpowers:finishing-a-development-branch`. Merging to `main` and pushing need the user's explicit go-ahead (or the "Commit Work" phrase).
