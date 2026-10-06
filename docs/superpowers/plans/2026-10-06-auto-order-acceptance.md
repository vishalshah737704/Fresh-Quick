# Automatic Order Acceptance (demo mode) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Admin checkbox makes every paid order (and every open order when ticked) advance placed -> accepted -> preparing -> ready -> (partner assigned by workflow 04) -> picked_up, 3 seconds apart.

**Architecture:** A service-role-only `app_settings` row holds the switch. New database triggers fire a new n8n webhook on a payment succeeding and on an order's status changing; n8n workflow 09 waits 3 s and calls `POST /api/internal/orders/[id]/auto-step`, which re-checks the switch and the order's current status before moving it one step (the status change fires the next event, so the chain runs itself). Ticking the box calls a sweep webhook that nudges every open order once.

**Tech Stack:** Next.js route handlers (TypeScript), Supabase Postgres (migration 35), n8n 2.40 workflow JSON, node:test (`tests/*.test.mjs`).

**Spec:** `docs/superpowers/specs/2026-10-06-auto-order-acceptance-design.md`

## Global Constraints

- Local Docker stack only; never stop or restart the n8n container (it runs with `--rm`).
- `lib/*.ts` files that tests import must be import-free (node's test runner cannot resolve value imports between lib files); server wiring lives in a separate `server-only` file.
- No RLS write policy on `app_settings` (service-role only, no policies at all).
- Internal routes use `verifyInternalSecret`; admin routes use `resolveAdmin` + `tokenFromRequest` from `@/lib/admin-auth`.
- n8n: URLs use `$env.APP_BASE_URL`, secret `$env.N8N_INTERNAL_SECRET`, `String(...)` around `.includes()`, placeholder credential ids only, never a real credential id.
- Real Gmail: workflows 03 and 05 send real mail; live tests use only an address Vishal owns, one order at a time, and ask first.
- 2-space indent, ES modules, async/await, comments only for non-obvious WHY.
- Run `npm run build` before calling a route task done; run `node --test tests/*.test.mjs` and `npx tsc --noEmit`.

## Review Focus

- Manual click or cancel during the 3 s wait: the step must skip, never override (test: `changed`, `raced`).
- Payment still pending or failed: `placed` must never advance (test: `payment_pending`).
- Setting off or malformed value in the table: nothing moves (test: `parseAutoOrderSetting`, `off`).
- Duplicate or reordered webhook events: same step twice must advance only once (test: `raced`).
- Ready order with no partner when the box is ticked: sweep re-triggers assignment (test: `retriggered`).

---

### Task 1: Setting table, triggers, pure logic

**Files:**
- Create: `supabase/migrations/00000000000035_auto_order_acceptance.sql`
- Create: `lib/auto-order.ts`
- Test: `tests/auto-order.test.mjs`

**Interfaces:**
- Produces (`lib/auto-order.ts`): `nextAutoStatus(status: string): string | null`; `parseAutoOrderSetting(value: unknown): boolean`; `parseEnabledBody(body: unknown): boolean | null`; `type AutoStepDeps`; `type AutoStepResult`; `runAutoStep(deps, id, expectedStatus): Promise<AutoStepResult>`; `AUTO_ORDER_KEY = "auto_order_acceptance"`; `OPEN_AUTO_STATUSES`.

- [ ] **Step 1: Write the failing test**

```js
// tests/auto-order.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextAutoStatus,
  parseAutoOrderSetting,
  parseEnabledBody,
  runAutoStep,
} from "../lib/auto-order.ts";

test("nextAutoStatus maps the four automatic steps only", () => {
  assert.equal(nextAutoStatus("placed"), "accepted");
  assert.equal(nextAutoStatus("accepted"), "preparing");
  assert.equal(nextAutoStatus("preparing"), "ready");
  assert.equal(nextAutoStatus("assigned"), "picked_up");
  for (const s of ["ready", "picked_up", "delivered", "cancelled", "rejected", "toString", "", "x"]) {
    assert.equal(nextAutoStatus(s), null, s);
  }
});

test("parseAutoOrderSetting is true only for {enabled: true}", () => {
  assert.equal(parseAutoOrderSetting({ enabled: true }), true);
  for (const v of [{ enabled: false }, { enabled: "true" }, {}, null, undefined, "x", 1, []]) {
    assert.equal(parseAutoOrderSetting(v), false);
  }
});

test("parseEnabledBody needs a strict boolean", () => {
  assert.equal(parseEnabledBody({ enabled: true }), true);
  assert.equal(parseEnabledBody({ enabled: false }), false);
  for (const v of [{ enabled: "true" }, { enabled: 1 }, {}, null, "x"]) {
    assert.equal(parseEnabledBody(v), null);
  }
});

function makeDeps({ enabled = true, order = { status: "placed", paymentSucceeded: true }, advanceOk = true, retrigger = true } = {}) {
  const calls = [];
  return {
    calls,
    deps: {
      readEnabled: async () => enabled,
      readOrder: async () => order,
      advance: async (id, from, to) => { calls.push(["advance", id, from, to]); return advanceOk; },
      retriggerAssignment: async (id) => { calls.push(["retrigger", id]); return retrigger; },
    },
  };
}

test("runAutoStep advances one step", async () => {
  const { deps, calls } = makeDeps();
  const result = await runAutoStep(deps, "o1", "placed");
  assert.deepEqual(result, { advanced: true, from: "placed", to: "accepted" });
  assert.deepEqual(calls, [["advance", "o1", "placed", "accepted"]]);
});

test("runAutoStep skips: off, missing, changed, no_step, payment_pending, raced", async () => {
  assert.deepEqual(await runAutoStep(makeDeps({ enabled: false }).deps, "o", "placed"), { advanced: false, reason: "off" });
  assert.deepEqual(await runAutoStep(makeDeps({ order: null }).deps, "o", "placed"), { advanced: false, reason: "missing" });
  assert.deepEqual(await runAutoStep(makeDeps({ order: { status: "cancelled", paymentSucceeded: true } }).deps, "o", "placed"), { advanced: false, reason: "changed" });
  assert.deepEqual(await runAutoStep(makeDeps().deps, "o", "picked_up"), { advanced: false, reason: "no_step" });
  assert.deepEqual(await runAutoStep(makeDeps({ order: { status: "placed", paymentSucceeded: false } }).deps, "o", "placed"), { advanced: false, reason: "payment_pending" });
  assert.deepEqual(await runAutoStep(makeDeps({ advanceOk: false }).deps, "o", "placed"), { advanced: false, reason: "raced" });
});

test("runAutoStep never touches the order when off or when the status changed", async () => {
  const off = makeDeps({ enabled: false });
  await runAutoStep(off.deps, "o", "placed");
  const changed = makeDeps({ order: { status: "accepted", paymentSucceeded: true } });
  await runAutoStep(changed.deps, "o", "placed");
  assert.deepEqual(off.calls, []);
  assert.deepEqual(changed.calls, []);
});

test("a ready order re-triggers assignment instead of advancing", async () => {
  const { deps, calls } = makeDeps({ order: { status: "ready", paymentSucceeded: true } });
  assert.deepEqual(await runAutoStep(deps, "o1", "ready"), { advanced: false, reason: "retriggered" });
  assert.deepEqual(calls, [["retrigger", "o1"]]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/auto-order.test.mjs` — Expected: FAIL (cannot find `../lib/auto-order.ts`).

- [ ] **Step 3: Write the logic**

```ts
// lib/auto-order.ts
// Import-free on purpose (node's test runner cannot resolve value imports between lib files).
// Demo mode: when the Admin setting is on, n8n workflow 09 calls runAutoStep 3 s after each
// status event; the status check makes every call safe to repeat or to lose a race.
export const AUTO_ORDER_KEY = "auto_order_acceptance";

// Orders the sweep nudges when the box is ticked.
export const OPEN_AUTO_STATUSES = ["placed", "accepted", "preparing", "ready", "assigned"] as const;

const NEXT: Record<string, string> = {
  placed: "accepted",
  accepted: "preparing",
  preparing: "ready",
  assigned: "picked_up",
};

export function nextAutoStatus(status: string): string | null {
  return Object.prototype.hasOwnProperty.call(NEXT, status) ? NEXT[status] : null;
}

export function parseAutoOrderSetting(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { enabled?: unknown }).enabled === true
  );
}

export function parseEnabledBody(body: unknown): boolean | null {
  if (typeof body !== "object" || body === null) return null;
  const enabled = (body as { enabled?: unknown }).enabled;
  return typeof enabled === "boolean" ? enabled : null;
}

export type AutoStepOrder = { status: string; paymentSucceeded: boolean };

export type AutoStepDeps = {
  readEnabled(): Promise<boolean>;
  readOrder(id: string): Promise<AutoStepOrder | null>;
  // False when the order had already moved off `from` (a manual click or a duplicate event won).
  advance(id: string, from: string, to: string): Promise<boolean>;
  // Re-saves a ready, unassigned order so workflow 04's assignment trigger fires again.
  retriggerAssignment(id: string): Promise<boolean>;
};

export type AutoStepResult =
  | { advanced: true; from: string; to: string }
  | {
      advanced: false;
      reason: "off" | "missing" | "changed" | "no_step" | "payment_pending" | "raced" | "retriggered";
    };

export async function runAutoStep(
  deps: AutoStepDeps,
  id: string,
  expectedStatus: string
): Promise<AutoStepResult> {
  if (!(await deps.readEnabled())) return { advanced: false, reason: "off" };
  const to = nextAutoStatus(expectedStatus);
  if (to === null && expectedStatus !== "ready") return { advanced: false, reason: "no_step" };
  const order = await deps.readOrder(id);
  if (!order) return { advanced: false, reason: "missing" };
  if (order.status !== expectedStatus) return { advanced: false, reason: "changed" };
  if (expectedStatus === "ready") {
    await deps.retriggerAssignment(id);
    return { advanced: false, reason: "retriggered" };
  }
  // A placed order's payment can still be pending; moving on would let a later failure slip through.
  if (expectedStatus === "placed" && !order.paymentSucceeded) {
    return { advanced: false, reason: "payment_pending" };
  }
  const moved = await deps.advance(id, expectedStatus, to as string);
  return moved
    ? { advanced: true, from: expectedStatus, to: to as string }
    : { advanced: false, reason: "raced" };
}
```

- [ ] **Step 4: Write the migration**

```sql
-- supabase/migrations/00000000000035_auto_order_acceptance.sql
-- Admin "Automatic order acceptance" demo switch + the n8n triggers that drive it (workflow 09).
create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS on with NO policies: only the service-role API routes read or write this table.
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value)
values ('auto_order_acceptance', '{"enabled": false}'::jsonb);

create trigger n8n_auto_order_step_orders
  after update of status on public.orders
  for each row
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/auto-order-step');

create trigger n8n_auto_order_step_payments
  after insert or update of status on public.payments
  for each row
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/auto-order-step');
```

- [ ] **Step 5: Apply the migration locally and run tests**

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/migrations/00000000000035_auto_order_acceptance.sql` then `node --test tests/auto-order.test.mjs`
Expected: CREATE TABLE ... INSERT 0 1 ... CREATE TRIGGER x2; tests PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00000000000035_auto_order_acceptance.sql lib/auto-order.ts tests/auto-order.test.mjs
git commit -m "feat(auto-order): setting table, n8n triggers and pure step logic"
```

### Task 2: Server wiring and internal routes

**Files:**
- Create: `lib/auto-order-server.ts`
- Create: `app/api/internal/orders/[id]/auto-step/route.ts`
- Create: `app/api/internal/auto-order/open/route.ts`

**Interfaces:**
- Consumes: `runAutoStep`, `AutoStepDeps`, `parseAutoOrderSetting`, `AUTO_ORDER_KEY`, `OPEN_AUTO_STATUSES` from `@/lib/auto-order`.
- Produces (`lib/auto-order-server.ts`): `getAutoOrderEnabled(): Promise<boolean>`; `setAutoOrderEnabled(enabled: boolean): Promise<boolean>` (true on success); `autoStepDeps: AutoStepDeps`; `listOpenAutoOrders(): Promise<{ id: string; status: string }[]>`.
- Routes: `POST /api/internal/orders/[id]/auto-step` body `{expectedStatus: string}` -> 200 JSON `AutoStepResult`; `GET /api/internal/auto-order/open` -> `{ orders: [{id, status}] }` (empty when off).

- [ ] **Step 1: Write the server wiring**

```ts
// lib/auto-order-server.ts
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import {
  AUTO_ORDER_KEY,
  OPEN_AUTO_STATUSES,
  parseAutoOrderSetting,
  type AutoStepDeps,
} from "@/lib/auto-order";

export async function getAutoOrderEnabled(): Promise<boolean> {
  const { data } = await supabaseServer
    .from("app_settings")
    .select("value")
    .eq("key", AUTO_ORDER_KEY)
    .maybeSingle();
  return parseAutoOrderSetting(data?.value);
}

export async function setAutoOrderEnabled(enabled: boolean): Promise<boolean> {
  const { error } = await supabaseServer
    .from("app_settings")
    .upsert({ key: AUTO_ORDER_KEY, value: { enabled }, updated_at: new Date().toISOString() });
  return !error;
}

export const autoStepDeps: AutoStepDeps = {
  readEnabled: getAutoOrderEnabled,
  async readOrder(id) {
    const { data } = await supabaseServer
      .from("orders")
      .select("status, payments(status)")
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const payments = (Array.isArray(data.payments) ? data.payments : data.payments ? [data.payments] : []) as {
      status: string;
    }[];
    return { status: data.status, paymentSucceeded: payments.some((p) => p.status === "success") };
  },
  async advance(id, from, to) {
    const { data, error } = await supabaseServer
      .from("orders")
      .update({ status: to })
      .eq("id", id)
      .eq("status", from)
      .select("id");
    return !error && (data?.length ?? 0) === 1;
  },
  async retriggerAssignment(id) {
    // Writing the same status still fires the "after update of status" trigger, which restarts workflow 04.
    const { data, error } = await supabaseServer
      .from("orders")
      .update({ status: "ready" })
      .eq("id", id)
      .eq("status", "ready")
      .is("delivery_partner_id", null)
      .select("id");
    return !error && (data?.length ?? 0) === 1;
  },
};

export async function listOpenAutoOrders(): Promise<{ id: string; status: string }[]> {
  if (!(await getAutoOrderEnabled())) return [];
  const { data } = await supabaseServer
    .from("orders")
    .select("id, status, payments(status)")
    .in("status", [...OPEN_AUTO_STATUSES]);
  const rows = (data ?? []) as { id: string; status: string; payments: { status: string }[] | { status: string } | null }[];
  return rows
    .filter((row) => {
      if (row.status !== "placed") return true;
      const payments = Array.isArray(row.payments) ? row.payments : row.payments ? [row.payments] : [];
      return payments.some((p) => p.status === "success");
    })
    .map((row) => ({ id: row.id, status: row.status }));
}
```

- [ ] **Step 2: Write the routes**

```ts
// app/api/internal/orders/[id]/auto-step/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { runAutoStep } from "@/lib/auto-order";
import { autoStepDeps } from "@/lib/auto-order-server";

// Called only by n8n workflow 09, 3 s after a status event. Always 200 for skips so n8n treats them as done.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const expectedStatus = typeof body?.expectedStatus === "string" ? body.expectedStatus : "";
  if (!expectedStatus) {
    return NextResponse.json({ error: "expectedStatus is required" }, { status: 400 });
  }
  return NextResponse.json(await runAutoStep(autoStepDeps, id, expectedStatus));
}
```

```ts
// app/api/internal/auto-order/open/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { listOpenAutoOrders } from "@/lib/auto-order-server";

// Used by n8n workflow 09's sweep when the Admin ticks the box. Empty list when the setting is off.
export async function GET(request: NextRequest) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  return NextResponse.json({ orders: await listOpenAutoOrders() });
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit` — Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add lib/auto-order-server.ts "app/api/internal/orders/[id]/auto-step/route.ts" app/api/internal/auto-order/open/route.ts
git commit -m "feat(auto-order): internal auto-step and open-orders routes"
```

### Task 3: Admin settings API

**Files:**
- Create: `app/api/admin/settings/auto-order/route.ts`

**Interfaces:**
- Consumes: `resolveAdmin`, `tokenFromRequest` (`@/lib/admin-auth`); `parseEnabledBody` (`@/lib/auto-order`); `getAutoOrderEnabled`, `setAutoOrderEnabled` (`@/lib/auto-order-server`).
- Produces: `GET` -> `{ enabled: boolean }`; `PUT {enabled: boolean}` -> `{ enabled: boolean, sweepStarted: boolean }` (400 on a non-boolean, 403/401 via `resolveAdmin`, 500 if the write fails).

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from "next/server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { parseEnabledBody } from "@/lib/auto-order";
import { getAutoOrderEnabled, setAutoOrderEnabled } from "@/lib/auto-order-server";

// The app runs on the host and n8n publishes 5678, so localhost is right here (n8n itself uses host.docker.internal).
const N8N_BASE_URL = process.env.N8N_BASE_URL ?? "http://localhost:5678";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  return NextResponse.json({ enabled: await getAutoOrderEnabled() });
}

export async function PUT(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  const enabled = parseEnabledBody(await request.json().catch(() => null));
  if (enabled === null) {
    return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });
  }
  if (!(await setAutoOrderEnabled(enabled))) {
    return NextResponse.json({ error: "Failed to save the setting" }, { status: 500 });
  }
  let sweepStarted = false;
  if (enabled) {
    // Best effort: the setting is saved either way; n8n being down only means open orders are not nudged.
    try {
      const res = await fetch(`${N8N_BASE_URL}/webhook/foodhub/auto-order-sweep`, {
        method: "POST",
        signal: AbortSignal.timeout(5000),
      });
      sweepStarted = res.ok;
    } catch {
      sweepStarted = false;
    }
  }
  return NextResponse.json({ enabled, sweepStarted });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` — Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/api/admin/settings/auto-order/route.ts
git commit -m "feat(auto-order): admin settings API with sweep trigger"
```

### Task 4: Admin Overview checkbox card

**Files:**
- Create: `components/AutoOrderCard.tsx`
- Modify: `app/admin/(portal)/dashboard/page.tsx` (render the card under the title)

**Interfaces:**
- Consumes: `GET`/`PUT /api/admin/settings/auto-order` from Task 3.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AutoOrderCard() {
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/settings/auto-order", { headers: await authHeader() });
        const body = await res.json();
        if (res.ok) setEnabled(body.enabled === true);
        else setMessage(body.error ?? "Failed to load the setting");
      } catch {
        setMessage("Failed to load the setting");
      }
      setLoaded(true);
    })();
  }, []);

  async function toggle(next: boolean) {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings/auto-order", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ enabled: next }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage(body.error ?? "Failed to save the setting");
      } else {
        setEnabled(body.enabled === true);
        if (body.enabled && !body.sweepStarted) {
          setMessage("Saved, but n8n did not respond, so open orders were not started. Check that n8n is running.");
        }
      }
    } catch {
      setMessage("Failed to save the setting");
    }
    setSaving(false);
  }

  return (
    <div className="mb-6 rounded-[var(--radius-card)] bg-white p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5"
          checked={enabled}
          disabled={!loaded || saving}
          onChange={(event) => void toggle(event.target.checked)}
        />
        <span>
          <span className="block font-semibold text-brand-ink">Automatic order acceptance (demo mode)</span>
          <span className="block text-sm text-brand-ink-muted">
            When on, every paid order is accepted, prepared, marked ready and picked up by itself, 3 seconds
            apart. Vendors and delivery partners do nothing. Needs n8n running.
          </span>
        </span>
      </label>
      {message && <p className="mt-2 text-sm text-red-600">{message}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Render it on the Overview page**

In `app/admin/(portal)/dashboard/page.tsx` add `import AutoOrderCard from "@/components/AutoOrderCard";` and render `<AutoOrderCard />` directly after the `{error && ...}` line.

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit` — Expected: no output.

```bash
git add components/AutoOrderCard.tsx "app/admin/(portal)/dashboard/page.tsx"
git commit -m "feat(auto-order): Admin Overview checkbox card"
```

### Task 5: Workflow 09 and its tests

**Files:**
- Create: `n8n/workflows/09-auto-order-flow.json`
- Test: `tests/auto-order-workflow.test.mjs`

**Interfaces:**
- Consumes: webhook bodies `{type, table, record}` from `n8n_notify`; `POST /api/internal/orders/:id/auto-step` `{expectedStatus}`; `GET /api/internal/auto-order/open` -> `{orders: [{id, status}]}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/auto-order-workflow.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wf = JSON.parse(readFileSync(new URL("../n8n/workflows/09-auto-order-flow.json", import.meta.url), "utf8"));
const byName = (name) => wf.nodes.find((n) => n.name === name);

test("workflow 09 has the step and sweep webhooks", () => {
  const paths = wf.nodes.filter((n) => n.type === "n8n-nodes-base.webhook").map((n) => n.parameters.path).sort();
  assert.deepEqual(paths, ["foodhub/auto-order-step", "foodhub/auto-order-sweep"]);
});

test("the step branch waits exactly 3 seconds before calling auto-step", () => {
  const wait = byName("Wait 3 s");
  assert.equal(wait.parameters.amount, 3);
  assert.equal(wait.parameters.unit, "seconds");
  assert.ok(wf.connections["Wait 3 s"].main[0].some((c) => c.node === "POST auto-step (after 3 s)"));
});

test("the step filter accepts payment success or accepted/preparing/assigned, wrapped in String()", () => {
  const cond = byName("Filter: payment success or status accepted/preparing/assigned").parameters.conditions.string[0].value1;
  assert.match(cond, /String\(/);
  for (const s of ["success", "accepted", "preparing", "assigned", "payments"]) assert.ok(cond.includes(s), s);
  assert.ok(!cond.includes("'ready'") && !cond.includes("picked_up"));
});

test("both auto-step calls send the internal secret and expectedStatus", () => {
  for (const name of ["POST auto-step (after 3 s)", "POST auto-step (sweep)"]) {
    const node = byName(name);
    assert.match(node.parameters.url, /\$env\.APP_BASE_URL/);
    assert.match(node.parameters.url, /auto-step/);
    const headers = JSON.stringify(node.parameters.headerParameters);
    assert.match(headers, /X-Internal-Secret/);
    assert.match(headers, /\$env\.N8N_INTERNAL_SECRET/);
    assert.match(JSON.stringify(node.parameters.bodyParameters), /expectedStatus/);
  }
});

test("the sweep reads the open list and splits it per order with no wait", () => {
  assert.match(byName("GET open orders").parameters.url, /auto-order\/open/);
  assert.equal(byName("Split orders").parameters.fieldToSplitOut, "orders");
  assert.ok(!wf.nodes.some((n) => n.name === "Wait 3 s" && wf.connections["Split orders"]));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/auto-order-workflow.test.mjs` — Expected: FAIL (ENOENT for the workflow file).

- [ ] **Step 3: Write the workflow**

```json
{
  "name": "09 - Auto Order Flow",
  "nodes": [
    {
      "id": "webhook-auto-step",
      "name": "Webhook: order status or payment changed",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 200],
      "webhookId": "f47ac10b-58cc-4372-a567-0e02b2c3d009",
      "parameters": { "httpMethod": "POST", "path": "foodhub/auto-order-step", "responseMode": "onReceived" },
      "notes": "Fired by Postgres triggers n8n_auto_order_step_orders and n8n_auto_order_step_payments (migration 35)."
    },
    {
      "id": "filter-auto-step",
      "name": "Filter: payment success or status accepted/preparing/assigned",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [460, 200],
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{String($json[\"body\"][\"table\"] === 'payments' ? $json[\"body\"][\"record\"][\"status\"] === 'success' : ['accepted','preparing','assigned'].includes($json[\"body\"][\"record\"][\"status\"]))}}",
              "value2": "true"
            }
          ]
        }
      }
    },
    {
      "id": "wait-3s",
      "name": "Wait 3 s",
      "type": "n8n-nodes-base.wait",
      "typeVersion": 1.1,
      "position": [680, 200],
      "webhookId": "f47ac10b-58cc-4372-a567-0e02b2c3d00a",
      "parameters": { "resume": "timeInterval", "amount": 3, "unit": "seconds" },
      "notes": "Workflow must stay active for the wait to resume."
    },
    {
      "id": "post-auto-step",
      "name": "POST auto-step (after 3 s)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [900, 200],
      "parameters": {
        "method": "POST",
        "url": "={{$env.APP_BASE_URL}}/api/internal/orders/{{$('Webhook: order status or payment changed').item.json[\"body\"][\"table\"] === 'payments' ? $('Webhook: order status or payment changed').item.json[\"body\"][\"record\"][\"order_id\"] : $('Webhook: order status or payment changed').item.json[\"body\"][\"record\"][\"id\"]}}/auto-step",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "X-Internal-Secret", "value": "={{$env.N8N_INTERNAL_SECRET}}" }] },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "expectedStatus",
              "value": "={{$('Webhook: order status or payment changed').item.json[\"body\"][\"table\"] === 'payments' ? 'placed' : $('Webhook: order status or payment changed').item.json[\"body\"][\"record\"][\"status\"]}}"
            }
          ]
        },
        "options": { "response": { "response": { "neverError": true } } }
      },
      "notes": "The route re-checks the setting and the order's current status; skips (setting off, order moved, payment pending) return 200."
    },
    {
      "id": "webhook-auto-sweep",
      "name": "Webhook: sweep (Admin ticked the box)",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [240, 440],
      "webhookId": "f47ac10b-58cc-4372-a567-0e02b2c3d00b",
      "parameters": { "httpMethod": "POST", "path": "foodhub/auto-order-sweep", "responseMode": "onReceived" },
      "notes": "Called by PUT /api/admin/settings/auto-order when the box is ticked."
    },
    {
      "id": "get-open-orders",
      "name": "GET open orders",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [460, 440],
      "parameters": {
        "method": "GET",
        "url": "={{$env.APP_BASE_URL}}/api/internal/auto-order/open",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "X-Internal-Secret", "value": "={{$env.N8N_INTERNAL_SECRET}}" }] }
      }
    },
    {
      "id": "split-orders",
      "name": "Split orders",
      "type": "n8n-nodes-base.splitOut",
      "typeVersion": 1,
      "position": [680, 440],
      "parameters": { "fieldToSplitOut": "orders", "options": {} }
    },
    {
      "id": "post-auto-step-sweep",
      "name": "POST auto-step (sweep)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [900, 440],
      "parameters": {
        "method": "POST",
        "url": "={{$env.APP_BASE_URL}}/api/internal/orders/{{$json[\"id\"]}}/auto-step",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "X-Internal-Secret", "value": "={{$env.N8N_INTERNAL_SECRET}}" }] },
        "sendBody": true,
        "bodyParameters": { "parameters": [{ "name": "expectedStatus", "value": "={{$json[\"status\"]}}" }] },
        "options": { "response": { "response": { "neverError": true } } }
      },
      "notes": "One nudge per open order; the status change it causes fires the normal chain, which supplies the later 3 s waits."
    }
  ],
  "connections": {
    "Webhook: order status or payment changed": { "main": [[{ "node": "Filter: payment success or status accepted/preparing/assigned", "type": "main", "index": 0 }]] },
    "Filter: payment success or status accepted/preparing/assigned": { "main": [[{ "node": "Wait 3 s", "type": "main", "index": 0 }], []] },
    "Wait 3 s": { "main": [[{ "node": "POST auto-step (after 3 s)", "type": "main", "index": 0 }]] },
    "Webhook: sweep (Admin ticked the box)": { "main": [[{ "node": "GET open orders", "type": "main", "index": 0 }]] },
    "GET open orders": { "main": [[{ "node": "Split orders", "type": "main", "index": 0 }]] },
    "Split orders": { "main": [[{ "node": "POST auto-step (sweep)", "type": "main", "index": 0 }]] }
  },
  "settings": { "executionOrder": "v1" }
}
```

- [ ] **Step 4: Run all workflow tests**

Run: `node --test tests/auto-order-workflow.test.mjs tests/n8n-workflows.test.mjs` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add n8n/workflows/09-auto-order-flow.json tests/auto-order-workflow.test.mjs
git commit -m "feat(auto-order): n8n workflow 09 (3 s step chain and sweep)"
```

### Task 6: Import, live verification, docs

**Files:**
- Modify: `docs/n8n-webhook-setup.md` (add "Workflow 09: Auto Order Flow" section)
- Modify: `knowledge/` (Admin checkbox Q&A in the relevant admin file), `CLAUDE.md`, `MEMORY.md`

- [ ] **Step 1: Import and publish workflow 09 in the local n8n** (never stop n8n): copy the JSON into the container and `n8n import:workflow` then publish, following `docs/n8n-webhook-setup.md` Workflow 07/08 steps.
- [ ] **Step 2: Build and restart the app on the real ports** so the new routes are live (`npm run build`, then the project's start script).
- [ ] **Step 3: Live checks with a real browser** (Playwright): tick the box; place an order with an email Vishal owns (ask first); watch status move every 3 s to picked_up and the animation deliver; untick mid-flow and confirm it stops; tick with an open order and confirm the sweep resumes it; check n8n executions show no errors.
- [ ] **Step 4: Docs**: write the workflow 09 section, the knowledge Q&A, the CLAUDE.md and MEMORY.md entries; run the full suite and `npx tsc --noEmit`.
- [ ] **Step 5: Reset Data, commit** (`Commit Work` only when Vishal says so; commit locally per task as above).
