# Delivery Portal Visual Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the delivery portal's layout/UX (route-group shell with top bar, two-column dashboard) on the existing design tokens, with zero functional/API change, and with the route-group structure baked in from Task 1 (not bolted on after a review, as happened in the vendor portal rebuild).

**Architecture:** `DeliverySessionContext` + `DeliveryShell` provide session state once via `app/delivery/(portal)/layout.tsx`. `app/delivery/login` stays outside the `(portal)` route group so the shell never mounts there — this is the exact fix the vendor rebuild's final review required, applied here from the start. Dashboard page drops its own `useDeliverySession()` call, reads context instead, and its two lists become a `md:grid-cols-2` layout. No new API routes, no schema change.

**Tech Stack:** Next.js App Router, TypeScript, Tailwind CSS, Supabase JS client, existing `lib/branding.ts` tokens.

**Spec:** `docs/superpowers/specs/2026-09-27-delivery-portal-visual-rebuild-design.md`

## Global Constraints

- Card/input border radius: 8px (`rounded-lg`). Button border radius: 999px full pill (`rounded-full`) — every button, no exceptions. The vendor rebuild's Task 1 review caught two pill-radius violations and its final review caught more on an unmigrated page — check every button in every task here.
- Use existing Tailwind tokens (`brand-primary`, `brand-accent`, `brand-bg`, `brand-surface`, `brand-ink`, `brand-ink-muted`) — never hardcode hex.
- No change to any `/api/delivery/*` route behavior or shape.
- `useDeliverySession()` (`components/delivery/useDeliverySession.ts`) is not modified — only where it's called from.
- **The route group (`app/delivery/(portal)/...`) is mandatory from Task 1** — `app/delivery/login/page.tsx` must never be wrapped by the shell layout. This is not optional polish; the vendor rebuild shipped without it and its final review found two Critical bugs (infinite post-login loading hang, stale session data after switching accounts in the same tab) that this structure alone fixes.
- Run `npm run build` (not just `tsc --noEmit`) before any task is marked done.
- Money values continue using the existing float `.toFixed(2)` display already present in this file (delivery uses plain `total` numbers from the API, not paise conversion like vendor) — do not introduce new float math beyond what already exists.

## Review Focus

- Cold-session login: after clearing storage and logging in fresh, the dashboard must load without an infinite "Loading…" — this is exactly the bug class the vendor rebuild's final review found; verify live from a cleared-storage browser, not an already-logged-in tab.
- Cross-account session leak: signing out and logging in as a DIFFERENT delivery partner in the same tab must show that partner's own online-status and order lists, never the previous partner's stale state.
- Empty states: zero available orders and zero "your deliveries" must each show their existing explicit message ("None right now." / "No deliveries yet."), not a blank card.
- Geolocation permission denied — the existing fallback to manual lat/lng inputs must still work; don't let the restyle accidentally hide or disable those inputs when geolocation fails.
- Mobile width (390px): the two-column grid must collapse to a single stacked column, not overflow or squeeze both lists into an unreadable half-width layout.

---

## Task 0: Worktree setup

**Files:** none (environment only)

- [ ] **Step 1: Create isolated worktree**

```bash
git worktree add .claude/worktrees/delivery-portal-rebuild -b delivery-portal-rebuild
```

- [ ] **Step 2: Copy gitignored env file into the worktree**

```bash
cp .env.local .claude/worktrees/delivery-portal-rebuild/.env.local
```

- [ ] **Step 3: Confirm local Supabase is running**

```bash
cd .claude/worktrees/delivery-portal-rebuild
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

## Task 1: Route group, DeliverySessionContext, DeliveryShell

**Files:**
- Create: `components/delivery/DeliverySessionContext.tsx`
- Create: `components/delivery/DeliveryShell.tsx`
- Create: `app/delivery/(portal)/layout.tsx`
- Move: `app/delivery/dashboard/page.tsx` → `app/delivery/(portal)/dashboard/page.tsx` (content unchanged in this task — Task 2 restyles it)

**Interfaces:**
- Produces: `DeliverySessionContext` — React context of type `{ loading: boolean; partnerId: string | null; isOnline: boolean; setIsOnline: (value: boolean) => void }`.
- Produces: `useDeliverySessionContext()` — hook that reads the context, throws if used outside `DeliveryShell`.
- Produces: `DeliveryShell` — client component rendering a top bar (brand mark, online/offline badge, sign out), wrapping `children`, providing the context above.
- Consumes: `useDeliverySession()` from `components/delivery/useDeliverySession.ts` (existing, unmodified) — returns `{ partnerId, isOnline, loading }`.

- [ ] **Step 1: Write `DeliverySessionContext.tsx`**

```tsx
"use client";

import { createContext, useContext } from "react";

export type DeliverySessionValue = {
  loading: boolean;
  partnerId: string | null;
  isOnline: boolean;
  setIsOnline: (value: boolean) => void;
};

export const DeliverySessionContext = createContext<DeliverySessionValue | null>(null);

export function useDeliverySessionContext(): DeliverySessionValue {
  const ctx = useContext(DeliverySessionContext);
  if (!ctx) {
    throw new Error("useDeliverySessionContext must be used within DeliveryShell");
  }
  return ctx;
}
```

- [ ] **Step 2: Write `DeliveryShell.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDeliverySession } from "@/components/delivery/useDeliverySession";
import { DeliverySessionContext } from "@/components/delivery/DeliverySessionContext";

export default function DeliveryShell({ children }: { children: React.ReactNode }) {
  const { loading, partnerId, isOnline: initialOnline } = useDeliverySession();
  const router = useRouter();
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (!loading) setIsOnline(initialOnline);
  }, [loading, initialOnline]);

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/delivery/login");
  }

  if (loading) return <p className="p-4">Loading…</p>;

  return (
    <DeliverySessionContext.Provider value={{ loading, partnerId, isOnline, setIsOnline }}>
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between border-b border-brand-ink-muted/10 bg-brand-surface p-3">
          <span className="font-heading text-lg text-brand-ink">Delivery</span>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-brand-accent/20 px-3 py-1 text-xs font-medium text-brand-ink">
              {isOnline ? "Online" : "Offline"}
            </span>
            <button
              onClick={signOut}
              className="rounded-full px-3 py-1 text-sm text-brand-ink-muted hover:bg-brand-accent/10"
            >
              Sign out
            </button>
          </div>
        </div>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </DeliverySessionContext.Provider>
  );
}
```

Use this second, corrected version as the actual file contents. There is
no "no partner linked" message needed here (unlike vendor's shell) —
`useDeliverySession()` only ever returns a real `partnerId` after a
successful resolve, or redirects to login; it has no distinct
"logged in but no partner profile" state to display.

- [ ] **Step 3: Write `app/delivery/(portal)/layout.tsx`**

```tsx
import DeliveryShell from "@/components/delivery/DeliveryShell";

export default function DeliveryPortalLayout({ children }: { children: React.ReactNode }) {
  return <DeliveryShell>{children}</DeliveryShell>;
}
```

- [ ] **Step 4: Move the dashboard page into the route group**

```bash
mkdir -p "app/delivery/(portal)/dashboard"
git mv app/delivery/dashboard/page.tsx "app/delivery/(portal)/dashboard/page.tsx"
```

Do not edit the moved file's contents in this task — it still calls
`useDeliverySession()` directly and still works exactly as before; Task 2
migrates it to `useDeliverySessionContext()` and restyles it. This task's
job is only to prove the route-group/shell mounts correctly around the
page unchanged.

- [ ] **Step 5: Manual verification — cold-session check (mandatory, per Review Focus)**

```bash
npm run build
npm run dev
```

In a browser with CLEARED storage/cookies: navigate to `/delivery/login`,
confirm no top bar renders (shell isn't mounted there). Log in as an
existing seeded delivery partner, confirm `/delivery/dashboard` shows the
top bar with correct Online/Offline badge and no infinite "Loading…".
Sign out, then log in as a DIFFERENT seeded delivery partner in the same
tab — confirm the new partner's own online-status shows, not the
previous partner's. Resize to 390px, confirm the top bar still renders
correctly (no sidebar to collapse, so this is just a visual check).

- [ ] **Step 6: Commit**

```bash
git add components/delivery/DeliverySessionContext.tsx components/delivery/DeliveryShell.tsx "app/delivery/(portal)/layout.tsx" "app/delivery/(portal)/dashboard/page.tsx"
git status
```

Confirm `git status` shows `app/delivery/dashboard/page.tsx` as deleted
(moved) and the new path as added — this should appear as a rename in
`git log --follow` even though `git add` sees add+delete.

```bash
git commit -m "feat: add delivery portal shell and route group (cold-session-safe from the start)"
```

---

## Task 2: Dashboard page context migration and two-column restructure

**Files:**
- Modify: `app/delivery/(portal)/dashboard/page.tsx` (full rewrite of the component body)

**Interfaces:**
- Consumes: `useDeliverySessionContext()` from Task 1 — `{ loading, partnerId, isOnline, setIsOnline }`.

- [ ] **Step 1: Rewrite `app/delivery/(portal)/dashboard/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useDeliverySessionContext } from "@/components/delivery/DeliverySessionContext";

type OrderRow = {
  id: string;
  status: string;
  total: number;
  stores: { name: string } | null;
};

const NEXT_LABEL: Record<string, string> = {
  assigned: "Mark picked up",
  picked_up: "Mark delivered",
};

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function DeliveryDashboardPage() {
  const { isOnline, setIsOnline } = useDeliverySessionContext();
  const [available, setAvailable] = useState<OrderRow[]>([]);
  const [mine, setMine] = useState<OrderRow[]>([]);
  const [lat, setLat] = useState("12.9716");
  const [lng, setLng] = useState("77.5946");
  const [error, setError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Record<string, string>>({});

  async function loadOrders() {
    const headers = await authHeader();
    const [availRes, mineRes] = await Promise.all([
      fetch("/api/delivery/available-orders", { headers }),
      fetch("/api/delivery/orders", { headers }),
    ]);
    const availBody = await availRes.json();
    const mineBody = await mineRes.json();
    if (availRes.ok) setAvailable(availBody.orders);
    if (mineRes.ok) {
      const mineOrders: OrderRow[] = mineBody.orders;
      setMine(mineOrders);
      const activeIds = new Set(
        mineOrders
          .filter((o) => o.status === "assigned" || o.status === "picked_up")
          .map((o) => o.id)
      );
      setAddresses((prev) => {
        const next: Record<string, string> = {};
        for (const [id, addr] of Object.entries(prev)) {
          if (activeIds.has(id)) next[id] = addr;
        }
        return next;
      });
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    if (!isOnline || typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(String(position.coords.latitude));
        setLng(String(position.coords.longitude));
      },
      () => {
        // permission denied or unavailable — keep existing manual values
      },
      { timeout: 5000 }
    );
  }, [isOnline]);

  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(async () => {
      await fetch("/api/delivery/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ lat: Number(lat), lng: Number(lng) }),
      });
    }, 15000);
    return () => clearInterval(interval);
  }, [isOnline, lat, lng]);

  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(loadOrders, 10000);
    return () => clearInterval(interval);
  }, [isOnline]);

  async function toggleOnline() {
    const res = await fetch("/api/delivery/toggle-online", {
      method: "POST",
      headers: await authHeader(),
    });
    const body = await res.json();
    if (res.ok) setIsOnline(body.isOnline);
    await loadOrders();
  }

  async function claim(orderId: string) {
    setError(null);
    const res = await fetch(`/api/delivery/orders/${orderId}/claim`, {
      method: "POST",
      headers: await authHeader(),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to claim order");
      return;
    }
    await loadOrders();
  }

  async function advance(orderId: string) {
    setError(null);
    const res = await fetch(`/api/delivery/orders/${orderId}/status`, {
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

  async function viewAddress(orderId: string) {
    setError(null);
    const res = await fetch(`/api/delivery/orders/${orderId}/address`, {
      headers: await authHeader(),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to load address");
      return;
    }
    setAddresses((prev) => ({ ...prev, [orderId]: body.address.line1 }));
  }

  return (
    <div>
      <h1 className="mb-4 font-heading text-2xl text-brand-ink">Dashboard</h1>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3">
        <button
          onClick={toggleOnline}
          className={`rounded-full px-4 py-2 text-sm text-white ${
            isOnline ? "bg-green-600" : "bg-brand-ink-muted/40"
          }`}
        >
          {isOnline ? "Online" : "Offline"} — tap to toggle
        </button>
        {isOnline && (
          <div className="flex gap-2 text-xs">
            <input
              className="w-24 rounded-lg border border-brand-ink-muted/20 px-2 py-1"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
            />
            <input
              className="w-24 rounded-lg border border-brand-ink-muted/20 px-2 py-1"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h2 className="mb-2 font-semibold text-brand-ink">Available orders</h2>
          <ul className="flex flex-col gap-2">
            {available.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3"
              >
                <span>
                  #{o.id.slice(0, 8)} · {o.stores?.name ?? "Restaurant"} · ₹{o.total.toFixed(2)}
                </span>
                <button
                  onClick={() => claim(o.id)}
                  className="rounded-full bg-brand-primary px-3 py-1 text-xs text-white"
                >
                  Claim
                </button>
              </li>
            ))}
            {available.length === 0 && (
              <p className="text-sm text-brand-ink-muted">None right now.</p>
            )}
          </ul>
        </div>

        <div>
          <h2 className="mb-2 font-semibold text-brand-ink">Your deliveries</h2>
          <ul className="flex flex-col gap-2">
            {mine.map((o) => (
              <li
                key={o.id}
                className="flex flex-col gap-1 rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-3"
              >
                <div className="flex items-center justify-between">
                  <span>
                    #{o.id.slice(0, 8)} · {o.status} · ₹{o.total.toFixed(2)}
                  </span>
                  <div className="flex gap-2">
                    {(o.status === "assigned" || o.status === "picked_up") && (
                      <button
                        onClick={() => viewAddress(o.id)}
                        className="rounded-full border border-brand-ink-muted/20 px-3 py-1 text-xs"
                      >
                        View address
                      </button>
                    )}
                    {NEXT_LABEL[o.status] && (
                      <button
                        onClick={() => advance(o.id)}
                        className="rounded-full bg-brand-primary px-3 py-1 text-xs text-white"
                      >
                        {NEXT_LABEL[o.status]}
                      </button>
                    )}
                  </div>
                </div>
                {addresses[o.id] && (
                  <p className="text-xs text-brand-ink-muted">{addresses[o.id]}</p>
                )}
              </li>
            ))}
            {mine.length === 0 && (
              <p className="text-sm text-brand-ink-muted">No deliveries yet.</p>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

```bash
npm run build
npm run dev
```

Load `/delivery/dashboard` (already logged in). Confirm two-column layout
at desktop width, single column at 390px. Toggle online/offline — confirm
badge in the top bar (Task 1's `DeliveryShell`) updates via
`setIsOnline`. Confirm lat/lng inputs appear only while online, geolocation
prefills them (or stays at manual defaults if permission denied). Claim
an available order (seed one via psql if none exist), advance its status,
view its address. Confirm the 15s ping and 10s poll still fire (check
Network tab or console) while online.

- [ ] **Step 3: Commit**

```bash
git add "app/delivery/(portal)/dashboard/page.tsx"
git commit -m "feat: migrate delivery dashboard to session context and two-column layout"
```

---

## Task 3: Login page restyle

**Files:**
- Modify: `app/delivery/login/page.tsx` (className changes only — no structural/flow change)

**Interfaces:** none new — pure restyle of existing JSX.

- [ ] **Step 1: Read the current full file**

```bash
cat app/delivery/login/page.tsx
```

- [ ] **Step 2: Update container/card/button/input classNames to match new tokens**

Wrap the existing form in a centered card:
`className="mx-auto mt-12 max-w-md rounded-lg border border-brand-ink-muted/10 bg-brand-surface p-6"`.
Update the heading to `className="mb-4 font-heading text-2xl text-brand-ink"`.
Update every `<input>` to `className="w-full rounded-lg border border-brand-ink-muted/20 px-3 py-2"`.
Update the submit button to `className="w-full rounded-full bg-brand-primary px-4 py-2 text-white"`.
If a vehicle-type selector or mode-switch toggle exists as styled buttons (not
plain links), give them `rounded-full` too, consistent with the pill-button
rule. Do not change any state variable, handler, validation logic, or the
existing `getSafeRedirect` function.

- [ ] **Step 3: Manual verification — cold-session check**

```bash
npm run build
npm run dev
```

With cleared storage, load `/delivery/login`, confirm it renders as a
centered card with no top bar (it's outside the `(portal)` route group
from Task 1). Confirm login and signup both still work end-to-end, and
confirm logging in successfully lands cleanly on the dashboard with no
infinite loading (re-confirming Task 1's fix holds after this page's
restyle).

- [ ] **Step 4: Commit**

```bash
git add app/delivery/login/page.tsx
git commit -m "style: restyle delivery login page with new design tokens"
```

---

## Task 4: Final verification and merge

**Files:** none (verification + git merge only)

- [ ] **Step 1: Full build**

```bash
npm run build
```

Expected: succeeds with no errors, including `/delivery/login` and
`/delivery/dashboard` (now served from the route group, same URL).

- [ ] **Step 2: Full manual walkthrough at desktop and 390px width, from a CLEARED-storage browser**

Login (fresh) → dashboard (toggle online/offline, claim/advance an order,
view address) → sign out → login as a DIFFERENT seeded delivery partner
in the same tab, confirm no stale data from the first partner. Repeat the
two-column/mobile-stacked layout check at 390px.

- [ ] **Step 3: Confirm Review Focus items are covered**

Re-check each of the 5 Review Focus bullets above against the actual
running app: cold-session login, cross-account session leak, empty
states for both lists, geolocation-denied fallback, and mobile column
collapse.

- [ ] **Step 4: Merge to local main**

```bash
cd C:\Vishal\Projects\FoodDelivery_App_WebSite
git merge delivery-portal-rebuild
```

Expected: fast-forward or clean merge (this plan touches only
delivery-portal files, no conflicts expected with `main`).

- [ ] **Step 5: Remove the worktree**

```bash
git worktree remove .claude/worktrees/delivery-portal-rebuild
```

If this fails with a file-lock error (as has happened before in this
project), leave the directory in place — safe, holds no unique content
once merged.

- [ ] **Step 6: Report completion**

Do not push to `origin` — per project rule, pushing requires asking first
unless Vishal's "Commit Work" phrase is invoked.
