# Admin Portal Visual Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the admin portal's layout/UX (route-group shell with top bar, tabbed dashboard with table panels) on the existing design tokens, with zero functional/API change, and with the route-group structure baked in from Task 1.

**Architecture:** `AdminSessionContext` + `AdminShell` provide session state once via `app/admin/(portal)/layout.tsx`. `app/admin/login` stays outside the `(portal)` route group so the shell never mounts there. Dashboard page drops its own `useAdminSession()` call, reads context instead, and its three stacked lists become tab panels rendered as tables. No new API routes, no schema change.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Supabase JS client, existing `lib/branding.ts` tokens.

**Spec:** `docs/superpowers/specs/2026-09-27-admin-portal-visual-rebuild-design.md`

## Global Constraints

- Card/input border radius: 8px (`rounded-lg`). Button border radius: 999px full pill (`rounded-full`) — every button, no exceptions.
- Use existing Tailwind tokens (`brand-primary`, `brand-accent`, `brand-bg`, `brand-surface`, `brand-ink`, `brand-ink-muted`) — never hardcode hex.
- No change to any `/api/admin/*` route behavior or shape.
- `useAdminSession()` (`components/admin/useAdminSession.ts`) is not modified — only where it's called from.
- **The route group (`app/admin/(portal)/...`) is mandatory from Task 1** — `app/admin/login/page.tsx` must never be wrapped by the shell layout. This is the fix sub-project 1 (vendor) discovered only after its final review found two Critical bugs (post-login infinite loading hang, stale session data across account switches); sub-project 2 (delivery) baked it in from the start and its final review confirmed the structure works. Do the same here.
- Run `npm run build` (not just `tsc --noEmit`) before any task is marked done.
- No new float money math — this file already uses `.toFixed(2)` on plain `total` numbers from the API; don't introduce new arithmetic.

## Review Focus

- Cold-session login: after clearing storage and logging in fresh, the dashboard must load without an infinite "Loading…" — verify live from a cleared-storage browser.
- Cross-account session leak: if a second admin account exists (or can be seeded with explicit approval), signing out and logging in as a different admin in the same tab must show correctly-scoped data, not stale state. If only one seeded admin account exists, this specific check may be skipped with a ledger note — the route-group file structure itself is what prevents the bug class.
- Empty states: zero orders, zero restaurants, zero delivery partners must each show their existing explicit message, not a blank table.
- Tab switching: only the active tab's panel renders; switching tabs must not lose in-progress state incorrectly (e.g. a pending reassign-partner dropdown selection on the Orders tab should be fine to reset when leaving that tab — no persistence requirement — but switching tabs must never crash or show a mixed/blank view).
- Mobile width (390px): the tab bar and each table must not overflow horizontally — tables should scroll horizontally within their container if columns don't fit, rather than breaking the page layout.

---

## Task 0: Worktree setup

**Files:** none (environment only)

- [ ] **Step 1: Create isolated worktree**

```bash
git worktree add .claude/worktrees/admin-portal-rebuild -b admin-portal-rebuild
```

- [ ] **Step 2: Copy gitignored env file into the worktree**

```bash
cp .env.local .claude/worktrees/admin-portal-rebuild/.env.local
```

- [ ] **Step 3: Confirm local Supabase is running**

```bash
cd .claude/worktrees/admin-portal-rebuild
npx supabase status
```

Expected: shows running local services. If not running, `npx supabase start` first.

- [ ] **Step 4: Install dependencies and confirm baseline build passes**

```bash
npm install
npm run build
```

Expected: build succeeds with no errors.

---

## Task 1: Route group, AdminSessionContext, AdminShell

**Files:**
- Create: `components/admin/AdminSessionContext.tsx`
- Create: `components/admin/AdminShell.tsx`
- Create: `app/admin/(portal)/layout.tsx`
- Move: `app/admin/dashboard/page.tsx` → `app/admin/(portal)/dashboard/page.tsx` (content unchanged in this task — Task 2 restyles it)

**Interfaces:**
- Produces: `AdminSessionContext` — React context of type `{ loading: boolean; adminId: string | null }`.
- Produces: `useAdminSessionContext()` — hook that reads the context, throws if used outside `AdminShell`.
- Produces: `AdminShell` — client component rendering a top bar (brand mark, sign out), wrapping `children`, providing the context above.
- Consumes: `useAdminSession()` from `components/admin/useAdminSession.ts` (existing, unmodified) — returns `{ adminId, loading }`.

- [ ] **Step 1: Write `AdminSessionContext.tsx`**

```tsx
"use client";

import { createContext, useContext } from "react";

export type AdminSessionValue = {
  loading: boolean;
  adminId: string | null;
};

export const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function useAdminSessionContext(): AdminSessionValue {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) {
    throw new Error("useAdminSessionContext must be used within AdminShell");
  }
  return ctx;
}
```

- [ ] **Step 2: Write `AdminShell.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAdminSession } from "@/components/admin/useAdminSession";
import { AdminSessionContext } from "@/components/admin/AdminSessionContext";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const { loading, adminId } = useAdminSession();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/admin/login");
  }

  if (loading) return <p className="p-4">Loading…</p>;

  return (
    <AdminSessionContext.Provider value={{ loading, adminId }}>
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between border-b border-brand-ink-muted/10 bg-brand-surface p-3">
          <span className="font-heading text-lg text-brand-ink">Admin</span>
          <button
            onClick={signOut}
            className="rounded-full px-3 py-1 text-sm text-brand-ink-muted hover:bg-brand-accent/10"
          >
            Sign out
          </button>
        </div>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </AdminSessionContext.Provider>
  );
}
```

- [ ] **Step 3: Write `app/admin/(portal)/layout.tsx`**

```tsx
import AdminShell from "@/components/admin/AdminShell";

export default function AdminPortalLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
```

- [ ] **Step 4: Move the dashboard page into the route group**

```bash
mkdir -p "app/admin/(portal)/dashboard"
git mv app/admin/dashboard/page.tsx "app/admin/(portal)/dashboard/page.tsx"
```

Do not edit the moved file's contents in this task — it still calls
`useAdminSession()` directly and still works exactly as before; Task 2
migrates it to `useAdminSessionContext()` and restructures it into tabs.

- [ ] **Step 5: Manual verification — cold-session check (mandatory)**

```bash
npm run build
npm run dev
```

In a browser with CLEARED storage/cookies: navigate to `/admin/login`,
confirm no top bar renders. Log in as the seeded admin account, confirm
`/admin/dashboard` shows the top bar with no infinite "Loading…". If a
second seeded admin account exists, sign out and log in as it in the same
tab, confirm no stale data carries over; if only one admin account
exists, skip this specific check and note it in your report — the
route-group file structure is what matters here, and that's verified by
the single-account cold-login check plus the file layout itself.

- [ ] **Step 6: Commit**

```bash
git add components/admin/AdminSessionContext.tsx components/admin/AdminShell.tsx "app/admin/(portal)/layout.tsx" "app/admin/(portal)/dashboard/page.tsx"
git commit -m "feat: add admin portal shell and route group (cold-session-safe from the start)"
```

---

## Task 2: Dashboard page context migration and tabbed table restructure

**Files:**
- Modify: `app/admin/(portal)/dashboard/page.tsx` (full rewrite of the component body)

**Interfaces:**
- Consumes: `useAdminSessionContext()` from Task 1 — `{ loading, adminId }` (neither is actually needed by this page's own render logic since `AdminShell` already gates loading before rendering children; the page drops its `useAdminSession()` call and doesn't need to read anything from the context for its own logic — it just stops calling the hook directly).

- [ ] **Step 1: Rewrite `app/admin/(portal)/dashboard/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  stores: { name: string } | null;
};

const REASSIGNABLE_STATUSES = ["assigned", "picked_up"];

type RestaurantRow = {
  id: string;
  name: string;
  is_open: boolean;
  is_suspended: boolean;
};

type PartnerRow = {
  user_id: string;
  is_online: boolean;
  vehicle_type: string | null;
  users: { full_name: string } | null;
};

type Tab = "orders" | "restaurants" | "partners";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [restaurants, setRestaurants] = useState<RestaurantRow[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [reassignSelections, setReassignSelections] = useState<Record<string, string>>({});
  const [reassignError, setReassignError] = useState<string | null>(null);

  async function loadAll() {
    const headers = await authHeader();
    const [oRes, rRes, pRes] = await Promise.all([
      fetch("/api/admin/orders", { headers }),
      fetch("/api/admin/restaurants", { headers }),
      fetch("/api/admin/delivery-partners", { headers }),
    ]);
    const [oBody, rBody, pBody] = await Promise.all([oRes.json(), rRes.json(), pRes.json()]);
    if (oRes.ok) setOrders(oBody.orders);
    if (rRes.ok) setRestaurants(rBody.stores);
    if (pRes.ok) setPartners(pBody.partners);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function toggleSuspend(r: RestaurantRow) {
    const path = r.is_suspended
      ? `/api/admin/restaurants/${r.id}/unsuspend`
      : `/api/admin/restaurants/${r.id}/suspend`;
    await fetch(path, { method: "POST", headers: await authHeader() });
    await loadAll();
  }

  async function reassign(orderId: string) {
    const deliveryPartnerId = reassignSelections[orderId];
    if (!deliveryPartnerId) return;
    setReassignError(null);
    const res = await fetch(`/api/admin/orders/${orderId}/reassign`, {
      method: "POST",
      headers: { ...(await authHeader()), "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryPartnerId }),
    });
    const body = await res.json();
    if (!res.ok) {
      setReassignError(body.error ?? "Failed to reassign order");
      return;
    }
    await loadAll();
  }

  const onlinePartners = partners.filter((p) => p.is_online);

  const TABS: { key: Tab; label: string; count: number }[] = [
    { key: "orders", label: "Orders", count: orders.length },
    { key: "restaurants", label: "Restaurants", count: restaurants.length },
    { key: "partners", label: "Delivery partners", count: partners.length },
  ];

  return (
    <div>
      <h1 className="mb-4 font-heading text-2xl text-brand-ink">Dashboard</h1>
      <div className="mb-4 flex gap-2 border-b border-brand-ink-muted/10">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-full px-4 py-2 text-sm ${
              activeTab === tab.key
                ? "bg-brand-primary text-white"
                : "text-brand-ink hover:bg-brand-accent/10"
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      {activeTab === "orders" && (
        <div className="overflow-x-auto rounded-lg border border-brand-ink-muted/10">
          {reassignError && <p className="p-2 text-sm text-red-600">{reassignError}</p>}
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-accent/10 text-brand-ink-muted">
              <tr>
                <th className="p-2">Order</th>
                <th className="p-2">Restaurant</th>
                <th className="p-2">Status</th>
                <th className="p-2">Total</th>
                <th className="p-2">Reassign</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-brand-ink-muted/10">
                  <td className="p-2">#{o.id.slice(0, 8)}</td>
                  <td className="p-2">{o.stores?.name ?? "Restaurant"}</td>
                  <td className="p-2">{o.status}</td>
                  <td className="p-2">₹{o.total.toFixed(2)}</td>
                  <td className="p-2">
                    {REASSIGNABLE_STATUSES.includes(o.status) ? (
                      <div className="flex items-center gap-2">
                        <select
                          className="rounded-lg border border-brand-ink-muted/20 px-2 py-1 text-xs"
                          value={reassignSelections[o.id] ?? ""}
                          onChange={(e) =>
                            setReassignSelections((prev) => ({ ...prev, [o.id]: e.target.value }))
                          }
                        >
                          <option value="">Select partner…</option>
                          {onlinePartners.map((p) => (
                            <option key={p.user_id} value={p.user_id}>
                              {p.users?.full_name ?? p.user_id}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => reassign(o.id)}
                          disabled={!reassignSelections[o.id]}
                          className="rounded-full bg-brand-primary px-3 py-1 text-xs text-white disabled:opacity-50"
                        >
                          Reassign
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-brand-ink-muted">
                    No orders yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "restaurants" && (
        <div className="overflow-x-auto rounded-lg border border-brand-ink-muted/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-accent/10 text-brand-ink-muted">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Status</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {restaurants.map((r) => (
                <tr key={r.id} className="border-t border-brand-ink-muted/10">
                  <td className="p-2">{r.name}</td>
                  <td className="p-2">
                    {r.is_suspended ? "Suspended" : r.is_open ? "Open" : "Closed"}
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => toggleSuspend(r)}
                      className="rounded-full bg-brand-accent/20 px-3 py-1 text-xs text-brand-ink"
                    >
                      {r.is_suspended ? "Unsuspend" : "Suspend"}
                    </button>
                  </td>
                </tr>
              ))}
              {restaurants.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-brand-ink-muted">
                    No restaurants yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === "partners" && (
        <div className="overflow-x-auto rounded-lg border border-brand-ink-muted/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-brand-accent/10 text-brand-ink-muted">
              <tr>
                <th className="p-2">Name</th>
                <th className="p-2">Status</th>
                <th className="p-2">Vehicle</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.user_id} className="border-t border-brand-ink-muted/10">
                  <td className="p-2">{p.users?.full_name ?? "Partner"}</td>
                  <td className="p-2">{p.is_online ? "Online" : "Offline"}</td>
                  <td className="p-2">{p.vehicle_type ?? "—"}</td>
                </tr>
              ))}
              {partners.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-brand-ink-muted">
                    No delivery partners yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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

Load `/admin/dashboard`. Confirm three tabs (Orders/Restaurants/Delivery
partners) with counts, only one panel visible at a time, switching tabs
doesn't crash or show a blank/mixed view. Confirm Orders table shows
reassign controls only for `assigned`/`picked_up` orders. Confirm
Restaurants table's suspend/unsuspend button works and toggles the
status column. Confirm Delivery partners table is read-only and shows
correct online/vehicle data. Confirm empty-state rows show when a
section has zero rows (test by checking actual seeded data, or note
which sections were non-empty). Resize to 390px, confirm tables scroll
horizontally within their container rather than breaking page layout.

- [ ] **Step 3: Commit**

```bash
git add "app/admin/(portal)/dashboard/page.tsx"
git commit -m "feat: migrate admin dashboard to tabbed table layout"
```

---

## Task 3: Login page restyle

**Files:**
- Modify: `app/admin/login/page.tsx` (className changes only — no structural/flow change)

**Interfaces:** none new — pure restyle of existing JSX.

- [ ] **Step 1: Read the current full file**

```bash
cat app/admin/login/page.tsx
```

- [ ] **Step 2: Update container/card/button/input classNames to match new tokens**

Wrap the existing form in a centered card:
`className="mx-auto mt-12 max-w-md rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-6"`.
Update the heading to `className="mb-4 font-heading text-2xl text-brand-ink"`.
Update every `<input>` to `className="w-full rounded-lg border border-brand-ink-muted/20 px-3 py-2"`.
Update the submit button to `className="w-full rounded-full bg-brand-primary px-4 py-2 text-white"`.
Do not change any state variable, handler, validation logic, or any
redirect-safety function present in the file.

- [ ] **Step 3: Manual verification — cold-session check**

```bash
npm run build
npm run dev
```

With cleared storage, load `/admin/login`, confirm it renders as a
centered card with no top bar (outside the route group from Task 1).
Confirm login works end-to-end and lands cleanly on the dashboard with no
infinite loading.

- [ ] **Step 4: Commit**

```bash
git add app/admin/login/page.tsx
git commit -m "style: restyle admin login page with new design tokens"
```

---

## Task 4: Final verification and merge

**Files:** none (verification + git merge only)

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: succeeds with no errors, including `/admin/login` and
`/admin/dashboard` (now served from the route group, same URL).

- [ ] **Step 2: Full manual walkthrough at desktop and 390px width, from a CLEARED-storage browser**

Login (fresh) → dashboard (all 3 tabs, suspend/unsuspend, reassign if a
reassignable order exists) → sign out → confirm login page has no top
bar and re-login works cleanly. Repeat the tab-bar/table-overflow check
at 390px.

- [ ] **Step 3: Confirm Review Focus items are covered**

Re-check each of the 5 Review Focus bullets above against the actual
running app: cold-session login, cross-account check (or its documented
skip if only one admin account exists), empty states for all 3 tables,
tab-switching stability, and mobile table overflow behavior.

- [ ] **Step 4: Merge to local main**

```bash
cd C:\Vishal\Projects\FoodDelivery_App_WebSite
git merge admin-portal-rebuild
```

Expected: fast-forward or clean merge.

- [ ] **Step 5: Remove the worktree**

```bash
git worktree remove .claude/worktrees/admin-portal-rebuild
```

If this fails with a file-lock error, leave the directory in place —
safe, holds no unique content once merged.

- [ ] **Step 6: Report completion**

Do not push to `origin` — per project rule, pushing requires asking first
unless Vishal's "Commit Work" phrase is invoked. This completes all 3
sub-projects of the vendor/delivery/admin visual pass (candidate #1 from
`KICKOFF_11.md`) — next up per Vishal's ordering is candidate #2 (the
React Native + Expo mobile app), then #3 (the `MenuItemRow.tsx` non-veg-dot
fix).
