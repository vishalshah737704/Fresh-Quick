# Delivery Animation Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a delivery partner picks up an order, the customer (web + mobile) sees a non-dismissible 15 s animation of a Fresh & Quick courier; only when it finishes does the customer's app mark the order `delivered`, which fires n8n's delivered workflow. An n8n 5-minute fallback completes the order if the customer never does.

**Architecture:** One shared pure module (`lib/delivery-animation.ts`, byte-identical copy in `mobile/lib/`) holds the animation clock, rider/scene geometry and a retry runner. Two new API routes (customer, Bearer-verified; internal, secret-guarded) share one server helper that applies a pure decision function. The partner "Mark delivered" action is removed. Workflow 05 gets a Wait-5-min fallback branch. Web renders the scene as React SVG; mobile as `react-native-svg` in a `Modal`.

**Tech Stack:** Next.js 16 App Router + TypeScript, Supabase (self-hosted, `supabaseServer` service role), n8n 2.40.7 workflow JSON, Expo SDK 57 / React Native 0.86, `node --test` for tests (Node 24 type stripping), `react-native-svg` (new, mobile only).

**Spec:** [docs/superpowers/specs/2026-10-02-delivery-animation-design.md](../specs/2026-10-02-delivery-animation-design.md)

**Execution note:** Per project rules, build in its own git worktree/branch (`delivery-animation`) via `superpowers:using-git-worktrees`, copy `.env.local` into the worktree, and finish with a whole-branch review. Commit via `/commit` (not raw `git commit`) and run `/review` first. Commit steps below show the intended message.

## Global Constraints

- Animation length is exactly `15000` ms; early-call tolerance is `1000` ms (server rejects completion earlier than 14 s after `picked_up_at` with HTTP 425).
- Customer identity comes only from `Authorization: Bearer <token>` verified by `supabaseServer.auth.getUser(token)`; never from the request body.
- `SUPABASE_SERVICE_ROLE_KEY` only in server files guarded by `server-only` (`lib/complete-delivery-server.ts`).
- No new RLS policies; no new DB migration (`picked_up_at` already exists from migration 27).
- Brand name/colors are never hardcoded in components: name from `BRAND.name` (`lib/branding.ts`), logo from `lib/brand-logo.ts`.
- Shared modules `lib/delivery-animation.ts` and `lib/brand-logo.ts` must be **byte-identical** to `mobile/lib/` copies (guarded by `tests/mobile-parity.test.mjs`), contain no runtime imports, and use erasable TypeScript only (no enums/namespaces) so `node --test` can load them.
- IF nodes in n8n that use `.includes()` must wrap in `String(...)`; no real n8n credential ids committed (`PLACEHOLDER_` only).
- Every `"use client"` dynamic page keeps its sibling `loading.tsx` (already present for the order page; do not remove).
- `npm run build` (not just `tsc`) must pass before the web tasks are done.
- Installing `react-native-svg` requires Vishal's explicit approval before running the command (Task 7 Step 1).

## Review Focus

1. Customer opens the order after 15 s have already passed -> animation must not replay; completion fires immediately (test: `animationOffsetMs` clamps to 15000; live check).
2. Two tabs/devices complete the same order, or the fallback fires after the customer finished -> second call returns 200, no error, no second email (test: `decideCompletion` "already"; live check).
3. A different customer's token with someone else's order id -> 404, no status change (live curl).
4. Device clock ahead/behind the server: `picked_up_at` in the future -> offset 0; server says 425 -> client retries and succeeds (tests for both).
5. Legacy `picked_up` row with null `picked_up_at` -> completes without the time rule instead of hanging forever (test, documented).
6. Order cancelled/rejected while popup is open, or network fails -> popup shows a clear message and a Close button instead of spinning forever (test: `runCompletion` returns `"failed"`).

---

### Task 1: Shared animation module + logo data (web and mobile copies)

**Files:**
- Create: `lib/delivery-animation.ts`
- Create: `lib/brand-logo.ts`
- Create: `mobile/lib/delivery-animation.ts` (byte-identical copy)
- Create: `mobile/lib/brand-logo.ts` (byte-identical copy)
- Create: `tests/delivery-animation.test.mjs`
- Modify: `tests/mobile-parity.test.mjs` (add copy-identity test)

**Interfaces:**
- Produces (`lib/delivery-animation.ts`):
  - `DELIVERY_ANIMATION_MS = 15000`, `EARLY_TOLERANCE_MS = 1000`, `RETRY_AFTER_EARLY_MS = 1500`
  - `type Pt = [number, number]`
  - `SCENE_WIDTH = 560`, `SCENE_HEIGHT = 300`, `SCROLL_SPAN = 560`, `RIDER_TRANSFORM = {x:130,y:112,scale:1.28}`
  - `animationOffsetMs(pickedUpAt: string | null, nowMs: number): number`
  - `type RiderPose`, `riderPose(ms: number): RiderPose`
  - `limbPolygon(p: Pt, q: Pt, w1: number, w2: number): string`
  - `type SkylineBuilding`, `skyline(seed, minH, maxH, colorCount, total, withWindows): SkylineBuilding[]`
  - `FAR_COLORS`, `NEAR_COLORS`
  - `type CompletionResult = "delivered" | "failed"`, `runCompletion(post: () => Promise<number>, sleep: (ms: number) => Promise<void>, maxAttempts?: number): Promise<CompletionResult>`
- Produces (`lib/brand-logo.ts`): `LOGO_VIEWBOX = 80`, `LOGO_PATHS`, `LOGO_COLORS`.

- [ ] **Step 1: Write the failing tests**

Create `tests/delivery-animation.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  DELIVERY_ANIMATION_MS,
  RETRY_AFTER_EARLY_MS,
  SCROLL_SPAN,
  animationOffsetMs,
  limbPolygon,
  riderPose,
  runCompletion,
  skyline,
} from "../lib/delivery-animation.ts";
import { LOGO_COLORS, LOGO_PATHS, LOGO_VIEWBOX } from "../lib/brand-logo.ts";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("animation is 15 seconds", () => {
  assert.equal(DELIVERY_ANIMATION_MS, 15000);
});

test("animationOffsetMs: null/invalid start -> 0", () => {
  assert.equal(animationOffsetMs(null, 1_000_000), 0);
  assert.equal(animationOffsetMs("not-a-date", 1_000_000), 0);
});

test("animationOffsetMs: elapsed time, clamped to [0, 15000]", () => {
  const start = Date.parse("2026-10-02T10:00:00.000Z");
  assert.equal(animationOffsetMs("2026-10-02T10:00:00.000Z", start + 4000), 4000);
  assert.equal(animationOffsetMs("2026-10-02T10:00:00.000Z", start + 15000), 15000);
  assert.equal(animationOffsetMs("2026-10-02T10:00:00.000Z", start + 99999), 15000);
});

test("animationOffsetMs: picked_up_at in the future (clock skew) -> 0", () => {
  const start = Date.parse("2026-10-02T10:00:00.000Z");
  assert.equal(animationOffsetMs("2026-10-02T10:00:00.000Z", start - 5000), 0);
});

test("riderPose: leg segments keep constant length (valid IK)", () => {
  for (const ms of [0, 250, 700, 1500, 4321, 9999, 15000]) {
    const pose = riderPose(ms);
    for (const leg of [pose.legNear, pose.legFar]) {
      assert.ok(Math.abs(dist(pose.hip, leg.knee) - 44) < 0.01, `thigh @${ms}`);
      assert.ok(Math.abs(dist(leg.knee, leg.foot) - 46) < 0.01, `shin @${ms}`);
    }
    for (const arm of [pose.armNear, pose.armFar]) {
      assert.ok(Math.abs(dist(pose.shoulder, arm.elbow) - 30) < 0.01, `upper arm @${ms}`);
      assert.ok(Math.abs(dist(arm.elbow, arm.hand) - 30) < 0.5, `forearm @${ms}`);
    }
  }
});

test("riderPose: near and far legs are half a turn apart; pedalling is periodic", () => {
  const a = riderPose(0);
  const b = riderPose(1000 / 1.15); // exactly one pedal turn
  assert.ok(dist(a.legNear.foot, b.legNear.foot) < 0.01);
  assert.ok(dist(a.legNear.foot, a.legFar.foot) > 20);
});

test("riderPose: scenery scrolls left and wraps within SCROLL_SPAN", () => {
  const p1 = riderPose(1000);
  assert.equal(p1.scroll.far, -14);
  assert.equal(p1.scroll.marks, -230);
  const late = riderPose(15000);
  for (const v of Object.values(late.scroll)) assert.ok(v <= 0 && v > -SCROLL_SPAN);
});

test("limbPolygon returns four x,y points", () => {
  const pts = limbPolygon([0, 0], [10, 0], 4, 2).split(" ");
  assert.equal(pts.length, 4);
  assert.deepEqual(pts[0].split(",").length, 2);
});

test("skyline is deterministic and covers the requested width", () => {
  const a = skyline(23, 70, 120, 4, 560, true);
  const b = skyline(23, 70, 120, 4, 560, true);
  assert.deepEqual(a, b);
  const last = a[a.length - 1];
  assert.ok(last.x + last.width >= 560);
  assert.ok(a.every((bld) => bld.colorIndex >= 0 && bld.colorIndex < 4));
  assert.equal(skyline(5, 60, 130, 3, 560, false).every((bld) => bld.windows.length === 0), true);
});

test("runCompletion: 200 first try -> delivered, no sleeping", async () => {
  const sleeps = [];
  const result = await runCompletion(async () => 200, async (ms) => void sleeps.push(ms));
  assert.equal(result, "delivered");
  assert.deepEqual(sleeps, []);
});

test("runCompletion: 425 (too early) retries after RETRY_AFTER_EARLY_MS then delivers", async () => {
  const statuses = [425, 425, 200];
  const sleeps = [];
  const result = await runCompletion(async () => statuses.shift(), async (ms) => void sleeps.push(ms));
  assert.equal(result, "delivered");
  assert.deepEqual(sleeps, [RETRY_AFTER_EARLY_MS, RETRY_AFTER_EARLY_MS]);
});

test("runCompletion: network error (0) and 5xx back off then deliver", async () => {
  const statuses = [0, 503, 200];
  const sleeps = [];
  const result = await runCompletion(async () => statuses.shift(), async (ms) => void sleeps.push(ms));
  assert.equal(result, "delivered");
  assert.deepEqual(sleeps, [1000, 2000]);
});

test("runCompletion: 401/404/409 stop immediately as failed", async () => {
  for (const status of [401, 404, 409]) {
    let calls = 0;
    const result = await runCompletion(async () => (calls++, status), async () => {});
    assert.equal(result, "failed", String(status));
    assert.equal(calls, 1, String(status));
  }
});

test("runCompletion: gives up after maxAttempts", async () => {
  let calls = 0;
  const result = await runCompletion(async () => (calls++, 500), async () => {}, 3);
  assert.equal(result, "failed");
  assert.equal(calls, 3);
});

test("brand logo data: viewbox, both shapes and the three brand colours", () => {
  assert.equal(LOGO_VIEWBOX, 80);
  assert.ok(LOGO_PATHS.bolt.startsWith("M") && LOGO_PATHS.leaf.startsWith("M"));
  assert.deepEqual(LOGO_COLORS, { disc: "#FFFFFF", bolt: "#F5821F", leaf: "#1E8A3E" });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/delivery-animation.test.mjs`
Expected: FAIL, `Cannot find module '../lib/delivery-animation.ts'`.

- [ ] **Step 3: Write `lib/brand-logo.ts`**

```ts
// Fresh & Quick logo mark (concept "A": bolt + leaf), as plain SVG data so the
// web dialog and the mobile (react-native-svg) animation render the same shapes.
// Brand colours here mirror lib/branding.ts's primary/accent; kept as literals
// because this file is copied byte-for-byte into mobile/lib/.
export const LOGO_VIEWBOX = 80;

export const LOGO_PATHS = {
  disc: { cx: 40, cy: 40, r: 38 },
  bolt: "M46 12 L22 46 H38 L32 68 L60 32 H44 Z",
  leaf: "M50 14 C64 12 72 22 70 34 C58 36 50 28 50 14 Z",
} as const;

export const LOGO_COLORS = {
  disc: "#FFFFFF",
  bolt: "#F5821F",
  leaf: "#1E8A3E",
} as const;
```

- [ ] **Step 4: Write `lib/delivery-animation.ts`**

```ts
// Shared by the web customer order page and the mobile Customer order screen.
// Pure: no imports, no DOM, no React. A byte-identical copy lives in
// mobile/lib/ (tests/mobile-parity.test.mjs guards drift).
// All coordinates are in the animation scene's SVG space (viewBox 0 0 560 300).

export const DELIVERY_ANIMATION_MS = 15000;
// Server rejects completion earlier than DELIVERY_ANIMATION_MS - EARLY_TOLERANCE_MS
// after picked_up_at, to absorb client/server clock skew.
export const EARLY_TOLERANCE_MS = 1000;
export const RETRY_AFTER_EARLY_MS = 1500;

export type Pt = [number, number];

export const SCENE_WIDTH = 560;
export const SCENE_HEIGHT = 300;
export const SCROLL_SPAN = 560;
export const RIDER_TRANSFORM = { x: 130, y: 112, scale: 1.28 } as const;

// How far into the 15 s animation we are, given when the partner picked up.
// Reopening mid-animation resumes here; a future/invalid timestamp starts at 0.
export function animationOffsetMs(pickedUpAt: string | null, nowMs: number): number {
  if (!pickedUpAt) return 0;
  const started = Date.parse(pickedUpAt);
  if (Number.isNaN(started)) return 0;
  return Math.min(Math.max(nowMs - started, 0), DELIVERY_ANIMATION_MS);
}

// ---- rider geometry (bike-local coordinates; origin placed by RIDER_TRANSFORM) ----
const HIP: Pt = [93, 42];
const CRANK: Pt = [105, 100];
const PEDAL_RADIUS = 17;
const THIGH = 44;
const SHIN = 46;
const ARM_SEGMENT = 30;
const SHOULDER: Pt = [126, 6];
const HAND_NEAR: Pt = [158, 37];
const HAND_FAR: Pt = [155, 36];
const CADENCE_HZ = 1.15;
const WHEEL_DEG_PER_SEC = 520;
const SCROLL_SPEED = { far: 14, near: 40, trees: 95, clouds: 6, marks: 230 } as const;

// Two-bone IK in screen coordinates. sign -1 bends the joint forward/up (knee),
// +1 bends it down/back (elbow).
function ik(a: Pt, b: Pt, l1: number, l2: number, sign: 1 | -1): Pt {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.5);
  const angle = Math.atan2(dy, dx);
  const cos = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const k = Math.acos(cos);
  return [a[0] + l1 * Math.cos(angle + sign * k), a[1] + l1 * Math.sin(angle + sign * k)];
}

export type RiderPose = {
  hip: Pt;
  crank: Pt;
  shoulder: Pt;
  torsoTop: Pt;
  lean: number;
  bobY: number;
  wheelDeg: number;
  pedalNear: Pt;
  pedalFar: Pt;
  legNear: { knee: Pt; foot: Pt };
  legFar: { knee: Pt; foot: Pt };
  armNear: { elbow: Pt; hand: Pt };
  armFar: { elbow: Pt; hand: Pt };
  scroll: { far: number; near: number; trees: number; clouds: number; marks: number };
};

function scrollOffset(sec: number, speed: number): number {
  return -((sec * speed) % SCROLL_SPAN);
}

export function riderPose(ms: number): RiderPose {
  const sec = ms / 1000;
  const pedal = sec * Math.PI * 2 * CADENCE_HZ;
  const lean = Math.sin(pedal) * 1.2;
  const footAt = (angle: number): Pt => [
    CRANK[0] + PEDAL_RADIUS * Math.cos(angle),
    CRANK[1] + PEDAL_RADIUS * Math.sin(angle),
  ];
  const pedalNear = footAt(pedal);
  const pedalFar = footAt(pedal + Math.PI);
  const leg = (foot: Pt) => ({ knee: ik(HIP, foot, THIGH, SHIN, -1), foot });
  const arm = (hand: Pt) => ({ elbow: ik(SHOULDER, hand, ARM_SEGMENT, ARM_SEGMENT, 1), hand });
  return {
    hip: HIP,
    crank: CRANK,
    shoulder: SHOULDER,
    torsoTop: [124 + lean, 6],
    lean,
    bobY: Math.sin(pedal * 2) * 1.1,
    wheelDeg: sec * WHEEL_DEG_PER_SEC,
    pedalNear,
    pedalFar,
    legNear: leg(pedalNear),
    legFar: leg(pedalFar),
    armNear: arm(HAND_NEAR),
    armFar: arm(HAND_FAR),
    scroll: {
      far: scrollOffset(sec, SCROLL_SPEED.far),
      near: scrollOffset(sec, SCROLL_SPEED.near),
      trees: scrollOffset(sec, SCROLL_SPEED.trees),
      clouds: scrollOffset(sec, SCROLL_SPEED.clouds),
      marks: scrollOffset(sec, SCROLL_SPEED.marks),
    },
  };
}

// Tapered limb as an SVG polygon "points" string; draw round joints separately.
export function limbPolygon(p: Pt, q: Pt, w1: number, w2: number): string {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const pts: Pt[] = [
    [p[0] + (nx * w1) / 2, p[1] + (ny * w1) / 2],
    [q[0] + (nx * w2) / 2, q[1] + (ny * w2) / 2],
    [q[0] - (nx * w2) / 2, q[1] - (ny * w2) / 2],
    [p[0] - (nx * w1) / 2, p[1] - (ny * w1) / 2],
  ];
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

// ---- scenery ----
export const FAR_COLORS = ["#B7AFA9", "#A9A39F", "#BDB5AA"] as const;
export const NEAR_COLORS = ["#9C8B79", "#8E7E6C", "#A39382", "#7E7366"] as const;

export type SkylineBuilding = {
  x: number;
  y: number;
  width: number;
  height: number;
  colorIndex: number;
  windows: { x: number; y: number; lit: boolean }[];
};

// Deterministic (seeded) row of buildings standing on the pavement line (y=214).
export function skyline(
  seed: number,
  minH: number,
  maxH: number,
  colorCount: number,
  total: number,
  withWindows: boolean
): SkylineBuilding[] {
  let s = seed;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const out: SkylineBuilding[] = [];
  let x = 0;
  while (x < total) {
    const width = 40 + rnd() * 40;
    const height = minH + rnd() * (maxH - minH);
    const colorIndex = Math.floor(rnd() * colorCount);
    const top = 214 - height;
    const windows: SkylineBuilding["windows"] = [];
    if (withWindows) {
      for (let wy = top + 12; wy < 198; wy += 17) {
        for (let wx = x + 8; wx < x + width - 10; wx += 15) {
          windows.push({ x: wx, y: wy, lit: rnd() > 0.75 });
        }
      }
    }
    out.push({ x, y: top, width, height, colorIndex, windows });
    x += width + 3;
  }
  return out;
}

// ---- completion call with retries ----
export type CompletionResult = "delivered" | "failed";

// `post` performs the HTTP call and returns the status code (0 = network error);
// it must not throw. 200 = delivered (also returned for an already-delivered
// order). 425 = server says the animation window has not elapsed yet. 401/404/409
// are terminal. Anything else (0, 5xx) backs off and retries.
export async function runCompletion(
  post: () => Promise<number>,
  sleep: (ms: number) => Promise<void>,
  maxAttempts = 8
): Promise<CompletionResult> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const status = await post();
    if (status === 200) return "delivered";
    if (status === 401 || status === 404 || status === 409) return "failed";
    if (attempt === maxAttempts) break;
    await sleep(status === 425 ? RETRY_AFTER_EARLY_MS : 1000 * attempt);
  }
  return "failed";
}
```

- [ ] **Step 5: Copy to mobile (byte-identical)**

Run:
```bash
cp lib/delivery-animation.ts mobile/lib/delivery-animation.ts
cp lib/brand-logo.ts mobile/lib/brand-logo.ts
```

- [ ] **Step 6: Add the parity test**

In `tests/mobile-parity.test.mjs`, extend the existing test `shared modules are byte-identical copies of the web files` with two more assertions (inside that test, after the `image-url` line):

```js
  assert.equal(read("../mobile/lib/delivery-animation.ts"), read("../lib/delivery-animation.ts"));
  assert.equal(read("../mobile/lib/brand-logo.ts"), read("../lib/brand-logo.ts"));
```

- [ ] **Step 7: Run all tests**

Run: `node --test tests/*.test.mjs`
Expected: PASS (new tests included, existing suites unchanged).

- [ ] **Step 8: Commit**

```bash
git add lib/delivery-animation.ts lib/brand-logo.ts mobile/lib/delivery-animation.ts mobile/lib/brand-logo.ts tests/delivery-animation.test.mjs tests/mobile-parity.test.mjs
git commit -m "feat: shared delivery animation module and logo data (web + mobile copies)"
```

---

### Task 2: Server completion decision (pure)

**Files:**
- Create: `lib/complete-delivery.ts`
- Create: `tests/complete-delivery.test.mjs`

**Interfaces:**
- Produces: `decideCompletion(input: CompletionInput): CompletionDecision` with
  `CompletionInput = { status: string; pickedUpAt: string | null; nowMs: number; mode: "customer" | "internal"; animationMs: number; toleranceMs: number }` and
  `CompletionDecision = { kind: "deliver" } | { kind: "already" } | { kind: "reject"; httpStatus: 409 | 425; error: string; retryAfterMs?: number }`.

- [ ] **Step 1: Write the failing test**

Create `tests/complete-delivery.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { decideCompletion } from "../lib/complete-delivery.ts";

const base = {
  status: "picked_up",
  pickedUpAt: "2026-10-02T10:00:00.000Z",
  nowMs: Date.parse("2026-10-02T10:00:15.000Z"),
  mode: "customer",
  animationMs: 15000,
  toleranceMs: 1000,
};

test("customer, 15 s elapsed -> deliver", () => {
  assert.deepEqual(decideCompletion(base), { kind: "deliver" });
});

test("customer, exactly at the 14 s tolerance boundary -> deliver", () => {
  assert.deepEqual(
    decideCompletion({ ...base, nowMs: Date.parse("2026-10-02T10:00:14.000Z") }),
    { kind: "deliver" }
  );
});

test("customer, too early -> 425 with retryAfterMs", () => {
  const d = decideCompletion({ ...base, nowMs: Date.parse("2026-10-02T10:00:05.000Z") });
  assert.equal(d.kind, "reject");
  assert.equal(d.httpStatus, 425);
  assert.equal(d.retryAfterMs, 9000);
});

test("customer, picked_up_at in the future (clock skew) -> 425", () => {
  const d = decideCompletion({ ...base, nowMs: Date.parse("2026-10-02T09:59:50.000Z") });
  assert.equal(d.kind, "reject");
  assert.equal(d.httpStatus, 425);
});

test("already delivered -> idempotent 'already' for both modes", () => {
  assert.deepEqual(decideCompletion({ ...base, status: "delivered" }), { kind: "already" });
  assert.deepEqual(decideCompletion({ ...base, status: "delivered", mode: "internal" }), { kind: "already" });
});

test("other statuses -> 409 for both modes", () => {
  for (const status of ["placed", "assigned", "ready", "cancelled", "rejected"]) {
    for (const mode of ["customer", "internal"]) {
      const d = decideCompletion({ ...base, status, mode });
      assert.equal(d.kind, "reject", `${status}/${mode}`);
      assert.equal(d.httpStatus, 409, `${status}/${mode}`);
    }
  }
});

test("internal (n8n fallback) skips the time rule", () => {
  const d = decideCompletion({ ...base, mode: "internal", nowMs: Date.parse("2026-10-02T10:00:01.000Z") });
  assert.deepEqual(d, { kind: "deliver" });
});

test("legacy picked_up row with null picked_up_at delivers without the time rule", () => {
  assert.deepEqual(decideCompletion({ ...base, pickedUpAt: null }), { kind: "deliver" });
  assert.deepEqual(decideCompletion({ ...base, pickedUpAt: "garbage" }), { kind: "deliver" });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/complete-delivery.test.mjs`
Expected: FAIL, `Cannot find module '../lib/complete-delivery.ts'`.

- [ ] **Step 3: Implement**

Create `lib/complete-delivery.ts`:

```ts
// Pure decision for "may this order become delivered right now?". Used by the
// customer route (after its 15 s animation) and the internal n8n fallback route.
// No imports on purpose: runs under `node --test`.
export type CompletionInput = {
  status: string;
  pickedUpAt: string | null;
  nowMs: number;
  mode: "customer" | "internal";
  animationMs: number;
  toleranceMs: number;
};

export type CompletionDecision =
  | { kind: "deliver" }
  | { kind: "already" }
  | { kind: "reject"; httpStatus: 409 | 425; error: string; retryAfterMs?: number };

export function decideCompletion(input: CompletionInput): CompletionDecision {
  if (input.status === "delivered") return { kind: "already" };
  if (input.status !== "picked_up") {
    return {
      kind: "reject",
      httpStatus: 409,
      error: `Order in status "${input.status}" cannot be completed`,
    };
  }
  if (input.mode === "internal") return { kind: "deliver" };

  // Legacy rows with no picked_up_at (pre migration 27) get no time rule rather
  // than hanging forever; the trigger always stamps it for new pickups.
  const started = input.pickedUpAt ? Date.parse(input.pickedUpAt) : Number.NaN;
  if (Number.isNaN(started)) return { kind: "deliver" };

  const required = input.animationMs - input.toleranceMs;
  const elapsed = input.nowMs - started;
  if (elapsed < required) {
    return {
      kind: "reject",
      httpStatus: 425,
      error: "Delivery animation has not finished yet",
      retryAfterMs: required - elapsed,
    };
  }
  return { kind: "deliver" };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/complete-delivery.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/complete-delivery.ts tests/complete-delivery.test.mjs
git commit -m "feat: pure delivery-completion decision (15 s rule, idempotent, 409/425)"
```

---

### Task 3: Server helper + customer and internal routes

**Files:**
- Create: `lib/complete-delivery-server.ts`
- Create: `app/api/customer/orders/[id]/complete-delivery/route.ts`
- Create: `app/api/internal/orders/[id]/complete-delivery/route.ts`

**Interfaces:**
- Consumes: `decideCompletion` (Task 2); `DELIVERY_ANIMATION_MS`, `EARLY_TOLERANCE_MS` (Task 1); `supabaseServer` (`lib/supabase-server.ts`); `verifyInternalSecret` (`lib/internal-auth.ts`).
- Produces: `completeDelivery(orderId: string, mode: "customer" | "internal", customerId?: string): Promise<{ httpStatus: number; body: Record<string, unknown> }>`; the two POST routes (customer: Bearer token; internal: `X-Internal-Secret`).

- [ ] **Step 1: Write the server helper**

Create `lib/complete-delivery-server.ts`:

```ts
import "server-only";
import { supabaseServer } from "@/lib/supabase-server";
import { decideCompletion } from "@/lib/complete-delivery";
import { DELIVERY_ANIMATION_MS, EARLY_TOLERANCE_MS } from "@/lib/delivery-animation";

type Result = { httpStatus: number; body: Record<string, unknown> };

// Applies decideCompletion to the stored order and, if allowed, flips it to
// delivered. The DB trigger + n8n workflow 05 fire off that status change.
export async function completeDelivery(
  orderId: string,
  mode: "customer" | "internal",
  customerId?: string
): Promise<Result> {
  const { data: order, error } = await supabaseServer
    .from("orders")
    .select("id, status, picked_up_at, customer_id")
    .eq("id", orderId)
    .maybeSingle();
  // Someone else's order looks exactly like a missing one (no id probing).
  if (error || !order || (mode === "customer" && order.customer_id !== customerId)) {
    return { httpStatus: 404, body: { error: "Order not found" } };
  }

  const decision = decideCompletion({
    status: order.status,
    pickedUpAt: order.picked_up_at,
    nowMs: Date.now(),
    mode,
    animationMs: DELIVERY_ANIMATION_MS,
    toleranceMs: EARLY_TOLERANCE_MS,
  });

  if (decision.kind === "already") {
    return { httpStatus: 200, body: { order: { id: order.id, status: "delivered" } } };
  }
  if (decision.kind === "reject") {
    return {
      httpStatus: decision.httpStatus,
      body: { error: decision.error, retryAfterMs: decision.retryAfterMs },
    };
  }

  const { data: updated } = await supabaseServer
    .from("orders")
    .update({ status: "delivered" })
    .eq("id", orderId)
    .eq("status", "picked_up")
    .select("id, status")
    .maybeSingle();
  if (updated) return { httpStatus: 200, body: { order: updated } };

  // Lost a race (other tab / the n8n fallback / admin). Delivered is success.
  const { data: again } = await supabaseServer
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (again?.status === "delivered") return { httpStatus: 200, body: { order: again } };
  return { httpStatus: 409, body: { error: "Order status changed, please refresh" } };
}
```

- [ ] **Step 2: Write the customer route**

Create `app/api/customer/orders/[id]/complete-delivery/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { completeDelivery } from "@/lib/complete-delivery-server";

// Called by the customer's app when its 15 s delivery animation ends. Identity
// comes from the verified session token, never from the body.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { data: userData, error: userError } = await supabaseServer.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await params;
  const result = await completeDelivery(id, "customer", userData.user.id);
  return NextResponse.json(result.body, { status: result.httpStatus });
}
```

- [ ] **Step 3: Write the internal route**

Create `app/api/internal/orders/[id]/complete-delivery/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { completeDelivery } from "@/lib/complete-delivery-server";

// Called only by n8n workflow 05's 5-minute fallback when the customer never
// finished the animation. Idempotent: 200 if already delivered, 409 for any
// other non-picked_up status (cancelled etc.) -- n8n treats both as done.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!verifyInternalSecret(request)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  }
  const { id } = await params;
  const result = await completeDelivery(id, "internal");
  return NextResponse.json(result.body, { status: result.httpStatus });
}
```

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit` then `npm run build`
Expected: both succeed; the build output lists `/api/customer/orders/[id]/complete-delivery` and `/api/internal/orders/[id]/complete-delivery`.

- [ ] **Step 5: Live-verify with the local stack (Supabase + app running)**

Prerequisite: Docker Desktop up, `npm run app:start:web-only`. Create a test order and drive it to `picked_up` (partner flow or SQL), then with that order id `$ORDER` and the customer's access token `$TOKEN` and another customer's token `$OTHER`:

```bash
# 1. no token
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/customer/orders/$ORDER/complete-delivery            # expect 401
# 2. wrong customer
curl -s -w " %{http_code}\n" -X POST -H "Authorization: Bearer $OTHER" http://localhost:3000/api/customer/orders/$ORDER/complete-delivery   # expect 404
# 3. too early (run within 13 s of pickup)
curl -s -w " %{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/customer/orders/$ORDER/complete-delivery   # expect 425 + retryAfterMs
# 4. after 15 s
curl -s -w " %{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/customer/orders/$ORDER/complete-delivery   # expect 200, status delivered
# 5. repeat (idempotent)
curl -s -w " %{http_code}\n" -X POST -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/customer/orders/$ORDER/complete-delivery   # expect 200
# 6. internal without secret
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/internal/orders/$ORDER/complete-delivery                    # expect 401
```
Expected: the codes above; `psql`/REST check shows `delivered_at` set exactly once.

- [ ] **Step 6: Commit**

```bash
git add lib/complete-delivery-server.ts "app/api/customer/orders/[id]/complete-delivery/route.ts" "app/api/internal/orders/[id]/complete-delivery/route.ts"
git commit -m "feat: customer and internal complete-delivery routes (15 s rule enforced server-side)"
```

---

### Task 4: Remove the partner "Mark delivered" action (web + mobile)

**Files:**
- Modify: `lib/order-constants.ts:14-21`
- Modify: `components/delivery/DeliveryOrderCard.tsx:19-24` and the `scope === "active"` block
- Modify: `mobile/components/DeliveryOrderCard.tsx:25-30` and its active-scope block
- Create: `tests/order-constants.test.mjs`

**Interfaces:**
- Produces: `DELIVERY_STATUS_TRANSITIONS` is exactly `{ assigned: "picked_up" }`. `/api/delivery/orders/[id]/status` therefore answers 400 for `picked_up` with its existing message (no code change in the route).

- [ ] **Step 1: Write the failing test**

Create `tests/order-constants.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { DELIVERY_STATUS_TRANSITIONS } from "../lib/order-constants.ts";

test("delivery partners can only advance assigned -> picked_up; delivered is customer/n8n-driven", () => {
  assert.deepEqual(DELIVERY_STATUS_TRANSITIONS, { assigned: "picked_up" });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/order-constants.test.mjs`
Expected: FAIL (map still contains `picked_up: "delivered"`).

- [ ] **Step 3: Edit `lib/order-constants.ts`**

Replace the delivery block (lines 14-21) with:

```ts
// Phase 5: delivery-partner-drivable status chain. "assigned" is entered
// via the claim endpoint, not this map (claim is a special first
// transition guarded by its own ready+unassigned check, not a simple
// status->status lookup). `picked_up -> delivered` is deliberately NOT here:
// the customer's app completes delivery after the 15 s animation (or n8n's
// 5-minute fallback does) -- see docs/superpowers/specs/2026-10-02-delivery-animation-design.md.
export const DELIVERY_STATUS_TRANSITIONS: Record<string, string> = {
  assigned: "picked_up",
};
```

- [ ] **Step 4: Edit the web card**

In `components/delivery/DeliveryOrderCard.tsx` replace the `advanceLabel` constant with:

```tsx
  const advanceLabel = order.status === "assigned" ? "Mark picked up" : null;
```

and, directly after the existing `scope === "active" && advanceLabel && onAdvance` button block, add:

```tsx
      {scope === "active" && order.status === "picked_up" && (
        <p className="rounded-lg bg-brand-accent-tint p-2 text-base font-medium text-brand-ink">
          Customer is receiving the order…
        </p>
      )}
```

- [ ] **Step 5: Edit the mobile card**

In `mobile/components/DeliveryOrderCard.tsx` replace its `advanceLabel` constant with the same one-liner (`const advanceLabel = order.status === "assigned" ? "Mark picked up" : null;`) and, after the `scope === "active" && advanceLabel && onAdvance` block, add (reusing the file's existing `Text` import and its muted-text style name; if the style is named differently, use the style already applied to the "Customer details appear after you accept." line):

```tsx
      {scope === "active" && order.status === "picked_up" && (
        <Text style={styles.mutedText}>Customer is receiving the order…</Text>
      )}
```

- [ ] **Step 6: Run tests, lint, type-check**

Run: `node --test tests/*.test.mjs` then `npx tsc --noEmit` then `npm run lint`
Expected: PASS / no errors. (For mobile type-check: `cd mobile && npx tsc --noEmit`.)

- [ ] **Step 7: Commit**

```bash
git add lib/order-constants.ts components/delivery/DeliveryOrderCard.tsx mobile/components/DeliveryOrderCard.tsx tests/order-constants.test.mjs
git commit -m "feat: partners no longer mark delivered; show 'customer is receiving the order'"
```

---

### Task 5: n8n workflow 05 five-minute fallback

**Files:**
- Modify: `n8n/workflows/05-delivery-status-propagation.json`
- Modify: `tests/n8n-workflows.test.mjs` (append a test)
- Modify: `docs/n8n-webhook-setup.md` (append a section)

**Interfaces:**
- Consumes: `POST /api/internal/orders/:id/complete-delivery` (Task 3).
- Produces: three new nodes in workflow 05: `Filter: status = picked_up` (IF), `Wait 5 min (customer fallback)` (Wait), `POST /api/internal/orders/:id/complete-delivery` (HTTP Request).

- [ ] **Step 1: Write the failing test**

Append to `tests/n8n-workflows.test.mjs`:

```js
test("workflow 05: picked_up branch waits 5 min then calls the internal complete-delivery fallback", () => {
  const wf = load("05-delivery-status-propagation.json");
  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const isPicked = byName["Filter: status = picked_up"];
  const wait = byName["Wait 5 min (customer fallback)"];
  const post = byName["POST /api/internal/orders/:id/complete-delivery"];
  assert.ok(isPicked && wait && post);
  assert.equal(isPicked.parameters.conditions.string[0].value2, "picked_up");
  assert.equal(wait.type, "n8n-nodes-base.wait");
  assert.equal(wait.parameters.amount, 5);
  assert.equal(wait.parameters.unit, "minutes");
  assert.equal(post.parameters.method, "POST");
  assert.ok(post.parameters.url.includes("/complete-delivery"));
  assert.ok(JSON.stringify(post.parameters.headerParameters).includes("X-Internal-Secret"));
  const fromNotify = wf.connections["Push Realtime Notification (placeholder)"].main[0].map((t) => t.node);
  assert.ok(fromNotify.includes("Filter: status = delivered"));
  assert.ok(fromNotify.includes(isPicked.name));
  assert.deepEqual(wf.connections[isPicked.name].main[0].map((t) => t.node), [wait.name]);
  assert.deepEqual(wf.connections[wait.name].main[0].map((t) => t.node), [post.name]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/n8n-workflows.test.mjs`
Expected: the new test FAILS (`isPicked && wait && post` falsy).

- [ ] **Step 3: Add the nodes**

In `n8n/workflows/05-delivery-status-propagation.json`, add these three objects to the `nodes` array (after the `check-delivered` node):

```json
    {
      "id": "check-picked-up",
      "name": "Filter: status = picked_up",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [680, 60],
      "parameters": {
        "conditions": {
          "string": [
            { "value1": "={{$json[\"body\"][\"record\"][\"status\"]}}", "value2": "picked_up" }
          ]
        }
      },
      "notes": "Customer-app completion is the normal path (after the 15 s animation). This branch is the safety net."
    },
    {
      "id": "wait-customer-fallback",
      "name": "Wait 5 min (customer fallback)",
      "type": "n8n-nodes-base.wait",
      "typeVersion": 1.1,
      "position": [900, 60],
      "webhookId": "f47ac10b-58cc-4372-a567-0e02b2c3d006",
      "parameters": {
        "resume": "timeInterval",
        "amount": 5,
        "unit": "minutes"
      },
      "notes": "Workflow must stay active for the wait to resume. The webhook node already responds immediately (responseMode onReceived)."
    },
    {
      "id": "post-complete-delivery",
      "name": "POST /api/internal/orders/:id/complete-delivery",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [1120, 60],
      "parameters": {
        "method": "POST",
        "url": "={{$env.APP_BASE_URL}}/api/internal/orders/{{$json[\"body\"][\"record\"][\"id\"]}}/complete-delivery",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "X-Internal-Secret", "value": "={{$env.N8N_INTERNAL_SECRET}}" }
          ]
        },
        "options": { "response": { "response": { "neverError": true } } }
      },
      "notes": "Idempotent: 200 if the customer already finished, 409 if the order is cancelled etc. neverError keeps those from failing the execution. A successful completion re-triggers this workflow via the orders UPDATE webhook, and the delivered branch sends the email."
    }
```

- [ ] **Step 4: Wire the connections**

In the same file's `connections`, replace the `"Push Realtime Notification (placeholder)"` entry with:

```json
    "Push Realtime Notification (placeholder)": {
      "main": [[
        { "node": "Filter: status = delivered", "type": "main", "index": 0 },
        { "node": "Filter: status = picked_up", "type": "main", "index": 0 }
      ]]
    },
    "Filter: status = picked_up": {
      "main": [
        [{ "node": "Wait 5 min (customer fallback)", "type": "main", "index": 0 }],
        []
      ]
    },
    "Wait 5 min (customer fallback)": {
      "main": [[{ "node": "POST /api/internal/orders/:id/complete-delivery", "type": "main", "index": 0 }]]
    },
```

Also update the file's `_note` string by appending: ` Added the 5-minute customer-completion fallback (picked_up -> Wait -> internal complete-delivery) on 2026-10-02; not yet run live.`

- [ ] **Step 5: Run to verify pass**

Run: `node --test tests/n8n-workflows.test.mjs`
Expected: PASS (existing structure/uniqueness/credential tests still pass too).

- [ ] **Step 6: Document**

Append to `docs/n8n-webhook-setup.md`:

```markdown
## Workflow 05 customer-completion fallback (added 2026-10-02)

Normal path: the customer's app calls `POST /api/customer/orders/:id/complete-delivery`
after its 15 s animation, which sets `delivered` and triggers the delivered email.
Fallback: when workflow 05 sees `picked_up` it waits 5 minutes, then calls
`POST /api/internal/orders/:id/complete-delivery` (X-Internal-Secret). That call
is a no-op (200) if the customer already finished and 409 for cancelled orders.
The workflow must be **active** for the Wait node to resume. Re-import the JSON
into n8n and Publish it after pulling this change.
```

- [ ] **Step 7: Commit**

```bash
git add n8n/workflows/05-delivery-status-propagation.json tests/n8n-workflows.test.mjs docs/n8n-webhook-setup.md
git commit -m "feat: n8n workflow 05 five-minute customer-completion fallback"
```

---

### Task 6: Web animation dialog + customer order page

**Files:**
- Create: `components/DeliveryAnimationDialog.tsx`
- Modify: `app/customer/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: everything exported by `lib/delivery-animation.ts` and `lib/brand-logo.ts` (Task 1); `BRAND` from `lib/branding.ts`; the customer route (Task 3).
- Produces: `DeliveryAnimationDialog` props `{ pickedUpAt: string | null; post: () => Promise<number>; onDelivered: () => void; onClose: () => void }`.

- [ ] **Step 1: Create the dialog**

Create `components/DeliveryAnimationDialog.tsx`:

```tsx
"use client";

import { memo, useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/branding";
import { LOGO_COLORS, LOGO_PATHS, LOGO_VIEWBOX } from "@/lib/brand-logo";
import {
  DELIVERY_ANIMATION_MS,
  FAR_COLORS,
  NEAR_COLORS,
  RIDER_TRANSFORM,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  SCROLL_SPAN,
  animationOffsetMs,
  limbPolygon,
  riderPose,
  runCompletion,
  skyline,
  type Pt,
} from "@/lib/delivery-animation";

type Phase = "playing" | "finishing" | "delivered" | "failed";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function Limb({ p, q, w1, w2, fill, opacity = 1 }: { p: Pt; q: Pt; w1: number; w2: number; fill: string; opacity?: number }) {
  return (
    <g fill={fill} opacity={opacity}>
      <polygon points={limbPolygon(p, q, w1, w2)} />
      <circle cx={p[0]} cy={p[1]} r={w1 / 2} />
      <circle cx={q[0]} cy={q[1]} r={w2 / 2} />
    </g>
  );
}

const FAR_BUILDINGS = skyline(5, 60, 130, FAR_COLORS.length, SCENE_WIDTH, false);
const NEAR_BUILDINGS = skyline(23, 70, 120, NEAR_COLORS.length, SCENE_WIDTH, true);

const Buildings = memo(function Buildings({ far }: { far: boolean }) {
  const list = far ? FAR_BUILDINGS : NEAR_BUILDINGS;
  const colors = far ? FAR_COLORS : NEAR_COLORS;
  return (
    <g filter={far ? "url(#fq-blur)" : undefined}>
      {list.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={b.y} width={b.width} height={b.height} fill={colors[b.colorIndex]} />
          <rect x={b.x} y={b.y} width={b.width} height={3} fill="rgba(255,255,255,.35)" />
          {b.windows.map((w, j) => (
            <rect key={j} x={w.x} y={w.y} width={7} height={9} fill={w.lit ? "#FFE6A8" : "rgba(40,60,90,.35)"} />
          ))}
        </g>
      ))}
    </g>
  );
});

const Trees = memo(function Trees() {
  return (
    <g>
      {[20, 130, 240, 350, 460].map((x) => (
        <g key={x} transform={`translate(${x},0)`}>
          <rect x={-3} y={178} width={6} height={38} fill="#5A4330" />
          <circle cx={0} cy={168} r={24} fill="#2F7A3B" />
          <circle cx={-12} cy={176} r={16} fill="#3A8F47" />
          <circle cx={13} cy={174} r={17} fill="#276A33" />
        </g>
      ))}
    </g>
  );
});

const Clouds = memo(function Clouds() {
  return (
    <g opacity={0.8}>
      {([[60, 44, 1.2], [250, 74, 0.9], [410, 36, 1.1]] as const).map(([x, y, s]) => (
        <g key={x} transform={`translate(${x},${y}) scale(${s})`}>
          <ellipse cx={0} cy={0} rx={30} ry={10} fill="#fff" />
          <ellipse cx={16} cy={-8} rx={18} ry={10} fill="#fff" />
          <ellipse cx={-14} cy={-5} rx={14} ry={8} fill="#fff" />
        </g>
      ))}
    </g>
  );
});

const RoadMarks = memo(function RoadMarks() {
  const dashes = Array.from({ length: 8 }, (_, i) => i * 70);
  const lines = Array.from({ length: 20 }, (_, i) => i * 28);
  return (
    <g>
      {dashes.map((x) => <rect key={x} x={x} y={268} width={38} height={4} rx={2} fill="#E9E6DF" opacity={0.85} />)}
      {lines.map((x) => <rect key={x} x={x} y={241} width={14} height={1.5} fill="#fff" opacity={0.12} />)}
    </g>
  );
});

// One scrolling layer = two copies side by side so it loops seamlessly.
function Layer({ offset, children }: { offset: number; children: React.ReactNode }) {
  return (
    <g transform={`translate(${offset.toFixed(1)} 0)`}>
      {children}
      <g transform={`translate(${SCROLL_SPAN} 0)`}>{children}</g>
    </g>
  );
}

const Spokes = memo(function Spokes({ cx }: { cx: number }) {
  return (
    <g>
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i * Math.PI) / 12;
        return (
          <line key={i} x1={cx + 4 * Math.cos(a)} y1={100 + 4 * Math.sin(a)} x2={cx + 30 * Math.cos(a)} y2={100 + 30 * Math.sin(a)} stroke="#AEB6C4" strokeWidth={0.8} opacity={0.85} />
        );
      })}
    </g>
  );
});

function WheelRim({ cx }: { cx: number }) {
  return (
    <>
      <circle cx={cx} cy={100} r={34} fill="none" stroke="#15171c" strokeWidth={6} />
      <circle cx={cx} cy={100} r={31} fill="none" stroke="#B9C1CF" strokeWidth={1.8} />
    </>
  );
}

function Shoe({ foot, pedalAngleHint }: { foot: Pt; pedalAngleHint: number }) {
  return (
    <g transform={`translate(${foot[0].toFixed(1)} ${foot[1].toFixed(1)}) rotate(${(Math.sin(pedalAngleHint) * 10).toFixed(0)})`}>
      <path d="M-8 -3 Q-8 -6 -3 -6 L6 -5 Q13 -3 13 2 L-8 3 Z" fill="#F2F4F8" stroke="#0B1D3A" strokeWidth={1.4} />
      <rect x={-8} y={2} width={21} height={2} fill="#0B1D3A" />
    </g>
  );
}

export function DeliveryAnimationDialog({
  pickedUpAt,
  post,
  onDelivered,
  onClose,
}: {
  pickedUpAt: string | null;
  post: () => Promise<number>;
  onDelivered: () => void;
  onClose: () => void;
}) {
  const [ms, setMs] = useState(() => animationOffsetMs(pickedUpAt, Date.now()));
  const [phase, setPhase] = useState<Phase>("playing");
  const [reduced, setReduced] = useState(false);
  const postRef = useRef(post);
  const onDeliveredRef = useRef(onDelivered);
  const closeRef = useRef<HTMLButtonElement>(null);
  postRef.current = post;
  onDeliveredRef.current = onDelivered;

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const t0 = performance.now() - animationOffsetMs(pickedUpAt, Date.now());
    let raf = 0;
    let cancelled = false;
    const tick = (now: number) => {
      const elapsed = Math.min(now - t0, DELIVERY_ANIMATION_MS);
      setMs(elapsed);
      if (elapsed < DELIVERY_ANIMATION_MS) {
        raf = requestAnimationFrame(tick);
        return;
      }
      setPhase("finishing");
      runCompletion(() => postRef.current(), sleep).then((result) => {
        if (cancelled) return;
        if (result === "delivered") {
          setPhase("delivered");
          onDeliveredRef.current();
        } else {
          setPhase("failed");
        }
      });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [pickedUpAt]);

  useEffect(() => {
    if (phase === "delivered" || phase === "failed") closeRef.current?.focus();
  }, [phase]);

  const pose = riderPose(reduced ? 0 : ms);
  const secondsLeft = Math.max(0, Math.ceil((DELIVERY_ANIMATION_MS - ms) / 1000));
  const nearFoot = pose.legNear.foot;
  const farFoot = pose.legFar.foot;
  const R = RIDER_TRANSFORM;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-brand-ink/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delivery-anim-title"
        className="w-full max-w-xl overflow-hidden rounded-3xl bg-brand-surface shadow-2xl"
      >
        <div className="px-5 pb-2 pt-4">
          <h2 id="delivery-anim-title" className="font-heading text-xl text-brand-ink">
            {phase === "delivered" ? "Delivered!" : "Your order is on the way!"}
          </h2>
          <p className="mt-1 text-sm text-brand-ink-muted" aria-live="polite">
            {phase === "delivered"
              ? "Enjoy your meal."
              : phase === "failed"
                ? "We couldn't confirm delivery just yet — your order will be marked delivered shortly."
                : phase === "finishing"
                  ? "Confirming delivery…"
                  : `Your ${BRAND.name} rider is heading to you.`}
          </p>
        </div>

        <svg viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`} className="block h-auto w-full" role="img" aria-label={`${BRAND.name} rider cycling to deliver your order`}>
          <defs>
            <linearGradient id="fq-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#9CC3E8" /><stop offset=".55" stopColor="#F6D9B4" /><stop offset="1" stopColor="#FBE9D0" />
            </linearGradient>
            <linearGradient id="fq-road" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4A4F5C" /><stop offset="1" stopColor="#2B2E37" />
            </linearGradient>
            <linearGradient id="fq-walk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#CFC8BC" /><stop offset="1" stopColor="#B2AA9C" />
            </linearGradient>
            <linearGradient id="fq-jersey" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FF9A3E" /><stop offset="1" stopColor="#D96A0C" />
            </linearGradient>
            <linearGradient id="fq-shorts" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1A2F57" /><stop offset="1" stopColor="#0A1830" />
            </linearGradient>
            <linearGradient id="fq-skin" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#E2B18A" /><stop offset="1" stopColor="#B98258" />
            </linearGradient>
            <linearGradient id="fq-helmet" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFFFFF" /><stop offset="1" stopColor="#C9D2DE" />
            </linearGradient>
            <linearGradient id="fq-box" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FF9238" /><stop offset=".55" stopColor="#F5821F" /><stop offset="1" stopColor="#C95F08" />
            </linearGradient>
            <radialGradient id="fq-sun" cx=".5" cy=".5" r=".5">
              <stop offset="0" stopColor="#FFF6DC" stopOpacity=".95" /><stop offset="1" stopColor="#FFE0A8" stopOpacity="0" />
            </radialGradient>
            <filter id="fq-blur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.6" /></filter>
            <filter id="fq-soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
          </defs>

          <rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="url(#fq-sky)" />
          <circle cx={450} cy={70} r={90} fill="url(#fq-sun)" />
          <Layer offset={pose.scroll.clouds}><Clouds /></Layer>
          <Layer offset={pose.scroll.far}><Buildings far /></Layer>
          <Layer offset={pose.scroll.near}><Buildings far={false} /></Layer>
          <Layer offset={pose.scroll.trees}><Trees /></Layer>
          <rect y={214} width={SCENE_WIDTH} height={14} fill="url(#fq-walk)" />
          <rect y={226} width={SCENE_WIDTH} height={4} fill="#8F877A" />
          <rect y={228} width={SCENE_WIDTH} height={72} fill="url(#fq-road)" />
          <Layer offset={pose.scroll.marks}><RoadMarks /></Layer>
          <ellipse cx={236} cy={288} rx={118} ry={8} fill="#000" opacity={0.4} filter="url(#fq-soft)" />

          <g transform={`translate(${R.x},${R.y}) scale(${R.scale})`}>
            <g transform={`translate(0 ${pose.bobY.toFixed(2)})`}>
              <Limb p={pose.hip} q={pose.legFar.knee} w1={17} w2={13} fill="url(#fq-shorts)" opacity={0.78} />
              <Limb p={pose.legFar.knee} q={farFoot} w1={11} w2={7} fill="url(#fq-skin)" opacity={0.78} />
              <Limb p={pose.shoulder} q={pose.armFar.elbow} w1={10} w2={8} fill="url(#fq-skin)" opacity={0.8} />
              <Limb p={pose.armFar.elbow} q={pose.armFar.hand} w1={8} w2={6} fill="url(#fq-skin)" opacity={0.8} />

              <g transform={`rotate(${pose.wheelDeg.toFixed(1)} 60 100)`}><Spokes cx={60} /></g>
              <g transform={`rotate(${pose.wheelDeg.toFixed(1)} 171 100)`}><Spokes cx={171} /></g>
              <WheelRim cx={60} />
              <WheelRim cx={171} />

              <circle cx={105} cy={100} r={13} fill="none" stroke="#9AA3B2" strokeWidth={3} />
              <line x1={105} y1={87} x2={60} y2={96} stroke="#222" strokeWidth={1.6} />
              <line x1={105} y1={113} x2={60} y2={104} stroke="#222" strokeWidth={1.6} />
              <line x1={105} y1={100} x2={pose.pedalNear[0]} y2={pose.pedalNear[1]} stroke="#7C8697" strokeWidth={4} strokeLinecap="round" />
              <line x1={105} y1={100} x2={pose.pedalFar[0]} y2={pose.pedalFar[1]} stroke="#5E6777" strokeWidth={4} strokeLinecap="round" />

              <g stroke="#0B1D3A" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" fill="none">
                <polyline points="60,100 94,54 146,54" />
                <line x1={60} y1={100} x2={105} y2={100} />
                <line x1={94} y1={54} x2={105} y2={100} />
                <line x1={146} y1={54} x2={105} y2={100} />
                <line x1={146} y1={54} x2={171} y2={100} />
                <line x1={94} y1={54} x2={68} y2={86} />
                <line x1={146} y1={54} x2={154} y2={38} strokeWidth={5} />
                <line x1={149} y1={38} x2={164} y2={38} strokeWidth={5} />
              </g>
              <path d="M80 47 Q94 41 106 46 Q100 51 88 51 Z" fill="#1c1c1c" />
              <rect x={160} y={30} width={7} height={6} rx={2} fill="#FFF3C4" />
              <polygon points="167,31 220,16 220,50 167,35" fill="#FFF3C4" opacity={0.18} />

              <line x1={22} y1={66} x2={86} y2={66} stroke="#0B1D3A" strokeWidth={3.5} strokeLinecap="round" />
              <g>
                <rect x={20} y={8} width={70} height={58} rx={7} fill="url(#fq-box)" />
                <rect x={20} y={8} width={70} height={10} rx={5} fill="#FFB267" opacity={0.85} />
                <rect x={20} y={56} width={70} height={10} rx={5} fill="#B24F05" opacity={0.55} />
                <g transform={`translate(24,22) scale(${26 / LOGO_VIEWBOX})`}>
                  <circle cx={LOGO_PATHS.disc.cx} cy={LOGO_PATHS.disc.cy} r={LOGO_PATHS.disc.r} fill={LOGO_COLORS.disc} />
                  <path d={LOGO_PATHS.bolt} fill={LOGO_COLORS.bolt} />
                  <path d={LOGO_PATHS.leaf} fill={LOGO_COLORS.leaf} />
                </g>
                {BRAND.name.split(" & ").map((part, i) => (
                  <text key={part} x={46} y={31 + i * 10} fontFamily="Poppins, Arial, sans-serif" fontWeight={700} fontSize={8} fill="#fff">
                    {i === 0 ? part : `& ${part}`}
                  </text>
                ))}
                <text x={28} y={58} fontFamily="Inter, Arial, sans-serif" fontWeight={600} fontSize={5.5} fill="#FFE9D2" letterSpacing={0.6}>FOOD DELIVERY</text>
              </g>

              <Limb p={[pose.hip[0] + 1, pose.hip[1] - 4]} q={pose.torsoTop} w1={22} w2={20} fill="url(#fq-jersey)" />
              <Limb p={pose.hip} q={pose.legNear.knee} w1={17} w2={13} fill="url(#fq-shorts)" />
              <Limb p={pose.legNear.knee} q={nearFoot} w1={11} w2={7} fill="url(#fq-skin)" />
              <Shoe foot={nearFoot} pedalAngleHint={nearFoot[1] - 100} />
              <Shoe foot={farFoot} pedalAngleHint={farFoot[1] - 100} />
              <Limb p={pose.shoulder} q={pose.armNear.elbow} w1={12} w2={9} fill="url(#fq-jersey)" />
              <Limb p={pose.armNear.elbow} q={pose.armNear.hand} w1={8} w2={6} fill="url(#fq-skin)" />
              <circle cx={pose.armNear.hand[0]} cy={pose.armNear.hand[1]} r={4.5} fill="#1A1A1A" />

              <g transform={`translate(${(pose.lean * 0.6).toFixed(2)} 0)`}>
                <rect x={132} y={2} width={9} height={14} rx={4} fill="url(#fq-skin)" />
                <circle cx={141} cy={-9} r={10} fill="url(#fq-skin)" />
                <path d="M129 -10 Q130 -26 144 -24 Q155 -22 153 -10 L146 -12 L132 -9 Z" fill="url(#fq-helmet)" />
                <path d="M129 -10 Q131 -26 144 -24" fill="none" stroke={LOGO_COLORS.leaf} strokeWidth={2} />
                <rect x={144} y={-10} width={11} height={4.5} rx={2.2} fill="#10151F" />
              </g>
            </g>
          </g>
        </svg>

        <div className="px-5 pb-5 pt-3">
          {phase === "delivered" || phase === "failed" ? (
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="rounded-full bg-brand-ink px-5 py-2 text-sm font-semibold text-white"
            >
              {phase === "delivered" ? "Done" : "Close"}
            </button>
          ) : (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-brand-primary-tint">
                <div
                  className="h-full rounded-full bg-brand-primary"
                  style={{ width: `${(ms / DELIVERY_ANIMATION_MS) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-brand-ink-muted">
                {phase === "finishing" ? "Confirming delivery…" : <>Arriving in <b className="text-brand-ink">{secondsLeft}</b>s</>}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire into the customer order page**

In `app/customer/orders/[id]/page.tsx`:

1. Add imports:
```tsx
import { useCallback } from "react";
import { DeliveryAnimationDialog } from "@/components/DeliveryAnimationDialog";
```
(merge `useCallback` into the existing `react` import line.)

2. Add state and the completion callback after the existing `useState` lines (before the `useEffect`):
```tsx
  const [celebrating, setCelebrating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const postComplete = useCallback(async (): Promise<number> => {
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`/api/customer/orders/${params.id}/complete-delivery`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      return res.status;
    } catch {
      return 0;
    }
  }, [params.id]);
```

3. Just before the final `return (` of the component (after the `paymentFailed` const), add:
```tsx
  const showAnimation = !dismissed && (order.status === "picked_up" || celebrating);
```

4. Inside the returned outermost `<div className="-m-4 ...">`, as its first child, add:
```tsx
      {showAnimation && (
        <DeliveryAnimationDialog
          pickedUpAt={order.pickedUpAt}
          post={postComplete}
          onDelivered={() => setCelebrating(true)}
          onClose={() => setDismissed(true)}
        />
      )}
```

- [ ] **Step 3: Type-check, lint, build**

Run: `npx tsc --noEmit` then `npm run lint` then `npm run build`
Expected: all pass with no warnings from the two changed files.

- [ ] **Step 4: Live-verify in the browser (production build, Playwright)**

Run the app (`node scripts/start.mjs --skip-mobile`), log in as a fresh customer, place an order, drive it to `picked_up` as the partner (set stray online partners offline first; workflow 04 auto-assigns). Then check and record:
1. The popup appears within ~3 s of pickup, cannot be closed (no X, Escape and backdrop click do nothing), and the rider/logo/"Fresh & Quick" box are visible.
2. At 15 s it shows "Delivered!" and the order page shows Delivered after Done.
3. Reload the page at ~9 s: the popup resumes near 9 s (countdown ~6 s), not 15 s.
4. Open the order after >15 s have passed since pickup (do not open before): it completes immediately without replaying 15 s.
5. n8n execution list: the delivered-branch execution started at/after `picked_up_at + 15 s`; the delivered email arrived.
6. With Chrome DevTools "prefers-reduced-motion: reduce" emulation: scene is static, progress/countdown still run.
7. DevTools Network: block the completion URL for the first call -> it retries and succeeds; the 425 path was proven in Task 3.

- [ ] **Step 5: Commit**

```bash
git add components/DeliveryAnimationDialog.tsx "app/customer/orders/[id]/page.tsx"
git commit -m "feat: web delivery animation popup; customer completes delivery after 15 s"
```

---

### Task 7: Mobile animation modal + Customer order screen

**Files:**
- Modify: `mobile/package.json` and lockfile (via `npx expo install`, **needs approval**)
- Create: `mobile/components/DeliveryAnimation.tsx`
- Modify: `mobile/src/app/customer/orders/[id].tsx`

**Interfaces:**
- Consumes: `mobile/lib/delivery-animation.ts`, `mobile/lib/brand-logo.ts` (Task 1 copies); `apiFetch`, `ApiError` (`mobile/lib/api.ts`); `BRAND` (`mobile/theme.ts`).
- Produces: `DeliveryAnimation` props `{ visible: boolean; pickedUpAt: string | null; post: () => Promise<number>; onDelivered: () => void; onClose: () => void }`.

- [ ] **Step 1: Get approval, then install the one new dependency**

Ask Vishal: "OK to run `npx expo install react-native-svg` in `mobile/`?" Only after a yes:

Run (in `mobile/`): `npx expo install react-native-svg`
Expected: package added at the SDK-57-compatible version; `mobile/package.json` and its lockfile change. Confirm the version it chose and report it.

- [ ] **Step 2: Create the component**

Create `mobile/components/DeliveryAnimation.tsx`:

```tsx
import { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, G, Line, Path, Polygon, Rect, Text as SvgText } from "react-native-svg";
import { BRAND } from "../theme";
import { LOGO_COLORS, LOGO_PATHS } from "../lib/brand-logo";
import {
  DELIVERY_ANIMATION_MS,
  FAR_COLORS,
  NEAR_COLORS,
  RIDER_TRANSFORM,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  SCROLL_SPAN,
  animationOffsetMs,
  limbPolygon,
  riderPose,
  runCompletion,
  skyline,
  type Pt,
} from "../lib/delivery-animation";

type Phase = "playing" | "finishing" | "delivered" | "failed";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const FAR = skyline(5, 60, 130, FAR_COLORS.length, SCENE_WIDTH, false);
const NEAR = skyline(23, 70, 120, NEAR_COLORS.length, SCENE_WIDTH, true);

function Limb({ p, q, w1, w2, fill, opacity = 1 }: { p: Pt; q: Pt; w1: number; w2: number; fill: string; opacity?: number }) {
  return (
    <G fill={fill} opacity={opacity}>
      <Polygon points={limbPolygon(p, q, w1, w2)} />
      <Circle cx={p[0]} cy={p[1]} r={w1 / 2} />
      <Circle cx={q[0]} cy={q[1]} r={w2 / 2} />
    </G>
  );
}

const Buildings = memo(function Buildings({ far }: { far: boolean }) {
  const list = far ? FAR : NEAR;
  const colors = far ? FAR_COLORS : NEAR_COLORS;
  return (
    <G>
      {list.map((b, i) => (
        <G key={i}>
          <Rect x={b.x} y={b.y} width={b.width} height={b.height} fill={colors[b.colorIndex]} />
          {b.windows.map((w, j) => (
            <Rect key={j} x={w.x} y={w.y} width={7} height={9} fill={w.lit ? "#FFE6A8" : "rgba(40,60,90,0.35)"} />
          ))}
        </G>
      ))}
    </G>
  );
});

const Trees = memo(function Trees() {
  return (
    <G>
      {[20, 130, 240, 350, 460].map((x) => (
        <G key={x} translate={`${x}, 0`}>
          <Rect x={-3} y={178} width={6} height={38} fill="#5A4330" />
          <Circle cx={0} cy={168} r={24} fill="#2F7A3B" />
          <Circle cx={-12} cy={176} r={16} fill="#3A8F47" />
          <Circle cx={13} cy={174} r={17} fill="#276A33" />
        </G>
      ))}
    </G>
  );
});

const Spokes = memo(function Spokes({ cx }: { cx: number }) {
  return (
    <G>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * Math.PI) / 6;
        return <Line key={i} x1={cx} y1={100} x2={cx + 30 * Math.cos(a)} y2={100 + 30 * Math.sin(a)} stroke="#AEB6C4" strokeWidth={1} />;
      })}
    </G>
  );
});

function Layer({ offset, children }: { offset: number; children: React.ReactNode }) {
  return (
    <G translate={`${offset.toFixed(1)}, 0`}>
      {children}
      <G translate={`${SCROLL_SPAN}, 0`}>{children}</G>
    </G>
  );
}

export function DeliveryAnimation({
  visible,
  pickedUpAt,
  post,
  onDelivered,
  onClose,
}: {
  visible: boolean;
  pickedUpAt: string | null;
  post: () => Promise<number>;
  onDelivered: () => void;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const [ms, setMs] = useState(() => animationOffsetMs(pickedUpAt, Date.now()));
  const [phase, setPhase] = useState<Phase>("playing");
  const [reduced, setReduced] = useState(false);
  const postRef = useRef(post);
  const onDeliveredRef = useRef(onDelivered);
  postRef.current = post;
  onDeliveredRef.current = onDelivered;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t0 = Date.now() - animationOffsetMs(pickedUpAt, Date.now());
    let cancelled = false;
    let finished = false;
    const timer = setInterval(() => {
      const elapsed = Math.min(Date.now() - t0, DELIVERY_ANIMATION_MS);
      setMs(elapsed);
      if (elapsed < DELIVERY_ANIMATION_MS || finished) return;
      finished = true;
      clearInterval(timer);
      setPhase("finishing");
      runCompletion(() => postRef.current(), sleep).then((result) => {
        if (cancelled) return;
        if (result === "delivered") {
          setPhase("delivered");
          onDeliveredRef.current();
        } else {
          setPhase("failed");
        }
      });
    }, 33);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [visible, pickedUpAt]);

  const pose = riderPose(reduced ? 0 : ms);
  const secondsLeft = Math.max(0, Math.ceil((DELIVERY_ANIMATION_MS - ms) / 1000));
  const cardWidth = Math.min(width - 32, 520);
  const R = RIDER_TRANSFORM;
  const nameParts = BRAND.name.split(" & ");

  return (
    // onRequestClose is a no-op on purpose: the Android back button must not dismiss it.
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { width: cardWidth }]}>
          <View style={styles.head}>
            <Text style={styles.title}>{phase === "delivered" ? "Delivered!" : "Your order is on the way!"}</Text>
            <Text style={styles.sub}>
              {phase === "delivered"
                ? "Enjoy your meal."
                : phase === "failed"
                  ? "We couldn't confirm delivery just yet — your order will be marked delivered shortly."
                  : phase === "finishing"
                    ? "Confirming delivery…"
                    : `Your ${BRAND.name} rider is heading to you.`}
            </Text>
          </View>

          <Svg width={cardWidth} height={(cardWidth * SCENE_HEIGHT) / SCENE_WIDTH} viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}>
            <Rect width={SCENE_WIDTH} height={SCENE_HEIGHT} fill="#F6D9B4" />
            <Rect width={SCENE_WIDTH} height={120} fill="#9CC3E8" />
            <Layer offset={pose.scroll.far}><Buildings far /></Layer>
            <Layer offset={pose.scroll.near}><Buildings far={false} /></Layer>
            <Layer offset={pose.scroll.trees}><Trees /></Layer>
            <Rect y={214} width={SCENE_WIDTH} height={14} fill="#C7C0B3" />
            <Rect y={228} width={SCENE_WIDTH} height={72} fill="#3A3E48" />
            <Layer offset={pose.scroll.marks}>
              <G>
                {Array.from({ length: 8 }, (_, i) => (
                  <Rect key={i} x={i * 70} y={268} width={38} height={4} rx={2} fill="#E9E6DF" />
                ))}
              </G>
            </Layer>

            <G translate={`${R.x}, ${R.y + pose.bobY}`} scale={R.scale}>
              <Limb p={pose.hip} q={pose.legFar.knee} w1={17} w2={13} fill="#0F2244" opacity={0.78} />
              <Limb p={pose.legFar.knee} q={pose.legFar.foot} w1={11} w2={7} fill="#D9A57B" opacity={0.78} />
              <Limb p={pose.shoulder} q={pose.armFar.elbow} w1={10} w2={8} fill="#D9A57B" opacity={0.8} />
              <Limb p={pose.armFar.elbow} q={pose.armFar.hand} w1={8} w2={6} fill="#D9A57B" opacity={0.8} />

              <G rotation={pose.wheelDeg} origin="60, 100"><Spokes cx={60} /></G>
              <G rotation={pose.wheelDeg} origin="171, 100"><Spokes cx={171} /></G>
              <Circle cx={60} cy={100} r={34} fill="none" stroke="#15171c" strokeWidth={6} />
              <Circle cx={171} cy={100} r={34} fill="none" stroke="#15171c" strokeWidth={6} />
              <Line x1={105} y1={100} x2={pose.pedalNear[0]} y2={pose.pedalNear[1]} stroke="#7C8697" strokeWidth={4} strokeLinecap="round" />
              <Line x1={105} y1={100} x2={pose.pedalFar[0]} y2={pose.pedalFar[1]} stroke="#5E6777" strokeWidth={4} strokeLinecap="round" />

              <G stroke="#0B1D3A" strokeWidth={4.5} strokeLinecap="round" fill="none">
                <Path d="M60 100 L94 54 L146 54" />
                <Line x1={60} y1={100} x2={105} y2={100} />
                <Line x1={94} y1={54} x2={105} y2={100} />
                <Line x1={146} y1={54} x2={105} y2={100} />
                <Line x1={146} y1={54} x2={171} y2={100} />
                <Line x1={146} y1={54} x2={154} y2={38} />
                <Line x1={149} y1={38} x2={164} y2={38} />
              </G>

              <Rect x={20} y={8} width={70} height={58} rx={7} fill="#F5821F" />
              <Rect x={20} y={8} width={70} height={10} rx={5} fill="#FFB267" />
              <G translate="24, 22" scale={0.325}>
                <Circle cx={LOGO_PATHS.disc.cx} cy={LOGO_PATHS.disc.cy} r={LOGO_PATHS.disc.r} fill={LOGO_COLORS.disc} />
                <Path d={LOGO_PATHS.bolt} fill={LOGO_COLORS.bolt} />
                <Path d={LOGO_PATHS.leaf} fill={LOGO_COLORS.leaf} />
              </G>
              {nameParts.map((part, i) => (
                <SvgText key={part} x={46} y={31 + i * 10} fontSize={8} fontWeight="bold" fill="#FFFFFF">
                  {i === 0 ? part : `& ${part}`}
                </SvgText>
              ))}

              <Limb p={[pose.hip[0] + 1, pose.hip[1] - 4]} q={pose.torsoTop} w1={22} w2={20} fill="#F5821F" />
              <Limb p={pose.hip} q={pose.legNear.knee} w1={17} w2={13} fill="#0F2244" />
              <Limb p={pose.legNear.knee} q={pose.legNear.foot} w1={11} w2={7} fill="#D9A57B" />
              <Rect x={pose.legNear.foot[0] - 8} y={pose.legNear.foot[1] - 5} width={21} height={8} rx={3} fill="#F2F4F8" stroke="#0B1D3A" strokeWidth={1.2} />
              <Rect x={pose.legFar.foot[0] - 8} y={pose.legFar.foot[1] - 5} width={21} height={8} rx={3} fill="#F2F4F8" stroke="#0B1D3A" strokeWidth={1.2} />
              <Limb p={pose.shoulder} q={pose.armNear.elbow} w1={12} w2={9} fill="#F5821F" />
              <Limb p={pose.armNear.elbow} q={pose.armNear.hand} w1={8} w2={6} fill="#D9A57B" />
              <Circle cx={pose.armNear.hand[0]} cy={pose.armNear.hand[1]} r={4.5} fill="#1A1A1A" />
              <G translate={`${(pose.lean * 0.6).toFixed(2)}, 0`}>
                <Circle cx={141} cy={-9} r={10} fill="#D9A57B" />
                <Path d="M129 -10 Q130 -26 144 -24 Q155 -22 153 -10 L146 -12 L132 -9 Z" fill="#F2F5FA" />
                <Rect x={144} y={-10} width={11} height={4.5} rx={2.2} fill="#10151F" />
              </G>
            </G>
          </Svg>

          <View style={styles.foot}>
            {phase === "delivered" || phase === "failed" ? (
              <Pressable style={styles.button} onPress={onClose}>
                <Text style={styles.buttonText}>{phase === "delivered" ? "Done" : "Close"}</Text>
              </Pressable>
            ) : (
              <>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${(ms / DELIVERY_ANIMATION_MS) * 100}%` }]} />
                </View>
                <Text style={styles.sub}>{phase === "finishing" ? "Confirming delivery…" : `Arriving in ${secondsLeft}s`}</Text>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(11,29,58,0.6)", alignItems: "center", justifyContent: "center" },
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 24, overflow: "hidden" },
  head: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, gap: 4 },
  title: { fontFamily: BRAND.fonts.heading, fontSize: 20, color: BRAND.colors.ink },
  sub: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.inkMuted },
  foot: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, gap: 8 },
  track: { height: 8, borderRadius: 999, backgroundColor: BRAND.colors.primary + "22", overflow: "hidden" },
  fill: { height: 8, borderRadius: 999, backgroundColor: BRAND.colors.primary },
  button: { alignSelf: "flex-start", backgroundColor: BRAND.colors.ink, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  buttonText: { fontFamily: BRAND.fonts.bodySemiBold, color: "#FFFFFF" },
});
```

- [ ] **Step 3: Wire into the Customer order screen**

In `mobile/src/app/customer/orders/[id].tsx`:

1. Imports: add `useCallback` is already imported; add
```tsx
import { apiFetch, ApiError } from "../../../../lib/api";
import { DeliveryAnimation } from "../../../../components/DeliveryAnimation";
```
2. After the `useState` lines in `OrderDetailScreen`, add:
```tsx
  const [celebrating, setCelebrating] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const postComplete = useCallback(async (): Promise<number> => {
    try {
      await apiFetch(`/api/customer/orders/${id}/complete-delivery`, { method: "POST" });
      return 200;
    } catch (thrown) {
      return thrown instanceof ApiError ? thrown.status : 0;
    }
  }, [id]);
```
3. Compute (after the `if (!order) {...}` early return):
```tsx
  const showAnimation = !dismissed && (order.status === "picked_up" || celebrating);
```
4. Render the modal as the first child inside the returned `<ScrollView>`:
```tsx
      <DeliveryAnimation
        visible={showAnimation}
        pickedUpAt={order.pickedUpAt}
        post={postComplete}
        onDelivered={() => setCelebrating(true)}
        onClose={() => setDismissed(true)}
      />
```
(`Modal` renders in its own layer, so placing it inside the ScrollView is fine.)

- [ ] **Step 4: Type-check**

Run (in `mobile/`): `npx tsc --noEmit`
Expected: no errors. Also run from repo root: `node --test tests/*.test.mjs` (parity test still passes).

- [ ] **Step 5: Verify on a phone/simulator**

Start the mobile app (`node scripts/start.mjs`), sign in as a fresh Customer, place an order, drive to `picked_up`. Check: modal appears and cannot be dismissed (Android back does nothing), rider + logo + name visible, 15 s countdown, "Delivered!" then Done, background order shows Delivered; re-open mid-animation resumes. Capture a screen recording/screenshot for Vishal.

- [ ] **Step 6: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/components/DeliveryAnimation.tsx "mobile/src/app/customer/orders/[id].tsx"
git commit -m "feat: mobile delivery animation modal (react-native-svg); customer completes delivery"
```
(Use the actual lockfile name that changed; run `git status` first.)

---

### Task 8: End-to-end verification, fallback test, docs, review

**Files:**
- Modify: `CLAUDE.md`, `MEMORY.md`, `README.md`, `AGENTS.md` (only where a change is needed; check each, per the "Update CLAUDE files" rule)
- Modify (if Vishal wants refreshed screenshots): `docs/User_Manual.docx`, `docs/Mobile_App_User_Manual.docx` via python-docx in place (separate, optional follow-up)

- [ ] **Step 1: Full automated gate**

Run: `node --test tests/*.test.mjs` ; `npx tsc --noEmit` ; `npm run lint` ; `npm run build` ; `cd mobile && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 2: Live fallback test (n8n)**

Re-import `n8n/workflows/05-delivery-status-propagation.json` into the local n8n, select the Gmail credential, Publish. Place and pick up an order; do **not** open it as the customer. Expected: ~5 min after pickup an n8n execution calls `/complete-delivery`, the order becomes `delivered`, and a second execution sends the delivered email. Then repeat with the customer completing normally and confirm the later fallback call returns 200 and sends no second email (check Gmail Sent and the n8n execution log).

- [ ] **Step 3: Live ordering proof**

For one normal run, record `picked_up_at`, `delivered_at` and the n8n delivered-branch execution start time; confirm `delivered_at >= picked_up_at + 14 s` and the execution started after `delivered_at`. Report the three timestamps to Vishal.

- [ ] **Step 4: Review**

Run `/review` on the branch diff; fix findings. Final whole-branch review focuses on the Review Focus list above and on "what does the rest of the codebase do" for anything still reading `picked_up -> delivered` (grep `Mark delivered`, `DELIVERY_STATUS_TRANSITIONS`, `/status` callers in web + mobile delivery dashboards; the dashboards' `advance` handlers are now only reachable for `assigned`).

- [ ] **Step 5: Update project memory docs**

Check and update each of `CLAUDE.md`, `MEMORY.md`, `README.md`, `AGENTS.md`: record the delivery-animation feature (customer-completes-delivery rule, the 14 s server rule, the 5-minute n8n fallback and that workflow 05 must be re-imported, partner "Mark delivered" removed, `react-native-svg` added to mobile, shared byte-identical modules), plus any defects found during verification. Do not rewrite unrelated sections.

- [ ] **Step 6: Commit and push (only on Vishal's "Commit Work")**

Per the standing phrase, "Commit Work" authorizes memory-doc update + commit + push to `origin`. Do not push before that instruction.
