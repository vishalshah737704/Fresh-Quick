# C3 Favorites, Recent Stores and One-Tap Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in customer can heart stores (saved on the account), see "Order again" on Home, and reorder a past order into the cart in one tap, on web and on the phone.

**Architecture:** One new service-role-only table (`favorite_stores`) behind customer-only API routes that take identity from the Bearer session token. Reorder reuses the logic that builds Zippy's reorder card by extracting a pure `buildReorderLines` from `lib/zippy/actions.ts`, so web, phone and Zippy agree on prices and skip reasons. Pure shared logic lives in `lib/favorites-model.ts`, copied byte-identical to `mobile/lib/` and parity-tested.

**Tech Stack:** Next.js App Router (TypeScript), Supabase (local Docker Postgres), Expo / React Native, Node test runner (`node --test tests/*.test.mjs`, TypeScript imported directly).

**Spec:** `docs/superpowers/specs/2026-10-07-c3-favorites-reorder-design.md`

**Discovered while planning (corrects the spec):** the phone Home already has an "Order again" row (`mobile/src/app/customer/(tabs)/home.tsx`, state `reorderStores`, built from a direct `orders` query) whose "Reorder" button only opens the store page, and the phone hearts in `mobile/components/StoreCard.tsx` and `mobile/src/app/customer/store/[id].tsx` are local-only. This plan upgrades those; it does not add a second row.

## Global Constraints

- No new npm packages. No push, deploy or PR without approval (Vishal's rules). Commits use the `/commit` skill's rules (no `--no-verify`, no amend, scan for secrets); end commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Money only in integer paise (`toPaise`, `formatRupees` from `lib/zippy/catalog.ts`).
- Identity only from the verified Bearer token via `supabaseServer.auth.getUser(token)` and a `users.role = 'customer'` check. Never from a body or model input.
- No RLS write policy on `favorite_stores`; RLS enabled with zero policies (service role only).
- Cart changes use `addItems(storeId, storeName, items, replace)`; never `clearCart()` then `addItem()`.
- Files shared with the phone are byte-identical copies guarded in `tests/mobile-parity.test.mjs`: `lib/favorites-model.ts` to `mobile/lib/favorites-model.ts`.
- 2-space indentation, ES modules, async/await, comments only for non-obvious WHY.
- Tests must not send real Gmail. Orders created for live checks use only an address Vishal owns, one at a time, and only after asking; prefer inserting past orders as `delivered` via SQL (the trigger-fired n8n workflow 05 emails the order's `recipient_email`, so use `replica` role for inserts as in the Z4 live checks, or ask first).
- Run `npm run build` (not just `tsc`) before calling a route/page task done. Never run the dev server on the same `.next` while a build runs.
- Docker Postgres container name: `supabase_db_phase1-scaffold-db`. Apply a migration with `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/<file>.sql`.
- Browser verification: the Claude-in-Chrome extension is connected for live UI checks (load its tools with one ToolSearch call; call `tabs_context_mcp` first; open a new tab; do not trigger JS dialogs). Playwright MCP is the fallback.

## Review Focus

- Signed-out heart tap must not toggle anything and must go to login with a validated redirect. Test: `favorites-model` has no auth logic; the live check in Task 5 taps the heart signed out.
- Reorder when the cart already holds another store: replaced, disclosed, no modal. Test: `reorderNotice` unit test (Task 2) and live check (Task 6).
- Reorder of a dish whose price changed or that is now unavailable: today's price, skipped line listed. Test: `buildReorderLines` tests (Task 3).
- Another customer's order id: "not found", never their items. Test: live curl check (Task 4).
- Double click on Reorder adds once, not twice. Test: busy-state unit test in Task 2 (`isReorderBusy`) and live double click (Task 6).
- A favorited store that later becomes suspended: heart can still be removed; it never appears in "Order again". Test: `pickReorderStores` test (Task 2).

## File Structure

Create:
- `supabase/migrations/00000000000036_favorite_stores.sql` - table, index, RLS enabled, no policies.
- `lib/favorites-model.ts` - pure shared logic: types, `pickReorderStores`, `reorderNotice`, `isReorderBusy`, `FAVORITES_PATH`. Copied to `mobile/lib/favorites-model.ts`.
- `lib/customer-auth.ts` - server helper `resolveCustomer(request)` returning `{ userId } | { error, status }` (same logic as `app/api/customer/location/route.ts`, which is left untouched).
- `app/api/customer/favorites/route.ts` - GET list.
- `app/api/customer/favorites/[storeId]/route.ts` - PUT add, DELETE remove.
- `app/api/customer/reorder-options/route.ts` - GET up to 3 recent stores.
- `app/api/customer/orders/[id]/reorder/route.ts` - POST returns the lines to re-add.
- `lib/customer-api.ts` - web fetch helper that attaches the session token.
- `lib/favorites-store.tsx` - web `FavoritesProvider` and `useFavorites()`.
- `components/FavoriteHeart.tsx` - web heart button.
- `lib/use-reorder.ts` - web hook `useReorder()`.
- `mobile/lib/favorites-store.tsx` - phone provider and hook.
- `mobile/lib/use-reorder.ts` - phone hook.
- `tests/favorites-model.test.mjs`, `tests/reorder-lines.test.mjs`.

Modify:
- `lib/zippy/actions.ts` - extract `buildReorderLines`; `buildReorderCard` calls it.
- `tests/mobile-parity.test.mjs` - one more byte-identical assertion.
- `components/RestaurantCard.tsx`, `app/customer/stores/[id]/page.tsx`, `app/customer/page.tsx`, `app/customer/orders/page.tsx`, `app/customer/orders/[id]/page.tsx`, `app/customer/layout.tsx`.
- `mobile/components/StoreCard.tsx`, `mobile/src/app/customer/store/[id].tsx`, `mobile/src/app/customer/(tabs)/home.tsx`, `mobile/src/app/customer/(tabs)/orders.tsx`, `mobile/src/app/customer/orders/[id].tsx`, `mobile/src/app/_layout.tsx`.
- `knowledge/customer/ordering-web.md`, `knowledge/customer/ordering-mobile.md`, `CLAUDE.md`, `MEMORY.md`, manuals (Task 9).

---

### Task 1: Migration 36 `favorite_stores`

**Files:**
- Create: `supabase/migrations/00000000000036_favorite_stores.sql`

**Interfaces:**
- Produces: table `public.favorite_stores(user_id uuid, store_id uuid, created_at timestamptz)` with primary key `(user_id, store_id)`.

- [ ] **Step 1: Write the migration**

```sql
-- C3: customers can favorite stores. Written only through service-role API routes
-- (identity from the verified session token), so RLS is on with NO policies:
-- an unused write policy would be a direct PostgREST bypass.
create table public.favorite_stores (
  user_id uuid not null references public.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

create index idx_favorite_stores_store_id on public.favorite_stores (store_id);

alter table public.favorite_stores enable row level security;
```

- [ ] **Step 2: Apply it to the local database**

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/00000000000036_favorite_stores.sql`
Expected: `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE`.

- [ ] **Step 3: Verify RLS and policies**

Run: `docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select relrowsecurity from pg_class where relname='favorite_stores'; select count(*) from pg_policies where tablename='favorite_stores';"`
Expected: `t`, then `0`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00000000000036_favorite_stores.sql
git commit -m "feat(c3): favorite_stores table (service-role only)"
```

---

### Task 2: Shared pure model `lib/favorites-model.ts`

**Files:**
- Create: `lib/favorites-model.ts`, `mobile/lib/favorites-model.ts` (byte-identical copy), `tests/favorites-model.test.mjs`
- Modify: `tests/mobile-parity.test.mjs` (add one assertion)

**Interfaces:**
- Produces (all exported from `lib/favorites-model.ts`):
  - `type ReorderOption = { storeId: string; storeName: string; imageUrl: string | null; isOpen: boolean; lastOrderId: string; lastOrderedAt: string }`
  - `type RecentOrderRow = { id: string; store_id: string; status: string; placed_at: string; stores: { id: string; name: string; banner_url: string | null; is_open: boolean; is_suspended: boolean } | { id: string; name: string; banner_url: string | null; is_open: boolean; is_suspended: boolean }[] | null }`
  - `pickReorderStores(rows: RecentOrderRow[], limit?: number): ReorderOption[]` - newest first, distinct stores, skips `cancelled`/`rejected` orders and suspended or missing stores, default limit 3.
  - `type ReorderLine = { menuItemId: string; name: string; price: number; quantity: number; imageUrl: string | null; selectedOptions: { groupId: string; groupName: string; optionId: string; optionName: string; priceDeltaPaise: number }[]; specialInstructions: string | null }`
  - `type ReorderResponse = { storeId: string; storeName: string; lines: ReorderLine[]; skipped: { name: string; reason: string }[] }`
  - `reorderNotice(args: { storeName: string; added: number; skipped: { name: string; reason: string }[]; replaced: { count: number; storeName: string | null } | null }): string`
  - `isReorderBusy(current: string | null, next: string): boolean` - true when a reorder is already running (blocks a double tap).
  - `FAVORITES_PATH = "/api/customer/favorites"`, `REORDER_OPTIONS_PATH = "/api/customer/reorder-options"`, `reorderPath(orderId: string): string`.

- [ ] **Step 1: Write the failing test** `tests/favorites-model.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { pickReorderStores, reorderNotice, isReorderBusy, reorderPath } from "../lib/favorites-model.ts";

const store = (id, over = {}) => ({ id, name: `Store ${id}`, banner_url: null, is_open: true, is_suspended: false, ...over });
const row = (id, storeRow, over = {}) => ({ id, store_id: storeRow?.id ?? "x", status: "delivered", placed_at: `2026-10-0${id}T10:00:00Z`, stores: storeRow, ...over });

test("pickReorderStores: distinct stores, newest first, default limit 3", () => {
  const rows = [row("9", store("a")), row("8", store("a")), row("7", store("b")), row("6", store("c")), row("5", store("d"))];
  const out = pickReorderStores(rows);
  assert.deepEqual(out.map((o) => o.storeId), ["a", "b", "c"]);
  assert.equal(out[0].lastOrderId, "9");
});

test("pickReorderStores: skips cancelled, rejected, suspended and missing stores", () => {
  const rows = [
    row("9", store("a"), { status: "cancelled" }),
    row("8", store("b"), { status: "rejected" }),
    row("7", store("c", { is_suspended: true })),
    row("6", null),
    row("5", [store("d")]),
  ];
  assert.deepEqual(pickReorderStores(rows).map((o) => o.storeId), ["d"]);
});

test("pickReorderStores: a closed store is kept but flagged", () => {
  const out = pickReorderStores([row("1", store("a", { is_open: false }))]);
  assert.equal(out[0].isOpen, false);
});

test("reorderNotice: plain add", () => {
  assert.equal(reorderNotice({ storeName: "Dosa Corner", added: 2, skipped: [], replaced: null }), "Added 2 items from Dosa Corner to your cart.");
  assert.equal(reorderNotice({ storeName: "Dosa Corner", added: 1, skipped: [], replaced: null }), "Added 1 item from Dosa Corner to your cart.");
});

test("reorderNotice: lists skipped lines and discloses a cart replacement", () => {
  const text = reorderNotice({
    storeName: "Dosa Corner",
    added: 1,
    skipped: [{ name: "Idli", reason: "unavailable now" }],
    replaced: { count: 3, storeName: "Pizza Hub" },
  });
  assert.match(text, /Replaced the 3 items from Pizza Hub/);
  assert.match(text, /Skipped: Idli \(unavailable now\)/);
});

test("isReorderBusy blocks a second tap while one runs", () => {
  assert.equal(isReorderBusy(null, "o1"), false);
  assert.equal(isReorderBusy("o1", "o1"), true);
  assert.equal(isReorderBusy("o1", "o2"), true);
});

test("reorderPath", () => {
  assert.equal(reorderPath("abc"), "/api/customer/orders/abc/reorder");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/favorites-model.test.mjs`
Expected: FAIL, cannot find module `../lib/favorites-model.ts`.

- [ ] **Step 3: Implement** `lib/favorites-model.ts`

```ts
// Shared by the web and phone favorites / reorder features.
// mobile/lib/favorites-model.ts is a byte-identical copy (tests/mobile-parity.test.mjs guards drift), so this file imports nothing.

export const FAVORITES_PATH = "/api/customer/favorites";
export const REORDER_OPTIONS_PATH = "/api/customer/reorder-options";
export const reorderPath = (orderId: string): string => `/api/customer/orders/${orderId}/reorder`;

type StoreEmbed = { id: string; name: string; banner_url: string | null; is_open: boolean; is_suspended: boolean };

export type RecentOrderRow = {
  id: string;
  store_id: string;
  status: string;
  placed_at: string;
  stores: StoreEmbed | StoreEmbed[] | null;
};

export type ReorderOption = {
  storeId: string;
  storeName: string;
  imageUrl: string | null;
  isOpen: boolean;
  lastOrderId: string;
  lastOrderedAt: string;
};

export type ReorderLine = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  selectedOptions: { groupId: string; groupName: string; optionId: string; optionName: string; priceDeltaPaise: number }[];
  specialInstructions: string | null;
};

export type ReorderResponse = {
  storeId: string;
  storeName: string;
  lines: ReorderLine[];
  skipped: { name: string; reason: string }[];
};

// Rows must already be newest first. Orders that never reached the kitchen (cancelled, rejected) do not make a store "recent".
export function pickReorderStores(rows: RecentOrderRow[], limit = 3): ReorderOption[] {
  const seen = new Set<string>();
  const out: ReorderOption[] = [];
  for (const row of rows) {
    if (row.status === "cancelled" || row.status === "rejected") continue;
    const store = Array.isArray(row.stores) ? row.stores[0] : row.stores;
    if (!store || store.is_suspended || seen.has(store.id)) continue;
    seen.add(store.id);
    out.push({
      storeId: store.id,
      storeName: store.name,
      imageUrl: store.banner_url,
      isOpen: store.is_open,
      lastOrderId: row.id,
      lastOrderedAt: row.placed_at,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function reorderNotice(args: {
  storeName: string;
  added: number;
  skipped: { name: string; reason: string }[];
  replaced: { count: number; storeName: string | null } | null;
}): string {
  const parts = [`Added ${args.added} ${args.added === 1 ? "item" : "items"} from ${args.storeName} to your cart.`];
  if (args.replaced) {
    const from = args.replaced.storeName ? ` from ${args.replaced.storeName}` : "";
    parts.push(`Replaced the ${args.replaced.count} ${args.replaced.count === 1 ? "item" : "items"}${from} that were in your cart.`);
  }
  if (args.skipped.length > 0) {
    parts.push(`Skipped: ${args.skipped.map((s) => `${s.name} (${s.reason})`).join(", ")}.`);
  }
  return parts.join(" ");
}

// One reorder at a time: a second tap while the first request is running must do nothing.
export const isReorderBusy = (current: string | null, _next: string): boolean => current !== null;
```

- [ ] **Step 4: Copy to mobile and add the parity assertion**

Run: `cp lib/favorites-model.ts mobile/lib/favorites-model.ts`

In `tests/mobile-parity.test.mjs`, inside the test "shared modules are byte-identical copies of the web files", add after the `signup-validation` line:

```js
  assert.equal(read("../mobile/lib/favorites-model.ts"), read("../lib/favorites-model.ts"));
```

- [ ] **Step 5: Run the tests**

Run: `node --test tests/favorites-model.test.mjs tests/mobile-parity.test.mjs`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/favorites-model.ts mobile/lib/favorites-model.ts tests/favorites-model.test.mjs tests/mobile-parity.test.mjs
git commit -m "feat(c3): shared favorites/reorder model with parity test"
```

---

### Task 3: Extract `buildReorderLines` from the Zippy reorder card

**Files:**
- Modify: `lib/zippy/actions.ts` (function `buildReorderCard`, currently lines ~210-296)
- Test: `tests/reorder-lines.test.mjs`

**Interfaces:**
- Consumes: existing `ReorderSource`, `ProductForCart`, `ActionShapeDeps`, `storeProblem`, `selectOptions`, `unitPaise`, `LIMITS`, `CartLineData` in the same file.
- Produces: `export function buildReorderLines(source: ReorderSource, products: Map<string, ProductForCart>, deps: ActionShapeDeps): { ok: true; items: CartLineData[]; skipped: { name: string; reason: string }[]; storeName: string; totalPaise: number } | { ok: false; error: string }`. `buildReorderCard` output must be unchanged.

- [ ] **Step 1: Write the failing test** `tests/reorder-lines.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeText, toPaise, formatRupees } from "../lib/zippy/catalog.ts";
import { buildReorderLines } from "../lib/zippy/actions.ts";

const deps = { sanitize: sanitizeText, toPaise, formatRupees, newId: () => "id" };
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const product = (over = {}) => ({
  id: U1, name: "Masala Dosa", price: "130.00", imageUrl: null, isAvailable: true,
  storeId: "s1", storeName: "Dosa Corner", storeOpen: true, storeSuspended: false,
  groups: [{ id: "g1", name: "Size", minSelect: 1, maxSelect: 1, options: [{ id: "o1", name: "Regular", priceDeltaPaise: 0 }, { id: "o2", name: "Large", priceDeltaPaise: 2000 }] }],
  ...over,
});
const line = (over = {}) => ({ product_id: U1, quantity: 2, note: null, option_ids: ["o2"], ...over });
const source = (lines) => ({ order_id: "ord1", store_id: "s1", lines });

test("uses today's price including option deltas", () => {
  const out = buildReorderLines(source([line()]), new Map([[U1, product({ price: "150.00" })]]), deps);
  assert.equal(out.ok, true);
  assert.equal(out.items[0].price, 150);
  assert.equal(out.items[0].selectedOptions[0].priceDeltaPaise, 2000);
  assert.equal(out.totalPaise, (15000 + 2000) * 2);
  assert.equal(out.storeName, "Dosa Corner");
});

test("skips unavailable, missing and changed-option lines with reasons", () => {
  const products = new Map([[U1, product()], [U2, product({ id: U2, name: "Idli", isAvailable: false, groups: [] })]]);
  const out = buildReorderLines(source([line(), line({ product_id: U2, option_ids: [] }), line({ product_id: "33333333-3333-4333-8333-333333333333" }), line({ option_ids: ["gone"] })]), products, deps);
  assert.equal(out.ok, true);
  assert.equal(out.items.length, 1);
  assert.deepEqual(out.skipped.map((s) => s.reason), ["unavailable now", "no longer on the menu", "options changed"]);
});

test("closed store, suspended store and nothing reorderable are errors", () => {
  assert.match(buildReorderLines(source([line()]), new Map([[U1, product({ storeOpen: false })]]), deps).error, /closed/i);
  assert.equal(buildReorderLines(source([line()]), new Map([[U1, product({ storeSuspended: true })]]), deps).error, "not found");
  assert.match(buildReorderLines(source([]), new Map(), deps).error, /none of the items/i);
});

test("quantity is clamped to the line limit and double quotes in notes become single quotes", () => {
  const out = buildReorderLines(source([line({ quantity: 99, note: 'extra "hot"' })]), new Map([[U1, product()]]), deps);
  assert.equal(out.items[0].quantity, 20);
  assert.equal(out.items[0].specialInstructions.includes('"'), false);
});
```

(The last assertion pins the existing sanitizer behaviour; if `sanitizeText` keeps double quotes, change the assertion to compare against `sanitizeText('extra "hot"', 200)` instead - run the test once to see.)

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/reorder-lines.test.mjs`
Expected: FAIL, `buildReorderLines` is not exported.

- [ ] **Step 3: Refactor `lib/zippy/actions.ts`**

Replace the head of `buildReorderCard` (everything from `export function buildReorderCard(` through the line `if (items.length === 0 || storeName === null) return { ok: false, error: "None of the items can be reordered right now" };`) with the two functions below, then change the rest of `buildReorderCard` to destructure the result. The loop body is moved verbatim.

```ts
export function buildReorderLines(
  source: ReorderSource,
  products: Map<string, ProductForCart>,
  deps: ActionShapeDeps
): { ok: true; items: CartLineData[]; skipped: { name: string; reason: string }[]; storeName: string; totalPaise: number } | { ok: false; error: string } {
  const items: CartLineData[] = [];
  const skipped: { name: string; reason: string }[] = [];
  let storeName: string | null = null;
  let totalPaise = 0;
  for (const line of source.lines) {
    const product = products.get(line.product_id);
    if (!product || product.storeId !== source.store_id) {
      skipped.push({ name: "An item", reason: "no longer on the menu" });
      continue;
    }
    const cleanStoreName = deps.sanitize(product.storeName, LIMITS.maxNameChars);
    const problem = storeProblem(product, cleanStoreName);
    if (problem) return { ok: false, error: problem };
    storeName = cleanStoreName;
    const name = deps.sanitize(product.name, LIMITS.maxNameChars);
    if (!product.isAvailable) {
      skipped.push({ name, reason: "unavailable now" });
      continue;
    }
    if (line.option_ids.some((id) => id === null)) {
      skipped.push({ name, reason: "options changed" });
      continue;
    }
    const chosen = selectOptions(product.groups, line.option_ids as string[], (v) => deps.sanitize(v, LIMITS.maxNameChars));
    if (!chosen.ok) {
      skipped.push({ name, reason: "options changed" });
      continue;
    }
    if (!Number.isFinite(line.quantity)) {
      skipped.push({ name, reason: "quantity unreadable" });
      continue;
    }
    if (!Number.isFinite(Number(product.price)) || chosen.selected.some((option) => !Number.isInteger(option.priceDeltaPaise))) {
      skipped.push({ name, reason: "price unavailable" });
      continue;
    }
    const quantity = Math.min(LIMITS.maxLineQuantity, Math.max(1, Math.trunc(line.quantity)));
    const note = line.note === null ? "" : deps.sanitize(line.note, LIMITS.maxNoteChars);
    items.push({
      menuItemId: product.id,
      name,
      price: Number(product.price),
      quantity,
      imageUrl: product.imageUrl,
      selectedOptions: chosen.selected,
      specialInstructions: note === "" ? null : note,
    });
    totalPaise += unitPaise(product, chosen.selected, deps) * quantity;
  }
  if (items.length === 0 || storeName === null) return { ok: false, error: "None of the items can be reordered right now" };
  return { ok: true, items, skipped, storeName, totalPaise };
}

export function buildReorderCard(
  source: ReorderSource,
  products: Map<string, ProductForCart>,
  deps: ActionShapeDeps,
  cart?: CartSnapshot | null
): { ok: true; card: ActionCard } | { ok: false; error: string } {
  const built = buildReorderLines(source, products, deps);
  if (!built.ok) return built;
  const { items, skipped, storeName, totalPaise } = built;
```

The remainder of `buildReorderCard` (`const count = items.length;` onward) stays exactly as is.

- [ ] **Step 4: Run the new and the existing Zippy tests**

Run: `node --test tests/reorder-lines.test.mjs tests/zippy-actions.test.mjs`
Expected: all PASS (the existing reorder card tests prove Zippy output is unchanged).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/zippy/actions.ts tests/reorder-lines.test.mjs
git commit -m "refactor(c3): extract buildReorderLines from the Zippy reorder card"
```

---

### Task 4: Customer API routes (favorites, reorder-options, reorder)

**Files:**
- Create: `lib/customer-auth.ts`, `app/api/customer/favorites/route.ts`, `app/api/customer/favorites/[storeId]/route.ts`, `app/api/customer/reorder-options/route.ts`, `app/api/customer/orders/[id]/reorder/route.ts`

**Interfaces:**
- Consumes: `supabaseServer` (`@/lib/supabase-server`), `pickReorderStores` / `RecentOrderRow` / `ReorderResponse` (`@/lib/favorites-model`), `buildReorderLines` / `uuidsOnly` (`@/lib/zippy/actions`), `loadProductsForCart` (`@/lib/zippy/actions-data`), `ordersReader.getReorderSource` (`@/lib/zippy/orders-data`), `sanitizeText`/`toPaise`/`formatRupees` (`@/lib/zippy/catalog`).
- Produces: `resolveCustomer(request: NextRequest): Promise<{ userId: string } | { error: string; status: number }>`; HTTP contract from the spec section 3.

- [ ] **Step 1: Create `lib/customer-auth.ts`**

```ts
import "server-only";
import type { NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Identity comes only from the verified session token, never from the body.
export async function resolveCustomer(
  request: NextRequest
): Promise<{ userId: string } | { error: string; status: number }> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { error: "Missing Authorization header", status: 401 };
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) return { error: "Invalid or expired session", status: 401 };
  const { data: profile, error: profileError } = await supabaseServer
    .from("users")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError) return { error: "Failed to verify account", status: 500 };
  if (!profile || profile.role !== "customer") return { error: "Customers only", status: 403 };
  return { userId: userData.user.id };
}
```

- [ ] **Step 2: Create `app/api/customer/favorites/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";

export async function GET(request: NextRequest) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { data, error } = await supabaseServer
    .from("favorite_stores")
    .select("store_id")
    .eq("user_id", who.userId);
  if (error) return NextResponse.json({ error: "Failed to load favorites" }, { status: 500 });
  return NextResponse.json({ storeIds: (data ?? []).map((row) => row.store_id as string) });
}
```

- [ ] **Step 3: Create `app/api/customer/favorites/[storeId]/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";
import { uuidsOnly } from "@/lib/zippy/actions";

type Ctx = { params: Promise<{ storeId: string }> };

async function parse(request: NextRequest, ctx: Ctx) {
  const who = await resolveCustomer(request);
  if ("error" in who) return { response: NextResponse.json({ error: who.error }, { status: who.status }) };
  const { storeId } = await ctx.params;
  if (uuidsOnly([storeId]).length !== 1) return { response: NextResponse.json({ error: "not found" }, { status: 404 }) };
  return { userId: who.userId, storeId };
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const parsed = await parse(request, ctx);
  if ("response" in parsed) return parsed.response;
  const { data: store, error: storeError } = await supabaseServer
    .from("stores")
    .select("id")
    .eq("id", parsed.storeId)
    .maybeSingle();
  if (storeError) return NextResponse.json({ error: "Failed to save favorite" }, { status: 500 });
  if (!store) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { error } = await supabaseServer
    .from("favorite_stores")
    .upsert({ user_id: parsed.userId, store_id: parsed.storeId }, { onConflict: "user_id,store_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: "Failed to save favorite" }, { status: 500 });
  return NextResponse.json({ favorite: true });
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const parsed = await parse(request, ctx);
  if ("response" in parsed) return parsed.response;
  const { error } = await supabaseServer
    .from("favorite_stores")
    .delete()
    .eq("user_id", parsed.userId)
    .eq("store_id", parsed.storeId);
  if (error) return NextResponse.json({ error: "Failed to remove favorite" }, { status: 500 });
  return NextResponse.json({ favorite: false });
}
```

Check the Next.js dynamic-route `params` shape in this repo's version first: open `app/api/customer/orders/[id]/complete-delivery/route.ts` and copy its `params` typing exactly (this Next version may differ from the above).

- [ ] **Step 4: Create `app/api/customer/reorder-options/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";
import { pickReorderStores, type RecentOrderRow } from "@/lib/favorites-model";

export async function GET(request: NextRequest) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, store_id, status, placed_at, stores(id, name, banner_url, is_open, is_suspended)")
    .eq("customer_id", who.userId)
    .order("placed_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ error: "Failed to load recent orders" }, { status: 500 });
  return NextResponse.json({ options: pickReorderStores((data ?? []) as unknown as RecentOrderRow[]) });
}
```

- [ ] **Step 5: Create `app/api/customer/orders/[id]/reorder/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { resolveCustomer } from "@/lib/customer-auth";
import { buildReorderLines, uuidsOnly } from "@/lib/zippy/actions";
import { loadProductsForCart } from "@/lib/zippy/actions-data";
import { ordersReader } from "@/lib/zippy/orders-data";
import { formatRupees, sanitizeText, toPaise } from "@/lib/zippy/catalog";
import type { ReorderResponse } from "@/lib/favorites-model";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The reader filters on the verified customer id, so another customer's order id is simply "not found".
  const source = await ordersReader.getReorderSource(who.userId, { order_id: id });
  if ("error" in source) return NextResponse.json({ error: "not found" }, { status: 404 });

  const products = await loadProductsForCart(source.lines.map((line) => line.product_id));
  const built = buildReorderLines(source, products, { sanitize: sanitizeText, toPaise, formatRupees, newId: () => "reorder" });
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: built.error === "not found" ? 404 : 409 });
  }
  const body: ReorderResponse = {
    storeId: source.store_id,
    storeName: built.storeName,
    lines: built.items,
    skipped: built.skipped,
  };
  return NextResponse.json(body);
}
```

If `GetMyOrderInput` requires fields beyond `order_id`, match its type from `lib/zippy/orders.ts`.

- [ ] **Step 6: Type-check and build**

Run: `npx tsc --noEmit` then `npm run build`
Expected: both clean.

- [ ] **Step 7: Live API check (local stack running)**

Start the stack per README (`npm run app:start`, Docker running). Sign in as a customer to get a token (sign up a fresh one if none exists; customers were reset). With the token in `$T` and a vendor token in `$V`, run curl checks and record outcomes:

- `GET /api/customer/favorites` with no header gives 401; with `$V` gives 403; with `$T` gives `{"storeIds":[]}`.
- `PUT /api/customer/favorites/<real store id>` gives `{"favorite":true}`; repeat gives the same (idempotent); `GET` now lists it; `DELETE` removes it; `PUT` with a random uuid gives 404; `PUT /api/customer/favorites/not-a-uuid` gives 404.
- `GET /api/customer/reorder-options` with no orders gives `{"options":[]}`.
- Insert one past `delivered` order for the test customer from a store with a known dish via SQL using `set session_replication_role = replica;` (no n8n webhook, no email), then `POST /api/customer/orders/<id>/reorder` returns lines and today's prices; a second customer's token gets 404 on the same id; set that dish `is_available=false` and see it in `skipped`; set the store `is_open=false` and see 409; restore both.

Expected: all as described. Report any deviation; do not continue until fixed.

- [ ] **Step 8: Commit**

```bash
git add lib/customer-auth.ts app/api/customer
git commit -m "feat(c3): favorites, reorder-options and reorder API routes"
```

---

### Task 5: Web favorites (provider, heart, store page, card)

**Files:**
- Create: `lib/customer-api.ts`, `lib/favorites-store.tsx`, `components/FavoriteHeart.tsx`
- Modify: `app/customer/layout.tsx`, `components/RestaurantCard.tsx`, `app/customer/stores/[id]/page.tsx`

**Interfaces:**
- Consumes: `useSession()` from `@/lib/auth`; `supabase` from `@/lib/supabase`; `FAVORITES_PATH` from `@/lib/favorites-model`.
- Produces: `customerFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>` (throws `Error` with the API message); `FavoritesProvider`; `useFavorites(): { ids: Set<string>; loaded: boolean; isFavorite(id: string): boolean; toggle(id: string): Promise<"login" | "ok" | "failed"> }`; `<FavoriteHeart storeId className? />`.

- [ ] **Step 1: `lib/customer-api.ts`**

```ts
"use client";

import { supabase } from "@/lib/supabase";

export async function customerFetch<T>(
  path: string,
  init: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown } = {}
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}
```

- [ ] **Step 2: `lib/favorites-store.tsx`**

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "@/lib/auth";
import { customerFetch } from "@/lib/customer-api";
import { FAVORITES_PATH } from "@/lib/favorites-model";

type FavoritesValue = {
  ids: Set<string>;
  loaded: boolean;
  isFavorite: (storeId: string) => boolean;
  toggle: (storeId: string) => Promise<"login" | "ok" | "failed">;
};

const FavoritesContext = createContext<FavoritesValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { userId, loading } = useSession();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    if (loading) return;
    // Sign-out or account switch: drop the previous account's hearts before anything renders them.
    setIds(new Set());
    setLoaded(false);
    if (!userId) return;
    let cancelled = false;
    customerFetch<{ storeIds: string[] }>(FAVORITES_PATH)
      .then((res) => {
        if (cancelled) return;
        setIds(new Set(res.storeIds));
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, loading]);

  const toggle = useCallback(
    async (storeId: string): Promise<"login" | "ok" | "failed"> => {
      if (!userId) return "login";
      const wasFavorite = idsRef.current.has(storeId);
      const apply = (on: boolean) =>
        setIds((prev) => {
          const next = new Set(prev);
          if (on) next.add(storeId);
          else next.delete(storeId);
          return next;
        });
      apply(!wasFavorite);
      try {
        await customerFetch(`${FAVORITES_PATH}/${storeId}`, { method: wasFavorite ? "DELETE" : "PUT" });
        return "ok";
      } catch {
        apply(wasFavorite);
        return "failed";
      }
    },
    [userId]
  );

  return (
    <FavoritesContext.Provider value={{ ids, loaded, isFavorite: (id) => ids.has(id), toggle }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesValue {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("useFavorites must be used inside FavoritesProvider");
  return value;
}
```

- [ ] **Step 3: `components/FavoriteHeart.tsx`**

```tsx
"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useFavorites } from "@/lib/favorites-store";

export function FavoriteHeart({ storeId, className = "" }: { storeId: string; className?: string }) {
  const { isFavorite, toggle } = useFavorites();
  const router = useRouter();
  const pathname = usePathname();
  const [failed, setFailed] = useState(false);
  const on = isFavorite(storeId);

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove from favorites" : "Add to favorites"}
      title={failed ? "Could not update favorite" : undefined}
      className={`flex h-8 w-8 items-center justify-center rounded-full bg-brand-surface text-lg shadow ${className}`}
      onClick={async (event) => {
        // The card is wrapped in a Link; the heart must never navigate.
        event.preventDefault();
        event.stopPropagation();
        const result = await toggle(storeId);
        if (result === "login") router.push(`/customer/login?redirectTo=${encodeURIComponent(pathname)}`);
        setFailed(result === "failed");
      }}
    >
      <span className={on ? "text-brand-danger-text-safe" : "text-brand-ink"}>{on ? "♥" : "♡"}</span>
    </button>
  );
}
```

The login page validates `redirectTo` with `new URL(...).origin` already (project rule); do not reimplement. Confirm the token `brand-danger-text-safe` exists in `app/globals.css`; if not, use `text-red-600`.

- [ ] **Step 4: Mount the provider** in `app/customer/layout.tsx`: import `FavoritesProvider` and wrap inside `AddressProvider`, outside `CartProvider`:

```tsx
    <AddressProvider>
      <FavoritesProvider>
        <CartProvider>
          ...unchanged...
        </CartProvider>
      </FavoritesProvider>
    </AddressProvider>
```

- [ ] **Step 5: Heart on the card.** In `components/RestaurantCard.tsx` add `import { FavoriteHeart } from "@/components/FavoriteHeart";` and, inside the `relative h-40` image div (after the image/fallback block), add:

```tsx
        <FavoriteHeart storeId={restaurant.id} className="absolute right-2 top-2" />
```

- [ ] **Step 6: Heart on the store page.** In `app/customer/stores/[id]/page.tsx` import `FavoriteHeart`, and in the banner overlay row replace the `<span ...>⭐ ...</span>` sibling context by adding the heart next to it:

```tsx
          <div className="flex shrink-0 items-center gap-2">
            <FavoriteHeart storeId={restaurant.id} />
            <span className="shrink-0 rounded-[var(--radius-card)] bg-brand-surface px-3 py-1.5 text-sm font-semibold text-brand-ink">
              ⭐ {restaurant.rating.toFixed(1)}
            </span>
          </div>
```

- [ ] **Step 7: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean (existing lint warnings unchanged).

- [ ] **Step 8: Live check in Chrome** (production build: `node scripts/start.mjs --skip-mobile`)

Signed out on `/customer`: tap a heart; expect redirect to login, no favorite saved. Sign in; tap heart on a card; it fills; reload the page; it is still filled; open the store page; header heart is filled; tap it off; reload; card heart empty. Check `select * from favorite_stores` agrees. Sign out and sign in as another customer: no hearts. Take a screenshot of the card grid and the store header.
Expected: all pass. Record results.

- [ ] **Step 9: Commit**

```bash
git add lib/customer-api.ts lib/favorites-store.tsx components/FavoriteHeart.tsx app/customer/layout.tsx components/RestaurantCard.tsx "app/customer/stores/[id]/page.tsx"
git commit -m "feat(c3): web favorites hearts on cards and store page"
```

---

### Task 6: Web Home (Order again, Favorites chip) and Reorder buttons

**Files:**
- Create: `lib/use-reorder.ts`
- Modify: `app/customer/page.tsx`, `app/customer/orders/page.tsx`, `app/customer/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `useCart()` (`addItems`, `storeId`, `storeName`, `items`) from `@/lib/cart-store`; `customerFetch`; `reorderPath`, `REORDER_OPTIONS_PATH`, `reorderNotice`, `isReorderBusy`, `ReorderOption`, `ReorderResponse` from `@/lib/favorites-model`; `useFavorites`.
- Produces: `useReorder(): { busyOrderId: string | null; notice: string | null; error: string | null; reorder(orderId: string): Promise<void>; clearMessages(): void }`.

- [ ] **Step 1: `lib/use-reorder.ts`**

```ts
"use client";

import { useRef, useState } from "react";
import { useCart } from "@/lib/cart-store";
import { customerFetch } from "@/lib/customer-api";
import { isReorderBusy, reorderNotice, reorderPath, type ReorderResponse } from "@/lib/favorites-model";

export function useReorder() {
  const cart = useCart();
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The ref blocks a double tap in the same tick, before state has re-rendered.
  const busyRef = useRef<string | null>(null);

  async function reorder(orderId: string) {
    if (isReorderBusy(busyRef.current, orderId)) return;
    busyRef.current = orderId;
    setBusyOrderId(orderId);
    setNotice(null);
    setError(null);
    try {
      const result = await customerFetch<ReorderResponse>(reorderPath(orderId), { method: "POST" });
      const replacing = cart.storeId !== null && cart.storeId !== result.storeId && cart.items.length > 0;
      const replaced = replacing
        ? { count: cart.items.reduce((sum, line) => sum + line.quantity, 0), storeName: cart.storeName }
        : null;
      cart.addItems(result.storeId, result.storeName, result.lines, replacing);
      setNotice(reorderNotice({ storeName: result.storeName, added: result.lines.length, skipped: result.skipped, replaced }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder");
    } finally {
      busyRef.current = null;
      setBusyOrderId(null);
    }
  }

  return { busyOrderId, notice, error, reorder, clearMessages: () => { setNotice(null); setError(null); } };
}
```

When the cart is empty or the same store, `replace` is false and `addItems` merges quantities into the existing lines of that store, which is the same behaviour Zippy's reorder card has.

- [ ] **Step 2: Home - Order again row and Favorites chip.** In `app/customer/page.tsx`:

Add imports:

```tsx
import { useFavorites } from "@/lib/favorites-store";
import { useReorder } from "@/lib/use-reorder";
import { customerFetch } from "@/lib/customer-api";
import { REORDER_OPTIONS_PATH, type ReorderOption } from "@/lib/favorites-model";
import { useSession } from "@/lib/auth";
```

Inside `CustomerHomeContent`, before the early returns, add state and an effect:

```tsx
  const { userId } = useSession();
  const { ids: favoriteIds } = useFavorites();
  const { busyOrderId, notice, error: reorderError, reorder } = useReorder();
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [reorderOptions, setReorderOptions] = useState<ReorderOption[]>([]);

  useEffect(() => {
    if (!userId) {
      setReorderOptions([]);
      return;
    }
    let cancelled = false;
    customerFetch<{ options: ReorderOption[] }>(REORDER_OPTIONS_PATH)
      .then((res) => {
        if (!cancelled) setReorderOptions(res.options);
      })
      .catch(() => {
        if (!cancelled) setReorderOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
```

(Hooks must stay above the `if (error)` / `if (restaurants === null)` early returns, matching the existing hook order.)

Apply the filter by changing the `searched` definition so every downstream view narrows, as the "Under 30" filter does:

```tsx
  const searched = withDistance.filter(
    ({ r }) =>
      matchesQuery(r) &&
      (!under30 || r.avg_prep_minutes < 30) &&
      (!favoritesOnly || favoriteIds.has(r.id))
  );
```

The existing empty-state paragraph for `searched.length === 0` needs a Favorites branch: add before the `under30` check inside that paragraph:

```tsx
          {favoritesOnly ? (
            "You have no favorite stores here yet. Tap the heart on a store to add one."
          ) : under30 ? (
```
and close the extra ternary level accordingly.

Add UI above `<CategoryIconRow .../>`'s sibling chips (just before the `CuisineChipRow` block), and the Order again row after `PromoBanner`:

```tsx
      {reorderOptions.length > 0 && (
        <section aria-label="Order again">
          <h2 className="mb-2 font-heading text-lg text-brand-ink">Order again</h2>
          {notice && <p className="mb-2 text-sm text-brand-ink-muted" role="status">{notice}</p>}
          {reorderError && <p className="mb-2 text-sm text-red-600" role="alert">{reorderError}</p>}
          <div className="flex gap-3 overflow-x-auto pb-2">
            {reorderOptions.map((option) => (
              <div key={option.storeId} className="flex w-56 shrink-0 flex-col gap-2 rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-surface p-3">
                <Link href={`/customer/stores/${option.storeId}`} className="font-semibold text-brand-ink">{option.storeName}</Link>
                {!option.isOpen && <p className="text-xs text-brand-ink-muted">Closed right now</p>}
                <button
                  type="button"
                  disabled={busyOrderId !== null || !option.isOpen}
                  onClick={() => reorder(option.lastOrderId)}
                  className="rounded-[var(--radius-pill)] bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busyOrderId === option.lastOrderId ? "Adding…" : "Reorder"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
```
(add `import Link from "next/link";`)

and the chip, placed just above `CuisineChipRow`:

```tsx
      {userId && (
        <div>
          <button
            type="button"
            aria-pressed={favoritesOnly}
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`rounded-[var(--radius-pill)] border px-4 py-1.5 text-sm font-semibold ${favoritesOnly ? "border-brand-primary bg-brand-primary text-white" : "border-brand-ink-muted/20 bg-brand-surface text-brand-ink"}`}
          >
            ♥ Favorites
          </button>
        </div>
      )}
```

- [ ] **Step 3: Orders list Reorder button.** In `app/customer/orders/page.tsx` add `import { useReorder } from "@/lib/use-reorder";`, call `const { busyOrderId, notice, error: reorderError, reorder } = useReorder();`, show `notice`/`reorderError` under the heading, and add inside each order's card, after the second flex row:

```tsx
            {order.status !== "cancelled" && order.status !== "rejected" && (
              <button
                type="button"
                disabled={busyOrderId !== null}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  reorder(order.id);
                }}
                className="self-start rounded-[var(--radius-pill)] border border-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary-text-safe disabled:opacity-50"
              >
                {busyOrderId === order.id ? "Adding…" : "Reorder"}
              </button>
            )}
```

`useReorder` uses `useCart`, which needs `CartProvider`; orders page is under `app/customer/layout.tsx`, so it is available.

- [ ] **Step 4: Order detail Reorder button.** In `app/customer/orders/[id]/page.tsx` call `useReorder()` (hooks above the early returns), and add, right after `<OrderDetailView order={order} />`:

```tsx
            {order.status !== "cancelled" && order.status !== "rejected" && (
              <div>
                {notice && <p className="mb-2 text-sm text-brand-ink-muted" role="status">{notice}</p>}
                {reorderError && <p className="mb-2 text-sm text-red-600" role="alert">{reorderError}</p>}
                <button
                  type="button"
                  disabled={busyOrderId !== null}
                  onClick={() => reorder(order.id)}
                  className="rounded-[var(--radius-pill)] bg-brand-primary px-5 py-2 font-semibold text-white disabled:opacity-50"
                >
                  {busyOrderId === order.id ? "Adding…" : "Reorder"}
                </button>
              </div>
            )}
```

The order page polls every 3 s; `useReorder` state is independent of that, so the notice survives re-renders.

- [ ] **Step 5: Type-check, lint, build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 6: Live check in Chrome** (production build; one customer with 2 delivered orders from different stores, inserted via SQL with `session_replication_role = replica`)

1. Home shows "Order again" with up to 3 stores, newest first; a cancelled-only store is absent.
2. Tap Reorder: the cart sidebar fills at today's prices; the notice reads "Added N items from X to your cart." Change a dish price in SQL, reorder again: new price. Mark a dish unavailable: notice lists "Skipped: ... (unavailable now)".
3. Cart holds store A; reorder store B: cart now only B items, notice says "Replaced the N items from A", and no "clear cart?" modal appears.
4. Double click Reorder quickly: quantities increase once (check cart).
5. Close the store (`is_open=false`): button disabled on Home; on the orders page the click shows the error "... is closed right now".
6. Favorites chip: with one hearted store, only that store shows; with none, the empty message shows; chip hidden when signed out.
7. Orders list and order detail Reorder work; cancelled order has no button.
Expected: all pass. Capture screenshots for the manual (Home Order again row, orders page with button, favorites chip active).

- [ ] **Step 7: Commit**

```bash
git add lib/use-reorder.ts app/customer/page.tsx app/customer/orders/page.tsx "app/customer/orders/[id]/page.tsx"
git commit -m "feat(c3): web Order again row, Favorites chip and Reorder buttons"
```

---

### Task 7: Phone favorites (provider, hearts)

**Files:**
- Create: `mobile/lib/favorites-store.tsx`
- Modify: `mobile/src/app/_layout.tsx`, `mobile/components/StoreCard.tsx`, `mobile/src/app/customer/store/[id].tsx`

**Interfaces:**
- Consumes: `apiFetch` from `mobile/lib/api.ts`; `supabase` from `mobile/lib/supabase`; `FAVORITES_PATH` from `mobile/lib/favorites-model`.
- Produces: `FavoritesProvider`, `useFavorites(): { ids: Set<string>; isFavorite(id: string): boolean; toggle(id: string): Promise<"ok" | "failed"> }`.

- [ ] **Step 1: `mobile/lib/favorites-store.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "./supabase";
import { apiFetch } from "./api";
import { FAVORITES_PATH } from "./favorites-model";

type FavoritesValue = {
  ids: Set<string>;
  isFavorite: (storeId: string) => boolean;
  toggle: (storeId: string) => Promise<"ok" | "failed">;
};

const FavoritesContext = createContext<FavoritesValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [ids, setIds] = useState<Set<string>>(new Set());
  const idsRef = useRef(ids);
  idsRef.current = ids;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setUserId(session?.user.id ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Account switch or sign-out: never show the previous account's hearts.
    setIds(new Set());
    if (!userId) return;
    let cancelled = false;
    apiFetch<{ storeIds: string[] }>(FAVORITES_PATH)
      .then((res) => {
        if (!cancelled) setIds(new Set(res.storeIds));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const toggle = useCallback(async (storeId: string): Promise<"ok" | "failed"> => {
    const wasFavorite = idsRef.current.has(storeId);
    const apply = (on: boolean) =>
      setIds((prev) => {
        const next = new Set(prev);
        if (on) next.add(storeId);
        else next.delete(storeId);
        return next;
      });
    apply(!wasFavorite);
    try {
      await apiFetch(`${FAVORITES_PATH}/${storeId}`, { method: wasFavorite ? "DELETE" : "PUT" });
      return "ok";
    } catch {
      apply(wasFavorite);
      return "failed";
    }
  }, []);

  return (
    <FavoritesContext.Provider value={{ ids, isFavorite: (id) => ids.has(id), toggle }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesValue {
  const value = useContext(FavoritesContext);
  if (!value) throw new Error("useFavorites must be used inside FavoritesProvider");
  return value;
}
```

- [ ] **Step 2: Mount it** in `mobile/src/app/_layout.tsx`: import `FavoritesProvider` from `../../lib/favorites-store` and wrap between `CartProvider` and `LocationProvider`:

```tsx
    <CartProvider>
      <FavoritesProvider>
        <LocationProvider>
          ...unchanged...
        </LocationProvider>
      </FavoritesProvider>
    </CartProvider>
```

- [ ] **Step 3: Real heart in `mobile/components/StoreCard.tsx`.** Remove `useState` import and the `favorited` state; add `import { useFavorites } from "../lib/favorites-store";`, then `const { isFavorite, toggle } = useFavorites(); const favorited = isFavorite(store.id);` and change the heart `onPress` to `onPress={(e) => { e.stopPropagation(); void toggle(store.id); }}`. Update the comment above the component to say hearts are saved on the account.

- [ ] **Step 4: Real heart in `mobile/src/app/customer/store/[id].tsx`.** Remove `const [isFavorite, setIsFavorite] = useState(false);...` and add `const { isFavorite, toggle } = useFavorites();` (import from `../../../../lib/favorites-store`; verify the relative depth against that file's other `lib` imports). Change the chip: `onPress={() => void toggle(store.id)}` and `{isFavorite(store.id) ? "♥" : "♡"}`.

- [ ] **Step 5: Type-check the phone app**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Check on the Android emulator** (`.\scripts\start-emulator.ps1 -OpenApp`, Metro running)

Sign in, heart a store card on Home and the store header; fully close and reopen the app (swipe away Expo Go, relaunch); the hearts persist. Cross-check on web (same account): same stores hearted. Sign out and into another account: no hearts.
Expected: pass. Screenshot via `adb exec-out screencap -p`.

- [ ] **Step 7: Commit**

```bash
git add mobile/lib/favorites-store.tsx mobile/src/app/_layout.tsx mobile/components/StoreCard.tsx "mobile/src/app/customer/store/[id].tsx"
git commit -m "feat(c3): phone favorites saved on the account"
```

---

### Task 8: Phone Order again and Reorder buttons

**Files:**
- Create: `mobile/lib/use-reorder.ts`
- Modify: `mobile/src/app/customer/(tabs)/home.tsx`, `mobile/src/app/customer/(tabs)/orders.tsx`, `mobile/src/app/customer/orders/[id].tsx`

**Interfaces:**
- Consumes: `apiFetch`; `useCart()` (`addItems`, `storeId`, `storeName`, `items`) from `mobile/lib/cart-store`; `reorderPath`, `REORDER_OPTIONS_PATH`, `reorderNotice`, `isReorderBusy`, `ReorderOption`, `ReorderResponse` from `mobile/lib/favorites-model`; `useFavorites`.
- Produces: `useReorder()` with the same shape as the web hook.

- [ ] **Step 1: `mobile/lib/use-reorder.ts`**

```ts
import { useRef, useState } from "react";
import { useCart } from "./cart-store";
import { apiFetch } from "./api";
import { isReorderBusy, reorderNotice, reorderPath, type ReorderResponse } from "./favorites-model";

export function useReorder() {
  const cart = useCart();
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef<string | null>(null);

  async function reorder(orderId: string) {
    if (isReorderBusy(busyRef.current, orderId)) return;
    busyRef.current = orderId;
    setBusyOrderId(orderId);
    setNotice(null);
    setError(null);
    try {
      const result = await apiFetch<ReorderResponse>(reorderPath(orderId), { method: "POST" });
      const replacing = cart.storeId !== null && cart.storeId !== result.storeId && cart.items.length > 0;
      const replaced = replacing
        ? { count: cart.items.reduce((sum, line) => sum + line.quantity, 0), storeName: cart.storeName }
        : null;
      cart.addItems(result.storeId, result.storeName, result.lines, replacing);
      setNotice(reorderNotice({ storeName: result.storeName, added: result.lines.length, skipped: result.skipped, replaced }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder");
    } finally {
      busyRef.current = null;
      setBusyOrderId(null);
    }
  }

  return { busyOrderId, notice, error, reorder };
}
```

- [ ] **Step 2: Home - feed the existing "Order again" row from the API and make Reorder real.** In `mobile/src/app/customer/(tabs)/home.tsx`:

Replace the direct `orders` query block inside `load` (from `const userId = sessionRes.data.session?.user.id;` through the `setReorderStores([])` else branch) with:

```tsx
    if (sessionRes.data.session) {
      try {
        const res = await apiFetch<{ options: ReorderOption[] }>(REORDER_OPTIONS_PATH);
        setReorderStores(res.options);
      } catch {
        setReorderStores([]);
      }
    } else {
      setReorderStores([]);
    }
```

Change the type `ReorderStore` to `ReorderOption` (delete the local type; import `ReorderOption`, `REORDER_OPTIONS_PATH` from `../../../../lib/favorites-model` and `apiFetch` from `../../../../lib/api`), update `useState<ReorderOption[] | null>`. In the FlatList, use `keyExtractor={(s) => \`reorder-${s.storeId}\`}`, `item.imageUrl`, `item.storeName`, and change the button:

```tsx
                    <Pressable
                      style={[styles.reorderButton, (busyOrderId !== null || !item.isOpen) && { opacity: 0.5 }]}
                      disabled={busyOrderId !== null || !item.isOpen}
                      onPress={() => reorder(item.lastOrderId)}
                    >
                      <Text style={styles.reorderButtonText}>
                        {busyOrderId === item.lastOrderId ? "Adding…" : item.isOpen ? "Reorder" : "Closed"}
                      </Text>
                    </Pressable>
```

Tapping the card image or name should still open the store: wrap image and name in a `Pressable onPress={() => router.push(\`/customer/store/${item.storeId}\`)}`.

Add `const { busyOrderId, notice, error: reorderError, reorder } = useReorder();` and render, under the "Order again" heading:

```tsx
              {notice && <Text style={styles.reorderNotice}>{notice}</Text>}
              {reorderError && <Text style={styles.errorText}>{reorderError}</Text>}
```

with style `reorderNotice: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted, paddingHorizontal: 16 }` (match the file's existing section padding).

Favorites chip: add `const { ids: favoriteIds } = useFavorites();` and `const [favoritesOnly, setFavoritesOnly] = useState(false);`; in the `matching` filter add `if (favoritesOnly && !favoriteIds.has(s.id)) return false;` and add `favoritesOnly, favoriteIds` to the `filtered` memo dependency list. Render a chip before the cuisine FlatList:

```tsx
        <Pressable
          onPress={() => setFavoritesOnly((v) => !v)}
          style={[styles.favoritesChip, favoritesOnly && styles.favoritesChipActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: favoritesOnly }}
        >
          <Ionicons name={favoritesOnly ? "heart" : "heart-outline"} size={14} color={favoritesOnly ? BRAND.colors.surface : BRAND.colors.ink} />
          <Text style={[styles.chipLabel, favoritesOnly && styles.chipLabelActive]}>Favorites</Text>
        </Pressable>
```

with styles `favoritesChip: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: BRAND.colors.inkMuted + "33", backgroundColor: BRAND.colors.surface }` and `favoritesChipActive: { backgroundColor: BRAND.colors.primary, borderColor: BRAND.colors.primary }`. The empty-state text for no matches gains: `favoritesOnly ? "No favorite stores here yet. Tap the heart on a store." : ...` ahead of the existing query message.

- [ ] **Step 3: Orders tab and order detail.** In `(tabs)/orders.tsx` add `const { busyOrderId, notice, error: reorderError, reorder } = useReorder();`, show notice/error under the heading, and add to each card (after `bottomRow`) a button hidden for cancelled/rejected:

```tsx
              {item.status !== "cancelled" && item.status !== "rejected" && (
                <Pressable
                  style={[styles.reorderButton, busyOrderId !== null && { opacity: 0.5 }]}
                  disabled={busyOrderId !== null}
                  onPress={() => reorder(item.id)}
                >
                  <Text style={styles.reorderButtonText}>{busyOrderId === item.id ? "Adding…" : "Reorder"}</Text>
                </Pressable>
              )}
```

(add `reorderButton: { alignSelf: "flex-start", borderWidth: 1, borderColor: BRAND.colors.primary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6 }` and `reorderButtonText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.primaryTextSafe }`). Do the same in `orders/[id].tsx` under the status/ETA text, using the same hook and styles.

Pressables inside a Pressable card: the inner button handles its own press and does not trigger the card's `onPress` (React Native gives the innermost touchable the event).

- [ ] **Step 4: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Android emulator check**

Home shows "Order again" fed by the API (same stores as web); tapping Reorder fills the cart (Cart tab shows the lines) with a notice; cross-store reorder replaces with a notice and no modal; a double tap adds once; Favorites chip filters; Orders tab and order detail Reorder work; a closed store shows "Closed" disabled.
Expected: pass. Screenshot each for the manual.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/use-reorder.ts "mobile/src/app/customer/(tabs)/home.tsx" "mobile/src/app/customer/(tabs)/orders.tsx" "mobile/src/app/customer/orders/[id].tsx"
git commit -m "feat(c3): phone Order again and one-tap Reorder"
```

---

### Task 9: Knowledge, docs, manuals and final verification

**Files:**
- Modify: `knowledge/customer/ordering-web.md`, `knowledge/customer/ordering-mobile.md`, `CLAUDE.md`, `MEMORY.md`, `README.md` (migration list/test count if mentioned), `docs/User_Manual.docx`, `docs/Mobile_App_User_Manual.docx` (in place with python-docx; renumber the static TOC if a chapter start page moves; regenerate the PDFs)

- [ ] **Step 1: Knowledge Q&As** (fact-checked against the code just built): add to `ordering-web.md` and `ordering-mobile.md` short Q&As: "How do I save a favorite store?" (tap the heart on a store card or store page; signed in; syncs between the website and the phone), "How do I see my favorites?" (Favorites chip on Home), "How do I order the same thing again?" (Order again on Home, or Reorder on Your orders / an order; today's prices; unavailable dishes are skipped and listed; a closed store cannot be reordered; reordering from another store replaces the cart and says so; Reorder does not place the order, go to Checkout). Match the file's existing heading style.

- [ ] **Step 2: Full automated verification**

Run: `node --test tests/*.test.mjs && npx tsc --noEmit && (cd mobile && npx tsc --noEmit) && npm run lint && npm run build`
Expected: all green; report the passing test count.

- [ ] **Step 3: Whole-flow regression in Chrome:** Zippy "reorder my last order" card still works (Task 3 refactor); checkout still places an order for a reordered cart (use a Vishal-owned email, one order, ask first - Gmail nodes are live).

- [ ] **Step 4: Manuals and project memory:** edit both manuals in place (new "Favorites and Reorder" subsections with the screenshots from Tasks 6 and 8, personal data blurred), convert to PDF, re-read each chapter's start page and renumber the static TOC lines; update `CLAUDE.md` (new C3 paragraph: tables/routes/files, the byte-identical `favorites-model`, lessons found live) and `MEMORY.md` per the "Update CLAUDE files" rule; note the "Reset Data" cascade for `favorite_stores`.

- [ ] **Step 5: Re-ingest knowledge after merge** (needs `N8N_INTERNAL_SECRET`; Vishal runs it or provides the shell): POST the n8n webhook `foodhub/zippy-ingest`, then `node scripts/zippy-eval.mjs` and record the score.

- [ ] **Step 6: Commit** (docs and knowledge) and report to Vishal; merging to `main` and pushing need his approval.

```bash
git add knowledge CLAUDE.md MEMORY.md README.md docs/User_Manual.docx docs/User_Manual.pdf docs/Mobile_App_User_Manual.docx docs/Mobile_App_User_Manual.pdf
git commit -m "docs(c3): favorites and reorder in knowledge, manuals and project memory"
```

---

## Self-Review (done)

- **Spec coverage:** table (T1), favorites/reorder-options/reorder API (T4), shared `buildReorderLines` (T3), web hearts/Home/Favorites chip/Reorder (T5-6), phone hearts/Order again/Reorder (T7-8), Zippy knowledge, manuals, Reset Data note, tests and live checks (T9). Vendor/Delivery/Admin/n8n: none, as the spec states. Phone "Order again" corrected from "new" to "upgrade existing".
- **Placeholders:** none; the two "verify against the repo" notes (Next `params` typing, `brand-danger-text-safe` token, `GetMyOrderInput` fields, relative import depth) name the exact file to copy from.
- **Type consistency:** `ReorderOption`, `ReorderResponse`, `ReorderLine`, `pickReorderStores`, `reorderNotice`, `isReorderBusy`, `reorderPath`, `REORDER_OPTIONS_PATH`, `FAVORITES_PATH` are defined once in Task 2 and used with those exact names in Tasks 4-8. `ReorderLine` is structurally the cart's `NewCartItem` (no `lineId`), so `addItems` accepts it.
- **Review Focus coverage:** each line has an owning test or live check (T2, T3, T4, T5, T6).
