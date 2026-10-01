# Order Visibility — Sub-project D (Mobile Customer + Delivery, then both manuals) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the React Native + Expo mobile app (Customer + Delivery Partner) to parity with the web work from sub-projects A–C — 6-step order tracker, orders list/detail with items/images/address/phone, delivery full order details with an Active vs History split — keep the web and mobile status mapping provably identical, delete the two legacy delivery endpoints, and refresh both user manuals (web + mobile, docx + pdf).

**Architecture:** Mobile cannot import web modules, so shared logic is copied and guarded by node sync tests: `mobile/lib/order-status.ts` is rewritten to export the same names/values as `lib/order-status.ts` (colours as mobile hex values, with a parity test on structure), and `mobile/lib/order-detail.ts` + `mobile/lib/image-url.ts` are **byte-identical copies** of the web files (sync-tested like `phone.ts`). Customer screens read orders directly from Supabase under RLS with the shared select strings (as the web customer pages do). The Delivery screens switch from the two legacy endpoints to `GET /api/delivery/active` and `GET /api/delivery/history` (built and verified in sub-project B), then the legacy endpoints are deleted. Manuals are edited in place with python-docx; static TOCs are renumbered after converting to PDF with LibreOffice.

**Tech Stack:** Expo ~57 / React Native 0.86 / expo-router (TypeScript, strict), `node --test` for pure-logic tests, python-docx + LibreOffice (`C:\Program Files\LibreOffice`) + PyMuPDF/Pillow for the manuals, Playwright MCP for web screenshots.

**Spec:** [docs/superpowers/specs/2026-09-30-order-visibility-and-admin-management-design.md](../specs/2026-09-30-order-visibility-and-admin-management-design.md) — sections Customer (web + mobile), Delivery (web + mobile), Web/mobile status parity, Customer phone number, Sub-projects (D). Prior plans (style/context): A, B, C in this folder; B's MEMORY.md entry lists what D must mirror.

**Branch:** `order-visibility-d` from `main` in the main checkout (no worktree — a worktree needs `npm ci`).

## Global Constraints

- 2-space indent, ES modules, `async/await`, comments only for non-obvious WHY. No new npm packages (global rule) — neither in the root nor in `mobile/`. Do not run `npm install`/`npm ci`/`expo install`.
- **Mobile cannot be run** (no device/simulator, installing one = package install). Mobile verification = `cd mobile && npx tsc --noEmit` + node tests of the pure logic + careful review. Every report and the final summary must say mobile was type-checked only, not run.
- Modules guarded by node tests (`mobile/lib/order-status.ts`, `mobile/lib/order-detail.ts`, `mobile/lib/image-url.ts`) must be erasable TS with only relative `import type` (no enums/parameter properties, no `@/` alias, no runtime imports of other project files) so `node --no-warnings --test tests/*.test.mjs` can import them directly. Run tests with the glob (a bare `tests/` directory fails on Node 24).
- **Parity rule:** `mobile/lib/order-status.ts` exports the SAME names and values as `lib/order-status.ts` for: `OrderStatus` (type), `ORDER_STATUSES`, `TERMINAL_STATUSES`, `isTerminalStatus`, `STATUS_LABEL`, `STATUS_MESSAGE`, `TIMELINE_STEPS`, `TIMELINE_STEP_INDEX`, `TimelineStatus`; and `STATUS_COLOR` as `Record<OrderStatus, { background: string; text: string }>` hex values. Web labels (current): placed "Placed", accepted "Accepted", preparing "Preparing", ready "Ready", assigned **"Partner assigned"**, picked_up **"On the way"**, delivered "Delivered", cancelled "Cancelled", rejected "Rejected". Timeline: `["Placed","Accepted","Preparing","Ready","On the way","Delivered"]`, index map placed 0, accepted 1, preparing 2, ready 3, assigned 4, picked_up 4, delivered 5, typed over `Exclude<OrderStatus,"cancelled"|"rejected">` so the compiler rejects an unmapped new status. Mobile keeps its extra export `SHOW_LOCATION_FOR_STATUS`. The old mobile exports `ORDERS_LIST_STATUS_LABEL` / `ORDER_DETAIL_STATUS_LABEL` are removed (all callers updated; `grep` must find none).
- **Colour mapping (mobile hex for the web's Tailwind classes; white text everywhere, all >= 4.5:1):** placed `#334155` (slate-700), accepted `#1D4ED8` (blue-700), preparing `#B45309` (amber-700), ready `#0F766E` (teal-700), assigned `#4338CA` (indigo-700), picked_up `#A85800` (BRAND.colors.primaryTextSafe), delivered `#15803D` (green-700), cancelled and rejected `#B91C1C` (red-700). Parity test checks key sets and the equality partition (which statuses share a colour) match the web's `STATUS_COLOR`, not the literal class strings.
- `mobile/lib/order-detail.ts` and `mobile/lib/image-url.ts` are copies of `lib/order-detail.ts` and `lib/image-url.ts` with **identical bytes** (sync test compares file contents after normalising `\r\n` to `\n`). Do not edit them independently of the web files.
- Money: integer paise (`formatPaise`, `lineTotalPaise` from the copied module); display DB `subtotal`/`delivery_fee`/`total` as stored.
- Brand tokens only via `mobile/theme.ts` (`BRAND`); never hardcode brand colours/fonts in components (status colours come from `STATUS_COLOR`). Phone numbers: show plain text; render a `tel:` link only when the value starts with `+` (placeholder `Not provided` is plain text) via `Linking.openURL`.
- Images: React Native `Image` only for URLs that pass `isAllowedImageUrl` (copied module); otherwise render a neutral placeholder block (same rule as web's `ItemThumb`).
- Privacy (Delivery): the new `/api/delivery/active` and `/history` endpoints already redact server-side (email never; available = no recipient data; active = name/phone/address/note; history = name only). The mobile UI must not try to show what the API omitted, and must not call the address endpoint anymore.
- Customer RLS note: customers get `storeAddress = null` (addresses are owner/assigned-partner readable only) — the mobile customer UI must not show a pickup line or crash on null.
- Polling: customer order detail every 3 s while focused and non-terminal (existing pattern); delivery dashboard refresh every 10 s while online (existing pattern). A failed poll keeps the previous data and shows an error line (no silent swallow, no crash on thrown fetch).
- Manuals: edit `docs/User_Manual.docx` and `docs/Mobile_App_User_Manual.docx` **in place with python-docx — never re-run the old `build.js`**. Both manuals use hand-typed static TOCs: after every edit convert to PDF with LibreOffice (`"C:\Program Files\LibreOffice\program\soffice.exe" --headless --convert-to pdf`), read each chapter's start page from the PDF, and rewrite the page numbers (replace everything after the tab in each TOC line — some lines split the number across two runs). When a screenshot is swapped out, drop the orphaned image relationship/part from the docx (python-docx leaves it inside the zip) — mandatory when the old image contained personal data. Blur/redact any real email, address or phone in any new screenshot before inserting it. Web screenshots come from a **production build** (`node scripts/start.mjs --skip-mobile`), never `next dev` (no dev badge), 1280×800.
- Lint: no new lint errors in touched files (`npx eslint` for web files; mobile has pre-existing issues — only ensure no new ones in files you touch: `cd mobile && npx eslint <files>` if configured, else rely on `tsc`).
- Never `git add -A`; stage named files; `/commit`-style messages; no `--no-verify`; no push without Vishal's go-ahead ("Commit Work"). File deletion only where this plan names it (Task 5) — Vishal approved deleting exactly `app/api/delivery/orders/route.ts` and `app/api/delivery/available-orders/route.ts` (and their now-empty directories if nothing else lives there, e.g. keep `app/api/delivery/orders/[id]/*`).
- Demo logins: `customer@foodhub.local` / `demo1234`; vendors `<store-slug>@foodhub.local` / `demo1234` (e.g. `dosa-corner@foodhub.local`); delivery partners `delivery@foodhub.local` and `partner-b1@foodhub.local` / `demo1234` (both online — n8n workflow 04 auto-assigns `ready` orders to an online partner); admin `admin@foodhub.local` / `admin-demo-password`. Don't read `.env*` or print keys. If a real email must be sent for a test, ask Vishal for the inbox at run time (the manuals do not need new emails).

## Review Focus

1. A status added to the web enum later must fail the compile on mobile too (Record typed over the narrowed union) and fail the parity test. Pinned by Task 1.
2. Order with a deleted product / null image / non-allowlisted host / zero items → neutral placeholder, no crash (mobile `OrderDetail` normaliser is the shared one, tested on web; mobile UI null-handling reviewed in Tasks 3–4).
3. Customer detail of an order with `address` null or `Not provided` phone → plain text, no broken `tel:` link. Task 3.
4. A delivery card for an order whose recipient fields are empty (`available` scope) must not render empty labels like "Phone: ". Task 4.
5. Network failure during the 3 s / 10 s polls → error line, previous data kept, no unhandled promise rejection. Tasks 3 and 4.
6. After deleting the legacy endpoints nothing references them (web, mobile, docs, n8n, tests). Task 5 grep.
7. Manuals: every figure referenced in text exists; TOC page numbers match the PDF; no personal data (real emails/addresses/phones) in any image, including orphaned parts inside the docx zip. Tasks 6–9.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `mobile/lib/order-status.ts` | Rewrite | web-identical statuses/labels/messages/timeline + hex `STATUS_COLOR` |
| `mobile/lib/order-detail.ts`, `mobile/lib/image-url.ts` | Create (copies) | shared normaliser/select strings/format helpers |
| `tests/mobile-parity.test.mjs` | Create | status parity + byte-identical copies |
| `mobile/components/OrderStatusStepper.tsx` | Modify | 6 steps, narrow-phone layout |
| `mobile/components/OrderStatusPill.tsx` | Create | coloured pill from `STATUS_COLOR`/`STATUS_LABEL` |
| `mobile/components/ItemThumb.tsx` | Create | guarded RN `Image` / placeholder |
| `mobile/components/OrderItemsList.tsx` | Create | items with thumbs, options, notes, line totals (shared by customer detail + delivery card) |
| `mobile/src/app/customer/(tabs)/orders.tsx` | Modify | orders list (thumbs, count, pill, total) |
| `mobile/src/app/customer/orders/[id].tsx` | Modify | full order detail |
| `mobile/components/DeliveryOrderCard.tsx` | Create | delivery card (available/active/history scopes) |
| `mobile/src/app/delivery/dashboard.tsx` | Modify | Active dashboard on `/api/delivery/active` |
| `mobile/src/app/delivery/history.tsx` | Create | History screen on `/api/delivery/history` |
| `app/api/delivery/orders/route.ts`, `app/api/delivery/available-orders/route.ts` | Delete (Task 5) | legacy endpoints |
| `docs/User_Manual.docx/.pdf`, `docs/Mobile_App_User_Manual.docx/.pdf`, `docs/_manual_assets/…` | Modify | manuals |
| `MEMORY.md`, `CLAUDE.md`, `README.md`, `AGENTS.md` | Check/modify (Task 10) | record D |

---

### Task 1: Mobile status mapping parity + shared module copies + sync tests

**Files:**
- Rewrite: `mobile/lib/order-status.ts`
- Create: `mobile/lib/order-detail.ts`, `mobile/lib/image-url.ts` (byte-identical copies of `lib/order-detail.ts`, `lib/image-url.ts`)
- Modify: `mobile/components/OrderStatusStepper.tsx`, `mobile/src/app/customer/orders/[id].tsx`, `mobile/src/app/customer/(tabs)/orders.tsx` (ONLY to keep them compiling against the renamed exports — minimal edits; their real redesign is Tasks 3 and 4)
- Test: `tests/mobile-parity.test.mjs`

**Interfaces:**
- Produces: everything listed under "Parity rule" in Global Constraints, plus `STATUS_COLOR: Record<OrderStatus, { background: string; text: string }>` (text always `"#FFFFFF"`) and `SHOW_LOCATION_FOR_STATUS`. `mobile/lib/order-detail.ts` exports exactly what `lib/order-detail.ts` exports (`ORDER_DETAIL_SELECT`, `ORDER_LIST_SELECT`, `normalizeOrderDetail`, `normalizeOrderListRow`, `formatPaise`, `lineTotalPaise`, `formatPayment`, `cleanText`, types).

- [ ] **Step 1: Write the failing test** `tests/mobile-parity.test.mjs` (run it first: it fails because the mobile exports don't match):

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as web from "../lib/order-status.ts";
import * as mobile from "../mobile/lib/order-status.ts";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("status list, terminal list and labels/messages are identical", () => {
  assert.deepEqual([...mobile.ORDER_STATUSES], [...web.ORDER_STATUSES]);
  assert.deepEqual([...mobile.TERMINAL_STATUSES], [...web.TERMINAL_STATUSES]);
  assert.deepEqual(mobile.STATUS_LABEL, web.STATUS_LABEL);
  assert.deepEqual(mobile.STATUS_MESSAGE, web.STATUS_MESSAGE);
  for (const status of web.ORDER_STATUSES) {
    assert.equal(mobile.isTerminalStatus(status), web.isTerminalStatus(status), status);
  }
});

test("timeline labels and index map are identical", () => {
  assert.deepEqual([...mobile.TIMELINE_STEPS], [...web.TIMELINE_STEPS]);
  assert.deepEqual(mobile.TIMELINE_STEP_INDEX, web.TIMELINE_STEP_INDEX);
});

test("assigned and picked_up are distinguishable everywhere", () => {
  assert.notEqual(mobile.STATUS_LABEL.assigned, mobile.STATUS_LABEL.picked_up);
  assert.notEqual(mobile.STATUS_COLOR.assigned.background, mobile.STATUS_COLOR.picked_up.background);
});

test("colour tables cover the same statuses with the same sharing pattern as web", () => {
  assert.deepEqual(Object.keys(mobile.STATUS_COLOR).sort(), Object.keys(web.STATUS_COLOR).sort());
  const partition = (colours) => {
    const groups = new Map();
    for (const status of web.ORDER_STATUSES) {
      const key = typeof colours[status] === "string" ? colours[status] : colours[status].background;
      groups.set(key, [...(groups.get(key) ?? []), status]);
    }
    return [...groups.values()].map((g) => g.join(",")).sort();
  };
  assert.deepEqual(partition(mobile.STATUS_COLOR), partition(web.STATUS_COLOR));
});

test("mobile colours are 6-digit hex with white text", () => {
  for (const status of web.ORDER_STATUSES) {
    assert.match(mobile.STATUS_COLOR[status].background, /^#[0-9A-Fa-f]{6}$/, status);
    assert.equal(mobile.STATUS_COLOR[status].text.toUpperCase(), "#FFFFFF", status);
  }
});

test("shared modules are byte-identical copies of the web files", () => {
  assert.equal(read("../mobile/lib/order-detail.ts"), read("../lib/order-detail.ts"));
  assert.equal(read("../mobile/lib/image-url.ts"), read("../lib/image-url.ts"));
});

test("legacy mobile label exports are gone", () => {
  assert.equal(mobile.ORDERS_LIST_STATUS_LABEL, undefined);
  assert.equal(mobile.ORDER_DETAIL_STATUS_LABEL, undefined);
});
```

- [ ] **Step 2: Run** `node --no-warnings --test tests/mobile-parity.test.mjs` → FAIL.
- [ ] **Step 3: Rewrite `mobile/lib/order-status.ts`** to the parity rule (copy the web file's structure; add `STATUS_COLOR` with the hex table; keep `SHOW_LOCATION_FOR_STATUS: OrderStatus[] = ["assigned","picked_up"]`; update the header comment: "mirrors lib/order-status.ts — tests/mobile-parity.test.mjs enforces it"). Copy `lib/order-detail.ts` and `lib/image-url.ts` to `mobile/lib/` byte for byte (`cp`, keep the original line endings).
- [ ] **Step 4: Keep the app compiling.** Replace usages of `ORDERS_LIST_STATUS_LABEL` → `STATUS_LABEL` and `ORDER_DETAIL_STATUS_LABEL` → `STATUS_MESSAGE` in `mobile/src/app/customer/(tabs)/orders.tsx` and `mobile/src/app/customer/orders/[id].tsx` (plus `TERMINAL_STATUSES` includes etc. as needed). Make `OrderStatusStepper` accept the 6 steps: dots stay a row of circles joined by lines (as now) but labels no longer sit under each dot — render ONE caption line under the dots: `Step {currentIndex+1} of {TIMELINE_STEPS.length} · {TIMELINE_STEPS[currentIndex]}` (bold) — mirroring the web timeline's compact narrow-screen form (6 labels cannot fit a 320–390pt phone). `grep -rn "ORDERS_LIST_STATUS_LABEL\|ORDER_DETAIL_STATUS_LABEL" mobile --include=*.ts --include=*.tsx` (excluding node_modules) must be empty.
- [ ] **Step 5: Verify** — `node --no-warnings --test tests/*.test.mjs` all pass; `cd mobile && npx tsc --noEmit` clean; `npx tsc --noEmit` (web) clean.
- [ ] **Step 6: Commit** (named files): `feat: mobile status mapping matches web; sync tests; shared order-detail module`

---

### Task 2: Shared mobile presentation components

**Files:**
- Create: `mobile/components/OrderStatusPill.tsx`, `mobile/components/ItemThumb.tsx`, `mobile/components/OrderItemsList.tsx`

**Interfaces:**
- Consumes: `STATUS_COLOR`, `STATUS_LABEL`, `OrderStatus` (`../lib/order-status`); `isAllowedImageUrl` (`../lib/image-url`); `formatPaise`, `lineTotalPaise`, `OrderDetailItem` (`../lib/order-detail`); `BRAND` (`../theme`).
- Produces:
  - `OrderStatusPill({ status }: { status: OrderStatus })` — pill (`radius: BRAND.radiusPill`) with `STATUS_COLOR[status].background` fill, white `bodySemiBold` text `STATUS_LABEL[status]`.
  - `ItemThumb({ url, name, size = 48 })` — `Image` (resizeMode cover, rounded 8) when `url` non-null and `isAllowedImageUrl(url)`; otherwise a neutral `BRAND.colors.inkTint` square showing the first letter of `name`; `accessibilityLabel={name}`.
  - `OrderItemsList({ items, showLineTotals = true }: { items: OrderDetailItem[]; showLineTotals?: boolean })` — one row per item: `ItemThumb`, `{quantity}× {name}`, options as a muted comma list, special instructions in quotes (muted), and `formatPaise(lineTotalPaise(unitPrice, quantity))` right-aligned when `showLineTotals`. Rows use `flexShrink`/`flex: 1` on the text column so long names wrap and never push the price off-screen. Empty `items` renders nothing.

- [ ] **Step 1: Write the three components** exactly per the interfaces; styles via `StyleSheet.create` with `BRAND` tokens; text ≥ 14pt for names (the operational screens should not be tiny).
- [ ] **Step 2: Verify** — `cd mobile && npx tsc --noEmit` clean; no hard-coded brand colours except `STATUS_COLOR`.
- [ ] **Step 3: Commit**: `feat: mobile order status pill, item thumbnail and items list components`

---

### Task 3: Mobile customer — orders list + full order detail

**Files:**
- Modify: `mobile/src/app/customer/(tabs)/orders.tsx`, `mobile/src/app/customer/orders/[id].tsx`

**Interfaces:**
- Consumes: `ORDER_LIST_SELECT`, `normalizeOrderListRow`, `RawOrderListRow`, `ORDER_DETAIL_SELECT`, `normalizeOrderDetail`, `RawOrderDetail`, `OrderDetail`, `formatPaise`, `formatPayment` (`../../../../lib/order-detail`); `OrderStatusPill`, `ItemThumb`, `OrderItemsList`, `OrderStatusStepper`, `CourierCard`; `STATUS_MESSAGE`, `TIMELINE_STEP_INDEX`, `SHOW_LOCATION_FOR_STATUS`, `isTerminalStatus` (`order-status`).

- [ ] **Step 1: Orders list** (`orders.tsx`): query `supabase.from("orders").select(ORDER_LIST_SELECT).eq("customer_id", userId).order("placed_at", { ascending: false })` → `normalizeOrderListRow`. Row (press → `/customer/orders/${id}`): store name (bold) + `OrderStatusPill`; date/time (`toLocaleString()`); up to 3 `ItemThumb` (size 40) + "+N" when more items, and "{itemCount} items"; total `formatPaise(Math.round(total * 100))`. Keep the existing `useFocusEffect` refetch, the "Your orders" heading, the loading/empty/error states (add an empty-state "No orders yet."); thrown fetches are caught and shown as the existing error text.
- [ ] **Step 2: Order detail** (`[id].tsx`): replace the two separate queries with ONE `supabase.from("orders").select(ORDER_DETAIL_SELECT).eq("id", id).single()` → `normalizeOrderDetail` (payment now comes from `order.payment`). Keep the 3 s poll, the stop-on-terminal rule, the partner-location lookup and `CourierCard`, the payment-failed message (`order.payment?.status === "failed"`), and the cancelled/rejected red banners (no stepper for them). Layout, top to bottom: heading `Order #{id.slice(0,8)}` + `OrderStatusPill`; store name + placed date; `STATUS_MESSAGE[status]` line; stepper; courier card/location (unchanged); **Deliver to** card — recipient name, recipient email, phone (`tel:` link via `Linking.openURL` only when it starts with `+`, else plain text), address label + all lines (or "No delivery address on file"), delivery note when present; **Items** card (`OrderItemsList`); **Totals** — Subtotal, Delivery fee, Total (`formatPaise(Math.round(x * 100))` from the stored values), Payment (`formatPayment(order.payment)`); **Timeline times** — Placed always, Accepted/Picked up/Delivered only when non-null (`toLocaleString()`); no "Pickup" line (store address is null for customers). The whole screen is wrapped in a `ScrollView`. Poll failures: keep the previous order and show an error line; clear on next success; catch thrown fetches.
- [ ] **Step 3: Verify** — `cd mobile && npx tsc --noEmit` clean; `npx tsc --noEmit` (web) clean; `node --no-warnings --test tests/*.test.mjs` pass; reread both files for the Review Focus items 2, 3, 5 (null address, `Not provided`, deleted product, thrown fetch). Say plainly in the report that nothing was run on a device.
- [ ] **Step 4: Commit**: `feat: mobile customer orders list and full order detail`

---

### Task 4: Mobile delivery — card, Active dashboard, History

**Files:**
- Create: `mobile/components/DeliveryOrderCard.tsx`, `mobile/src/app/delivery/history.tsx`
- Modify: `mobile/src/app/delivery/dashboard.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `ApiError` (`../../../lib/api`); `OrderDetail`, `formatPaise` (`order-detail`); `OrderStatusPill`, `OrderItemsList`; `GET /api/delivery/active` → `{ available: OrderDetail[]; mine: OrderDetail[] }`; `GET /api/delivery/history` → `{ orders: OrderDetail[] }`; `POST /api/delivery/orders/:id/claim`, `POST /api/delivery/orders/:id/status` (unchanged).
- Produces: `DeliveryOrderCard({ order, scope, busy, onClaim, onAdvance })` with `scope: "available" | "active" | "history"` (mirrors `components/delivery/DeliveryOrderCard.tsx` on the web).

- [ ] **Step 1: `DeliveryOrderCard`** — header: `#{id.slice(0,8)}`, `OrderStatusPill`, amount `formatPaise(Math.round(total * 100))`; **Pickup** block: `Pickup — {storeName}` and `storeAddress.lines.join(", ")` or "Address not on file"; `available`: only the line "Customer details appear after you accept." plus the items summary (`OrderItemsList showLineTotals={false}`) and an **Accept** button (`onClaim`); `active`: **Drop-off** block — recipient name (bold), phone (`tel:` via `Linking.openURL` only for values starting with `+`, otherwise plain text; omit the line entirely if empty), address label + all lines (or "No delivery address on file"), note when present, items, and the action button `Mark picked up` (status `assigned`) / `Mark delivered` (status `picked_up`) → `onAdvance`; `history`: compact line (`Delivered to {recipientName}` for delivered, else the status label), `deliveredAt ?? placedAt` timestamp, one-line items summary (`{qty total} items: names…`, 2 lines max), no buttons. Buttons `disabled={busy}`; text wraps (no overflow with long names).
- [ ] **Step 2: Dashboard** — replace the two fetches with `apiFetch<{available; mine}>("/api/delivery/active")`; remove `addresses` state and the `viewAddress`/"View address" code and the old `OrderRow` type and `NEXT_LABEL`; render "Your active deliveries" (`DeliveryOrderCard scope="active"`) first, then "Available orders" (`scope="available"`; when offline show "Go online to see available orders."); per-order `busyOrderId` guard in a `try/finally` for `claim`/`advance` (keep existing handlers' logic). Keep: online toggle, location permission + ping, 10 s refresh, profile name, reset-password UI. A failed refresh (non-OK or thrown) keeps the previous lists and shows "Failed to refresh orders"-style error (use `ApiError.message` when present); the next success clears it. Add a **History** entry point: a pressable "History" segment/link next to the title that `router.push("/delivery/history")`.
- [ ] **Step 3: History screen** (`history.tsx`): `useRequireSession("/login/delivery")`; load once on focus via `apiFetch<{orders}>("/api/delivery/history")`; heading "History", note "Showing your 50 most recent finished orders.", a Refresh pressable, loading/error/empty ("No completed deliveries yet.") states, list of `DeliveryOrderCard scope="history"`; a "Back to dashboard" link (`router.replace("/delivery/dashboard")`). Mirror structure/style of `dashboard.tsx` (ScrollView, BRAND tokens).
- [ ] **Step 4: Verify** — `cd mobile && npx tsc --noEmit`; web `npx tsc --noEmit`; node tests; grep that `mobile/` no longer references `/api/delivery/orders"` (exact path without `/:id`), `available-orders`, or `/address` — i.e. `grep -rn "delivery/orders\"\|available-orders\|/address" mobile/src mobile/lib mobile/components` is empty (the `/api/delivery/orders/${id}/claim` and `/status` calls are template strings and are fine). Review Focus 4 and 5 re-read. Report that nothing was run on a device.
- [ ] **Step 5: Commit**: `feat: mobile delivery active dashboard, order card and history screen`

---

### Task 5: Delete legacy delivery endpoints (approved by Vishal)

**Files:**
- Delete: `app/api/delivery/orders/route.ts`, `app/api/delivery/available-orders/route.ts`

- [ ] **Step 1: Prove nothing calls them.** `grep -rn "api/delivery/orders\b" app components lib mobile/src mobile/lib mobile/components tests docs n8n scripts --include=*.ts --include=*.tsx --include=*.mjs --include=*.md --include=*.json` and the same for `available-orders` — only hits allowed: the `/api/delivery/orders/[id]/…` sub-routes, `docs/` historical text, `MEMORY.md`, and spec/plan files. Paste the grep output in the report. If any live caller remains, STOP and report.
- [ ] **Step 2: Delete exactly those two files** (`git rm`), keep `app/api/delivery/orders/[id]/*`. Remove an emptied `available-orders/` directory if nothing else is in it.
- [ ] **Step 3: Verify** — `npx tsc --noEmit`; `npm run build` (the route list must no longer show `/api/delivery/orders` and `/api/delivery/available-orders` but must still show `/api/delivery/orders/[id]/claim|status|address`, `/api/delivery/active`, `/api/delivery/history`); node tests.
- [ ] **Step 4: Commit**: `chore: remove legacy delivery list endpoints (mobile now uses active/history)`

---

### Task 6: Web manual — retake screenshots from a production build

**Files:**
- Modify: `docs/_manual_assets/screens/*.png` (new/retaken files), nothing in the docx yet

This task is controller-led with an agent driving Playwright. **Ask Vishal before stopping the running dev servers** (`node scripts/stop.mjs` stops the app services; ask first, and wait for the stop to finish before starting — `app:start` right after `app:stop` can hit a Supabase health-check timeout).

- [ ] **Step 1: Start the production build** — `node scripts/start.mjs --skip-mobile` (builds and serves on :3000). Confirm no Next dev badge appears.
- [ ] **Step 2: Drive ONE real Cash-on-Delivery order through all portals** (customer `customer@foodhub.local` → vendor `dosa-corner@foodhub.local` → delivery partner → admin) and capture 1280×800 screenshots (Playwright MCP; files land in `.playwright-mcp/`, then copy into `docs/_manual_assets/screens/` with new names) of every screen the manual should show: customer Orders list; customer order detail (items, address, phone, totals, 6-step tracker mid-flow AND delivered); vendor Orders board (colored columns, full-details dialog); delivery Dashboard (Active: available card + active card with drop-off block) and History; admin Overview (KPIs), Orders table, Order detail (with reassign), Vendors (with Add form open), Delivery Partners (with Add form open); plus any screen whose look changed since v2.0 of the manual (compare against the existing `docs/_manual_assets/screens/*.png`). Use throwaway demo data only. **Blur** any real email/address/phone that appears (checkout fields are never prefilled; the order's recipient email must be a fake like `demo@example.com` for screenshots, not Vishal's real address).
- [ ] **Step 3: Verify** — list the new PNGs with sizes (1280×800), open each and confirm no personal data and no dev badge; write the mapping "figure → file → what it shows" into the report.
- [ ] **Step 4: Commit**: `docs: retake web manual screenshots for order visibility and admin screens` (PNG files by name).

---

### Task 7: Web manual — edit in place, renumber TOC, regenerate PDF

**Files:**
- Modify: `docs/User_Manual.docx`, `docs/User_Manual.pdf`

- [ ] **Step 1: Inspect** the current docx with python-docx (headings via paragraph styles are NOT reliable — some paragraphs have no style; locate sections by text and by the static TOC lines). Record the chapter list and the current TOC text.
- [ ] **Step 2: Content updates (python-docx, in place):** bump version/date on the cover/footer (v2.0 → v3.0); "What's New" section updated for this release: phone number at checkout, Orders list/detail with the 6-step tracker, vendor board redesign with full details, delivery Active vs History with full pickup/drop-off details, admin sidebar (Overview/Orders/Vendors/Delivery Partners), order detail with reassign, Add vendor / Add delivery partner (admin types the temp password, 6-character minimum), delivered email (checkout email; subject; what it contains). Update every affected chapter's text and swap in the Task 6 figures (replace the image part of the existing inline shape; keep captions/numbering consistent; add new figures where a new screen exists). Remove statements now wrong (e.g. "admin dashboard shows every order…", delivery "View address" button, 4-step tracker, "Out for delivery" wording → "Partner assigned"/"On the way").
- [ ] **Step 3: Orphan cleanup** — after replacing images, drop orphaned image relationships/parts so the docx zip contains only referenced images; assert by listing `word/media/*` vs relationships.
- [ ] **Step 4: PDF + TOC** — convert to PDF with LibreOffice; extract each chapter heading's start page with PyMuPDF; rewrite the static TOC numbers (replace everything after the tab in each line; handle split-run lines); reconvert and re-check until every TOC number equals the PDF page. Check for a blank page and a blank TOC page.
- [ ] **Step 5: Verify** — render 4–6 representative PDF pages to PNG (PyMuPDF) and look at them (cover, TOC, a changed customer page, delivery page, admin page, last page); `unzip -l` the docx for media count; confirm no personal data in any image.
- [ ] **Step 6: Commit**: `docs: refresh web user manual (v3.0) for order visibility, delivery and admin changes`

---

### Task 8: Mobile manual — text/figure updates that do not need a recording

**Files:**
- Modify: `docs/Mobile_App_User_Manual.docx` (PDF is regenerated in Task 10)

- [ ] **Step 1: Inspect** the mobile docx like Task 7 Step 1 (locate Orders, Tracking, Delivery Partner sections and the static TOC).
- [ ] **Step 2: Update text** for everything that changed on mobile: phone number at checkout (already shipped in A — verify the checkout section mentions it), Orders tab (list rows: store, date, status pill, item thumbnails/count, total), Order detail (6-step "Step N of 6" tracker, deliver-to card with phone, items with photos, totals, payment, timeline times), new status wording (Partner assigned / On the way), Delivery: Active dashboard (available vs active cards, what customer details a partner sees and when), History screen. Mark each figure that needs a NEW real screenshot with a visible placeholder caption `[Figure X — pending screenshot from Vishal's phone recording]` (keep the old figure in place until Task 9 replaces it; do not leave a screenshot that shows a stale 4-step tracker without the caption saying it is being replaced). Bump the version (v3.0 → v4.0) only in Task 10 when the figures are final.
- [ ] **Step 3: Commit** (docx only; do NOT regenerate the PDF yet): `docs: mobile manual text updated for order visibility; figures pending recording`

---

### Task 9: Mobile manual — figures from Vishal's phone recording (needs Vishal)

**Files:**
- Modify: `docs/_manual_assets/…` (new frames), `docs/Mobile_App_User_Manual.docx`, `docs/Mobile_App_User_Manual.pdf`

This task cannot start until Vishal has run the mobile app (Expo, against the local backend with `EXPO_PUBLIC_API_BASE_URL` pointing at his machine) and made a screen recording. The controller asks him (AskUserQuestion) when Tasks 1–5 are merged-ready, tells him exactly what to record (Customer: login → Orders list → an order's detail at placed/accepted/preparing/ready/on the way/delivered if possible → delivered; Delivery: login → go Online → Active dashboard with an available and an active card → Mark picked up/delivered → History) and where to put the file (project `docs/`, like the earlier MP4 — never committed; it is git-untracked).

- [ ] **Step 1:** Extract candidate frames from the recording (OpenCV was used before; if `cv2` is missing use PyMuPDF/ffmpeg only if already installed — otherwise ask Vishal for individual screenshots; no package installs).
- [ ] **Step 2:** Select the frames for the Task 8 placeholders; **blur** any real email/address/phone/name; save PNGs under `docs/_manual_assets/`.
- [ ] **Step 3:** Swap them into the docx (replace the placeholder figures and any stale-frame figures), drop orphaned image parts, bump the version to v4.0, convert to PDF, renumber the static TOC against the PDF, re-render several pages and look at them.
- [ ] **Step 4: Verify** — no personal data in any image or orphaned part; every figure referenced exists; TOC matches the PDF.
- [ ] **Step 5: Commit**: `docs: refresh mobile user manual (v4.0) with order tracker, orders and delivery history screens`

---

### Task 10: Docs, final gates, final review

**Files:** `MEMORY.md`, `CLAUDE.md`, `README.md`, `AGENTS.md` (check each), `docs/n8n-webhook-setup.md` only if it mentions the deleted endpoints.

- [ ] **Step 1: Final gates:** web `npx tsc --noEmit`; `cd mobile && npx tsc --noEmit`; `node --no-warnings --test tests/*.test.mjs`; `npm run build`; `npx eslint` on touched web files. Report plainly that mobile was type-checked only.
- [ ] **Step 2: Docs:** add a MEMORY.md entry "Order visibility — sub-project D" in the style of A/B/C (what shipped, parity guard and byte-identical copies, endpoints deleted, manuals refreshed with versions, evidence, defects/lessons, open items: mobile never run on a device unless Vishal's recording proves it; raw Expo Router header titles still unfixed; anything deferred); CLAUDE.md one short status paragraph + update the "Mobile app" status mentions if now wrong (e.g. it said mobile "describes the pre-redesign flow" — fix); README mobile section if now wrong; AGENTS.md check.
- [ ] **Step 3: Final whole-branch review against the SPEC** (fresh reviewer, most capable model, over `git diff main...order-visibility-d`): every Customer (mobile) and Delivery (mobile) bullet; Web/mobile status parity; legacy endpoints really unused; privacy rendering of redacted scopes; manuals vs the actual UI (spot-check three claims per manual against code); no personal data in docs/images; Review Focus list. One fix wave + one scoped re-review.
- [ ] **Step 4:** merge to local `main` after Vishal's go-ahead; push only on his "Commit Work" (the unpushed `78ecb6b` docs commit on `main` goes up with it). If a push is denied, report; don't route around.
