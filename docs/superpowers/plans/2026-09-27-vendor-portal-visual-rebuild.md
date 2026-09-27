# Vendor Portal Visual Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the vendor portal's layout/UX (sidebar nav, dashboard stat cards, kanban orders board, table-style menu manager) on top of the existing Uber Eats-style design tokens, with zero functional/API change.

**Architecture:** New `VendorSessionContext` + `VendorShell` client component provide session/store state once via `app/vendor/layout.tsx`; dashboard/menu/orders pages consume that context instead of each calling `useVendorSession()` directly, and are restructured presentationally only. Orders page groups the existing `orders` array client-side into status columns. Menu page restructures existing item state into a table. No new API routes, no schema change.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Supabase JS client, existing `lib/branding.ts` tokens.

**Spec:** `docs/superpowers/specs/2026-09-27-vendor-portal-visual-rebuild-design.md`

## Global Constraints

- Card/input border radius: 8px. Button border radius: 999px (full pill). Per piece 1 design tokens.
- Use existing Tailwind tokens `brand-primary`, `brand-accent`, `brand-bg`, `brand-surface`, `brand-ink`, `brand-ink-muted` — never hardcode hex.
- No change to any `/api/vendor/*` route behavior or request/response shape.
- `useVendorSession()` hook itself (`components/vendor/useVendorSession.ts`) is not modified — only where it's called from.
- Run `npm run build` (not just `tsc --noEmit`) before any task is marked done.
- Money values continue using the existing paise/rupees conversion already present in each page — do not introduce new float math.

## Review Focus

- Session not yet resolved (`loading === true`) when a page mounts under the new layout — every restructured page must still show a loading state instead of rendering with `storeId`/`isOpen` as null/undefined.
- Vendor with no linked store (`storeId === null`) — sidebar and pages must still show the existing "No restaurant is linked" message, not crash on a null store id.
- Empty states — zero orders total, zero orders in a given kanban column, zero menu items — must render an explicit empty message, not a blank column/table.
- Order whose `status` is not one of `placed/accepted/preparing/ready` (e.g. already `delivered`/`cancelled` from a stale fetch) — must not appear in any kanban column and must not crash the grouping logic.
- Mobile width (390px): sidebar must collapse to a top bar + drawer, not overflow or hide navigation entirely.

---

## Task 0: Worktree setup

**Files:** none (environment only)

- [ ] **Step 1: Create isolated worktree**

```bash
git worktree add .claude/worktrees/vendor-portal-rebuild -b vendor-portal-rebuild
```

- [ ] **Step 2: Copy gitignored env file into the worktree**

```bash
cp .env.local .claude/worktrees/vendor-portal-rebuild/.env.local
```

- [ ] **Step 3: Confirm local Supabase is running (Docker Desktop must already be up)**

```bash
cd .claude/worktrees/vendor-portal-rebuild
npx supabase status
```

Expected: shows running local services. If not running, `npx supabase start` first.

- [ ] **Step 4: Install dependencies and confirm baseline build passes**

```bash
npm install
npm run build
```

Expected: build succeeds with no errors (confirms starting state is clean before any changes).

---

## Task 1: VendorSessionContext + VendorShell layout

**Files:**
- Create: `components/vendor/VendorSessionContext.tsx`
- Create: `components/vendor/VendorShell.tsx`
- Create: `app/vendor/layout.tsx`
- Test: `components/vendor/__tests__/VendorSessionContext.test.tsx` (if a test runner is present — this project has no automated suite yet per MEMORY.md, so this task's "test" is a manual Playwright check instead; see Step 5)

**Interfaces:**
- Produces: `VendorSessionContext` — React context of type `{ loading: boolean; storeId: string | null; isOpen: boolean | null; refreshIsOpen: () => Promise<void> }`.
- Produces: `useVendorSessionContext()` — hook that reads the context, throws if used outside `VendorShell`.
- Produces: `VendorShell` — client component rendering sidebar (desktop) / top bar + drawer (mobile), wrapping `children`, providing the context above.
- Consumes: `useVendorSession()` from `components/vendor/useVendorSession.ts` (existing, unmodified) — returns `{ loading, storeId }` (note: existing hook has no `vendorId` usage needed here beyond what it already returns).

- [ ] **Step 1: Write `VendorSessionContext.tsx`**

```tsx
"use client";

import { createContext, useContext } from "react";

export type VendorSessionValue = {
  loading: boolean;
  storeId: string | null;
  isOpen: boolean | null;
  refreshIsOpen: () => Promise<void>;
};

export const VendorSessionContext = createContext<VendorSessionValue | null>(null);

export function useVendorSessionContext(): VendorSessionValue {
  const ctx = useContext(VendorSessionContext);
  if (!ctx) {
    throw new Error("useVendorSessionContext must be used within VendorShell");
  }
  return ctx;
}
```

- [ ] **Step 2: Write `VendorShell.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVendorSession } from "@/components/vendor/useVendorSession";
import { VendorSessionContext } from "@/components/vendor/VendorSessionContext";

const NAV_LINKS = [
  { href: "/vendor/dashboard", label: "Dashboard" },
  { href: "/vendor/menu", label: "Menu" },
  { href: "/vendor/orders", label: "Orders" },
];

export default function VendorShell({ children }: { children: React.ReactNode }) {
  const { loading, storeId } = useVendorSession();
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState<boolean | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refreshIsOpen = useCallback(async () => {
    if (!storeId) return;
    const { data } = await supabase.from("stores").select("is_open").eq("id", storeId).single();
    setIsOpen(data?.is_open ?? null);
  }, [storeId]);

  useEffect(() => {
    if (!loading && storeId) refreshIsOpen();
  }, [loading, storeId, refreshIsOpen]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/vendor/login");
  }

  if (loading) return <p className="p-4">Loading…</p>;

  if (!storeId) {
    return (
      <p className="p-4 text-sm text-red-600">
        No restaurant is linked to this account. Contact support.
      </p>
    );
  }

  return (
    <VendorSessionContext.Provider value={{ loading, storeId, isOpen, refreshIsOpen }}>
      <div className="flex min-h-screen flex-col md:flex-row">
        <div className="flex items-center justify-between border-b border-brand-ink-muted/10 bg-brand-surface p-3 md:hidden">
          <span className="font-heading text-lg text-brand-ink">Vendor</span>
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="rounded-lg border border-brand-ink-muted/20 px-3 py-1 text-sm"
          >
            Menu
          </button>
        </div>
        <aside
          className={`${drawerOpen ? "flex" : "hidden"} w-full flex-col gap-2 border-b border-brand-ink-muted/10 bg-brand-surface p-4 md:flex md:w-56 md:border-b-0 md:border-r md:min-h-screen`}
        >
          <span className="mb-2 hidden font-heading text-lg text-brand-ink md:block">Vendor</span>
          <span className="mb-2 inline-flex w-fit items-center rounded-full bg-brand-accent/20 px-3 py-1 text-xs font-medium text-brand-ink">
            {isOpen === null ? "…" : isOpen ? "Open" : "Closed"}
          </span>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setDrawerOpen(false)}
              className={`rounded-lg px-3 py-2 text-sm ${
                pathname === link.href
                  ? "bg-brand-primary text-white"
                  : "text-brand-ink hover:bg-brand-accent/10"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={signOut}
            className="mt-auto rounded-lg px-3 py-2 text-left text-sm text-brand-ink-muted hover:bg-brand-accent/10"
          >
            Sign out
          </button>
        </aside>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </VendorSessionContext.Provider>
  );
}
```

- [ ] **Step 3: Write `app/vendor/layout.tsx`**

```tsx
import VendorShell from "@/components/vendor/VendorShell";

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return <VendorShell>{children}</VendorShell>;
}
```

- [ ] **Step 4: Confirm login page is exempt from this layout**

Next.js App Router applies `app/vendor/layout.tsx` to every route under
`app/vendor/`, including `app/vendor/login`. Since login must NOT get the
sidebar (per spec), move login out from under the shared layout by adding
a route group: rename `app/vendor/login` to `app/vendor/(auth)/login` is
unnecessary complexity for one page — instead, add a check at the top of
`VendorShell`: if `pathname === "/vendor/login"`, render `children` with
no shell. Update Step 2's `VendorShell` by adding this near the top of
the component body, right after computing `pathname`:

```tsx
  if (pathname === "/vendor/login") {
    return <>{children}</>;
  }
```

- [ ] **Step 5: Manual verification (no automated test runner in this project yet)**

```bash
npm run build
npm run dev
```

Open `/vendor/login` — confirm no sidebar renders. Log in as an existing
seeded vendor, confirm `/vendor/dashboard` shows the sidebar with correct
open/closed badge, and clicking Menu/Orders navigates with the active
link highlighted. Resize to 390px width, confirm the sidebar collapses to
a top bar + drawer that opens/closes on tap.

- [ ] **Step 6: Commit**

```bash
git add components/vendor/VendorSessionContext.tsx components/vendor/VendorShell.tsx app/vendor/layout.tsx
git commit -m "feat: add vendor portal sidebar shell and session context"
```

---

## Task 2: Dashboard page restructure

**Files:**
- Modify: `app/vendor/dashboard/page.tsx` (full rewrite of the component body)

**Interfaces:**
- Consumes: `useVendorSessionContext()` from Task 1 — `{ loading, storeId, isOpen, refreshIsOpen }`.

- [ ] **Step 1: Rewrite `app/vendor/dashboard/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useVendorSessionContext } from "@/components/vendor/VendorSessionContext";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorDashboardPage() {
  const { storeId, isOpen, refreshIsOpen } = useVendorSessionContext();
  const [deliveryFeeRupees, setDeliveryFeeRupees] = useState("");
  const [promoText, setPromoText] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadStore() {
      if (!storeId) return;
      const { data } = await supabase
        .from("stores")
        .select("delivery_fee_paise, promo_text")
        .eq("id", storeId)
        .single();
      setDeliveryFeeRupees(data ? (data.delivery_fee_paise / 100).toString() : "");
      setPromoText(data?.promo_text ?? "");
    }
    loadStore();
  }, [storeId]);

  async function toggleOpen() {
    if (isOpen === null) return;
    setActionError(null);
    const res = await fetch("/api/vendor/restaurant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ isOpen: !isOpen }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setActionError(body?.error ?? "Failed to update restaurant");
      return;
    }
    await refreshIsOpen();
  }

  async function saveFeeAndPromo() {
    setActionError(null);
    setSavedMessage(null);
    if (deliveryFeeRupees.trim() === "") {
      setActionError("Delivery fee must be a non-negative number");
      return;
    }
    const fee = Number(deliveryFeeRupees);
    if (!Number.isFinite(fee) || fee < 0) {
      setActionError("Delivery fee must be a non-negative number");
      return;
    }
    const res = await fetch("/api/vendor/restaurant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeader()) },
      body: JSON.stringify({ deliveryFeeRupees: fee, promoText: promoText.trim() || null }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setActionError(body?.error ?? "Failed to update restaurant");
      return;
    }
    setDeliveryFeeRupees((body.store.delivery_fee_paise / 100).toString());
    setPromoText(body.store.promo_text ?? "");
    setSavedMessage("Saved.");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 font-heading text-2xl text-brand-ink">Dashboard</h1>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col justify-between rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
          <p className="text-sm text-brand-ink-muted">Restaurant status</p>
          <p className="mb-3 text-lg font-medium text-brand-ink">
            {isOpen ? "Open" : "Closed"}
          </p>
          <button
            onClick={toggleOpen}
            disabled={isOpen === null}
            className="self-start rounded-full bg-brand-primary px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {isOpen ? "Close restaurant" : "Open restaurant"}
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-4">
        <h2 className="mb-1 text-sm font-medium text-brand-ink">Delivery settings</h2>
        <label className="text-sm text-brand-ink-muted">Delivery fee (rupees)</label>
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
          value={deliveryFeeRupees}
          onChange={(e) => setDeliveryFeeRupees(e.target.value)}
        />
        <label className="text-sm text-brand-ink-muted">Promo text (optional)</label>
        <input
          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1"
          placeholder="e.g. 25% off ₹150+"
          value={promoText}
          onChange={(e) => setPromoText(e.target.value)}
        />
        <button
          onClick={saveFeeAndPromo}
          className="self-start rounded-full bg-brand-primary px-4 py-2 text-sm text-white"
        >
          Save
        </button>
        {savedMessage && <p className="text-sm text-brand-accent">{savedMessage}</p>}
      </div>

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

```bash
npm run build
npm run dev
```

Log in as vendor, load `/vendor/dashboard`. Toggle open/closed, confirm
sidebar badge updates immediately (via `refreshIsOpen`). Edit delivery
fee/promo, save, confirm "Saved." message and values persist on reload.

- [ ] **Step 3: Commit**

```bash
git add app/vendor/dashboard/page.tsx
git commit -m "feat: restructure vendor dashboard into stat/settings cards"
```

---

## Task 3: Orders page kanban restructure

**Files:**
- Modify: `app/vendor/orders/page.tsx` (full rewrite of the component body)

**Interfaces:**
- Consumes: `useVendorSessionContext()` from Task 1 — only `loading` is needed here (kept for parity with the existing gate, though the shell already gates on session before rendering children — see Step 1 note).

- [ ] **Step 1: Rewrite `app/vendor/orders/page.tsx`**

Note: `VendorShell` already blocks rendering `children` until
`loading` is false and `storeId` exists, so this page no longer needs its
own loading gate — it can render directly. Kanban columns are
`placed`, `accepted`, `preparing`, `ready`; any order whose status is not
one of those four (e.g. stale `delivered`/`cancelled`) is filtered out of
every column via the `KANBAN_STATUSES` allowlist, never added to a
column, and never crashes the grouping.

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  special_instructions: string | null;
  products: { name: string } | null;
  order_item_options: { id: string; group_name: string; option_name: string }[];
};
type Order = {
  id: string;
  status: string;
  total: number;
  placed_at: string;
  delivery_note: string | null;
  order_items: OrderItem[];
};

const KANBAN_STATUSES = ["placed", "accepted", "preparing", "ready"] as const;

const COLUMN_LABEL: Record<(typeof KANBAN_STATUSES)[number], string> = {
  placed: "Placed",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
};

const NEXT_LABEL: Record<string, string> = {
  placed: "Accept",
  accepted: "Start preparing",
  preparing: "Mark ready",
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadOrders() {
    const res = await fetch("/api/vendor/orders", { headers: await authHeader() });
    const body = await res.json();
    if (res.ok) setOrders(body.orders);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  async function advance(orderId: string) {
    setError(null);
    const res = await fetch(`/api/vendor/orders/${orderId}/status`, {
      method: "POST",
      headers: await authHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to update order status");
      return;
    }
    await loadOrders();
  }

  async function reject(orderId: string) {
    setError(null);
    const res = await fetch(`/api/vendor/orders/${orderId}/reject`, {
      method: "POST",
      headers: await authHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to reject order");
      return;
    }
    await loadOrders();
  }

  function ordersForColumn(status: (typeof KANBAN_STATUSES)[number]) {
    return orders
      .filter((order) => order.status === status)
      .sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime());
  }

  return (
    <div>
      <h1 className="mb-4 font-heading text-2xl text-brand-ink">Orders</h1>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      {orders.length === 0 ? (
        <p className="text-sm text-brand-ink-muted">No orders yet.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          {KANBAN_STATUSES.map((status) => {
            const columnOrders = ordersForColumn(status);
            return (
              <div key={status} className="flex flex-col gap-3">
                <h2 className="text-sm font-medium text-brand-ink-muted">
                  {COLUMN_LABEL[status]} ({columnOrders.length})
                </h2>
                {columnOrders.length === 0 && (
                  <p className="text-sm text-brand-ink-muted">No orders.</p>
                )}
                {columnOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3"
                  >
                    <p className="mb-2 font-medium text-brand-ink">
                      #{order.id.slice(0, 8)}
                    </p>
                    <ul className="mb-2 text-sm text-brand-ink-muted">
                      {order.order_items.map((item) => (
                        <li key={item.id}>
                          {item.quantity}× {item.products?.name ?? "Item"}
                          {item.order_item_options.length > 0 && (
                            <span>
                              {" "}
                              — {item.order_item_options.map((o) => o.option_name).join(", ")}
                            </span>
                          )}
                          {item.special_instructions && (
                            <span> — &quot;{item.special_instructions}&quot;</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {order.delivery_note && (
                      <p className="mb-2 text-sm text-brand-ink-muted">
                        Note: &quot;{order.delivery_note}&quot;
                      </p>
                    )}
                    <p className="mb-2 text-sm font-medium text-brand-ink">
                      ₹{order.total.toFixed(2)}
                    </p>
                    <div className="flex gap-2">
                      {order.status === "placed" && (
                        <button
                          onClick={() => reject(order.id)}
                          className="rounded-full border border-red-600 px-2 py-1 text-xs text-red-600"
                        >
                          Reject
                        </button>
                      )}
                      {NEXT_LABEL[order.status] && (
                        <button
                          onClick={() => advance(order.id)}
                          className="rounded-full bg-brand-primary px-2 py-1 text-xs text-white"
                        >
                          {NEXT_LABEL[order.status]}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

```bash
npm run build
npm run dev
```

Load `/vendor/orders` with seeded orders across different statuses (place
a fresh test order via the customer flow if needed to populate `placed`).
Confirm each order appears in exactly one column matching its status,
empty columns show "No orders.", accept/reject/advance buttons work and
move the order to the next column after `loadOrders()` refetches. Confirm
a `delivered` or `cancelled` order (if any exist from prior sessions)
does NOT appear in any column.

- [ ] **Step 3: Commit**

```bash
git add app/vendor/orders/page.tsx
git commit -m "feat: restructure vendor orders into status-grouped kanban board"
```

---

## Task 4: Menu page table restructure

**Files:**
- Modify: `app/vendor/menu/page.tsx` (restructure the item-listing JSX only; all state/handlers unchanged)

**Interfaces:**
- Consumes: existing state/handlers already in this file (`items`, `editingId`, `optionsOpenId`, `groupsByItem`, etc.) — Task 4 changes only how `items` renders, not how it's fetched or mutated.

- [ ] **Step 1: Read the current full file to confirm exact existing state/handler names before editing**

```bash
cat app/vendor/menu/page.tsx
```

Use the exact existing variable/function names found here (e.g. `items`,
`setEditingId`, `loadGroups`, `optionForms`) — do not rename anything.

- [ ] **Step 2: Replace the existing item-listing block (the `<ul>`/`<li>` list that maps over `items`, currently a stacked-card list) with a table**

Find the JSX that renders `items.map(...)` for display (not the add-item
form, not the edit form — those stay as-is). Replace that list wrapper
with:

```tsx
<div className="overflow-x-auto rounded-lg border border-brand-ink-muted/10">
  <table className="w-full text-left text-sm">
    <thead className="bg-brand-accent/10 text-brand-ink-muted">
      <tr>
        <th className="p-2">Image</th>
        <th className="p-2">Name</th>
        <th className="p-2">Price</th>
        <th className="p-2">Veg</th>
        <th className="p-2">Available</th>
        <th className="p-2">Actions</th>
      </tr>
    </thead>
    <tbody>
      {items.map((item) => (
        <tr key={item.id} className="border-t border-brand-ink-muted/10">
          <td className="p-2">
            {item.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt={item.name} className="h-10 w-10 rounded-lg object-cover" />
            )}
          </td>
          <td className="p-2 font-medium text-brand-ink">{item.name}</td>
          <td className="p-2">₹{item.price.toFixed(2)}</td>
          <td className="p-2">
            {item.product_attributes?.is_veg ? (
              <span className="rounded-full bg-brand-accent/20 px-2 py-0.5 text-xs">Veg</span>
            ) : (
              "—"
            )}
          </td>
          <td className="p-2">{item.is_available ? "Yes" : "No"}</td>
          <td className="p-2">
            {/* keep existing edit/delete/toggle/options buttons here, restyled to rounded-full + brand tokens, calling the same existing handlers (setEditingId(item.id), the existing delete handler, the existing availability-toggle handler, and setOptionsOpenId(item.id)) */}
          </td>
        </tr>
      ))}
      {items.length === 0 && (
        <tr>
          <td colSpan={6} className="p-4 text-center text-brand-ink-muted">
            No menu items yet.
          </td>
        </tr>
      )}
    </tbody>
  </table>
</div>
```

Fill the Actions cell with the exact existing buttons/handlers already in
the file (edit-trigger, delete, availability toggle, manage-options
trigger) — copy their existing `onClick` handlers verbatim, only
restyling `className` to `rounded-full` buttons using `brand-primary`/
`brand-accent`/border-token colors consistent with the rest of this
rebuild. Do not change any handler logic.

Leave the edit-form (`editingId === item.id` conditional block) and the
options editor (`optionsOpenId === item.id` conditional block) exactly
where they are functionally — they can render as an expanded row below
the table row, or continue rendering as a panel beneath the table; either
is fine as long as no handler or state name changes.

- [ ] **Step 3: Manual verification**

```bash
npm run build
npm run dev
```

Load `/vendor/menu`. Confirm the table renders all seeded items with
correct name/price/veg badge/availability. Add a new item via the
existing add-item form, confirm it appears as a new row. Edit an item,
toggle availability, delete an item, add an option group — confirm all
existing functionality still works unchanged.

- [ ] **Step 4: Commit**

```bash
git add app/vendor/menu/page.tsx
git commit -m "feat: restructure vendor menu list into a table"
```

---

## Task 5: Login page restyle

**Files:**
- Modify: `app/vendor/login/page.tsx` (className changes only — no structural/flow change)

**Interfaces:** none new — pure restyle of existing JSX.

- [ ] **Step 1: Read the current full file**

```bash
cat app/vendor/login/page.tsx
```

- [ ] **Step 2: Update container/card/button/input classNames to match new tokens**

Wrap the existing form in a centered card:
`className="mx-auto mt-12 max-w-md rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-6"`.
Update the heading to `className="mb-4 font-heading text-2xl text-brand-ink"`.
Update every `<input>` to `className="w-full rounded-lg border border-brand-ink-muted/20 px-3 py-2"`.
Update the submit button to `className="w-full rounded-full bg-brand-primary px-4 py-2 text-white"`.
Do not change any state variable, handler, validation logic, or the
existing `getSafeRedirect` function — restyle `className` attributes
only.

- [ ] **Step 3: Manual verification**

```bash
npm run build
npm run dev
```

Load `/vendor/login`, confirm it renders as a centered card with no
sidebar (per Task 1 Step 4's pathname check), styled with new tokens.
Confirm login and signup both still work end-to-end.

- [ ] **Step 4: Commit**

```bash
git add app/vendor/login/page.tsx
git commit -m "style: restyle vendor login page with new design tokens"
```

---

## Task 6: Final verification and merge

**Files:** none (verification + git merge only)

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: succeeds with no errors or warnings introduced by this plan's changes.

- [ ] **Step 2: Full manual walkthrough at desktop and 390px width**

Using `npm run dev`, walk through: login → dashboard (toggle open/closed,
save fee/promo) → menu (add/edit/delete item, add option group) → orders
(accept/reject/advance an order through all 4 columns) → sign out. Repeat
the walkthrough at 390px width, confirming the sidebar drawer opens/closes
correctly on every page.

- [ ] **Step 3: Confirm Review Focus items are covered**

Re-check each of the 5 Review Focus bullets above against the actual
running app: loading state, no-store vendor message, empty states (zero
orders, empty kanban column, zero menu items), a non-kanban-status order
excluded from the board, and mobile drawer behavior.

- [ ] **Step 4: Merge to local main**

```bash
cd C:\Vishal\Projects\FoodDelivery_App_WebSite
git merge vendor-portal-rebuild
```

Expected: fast-forward or clean merge (this plan touches only vendor-
portal files, no conflicts expected with `main`).

- [ ] **Step 5: Remove the worktree**

```bash
git worktree remove .claude/worktrees/vendor-portal-rebuild
```

If this fails with a file-lock error (seen before in this project per
`HANDOFF_11.md`), leave the directory in place — it's safe, holds no
unique content once merged, and can be cleaned up later.

- [ ] **Step 6: Report completion**

Do not push to `origin` — per project rule, pushing requires asking first
unless Vishal's "Commit Work" phrase is invoked.
