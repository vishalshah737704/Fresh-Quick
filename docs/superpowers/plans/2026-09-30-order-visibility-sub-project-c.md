# Order Visibility — Sub-project C (n8n delivered email) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an order is marked `delivered`, n8n emails the person who placed it (the checkout email, `orders.recipient_email`): "Thank you for your order. Your order has been successfully delivered. Please let us know your experience." plus the full order details with item images and totals. Also re-import the stale local n8n workflows so the previously unconfirmed "order accepted" email is confirmed live.

**Architecture:** `GET /api/internal/orders/[id]/notification-details` (called by n8n with the shared secret) is extended to read the order through the existing `ORDER_DETAIL_SELECT`/`normalizeOrderDetail` and to return the structured details **plus a ready-made, HTML-escaped email subject and body** produced by a new pure, unit-tested module `lib/delivered-email.ts` (decision with Vishal: build the HTML in the app route, not in an n8n Code node). Workflow 05 gets two new nodes on its `delivered` branch (HTTP GET details -> Gmail send, HTML mode), wired in parallel with the existing placeholder node. The re-import of the workflow JSONs into the local n8n container is done by Vishal in the n8n UI (decision); Claude verifies behaviour live afterwards.

**Tech Stack:** Next.js 16 route handler, TypeScript (erasable subset for `lib/`), `node --test`, n8n (local Docker container `n8n`, Gmail OAuth2 node already connected by Vishal), local Supabase (`pg_net` webhooks via `public.n8n_notify()`), Playwright MCP.

**Spec:** [docs/superpowers/specs/2026-09-30-order-visibility-and-admin-management-design.md](../specs/2026-09-30-order-visibility-and-admin-management-design.md) — section "n8n delivered email" (+ Customer phone number: "n8n (`notification-details` returns it; the delivered email includes it)"). Prior plans (style reference): sub-projects A and B in this folder. Operational reference: [docs/n8n-webhook-setup.md](../../n8n-webhook-setup.md).

**Branch:** `order-visibility-c` from `main` in the main checkout (no worktree — a worktree needs `npm ci`).

## Global Constraints

- 2-space indent, ES modules, `async/await`, comments only for non-obvious WHY.
- No new npm packages. `lib/delivered-email.ts` must be erasable TS (no enums/parameter properties) with **no runtime imports of other project files** (only `import type` with relative paths) so `node --no-warnings --test tests/*.test.mjs` can import it directly; helpers it needs (rupee formatting, HTML escaping) are defined locally; the image-host allowlist is injected as a parameter.
- The internal route stays guarded by `verifyInternalSecret` (secret header `X-Internal-Secret`); the service-role client stays in route files only; nothing here may be importable from a client bundle.
- Never print, log, commit or hardcode secrets. The shared secret already lives in the running n8n container's env and in `.env.local`; do NOT read `.env*` files. For local curl tests read the secret into a shell variable without echoing it: `S=$(docker exec n8n printenv N8N_INTERNAL_SECRET)` and pass `-H "X-Internal-Secret: $S"`; never print `$S` or the full request command output if it would include it.
- Every URL n8n calls back into this machine uses `host.docker.internal` (n8n container env already has `APP_BASE_URL=http://host.docker.internal:3000`, `SUPABASE_URL`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`) — do not change the container.
- **Email HTML safety:** every dynamic value (recipient name, store name, item names, option names, special instructions, delivery note, address lines, phone, image URL) is HTML-escaped; `<img src>` is emitted only when the URL is `https:` AND passes the injected allowlist predicate (route injects `isAllowedImageUrl` from `lib/image-url.ts`); otherwise the row renders without an image.
- Money: DB numeric rupees -> integer paise (`Math.round(x * 100)`) for any computed amount (line totals); display DB `subtotal`/`delivery_fee`/`total` as stored, never recompute them. Currency symbol `₹`, 2 decimals.
- Exact greeting text (verbatim from Vishal): `Thank you for your order. Your order has been successfully delivered. Please let us know your experience.`
- Recipient of the email: `orders.recipient_email` (the checkout email), NOT the auth email. If it is blank/missing the route returns 404 `Recipient email not found` (workflow shows a failed execution rather than silently emailing nobody/wrong person).
- Backwards compatibility: keep the existing response fields (`orderId`, `customerEmail`, `restaurantName`, `total`, `deliveryAddress`) so workflow 03's accepted email keeps working; `customerEmail` now carries `recipient_email`. New fields are additive.
- Schema: no migration, no RLS change. Apply nothing to the DB. Never run `supabase db reset`.
- n8n state changes (import, publish, credential selection) are done by **Vishal in the n8n UI**; Claude must not recreate or restart the n8n container, and must not touch n8n credentials. Claude writes exact import steps and verifies results.
- Real emails: the live test sends a real Gmail message to the order's checkout email. Use only an address Vishal names at test time (ask via AskUserQuestion); never email a customer-seeded address.
- Lint: no new lint errors on touched TS files (12 pre-existing failures elsewhere). Done = `npx tsc --noEmit`, `node --no-warnings --test tests/*.test.mjs`, `npm run build`, live end-to-end verification (accepted email + delivered email received and rendered), final whole-branch review against the SPEC. Commit via `/commit` (named files only, never `git add -A`, never `--no-verify`). No push without Vishal's go-ahead ("Commit Work").
- Demo logins: `customer@foodhub.local` / `demo1234`; vendors `<store-slug>@foodhub.local` / `demo1234` (e.g. `dosa-corner@foodhub.local`); delivery partner test account `partner-b1@foodhub.local` / `demo1234` (or `delivery@foodhub.local`, currently ONLINE — note n8n workflow 04 auto-assigns a `ready` order to any online partner); admin `admin@foodhub.local` / `admin-demo-password`.

## Review Focus

1. Item name / option / special instruction / recipient name containing `<script>`, `"`, `&`, `'` -> escaped everywhere, including inside the `<img alt>` / `src` attributes. Pinned by Task 1 tests.
2. Item with `imageUrl` null, non-https, or a non-allowlisted host -> row renders with no `<img>`; no crash. Pinned by Task 1 tests.
3. Order with no delivery address (`address` null) -> "No delivery address on file", no crash; `recipientPhone` of `Not provided` renders as plain text (no broken `tel:` link). Task 1 tests.
4. `recipient_email` blank -> 404 `Recipient email not found`; route never falls back to the auth email. Task 2 (live check).
5. Gmail node in HTML mode: the body is the route's `deliveredEmailHtml`, not an expression that re-templates user data. Task 3 JSON test.
6. The `delivered` Postgres trigger can fire more than once for one order if status is re-saved as `delivered`; document it (do not add dedupe state in this sub-project) in the n8n doc. Task 5.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `lib/delivered-email.ts` | Create | pure `buildDeliveredEmail(order, isImageAllowed)` -> `{ subject, html }`, `escapeHtml` |
| `tests/delivered-email.test.mjs` | Create | escaping, images, totals, address/phone edge cases, exact greeting |
| `app/api/internal/orders/[id]/notification-details/route.ts` | Modify | normalized order + email subject/body + recipient email |
| `n8n/workflows/05-delivery-status-propagation.json` | Modify | `delivered` branch: GET details -> Gmail (HTML) |
| `tests/n8n-workflows.test.mjs` | Create | all 5 workflow JSONs parse; connections reference real nodes; 05 delivered branch shape |
| `docs/n8n-webhook-setup.md` | Modify | workflow 05 section, re-import steps, verified results, duplicate-fire note |
| `MEMORY.md`, `CLAUDE.md`, `README.md`, `AGENTS.md` | Check/modify (Task 5) | record sub-project C |

---

### Task 1: `lib/delivered-email.ts` — escaped HTML email builder

**Files:**
- Create: `lib/delivered-email.ts`
- Test: `tests/delivered-email.test.mjs`

**Interfaces:**
- Consumes: `import type { OrderDetail } from "./order-detail";` (type only).
- Produces:
  - `export const DELIVERED_GREETING = "Thank you for your order. Your order has been successfully delivered. Please let us know your experience.";`
  - `export function escapeHtml(value: string): string` — escapes `& < > " '`.
  - `export function buildDeliveredEmail(order: OrderDetail, isImageAllowed: (url: string) => boolean): { subject: string; html: string }`
    - `subject` = `Your order from ${order.storeName} has been delivered` (raw text; n8n/Gmail handle header encoding).
    - `html` = a self-contained HTML fragment (inline styles only, table layout, max width 600px): greeting paragraph (`DELIVERED_GREETING`) addressed `Hi {recipientName},`; "Order #{id.slice(0,8)} from {storeName}" line; an items table (one row per item: optional 56×56 `<img>` thumbnail, `{qty}× {name}`, options as comma list, quoted special instructions, line total = `lineTotalPaise` computed locally as `Math.round(unitPrice * 100) * quantity`); a totals block (Subtotal, Delivery fee, Total from `order.subtotal/deliveryFee/total` via local paise formatting); a "Delivered to" block (recipient name, phone — plain text, address label + lines or `No delivery address on file`); the delivery note when present.

- [ ] **Step 1: Write the failing tests** `tests/delivered-email.test.mjs`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildDeliveredEmail, escapeHtml, DELIVERED_GREETING } from "../lib/delivered-email.ts";

const order = {
  id: "abcdef12-0000-0000-0000-000000000000",
  status: "delivered",
  placedAt: "2026-09-30T10:00:00Z",
  acceptedAt: null, pickedUpAt: null, deliveredAt: null,
  subtotal: 250, deliveryFee: 30, total: 280,
  deliveryNote: "ring bell",
  recipientName: "Asha",
  recipientEmail: "asha@example.com",
  recipientPhone: "+919876543210",
  storeName: "Dosa Corner",
  storeAddress: null,
  deliveryPartnerId: "p1",
  address: { label: "Home", lines: ["1 Park St", "Pune 411001"] },
  payment: { status: "success", method: "mock_card" },
  items: [
    {
      id: "i1", quantity: 2, unitPrice: 100.5, specialInstructions: "no onion",
      name: "Masala Dosa", imageUrl: "https://images.pexels.com/photos/1/a.jpeg",
      options: [{ id: "o1", groupName: "Size", optionName: "Large" }],
    },
  ],
};
const allow = (url) => url.startsWith("https://images.pexels.com/");

test("escapeHtml escapes the five special characters", () => {
  assert.equal(escapeHtml(`<a href="x">&'</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
});

test("subject and exact greeting", () => {
  const { subject, html } = buildDeliveredEmail(order, allow);
  assert.equal(subject, "Your order from Dosa Corner has been delivered");
  assert.ok(html.includes(DELIVERED_GREETING));
  assert.equal(
    DELIVERED_GREETING,
    "Thank you for your order. Your order has been successfully delivered. Please let us know your experience."
  );
  assert.ok(html.includes("Hi Asha,"));
  assert.ok(html.includes("#abcdef12"));
});

test("item row shows image, qty, options, note, and paise-correct line total", () => {
  const { html } = buildDeliveredEmail(order, allow);
  assert.ok(html.includes('<img src="https://images.pexels.com/photos/1/a.jpeg"'));
  assert.ok(html.includes("2× Masala Dosa"));
  assert.ok(html.includes("Large"));
  assert.ok(html.includes("no onion"));
  assert.ok(html.includes("₹201.00")); // 100.50 * 2
});

test("totals come from the stored order values", () => {
  const { html } = buildDeliveredEmail(order, allow);
  assert.ok(html.includes("₹250.00"));
  assert.ok(html.includes("₹30.00"));
  assert.ok(html.includes("₹280.00"));
});

test("delivered-to block has name, phone as plain text, address lines, note", () => {
  const { html } = buildDeliveredEmail(order, allow);
  assert.ok(html.includes("+919876543210"));
  assert.ok(!html.includes("href=\"tel:"));
  assert.ok(html.includes("1 Park St"));
  assert.ok(html.includes("Pune 411001"));
  assert.ok(html.includes("ring bell"));
});

test("every dynamic value is escaped, including attributes", () => {
  const evil = {
    ...order,
    recipientName: `<script>alert(1)</script>`,
    storeName: `Bob's & "Co"`,
    deliveryNote: `<b>x</b>`,
    items: [{
      ...order.items[0],
      name: `<img src=x onerror=alert(1)>`,
      specialInstructions: `"><script>1</script>`,
      imageUrl: `https://images.pexels.com/photos/1/a.jpeg"onerror="alert(1)`,
      options: [{ id: "o", groupName: "g", optionName: "<i>opt</i>" }],
    }],
  };
  const { html, subject } = buildDeliveredEmail(evil, allow);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(!html.includes("<i>opt</i>"));
  assert.ok(!/onerror="alert/.test(html));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(subject.includes("Bob's & \"Co\"")); // subject is plain text, not HTML
});

test("no <img> for null, non-https or non-allowlisted image URLs; row still renders", () => {
  for (const imageUrl of [null, "http://images.pexels.com/x.jpg", "https://evil.example/x.jpg"]) {
    const { html } = buildDeliveredEmail({ ...order, items: [{ ...order.items[0], imageUrl }] }, allow);
    assert.ok(!html.includes("<img"), String(imageUrl));
    assert.ok(html.includes("2× Masala Dosa"));
  }
});

test("missing address and 'Not provided' phone render safely", () => {
  const { html } = buildDeliveredEmail(
    { ...order, address: null, recipientPhone: "Not provided", deliveryNote: null },
    allow
  );
  assert.ok(html.includes("No delivery address on file"));
  assert.ok(html.includes("Not provided"));
  assert.ok(!html.includes("Note:"));
});

test("an order with zero items still renders greeting and totals", () => {
  const { html } = buildDeliveredEmail({ ...order, items: [] }, allow);
  assert.ok(html.includes(DELIVERED_GREETING));
  assert.ok(html.includes("₹280.00"));
});
```

- [ ] **Step 2: Run to verify failure** — `node --no-warnings --test tests/delivered-email.test.mjs` -> FAIL (module missing).
- [ ] **Step 3: Implement `lib/delivered-email.ts`** per the Interfaces block. Notes: use inline styles; table-based layout; `escapeHtml` applied to every interpolated string including `<img src>`/`alt`; the "Note:" line only when `deliveryNote` is non-null; labels/colours neutral (this is an email, not the app: plain hex colours are fine here, do not import app tokens). Local helper `rupees(amount: number): string` = `₹${(Math.round(amount * 100) / 100).toFixed(2)}`; line total `rupees((Math.round(item.unitPrice * 100) * item.quantity) / 100)`.
- [ ] **Step 4: Run** — `node --no-warnings --test tests/*.test.mjs` -> all pass; `npx tsc --noEmit` clean; `npx eslint lib/delivered-email.ts`.
- [ ] **Step 5: Commit** (`/commit`, named files): `feat: HTML-escaped delivered-order email builder`

---

### Task 2: Extend `notification-details` route

**Files:**
- Modify: `app/api/internal/orders/[id]/notification-details/route.ts`

**Interfaces:**
- Consumes: `ORDER_DETAIL_SELECT`, `normalizeOrderDetail`, `RawOrderDetail` (`@/lib/order-detail`); `isAllowedImageUrl` (`@/lib/image-url`); `buildDeliveredEmail` (`@/lib/delivered-email`); `verifyInternalSecret`; `supabaseServer`.
- Produces — JSON body (all existing fields kept):
  `{ orderId, customerEmail /* = recipient_email */, restaurantName, total /* number, rupees */, deliveryAddress /* legacy string: address label || first line || "your saved address" */, status, recipientName, recipientPhone, subtotal, deliveryFee, address: { label, lines } | null, items: [{ name, quantity, unitPrice, imageUrl, options: string[] , specialInstructions }], emailSubject, deliveredEmailHtml }`.

- [ ] **Step 1: Rewrite the handler** (keep the secret guard and the 404 `Order not found`):
  - `const { data, error } = await supabaseServer.from("orders").select(ORDER_DETAIL_SELECT).eq("id", id).maybeSingle();` -> 404 `Order not found` when null/error.
  - `const order = normalizeOrderDetail(data as unknown as RawOrderDetail);`
  - If `!order.recipientEmail.trim()` -> 404 `{ error: "Recipient email not found" }` (do NOT look up the auth user any more).
  - `const { subject, html } = buildDeliveredEmail(order, isAllowedImageUrl);`
  - Return the body above. `deliveryAddress` legacy value: `order.address?.label || order.address?.lines[0] || "your saved address"`; `restaurantName`: `order.storeName` (note: `normalizeOrderDetail` yields "Unknown store" when missing — the old fallback "the restaurant" is replaced; acceptable); `total: order.total`.
  - Update the file's header comment: it now serves workflow 03 (accepted) and workflow 05 (delivered) and returns the checkout email, not the account email.
  - The route must not take a status check: both workflows call it at different statuses.
- [ ] **Step 2: Verify static** — `npx tsc --noEmit`; `npx eslint` the file; `npm run build` (a dev server may be running on :3000 — a prior build did not break it).
- [ ] **Step 3: Verify live (curl, no secret printed).** Pick a recent delivered order and a non-delivered order:
  `docker exec supabase_db_phase1-scaffold-db psql -U postgres -d postgres -Atc "select id,status,recipient_email from orders order by placed_at desc limit 5"`.
  Then, with the secret in a shell variable only:
  ```bash
  S=$(docker exec n8n printenv N8N_INTERNAL_SECRET)
  curl -s -H "X-Internal-Secret: $S" http://localhost:3000/api/internal/orders/<id>/notification-details | python -c "import sys,json; d=json.load(sys.stdin); print({k:(v if k!='deliveredEmailHtml' else f'<{len(v)} chars>') for k,v in d.items()})"
  ```
  Expected: all new fields present; `customerEmail` equals the order's `recipient_email` (not the auth email); `items` carry `imageUrl`; `deliveredEmailHtml` non-empty and contains the greeting. Also: no header -> `401`; unknown uuid -> `404 Order not found`. Record outputs in the report (never the secret).
- [ ] **Step 4: Commit** (`/commit`): `feat: notification-details returns full order details and delivered email body`

---

### Task 3: Workflow 05 — delivered email branch + JSON tests

**Files:**
- Modify: `n8n/workflows/05-delivery-status-propagation.json`
- Create: `tests/n8n-workflows.test.mjs`

**Interfaces:**
- Consumes: the route contract from Task 2 (`customerEmail`, `emailSubject`, `deliveredEmailHtml`).
- Produces: workflow 05 with two new nodes after `Filter: status = delivered` (true branch), wired in parallel with the existing `Finalize Payment + Prompt Review (placeholder)` node:
  1. `GET /api/internal/orders/:id/notification-details` — copy node `get-notification-details` from workflow 03 verbatim (HTTP Request v4, URL `={{$env.APP_BASE_URL}}/api/internal/orders/{{$json["body"]["record"]["id"]}}/notification-details`, header `X-Internal-Secret: ={{$env.N8N_INTERNAL_SECRET}}`), new unique `id` (`get-notification-details-delivered`), position `[900, 540]`, a `notes` field saying it fetches the delivered email content.
  2. `Gmail: Send Order Delivered Email` — `n8n-nodes-base.gmail` typeVersion 2, `resource: "message"`, `operation: "send"`, `sendTo: "={{$json[\"customerEmail\"]}}"`, `subject: "={{$json[\"emailSubject\"]}}"`, `emailType: "html"`, `message: "={{$json[\"deliveredEmailHtml\"]}}"`, `options: {}`; same placeholder credential block as workflow 03's Gmail node (`PLACEHOLDER_CONNECT_YOUR_GMAIL_CREDENTIAL`) and a note telling the importer to select their Gmail credential; `id: "send-order-delivered-email"`, position `[1120, 540]`.
  - Connections: `Filter: status = delivered` main[0] gains the GET node (alongside the placeholder); GET -> Gmail.
  - Keep the file's top-level fields (`name`, `active: false`, `_note`, `_untested_reference_only`) exactly as they are.

- [ ] **Step 1: Failing test** `tests/n8n-workflows.test.mjs` (plain node, reads the five JSON files):

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const dir = new URL("../n8n/workflows/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
const load = (f) => JSON.parse(readFileSync(new URL(f, dir), "utf8"));

test("there are five workflow files and each parses", () => {
  assert.equal(files.length, 5);
  for (const f of files) assert.ok(load(f).nodes.length > 0, f);
});

test("every connection source and target is a real node name", () => {
  for (const f of files) {
    const wf = load(f);
    const names = new Set(wf.nodes.map((n) => n.name));
    for (const [src, conn] of Object.entries(wf.connections)) {
      assert.ok(names.has(src), `${f}: source ${src}`);
      for (const branch of conn.main) for (const t of branch) assert.ok(names.has(t.node), `${f}: target ${t.node}`);
    }
  }
});

test("node ids and names are unique within each workflow", () => {
  for (const f of files) {
    const wf = load(f);
    assert.equal(new Set(wf.nodes.map((n) => n.id)).size, wf.nodes.length, `${f} ids`);
    assert.equal(new Set(wf.nodes.map((n) => n.name)).size, wf.nodes.length, `${f} names`);
  }
});

test("workflow 05: delivered branch fetches details then sends an HTML Gmail", () => {
  const wf = load("05-delivery-status-propagation.json");
  const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
  const gmail = byName["Gmail: Send Order Delivered Email"];
  const get = byName["GET /api/internal/orders/:id/notification-details"];
  assert.ok(gmail && get);
  assert.equal(gmail.type, "n8n-nodes-base.gmail");
  assert.equal(gmail.parameters.emailType, "html");
  assert.equal(gmail.parameters.message, '={{$json["deliveredEmailHtml"]}}');
  assert.equal(gmail.parameters.subject, '={{$json["emailSubject"]}}');
  assert.equal(gmail.parameters.sendTo, '={{$json["customerEmail"]}}');
  const deliveredTargets = wf.connections["Filter: status = delivered"].main[0].map((t) => t.node);
  assert.ok(deliveredTargets.includes(get.name));
  assert.ok(deliveredTargets.includes("Finalize Payment + Prompt Review (placeholder)"));
  assert.deepEqual(wf.connections[get.name].main[0].map((t) => t.node), [gmail.name]);
  assert.ok(get.parameters.url.includes("/notification-details"));
  assert.ok(!JSON.stringify(wf).match(/[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{10,}/)); // no token-looking strings
});

test("workflow 03 accepted email still sends to customerEmail", () => {
  const wf = load("03-restaurant-status-change.json");
  const gmail = wf.nodes.find((n) => n.name === "Gmail: Send Order Accepted Email");
  assert.equal(gmail.parameters.sendTo, '={{$json["customerEmail"]}}');
});
```

  Run -> the workflow-05 test FAILS (nodes missing); the others pass.
- [ ] **Step 2: Edit the JSON** as specified (hand-edit via a small script or editor, keep 2-space indent and the file's existing key order). Re-run tests -> pass.
- [ ] **Step 3: Verify** — `node --no-warnings --test tests/*.test.mjs`; `python -c "import json;json.load(open('n8n/workflows/05-delivery-status-propagation.json',encoding='utf-8'))"`.
- [ ] **Step 4: Commit** (`/commit`): `feat: workflow 05 emails the customer on delivery`

---

### Task 4: Re-import workflows (Vishal) + live verification (accepted AND delivered emails)

**Files:** none in git. Evidence goes in the report (and Task 5's doc).

This task is led by the controller (not a subagent) because it needs Vishal in the n8n UI.

- [ ] **Step 1: Give Vishal exact import steps** (his n8n at http://localhost:5678): for each of the 5 files in `n8n/workflows/` (01–05): *Workflows -> (menu) Import from file*; if a workflow with the same name already exists, delete or archive the old copy first so there are not two listeners on the same webhook path. On workflows **03** (node "Gmail: Send Order Accepted Email") and **05** (node "Gmail: Send Order Delivered Email") open the Gmail node and **select your connected Gmail credential** in the Credential dropdown, then Save; then **Publish** all five (n8n's activate). Confirm workflow 05's Gmail node shows "Email Type: HTML".
- [ ] **Step 2: Confirm the stack is ready:** Next.js dev server on :3000; `docker exec n8n printenv APP_BASE_URL` shows `http://host.docker.internal:3000` (value is not secret); Supabase triggers present (`select tgname from pg_trigger where tgrelid='public.orders'::regclass and tgname like 'n8n_%'` -> 4 triggers incl. `n8n_order_delivery_status_changed`).
- [ ] **Step 3: Ask Vishal which email address to use** for the live test (AskUserQuestion); it must be an inbox he can read. Do not guess.
- [ ] **Step 4: Run the live flow with Playwright** (screenshots only under the project root, `.playwright-mcp/`): as `customer@foodhub.local` place an order from `dosa-corner` with the chosen **checkout email** and phone `9876543210` (checkout fields are never prefilled); as `dosa-corner@foodhub.local` Accept -> Start preparing -> Mark ready; the ready order is auto-assigned by workflow 04 to an online partner (note which); as that partner Mark picked up -> Mark delivered (log in at `/delivery/login`; if the order was assigned to `delivery@foodhub.local`, use that account).
- [ ] **Step 5: Verify (evidence for each):**
  1. **Webhook payload populated** (the `n8n_notify` lesson): after each transition read the latest rows: `select id, status_code, left(content::text, 200) from net._http_response order by id desc limit 6` -> HTTP 200 from n8n for the `accepted` and `delivered` webhook calls. (Whether the payload body carries `record.id`/`status` is proven by n8n's own execution succeeding; also check the n8n execution data in step 2 below.)
  2. **n8n executions:** try opening `http://localhost:5678` in Playwright; if it needs a login, ask Vishal to read the Executions list for workflows 03 and 05 and report each node's status (all green through the Gmail node). Do not attempt to read n8n credentials.
  3. **Accepted email (workflow 03 — never confirmed before):** Vishal confirms an email "Your order from Dosa Corner has been accepted!" arrived at the checkout email (previously the auth email — now `recipient_email`, via Task 2).
  4. **Delivered email:** Vishal confirms an email "Your order from Dosa Corner has been delivered" arrived at the checkout email with: the greeting sentence verbatim, order number + store, item rows with **photos**, quantities/options, subtotal/delivery fee/total matching the order page, delivered-to name/phone/address; renders sanely on a phone-width mail client view (Vishal's check). Ask him to screenshot or describe; save nothing sensitive in git.
  5. **Negative checks (no email, no crash):** an order that is *cancelled/rejected* triggers neither email; a second status re-save of `delivered` (documented, not fixed) is not tested live.
  6. The workflow-05 placeholder branch still runs (no regression): execution shows `Finalize Payment + Prompt Review (placeholder)` ran.
- [ ] **Step 6:** fix any defect found in its owning file with its own commit (e.g. a wrong node parameter name for HTML mode — if n8n's Gmail v2 uses different parameter names than the JSON, correct the JSON from the live node's own exported JSON and re-run Task 3's tests), re-import (Vishal), re-verify. Save the evidence (sans secrets and personal email text) for the report.

---

### Task 5: Docs, final gates, final review

**Files:**
- Modify: `docs/n8n-webhook-setup.md`, `MEMORY.md`, `CLAUDE.md`, `README.md` (check each; `AGENTS.md` only if wrong), spec n8n section (one sentence: HTML is built by the route's tested `lib/delivered-email.ts`, the Gmail node only uses it).

- [ ] **Step 1: `docs/n8n-webhook-setup.md`:** workflow 5 section now describes the delivered email branch; the "Not yet verified" paragraph (section 6) is replaced with the Task 4 results (accepted email + delivered email verified on `<date>`); add the exact re-import steps used (UI import, pick Gmail credential on 03 and 05 Gmail nodes, publish) and a note that a status re-saved as `delivered` fires the webhook again (duplicate email possible; no dedupe by design).
- [ ] **Step 2: MEMORY.md** — new "Order visibility — sub-project C" entry in the style of A/B (what shipped, decisions: HTML in route, recipient email, UI import; defects/lessons found; open items; evidence); **CLAUDE.md** one short status paragraph; **README.md** only if its n8n section is now wrong; **AGENTS.md** check.
- [ ] **Step 3: Final gates:** `npx tsc --noEmit`; `node --no-warnings --test tests/*.test.mjs`; `npm run build`; eslint on touched files.
- [ ] **Step 4: Final whole-branch review against the SPEC** (fresh reviewer on the most capable model over `git diff main...order-visibility-c`), checking: every bullet of the spec's "n8n delivered email" section; escaping/XSS in the email; recipient email vs auth email; internal-route secret guard intact; workflow 03 back-compat; JSON validity; no secrets in the diff; the Review Focus list. Fix findings in one wave + one scoped re-review.
- [ ] **Step 5:** merge to local `main` only after Vishal's go-ahead; push only on his standing phrase "Commit Work" (if denied, report it, do not route around).
