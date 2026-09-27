# Account-Scoped Cart Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Anonymous customer carts no longer survive a page reload; logged-in customer carts persist server-side and follow the account across browsers/devices.

**Architecture:** A new owner-RLS-scoped `carts` table holds one row per customer. `GET`/`PUT /api/cart` load and save it. `lib/cart-store.tsx` drops all `localStorage` use, tracks the Supabase session via the existing `useSession()` hook, and switches between in-memory-only state (logged out) and server-synced state (logged in), including the login-time load/merge rule and a debounced save on every mutation.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (Postgres + Auth), existing `lib/auth.ts`'s `useSession()` hook.

**Spec:** `docs/superpowers/specs/2026-09-27-account-scoped-cart-persistence-design.md`

## Global Constraints

- `carts` RLS is owner-scoped (`auth.uid() = user_id`) on all four operations — this table is written directly by the client, unlike vendor/admin tables which route through service-role API routes. Do not add a service-role-only policy pattern here; it would block the legitimate client writes this feature needs.
- No change to `CartItem`, `SelectedOption`, `buildLineId`, the single-restaurant conflict-dialog rule (`pendingConflict`/`confirmClearAndAdd`/`cancelPendingAdd`), or checkout — only the persistence layer moves.
- Run `npm run build` (not just `tsc --noEmit`) before any task is marked done.
- API routes authenticate via `Authorization: Bearer <token>` + `supabaseServer.auth.getUser(token)`, the same pattern already used in `app/api/cart/checkout/route.ts` — never trust a client-supplied user id.

## Review Focus

- Logging out must clear the in-memory cart immediately in the UI — a customer who logs out on a shared computer must not leave their cart visible to the next person.
- The login-time merge rule must actually distinguish "no row exists yet" from "row exists with an empty cart" (both are valid states) — an empty `{ cart: null }` response and an empty `{ cart: { items: [] } }` response must be handled differently per the spec (first triggers "save my in-progress cart"; second is a real saved empty cart, so it should NOT be overwritten with an in-progress cart the same way as the null case — though since it's empty either way, the practical effect is identical for a first save, this matters for interpreting response shapes correctly, not just behavior).
- A logged-in user's rapid quantity +/- clicks must not flood the API — the debounce must actually coalesce them into one request, not fire one per click.
- `PUT /api/cart` must reject a request whose bearer token doesn't resolve to a valid user (expired/garbage token) with 401, not silently write to nobody's row or crash.
- Switching accounts in the same tab (log out, log in as a different customer) must not show the previous account's cart even momentarily — the in-memory clear on logout (first bullet) is what prevents this, but verify it live with two distinct seeded customers, not just one.

---

## Task 1: `carts` table + RLS migration

**Files:**
- Create: `supabase/migrations/00000000000022_carts.sql`

**Interfaces:**
- Produces: `public.carts` table with columns `user_id uuid primary key`, `store_id uuid`, `store_name text`, `items jsonb not null default '[]'`, `order_note text not null default ''`, `updated_at timestamptz not null default now()`.

- [ ] **Step 1: Write the migration**

```sql
create table public.carts (
  user_id uuid primary key references public.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  store_name text,
  items jsonb not null default '[]'::jsonb,
  order_note text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.carts enable row level security;

create policy "customer_can_read_own_cart" on public.carts
  for select using (auth.uid() = user_id);

create policy "customer_can_insert_own_cart" on public.carts
  for insert with check (auth.uid() = user_id);

create policy "customer_can_update_own_cart" on public.carts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "customer_can_delete_own_cart" on public.carts
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Reset the local DB and confirm the migration applies cleanly**

```bash
npx supabase db reset
```

Expected: completes with no errors, and `carts` appears in the schema.

- [ ] **Step 3: Confirm RLS actually restricts access — verify live with psql, not just by reading the policy SQL**

```bash
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select tablename, policyname, cmd from pg_policies where tablename = 'carts';"
```

Expected: 4 rows (select/insert/update/delete), each with `auth.uid() = user_id` in its qual/with_check (visible via `\d+` or a `pg_policies` column if you want to inspect further — the row count and cmd list is the main check here).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00000000000022_carts.sql
git commit -m "feat: add carts table with owner-scoped RLS"
```

---

## Task 2: `GET`/`PUT /api/cart` routes

**Files:**
- Create: `app/api/cart/route.ts`

**Interfaces:**
- Produces: `GET /api/cart` → `{ cart: null }` or `{ cart: { storeId: string | null, storeName: string | null, items: CartItem[], orderNote: string } }`.
- Produces: `PUT /api/cart` (body: `{ storeId: string | null, storeName: string | null, items: CartItem[], orderNote: string }`) → `{ cart: <same shape as GET> }` on success.
- Consumes: `supabaseServer` from `@/lib/supabase-server` (existing, unmodified).

- [ ] **Step 1: Write the route file**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

async function resolveUserId(request: NextRequest): Promise<{ userId: string } | { error: string; status: number }> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: "Missing Authorization header", status: 401 };
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return { error: "Invalid or expired session", status: 401 };
  }
  return { userId: userData.user.id };
}

export async function GET(request: NextRequest) {
  const resolved = await resolveUserId(request);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { data, error } = await supabaseServer
    .from("carts")
    .select("store_id, store_name, items, order_note")
    .eq("user_id", resolved.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load cart" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ cart: null });
  }
  return NextResponse.json({
    cart: {
      storeId: data.store_id,
      storeName: data.store_name,
      items: data.items,
      orderNote: data.order_note,
    },
  });
}

export async function PUT(request: NextRequest) {
  const resolved = await resolveUserId(request);
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    !Array.isArray(body.items) ||
    typeof body.orderNote !== "string" ||
    !(body.storeId === null || typeof body.storeId === "string") ||
    !(body.storeName === null || typeof body.storeName === "string")
  ) {
    return NextResponse.json({ error: "Invalid cart payload" }, { status: 400 });
  }

  const { error } = await supabaseServer.from("carts").upsert({
    user_id: resolved.userId,
    store_id: body.storeId,
    store_name: body.storeName,
    items: body.items,
    order_note: body.orderNote,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: "Failed to save cart" }, { status: 500 });
  }

  return NextResponse.json({
    cart: { storeId: body.storeId, storeName: body.storeName, items: body.items, orderNote: body.orderNote },
  });
}
```

- [ ] **Step 2: Manual verification with curl (no automated test suite in this project)**

```bash
npm run build
npm run dev
```

Sign in as a seeded customer via the browser, open dev tools, run
`(await window.supabase?.auth.getSession())?.data.session?.access_token`
in the console if `supabase` is exposed globally, or grab the token from
the Network tab of any authenticated request — then:

```bash
TOKEN="<paste token>"
curl -s http://localhost:3000/api/cart -H "Authorization: Bearer $TOKEN"
```

Expected: `{"cart":null}` for a fresh account.

```bash
curl -s -X PUT http://localhost:3000/api/cart \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"storeId":null,"storeName":null,"items":[],"orderNote":""}'
curl -s http://localhost:3000/api/cart -H "Authorization: Bearer $TOKEN"
```

Expected: PUT returns the same empty cart shape, and the follow-up GET
now returns `{"cart":{"storeId":null,"storeName":null,"items":[],"orderNote":""}}`
(a real saved empty cart — the `carts` row now exists) instead of
`{"cart":null}`.

Also confirm a request with no `Authorization` header, and one with a
garbage token, both return 401:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cart
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/cart -H "Authorization: Bearer garbage"
```

Expected: both `401`.

- [ ] **Step 3: Commit**

```bash
git add app/api/cart/route.ts
git commit -m "feat: add GET/PUT /api/cart routes for server-side cart persistence"
```

---

## Task 3: Rewrite `lib/cart-store.tsx`

**Files:**
- Modify: `lib/cart-store.tsx` (full rewrite of the persistence logic; `CartItem`/`SelectedOption`/`buildLineId`/the context shape and all mutation function signatures stay the same)

**Interfaces:**
- Consumes: `useSession()` from `@/lib/auth` (existing, unmodified) — returns `{ userId: string | null, loading: boolean }`.
- Consumes: `supabase` from `@/lib/supabase` (existing client, for `getSession()` to read the access token before calling `/api/cart`).
- Produces: same `CartContextValue` shape as today (no consumer of `useCart()` needs to change) — `storeId`, `storeName`, `items`, `subtotal`, `orderNote`, `pendingConflict`, `addItem`, `updateQuantity`, `removeItem`, `setSpecialInstructions`, `setOrderNote`, `clearCart`, `confirmClearAndAdd`, `cancelPendingAdd`.

- [ ] **Step 1: Rewrite `lib/cart-store.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/auth";

export type SelectedOption = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDeltaPaise: number;
};

export type CartItem = {
  lineId: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  selectedOptions: SelectedOption[];
  specialInstructions: string | null;
};

type NewCartItem = Omit<CartItem, "lineId">;

type PendingConflict = {
  storeId: string;
  storeName: string;
  item: NewCartItem;
} | null;

type CartContextValue = {
  storeId: string | null;
  storeName: string | null;
  items: CartItem[];
  subtotal: number;
  orderNote: string;
  pendingConflict: PendingConflict;
  addItem: (storeId: string, storeName: string, item: NewCartItem) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeItem: (lineId: string) => void;
  setSpecialInstructions: (lineId: string, text: string) => void;
  setOrderNote: (text: string) => void;
  clearCart: () => void;
  confirmClearAndAdd: () => void;
  cancelPendingAdd: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function buildLineId(menuItemId: string, selectedOptions: SelectedOption[]): string {
  const optionIds = selectedOptions.map((o) => o.optionId).sort();
  return `${menuItemId}::${optionIds.join(",")}`;
}

type ServerCart = {
  storeId: string | null;
  storeName: string | null;
  items: CartItem[];
  orderNote: string;
};

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

async function fetchServerCart(): Promise<ServerCart | null> {
  const res = await fetch("/api/cart", { headers: await authHeader() });
  if (!res.ok) return null;
  const body = await res.json();
  return body.cart ?? null;
}

async function saveServerCart(cart: ServerCart): Promise<void> {
  await fetch("/api/cart", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify(cart),
  });
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { userId, loading: sessionLoading } = useSession();
  const [storeId, setStoreId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [orderNote, setOrderNoteState] = useState("");
  const [pendingConflict, setPendingConflict] = useState<PendingConflict>(null);
  const previousUserId = useRef<string | null | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSave = useRef(false);

  // Handle login/logout/mount transitions.
  useEffect(() => {
    if (sessionLoading) return;
    const wasLoggedIn = previousUserId.current;
    previousUserId.current = userId;

    if (!userId) {
      // Logged out (or never logged in): clear in-memory cart, no server calls.
      if (wasLoggedIn) {
        skipNextSave.current = true;
        setItems([]);
        setStoreId(null);
        setStoreName(null);
        setOrderNoteState("");
        setPendingConflict(null);
      }
      return;
    }

    // Logged in (fresh login or session already existed on mount): reconcile with server.
    let cancelled = false;
    (async () => {
      const serverCart = await fetchServerCart();
      if (cancelled) return;
      if (serverCart) {
        skipNextSave.current = true;
        setStoreId(serverCart.storeId);
        setStoreName(serverCart.storeName);
        setItems(serverCart.items);
        setOrderNoteState(serverCart.orderNote);
      } else {
        // No saved cart yet — persist whatever's in memory (anonymous cart in progress, or empty).
        await saveServerCart({ storeId, storeName, items, orderNote });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sessionLoading]);

  // Debounced save on every mutation, only while logged in.
  useEffect(() => {
    if (!userId) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveServerCart({ storeId, storeName, items, orderNote });
    }, 500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [userId, storeId, storeName, items, orderNote]);

  function addItemDirect(sId: string, sName: string, item: NewCartItem) {
    const lineId = buildLineId(item.menuItemId, item.selectedOptions);
    setStoreId(sId);
    setStoreName(sName);
    setItems((prev) => {
      const existing = prev.find((i) => i.lineId === lineId);
      if (existing) {
        return prev.map((i) =>
          i.lineId === lineId ? { ...i, quantity: i.quantity + item.quantity } : i
        );
      }
      return [...prev, { ...item, lineId }];
    });
  }

  function addItem(sId: string, sName: string, item: NewCartItem) {
    if (storeId !== null && storeId !== sId) {
      setPendingConflict({ storeId: sId, storeName: sName, item });
      return;
    }
    addItemDirect(sId, sName, item);
  }

  function confirmClearAndAdd() {
    if (!pendingConflict) return;
    setItems([]);
    setOrderNoteState("");
    addItemDirect(pendingConflict.storeId, pendingConflict.storeName, pendingConflict.item);
    setPendingConflict(null);
  }

  function cancelPendingAdd() {
    setPendingConflict(null);
  }

  function updateQuantity(lineId: string, quantity: number) {
    if (quantity <= 0) {
      removeItem(lineId);
      return;
    }
    setItems((prev) => prev.map((i) => (i.lineId === lineId ? { ...i, quantity } : i)));
  }

  function removeItem(lineId: string) {
    setItems((prev) => {
      const next = prev.filter((i) => i.lineId !== lineId);
      if (next.length === 0) {
        setStoreId(null);
        setStoreName(null);
      }
      return next;
    });
  }

  function setSpecialInstructions(lineId: string, text: string) {
    setItems((prev) =>
      prev.map((i) =>
        i.lineId === lineId
          ? { ...i, specialInstructions: text.trim() === "" ? null : text }
          : i
      )
    );
  }

  function setOrderNote(text: string) {
    setOrderNoteState(text.trim() === "" ? "" : text);
  }

  function clearCart() {
    setItems([]);
    setStoreId(null);
    setStoreName(null);
    setOrderNoteState("");
    setPendingConflict(null);
  }

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        storeId,
        storeName,
        items,
        subtotal,
        orderNote,
        pendingConflict,
        addItem,
        updateQuantity,
        removeItem,
        setSpecialInstructions,
        setOrderNote,
        clearCart,
        confirmClearAndAdd,
        cancelPendingAdd,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
```

Run `npx eslint lib/cart-store.tsx` after writing this file and fix any
reported issues before moving on.

- [ ] **Step 2: Manual verification — anonymous reload clears cart**

```bash
npm run build
npm run dev
```

In a browser with cleared storage, browse anonymously, add an item to
the cart, confirm the cart column appears. Reload the page. Confirm the
cart is empty and the cart column disappears.

- [ ] **Step 3: Manual verification — anonymous cart survives into a fresh account login**

While still anonymous with an item in the cart (don't reload), sign up
for a brand-new customer account from the sidebar's Sign Up link.
Confirm the cart still shows the same item immediately after signup
completes (no reload). Reload the page while still logged in as this new
account — confirm the cart is still there (now server-backed).

- [ ] **Step 4: Manual verification — server cart wins over a differing anonymous cart**

Seed a cart row for an existing seeded customer directly via psql (use
the `carts` table from Task 1), e.g.:

```bash
docker exec supabase_db_phase1-scaffold-db psql -U postgres -c "select id from public.users where role = 'customer' limit 1;"
```

Take that id and insert a `carts` row for it with some `items` JSON (any
valid seeded product id/name/price is fine, doesn't need to trace to a
real menu item for this UI-level check). Then, in a browser with cleared
storage, browse anonymously and add a *different* item to the cart, then
log in as that seeded customer. Confirm the cart shown after login
matches the seeded server cart, not the anonymous one you just built.

Clean up: delete the manually-inserted `carts` row afterward via psql if
you want the account back to its pre-test state (not required for
correctness, just tidiness — a `carts` row is not seed data and
`db reset` wipes it anyway).

- [ ] **Step 5: Manual verification — logout clears immediately, no cross-account leakage**

While logged in with items in the cart, sign out via the sidebar. Confirm
the cart column disappears immediately (no reload needed). Log in as a
*different* seeded customer in the same tab. Confirm you see that
customer's own cart state (empty, or their own saved cart if one exists)
and never a flash of the previous customer's items.

- [ ] **Step 6: Manual verification — debounce coalesces rapid clicks**

While logged in with an item in the cart, open the Network tab, then
click the quantity `+` button 5 times quickly. Confirm only one (or a
small number, not five) `PUT /api/cart` requests fire, landing shortly
after the last click — not one request per click.

- [ ] **Step 7: Commit**

```bash
git add lib/cart-store.tsx
git commit -m "feat: move cart persistence from localStorage to account-scoped server storage"
```

---

## Task 4: Final verification and merge

**Files:** none (verification + git merge only)

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: succeeds with no errors.

- [ ] **Step 2: Confirm no other file still references removed cart-store internals**

```bash
grep -rn "foodhub_cart\|loadStoredCart\|normalizeStoredItem\|STORAGE_KEY" --include="*.ts" --include="*.tsx" .
```

Expected: no matches outside of `.claude/worktrees/` (stale other-branch
copies) or this plan file itself — all removed from `lib/cart-store.tsx`
with nothing else depending on them (grep the whole repo, not just
`lib/`, since a stray reference elsewhere would be a real gap).

- [ ] **Step 3: Confirm Review Focus items are covered**

Re-check each of the 5 Review Focus bullets above against the actual
running app: immediate logout clear, the null-vs-empty-cart response
distinction (re-read Task 2's Step 2 test output to confirm you saw both
shapes), debounce coalescing, 401 on bad/missing token, and no
cross-account flash when switching customers in one tab.

- [ ] **Step 4: Merge to local main**

```bash
cd C:\Vishal\Projects\FoodDelivery_App_WebSite
git merge account-scoped-cart-persistence
```

Expected: fast-forward or clean merge.

- [ ] **Step 5: Remove the worktree**

```bash
git worktree remove .claude/worktrees/account-scoped-cart-persistence
```

If this fails with a file-lock error, leave the directory in place —
safe, holds no unique content once merged.

- [ ] **Step 6: Report completion**

Do not push to `origin` — per project rule, pushing requires asking first
unless Vishal's "Commit Work" phrase is invoked.
