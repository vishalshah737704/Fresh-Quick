# n8n Webhook Setup — Verified End-to-End (2026-09-25)

This document and the workflow JSON in `n8n/workflows/*.json` were written
by hand to n8n's documented export/config shape, and were reviewed against
n8n's node-parameter documentation as part of the Fresh & Quick redesign
(the previously-known bugs listed in MEMORY.md's Phase 7 entry — IF-node
version mismatches, a legacy-function-node API/parameter mismatch, an
array-indexing bug, a missing empty-candidates guard, missing `webhookId`
fields — are fixed as of that pass). **All 5 workflows have since been
imported into a real local n8n instance, wired to a live local Supabase
stack via the migration in section 2, and driven end-to-end through the
actual customer/vendor/delivery UI** (2026-09-25 session) — see section 5's
per-workflow notes for what was actually observed, and section 1 for two
real environment-variable bugs found and fixed during that pass. See
`docs/superpowers/specs/2026-09-25-phase7-n8n-automation-design.md` for the
full design. Checkout payment resolution now uses workflow 02 with an
in-process fallback (see section 5's "02" entry) — everything else
(vendor status updates, delivery self-claim, and the delivery-address
view) stays on its own tested path that works today without n8n.

Supabase Database Webhooks fire on every row event for the table they're
configured on — there is no column-level or conditional filtering on the
Supabase side (the `UPDATE(status)` label in the table below describes
intent, not an enforceable filter). Each workflow's own `IF`/filter node is
what actually narrows execution to the specific status values it cares
about.

## 1. Prerequisites

- A running n8n instance (self-hosted, matching the project's "no cloud
  services" preference — e.g. `docker run -p 5678:5678 n8nio/n8n`, same
  spirit as the Supabase stack). n8n cloud also works if you'd rather not
  self-host it, but that's a choice for whoever wires this up, not
  something this project assumes.
- This app reachable from n8n over the network. **If n8n runs in Docker
  and the Next.js app runs on your host machine** (`npm run app:start` /
  `npm run dev`), use `http://host.docker.internal:3000` as `APP_BASE_URL`
  — `localhost`/`127.0.0.1` inside the n8n container refers to the
  container itself, not your host, and this is the single most common
  reason a first attempt silently fails to reach the app. If both n8n and
  the app run in the same Docker network (e.g. both added to
  `supabase/docker-compose.yml` or a shared compose file), use the app
  container's service name instead.
- `N8N_INTERNAL_SECRET` set to the same value in both this app's
  `.env.local` and n8n's own environment (the workflows read it as
  `{{$env.N8N_INTERNAL_SECRET}}` in their `X-Internal-Secret` header
  parameter — configure it in n8n's environment variables, not by editing
  the workflow JSON).
- `APP_BASE_URL` set in n8n's environment to wherever this Next.js app is
  reachable from n8n (see above).
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` set in n8n's environment
  for workflow 4's direct Supabase REST read of a store's lat/lng.
  **`SUPABASE_URL` needs the same `host.docker.internal` treatment as
  `APP_BASE_URL` above** — if n8n runs in Docker and the local Supabase
  stack runs on the host (the normal case per this project's Docker
  setup), `http://127.0.0.1:54321` or `http://localhost:54321` refers to
  the n8n container itself and the "GET restaurant lat/lng" node in
  workflow 4 fails with "The service refused the connection" the first
  time it actually runs. Use `http://host.docker.internal:54321` instead.
  This bug survived the original hand-review because it only shows up
  once a node actually executes against a live instance, not on JSON
  inspection.
- **`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`** in n8n's environment. n8n
  blocks node-level `{{$env.X}}` access by default; without this flag,
  every node that reads `N8N_INTERNAL_SECRET` or `APP_BASE_URL` via
  `{{$env...}}` (workflows 2 and 4's HTTP Request nodes) fails with
  "access to env vars denied" the moment it runs, even though the
  variable is correctly set in the container. Same class of bug as
  `SUPABASE_URL` above — invisible until a node actually executes.
- **A Postgres-side `app.n8n_internal_secret` setting**, read by the
  Database Webhook triggers in section 2 — separate from n8n's own
  `N8N_INTERNAL_SECRET` env var, but must be set to the same value. Set
  it once per local Postgres instance (not committed to git — this is
  deliberately outside the migration, see section 2):
  ```
  docker exec -i supabase_db_<your project_id> psql -U supabase_admin -d postgres \
    -c "alter database postgres set app.n8n_internal_secret = '<same value as N8N_INTERNAL_SECRET>';"
  ```
  (`<your project_id>` is the `project_id` in `supabase/config.toml`, and
  the container name follows `supabase_db_<project_id>`.) `supabase_admin`
  is used because the default `postgres` role in the local stack isn't a
  real Postgres superuser and can't `ALTER DATABASE ... SET` a custom
  GUC. Needs a fresh Postgres connection to take effect for that session
  — already-open connections keep the old value.

A confirmed-working local Docker Desktop run command (Windows, n8n and the
Next.js app on the host, Supabase self-hosted via `npx supabase start`) —
verified end-to-end in the 2026-09-25 session:

```
docker run -d --rm --name n8n -p 5678:5678 \
  -v n8n_data:/home/node/.n8n \
  -e N8N_INTERNAL_SECRET=<same value as .env.local's N8N_INTERNAL_SECRET> \
  -e APP_BASE_URL=http://host.docker.internal:3000 \
  -e SUPABASE_URL=http://host.docker.internal:54321 \
  -e SUPABASE_SERVICE_ROLE_KEY=<local stack's printed service_role key> \
  -e N8N_BLOCK_ENV_ACCESS_IN_NODE=false \
  n8nio/n8n
```

(`-d --rm` runs it detached so it survives the calling shell exiting, still
auto-removed on `docker stop`; swap for `-it --rm` if you want it
foreground/interactive instead.)

## 2. Supabase Database Webhook configuration

Supabase Database Webhooks fire an HTTP POST to n8n's webhook URL whenever
a row is inserted/updated on a chosen table. **The local CLI's
`supabase/config.toml` does not actually support declaring these
declaratively** (that framing in earlier drafts of this doc was
aspirational, not accurate) — the real mechanism, and what this project
uses, is a SQL migration
(`supabase/migrations/00000000000015_n8n_webhooks.sql`) that enables the
`pg_net` extension, defines a `public.n8n_notify()` trigger function, and
creates one `AFTER INSERT`/`AFTER UPDATE OF status` trigger per row below
that calls it with the target n8n webhook URL. **No secret value is
hardcoded in the migration file** — `n8n_notify()` reads the shared
secret at request time from `current_setting('app.n8n_internal_secret',
true)`, a Postgres setting you set locally per section 1 (deliberately
outside the migration, so nothing secret-shaped ever lands in git — an
earlier version of this migration hardcoded the secret string directly
and it got flagged as a leaked credential the moment it was pushed).
This is functionally the same outcome Studio's Database → Webhooks UI
produces (it stores webhook config, including headers, in the
Studio-managed `supabase_functions.hooks` table instead) — using a
migration here just makes the wiring survive `supabase db reset` and
keeps it in git as documented infrastructure. If you use Studio's UI
instead, you lose that persistence but gain a form instead of SQL. Point
either at your n8n instance's webhook URLs (the `path` field in each
workflow JSON, e.g.
`https://<n8n-host>/webhook/foodhub/order-placed`):

| Table     | Events                          | n8n webhook path                          | Workflow |
|-----------|----------------------------------|--------------------------------------------|----------|
| `payments`| UPDATE(status) WHEN status='success' | `foodhub/order-placed`                | 01 |
| `payments`| INSERT                           | `foodhub/payment-created`                  | 02 |
| `orders`  | UPDATE(status) WHEN status in (accepted,preparing,ready) | `foodhub/order-status-changed` | 03 |
| `orders`  | UPDATE(status) WHEN status='ready' | `foodhub/order-ready`                    | 04 |
| `orders`  | UPDATE(status) WHEN status in (picked_up,delivered) | `foodhub/order-delivery-status-changed` | 05 |

**Every trigger above now has a `WHEN` clause matching its workflow's own
`IF`/Filter node condition** (fixed 2026-09-29, `supabase/migrations/
00000000000025_n8n_trigger_conditions.sql`, after a live debugging session
found two bugs: (1) the order-status triggers fired unconditionally on
every status update — including `cancelled` — relying entirely on each
workflow's own Filter node to no-op, which made n8n's execution log show
misleading "Success" runs for statuses the workflow didn't actually care
about; (2) workflow 01 fired on `orders` INSERT, which happens before
checkout's payment result is known (see `lib/mock-payment.ts`), so a
vendor got a "new order" notification for an order that failed payment
and was cancelled moments later. If you're wiring this up via Studio's
Database → Webhooks UI instead of the migration, replicate the WHEN
condition in Studio's own filter/condition field for each webhook, or
you'll reintroduce both bugs.

## 3. Importing each workflow

In n8n: **Workflows → Import from File**, pick one of
`n8n/workflows/*.json`, one at a time. n8n will likely still flag missing
credentials (the HTTP Request nodes use header-based auth, not n8n
Credential objects, by design — nothing to reconnect there) — the thing
worth checking on import is that n8n accepted the node type versions
without silently downgrading or erroring; if your n8n version's node
library differs meaningfully from what these were authored against,
compare the imported node's parameter panel against the JSON's
`parameters` block before trusting it.

## 4. Activation order

**None of the 5 workflows depend on another workflow having run first** —
each is an independent webhook listener triggered by a different table
event (or a different status value on the same table). You can activate
them in any order, including one at a time to test incrementally (see
below) before turning the rest on. The one real-world dependency is
environmental, not between workflows: workflows 2, 3, and 4 have HTTP
Request nodes that actually call this app, so those need `APP_BASE_URL`
and `N8N_INTERNAL_SECRET` correctly set (workflow 4 also needs
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` for its direct store
lookup). Workflow 3 additionally needs a real Gmail OAuth2 credential
connected to its "Gmail: Send Order Accepted Email" node before
activating — the JSON ships with a placeholder credential id and will
fail at that node until you connect one in the n8n UI. Workflows 1 and 5
only have webhook/filter/no-op nodes and don't call out anywhere, so they
have no environment-variable dependency.

## 5. How to test each workflow

**Before a workflow is active, n8n only serves its webhook on the
`/webhook-test/...` path** (click the webhook node's "Listen for test
event" button in the n8n editor first) — the production `/webhook/...`
path from section 2's table only responds once the workflow's `active`
flag is `true`. So to test end-to-end against the real Supabase webhook
before activating, either temporarily point the Supabase Database Webhook
at the `/webhook-test/...` URL and switch it to `/webhook/...` once you
activate the workflow, or activate the workflow first (accepting that it
will now also fire for real going forward) and test against production
from the start. Testing against `/webhook-test/...` is the safer choice
if you don't want a possibly-broken workflow firing on real production
events while you're still debugging it.

Test each one by triggering the real action that fires its underlying
Supabase Database Webhook, then checking the expected downstream effect.
None of these require n8n's own "Execute Workflow" test button to be
meaningful on their own — that button runs the workflow with sample data
you supply, which is useful for checking node wiring, but the real proof
is the end-to-end path below.

**01 — Order Placed.** Place a real order through `/customer/checkout`.
Expect: the webhook fires on the `orders` INSERT, the filter passes
(status is `placed` on insert), and the "Notify Restaurant" node now
calls a real internal route, `POST /api/internal/orders/[id]/notify-
vendor`, which writes a row to the new `public.notifications` table
(order_id, restaurant_id, channel, message) — check that table in
Supabase Studio for the new row, not just n8n's execution log. This
route requires the `X-Internal-Secret` header to match Postgres's
`app.n8n_internal_secret` setting (see section 1's prerequisite for
setting it — this was previously undocumented and caused a real setup
gap the first time this workflow was tested live end-to-end).

**02 — Payment Mock Confirmation.** Now live and active in the checkout
flow. Checkout inserts the payment row as `status='pending'` and then
(server-side, inside `app/api/cart/checkout/route.ts`) polls for up to
~10s for this workflow to resolve it via `/api/internal/payments/[id]/
result`. If n8n doesn't respond within that window (most commonly
because n8n isn't running locally, which is the default dev state), the
same route falls back to resolving the payment itself via the same
`applyPaymentResult()` helper this workflow's callback route uses, so
behavior is identical either way. Test by placing an order with n8n
running and confirming the payment's `status` updates from `pending` to
`success`/`failed` within a couple of seconds (well inside the 10s
fallback boundary); with n8n stopped, confirm the order instead takes
the full ~10s before the fallback resolves it.

**03 — Restaurant Accepts / Status Change.** As the seeded vendor, advance
an order through `/vendor/orders` (accept → preparing → ready). Expect:
the webhook fires on each `orders` UPDATE, the filter passes for
`accepted`/`preparing`/`ready`, and the placeholder notification node
executes. The customer's own order page already reflects the status
change via its independent 3s poll — this workflow doesn't need to work
for that to be true. On the `accepted` transition specifically, a second
branch also fires: `GET /api/internal/orders/:id/notification-details`
(customer email, restaurant name, total, delivery address), followed by
a Gmail node that emails the customer an order-accepted confirmation.
That branch needs a real Gmail credential connected (see section 4) —
until then it will show a failed execution at the Gmail node on every
`accepted` transition, which is expected, not a sign anything else is
broken.

**Rejecting an order** (vendor rejects a still-`placed` order via
`/vendor/orders`'s Reject button) does **not** go through n8n — the
order's status update to `rejected` and the mock payment refund
(`payments.status` → `refunded`) both happen synchronously in
`app/api/vendor/orders/[id]/reject/route.ts`. That route (and the
sibling accept/advance route,
`app/api/vendor/orders/[id]/status/route.ts`) now also checks whether
the order's payment is still `pending` before allowing the action,
since checkout's poll+fallback window means a vendor can see a
`placed` order whose payment hasn't resolved yet. There is nothing to
test in n8n for this path.

**04 — Delivery Partner Assignment.** Advance an order to `ready` as the
vendor, with at least one delivery partner online (`/delivery/dashboard`,
toggle online). Expect: the webhook fires, the filter passes, the
store's lat/lng is fetched, `GET /api/internal/orders/:id/assign`
returns nearest-first candidates, the empty-candidates guard passes (since
a partner is online), and `POST /api/internal/orders/:id/assign` assigns
the order — check `orders.delivery_partner_id` and `orders.status`
(`assigned`) in Supabase Studio, or that the order disappears from
`/delivery/dashboard`'s "Available orders" list for other partners. Also
test the empty-candidates path: advance an order to `ready` with zero
partners online, and confirm the workflow's execution log shows the
"No candidates available (no-op)" branch instead of a POST with an
undefined `deliveryPartnerId`.

**05 — Delivery Status Propagation.** As the delivery partner, mark an
order picked up in `/delivery/dashboard`; the customer's order page then
completes it (delivered) after its ~15 s animation — see the fallback section at the end. Expect: the
webhook fires on each `orders` UPDATE, the filter passes for
`picked_up`/`delivered`, and the placeholder notification executes. On
`delivered` specifically, two branches run: the "Finalize Payment +
Prompt Review" placeholder (still a no-op — see that node's own `notes`
field for the unresolved design question around what "finalize" should
actually do, since Phase 3's payment already resolves at checkout time,
not delivery time), and the delivered-email branch:
`GET /api/internal/orders/:id/notification-details` followed by a Gmail
node (HTML) that emails the customer. `notification-details` returns the
checkout email (`recipient_email`), the items with images, totals,
address and phone, plus a ready, HTML-escaped `emailSubject` and
`deliveredEmailHtml` built by `lib/delivered-email.ts`. Like 03's accepted
branch, this needs a Gmail credential selected on the Gmail node.

## 6. Verified 2026-09-25 (actual results, not just expected)

All 5 workflows were imported, published (n8n's current UI calls
activation "Publish"), and driven end-to-end against a live local n8n +
Supabase + Next.js stack, using Playwright to drive the real customer,
vendor, and delivery UI (plus direct `psql` status updates for the
delivery-partner-assignment/status-propagation legs, to avoid needing a
second authenticated browser session mid-test). Actual results:

- **01** — Succeeded. Real checkout order insert → webhook → filter →
  "Notify Restaurant" placeholder, as expected.
- **02** — Fires correctly on every `payments` insert, but every run
  errors at "POST /api/internal/payments/:id/result" with `Payment is not
  pending` — exactly the documented expected-inert behavior above, not a
  new bug. Confirms the guard works as designed; this workflow stays
  effectively off until checkout is changed to insert `pending` payments.
- **03** — Succeeded on every `accepted`/`preparing`/`ready`/`cancelled`
  transition tested.
- **04** — Initially failed with "The service refused the connection" at
  the store lat/lng lookup — the `SUPABASE_URL` bug documented in
  section 1. After fixing `SUPABASE_URL` to use `host.docker.internal`,
  re-ran and succeeded, with a real assignment confirmed in the database
  (`orders.status = 'assigned'`, `orders.delivery_partner_id` set to the
  online test partner).
- **05** — Succeeded on both `picked_up` and `delivered`, reaching the
  "Finalize Payment + Prompt Review" placeholder on `delivered` as
  expected.

Both environment-variable bugs in section 1 (`N8N_BLOCK_ENV_ACCESS_IN_NODE`
and `SUPABASE_URL`'s `host.docker.internal` requirement) were found during
this pass and are now fixed in the confirmed-working run command above —
neither was visible from the original hand-review of the JSON, since both
only manifest once a node actually executes against a live n8n instance.

### Re-verified 2026-09-30

Workflows 01–05 were re-imported into n8n 2.40.7 and run live. The
accepted email (03, execution 318) and the delivered email (05,
execution 323) were both sent and received. The webhook payload is
populated (every `net._http_response` was 200). Other executions: 01 =
317, 02 = 316, 04 = 320.

### Re-importing workflows

- **UI import works** (Workflows → Import from file). Imported workflows
  start inactive.
- **CLI alternative:** `docker cp` the JSON into the container, with the
  existing workflow `id` injected into the file so the import overwrites
  rather than duplicates, then run
  `n8n import:workflow --separate --input=<dir>` inside the container.
  It imports as inactive.
- **No UI, no restart:** while the n8n container is NOT running, import and
  publish in a one-off container against the same volume (host dir with the JSON
  files, workflow `id` injected so it overwrites, Gmail credential id attached
  only in this copy):
  `docker run --rm -v n8n_data:/home/node/.n8n -v <host dir>:/in:ro --entrypoint sh n8nio/n8n -c "n8n import:workflow --separate --input=/in/; n8n publish:workflow --id=<id>"`.
  The published state takes effect when the real container starts.
- On Windows Git Bash set `MSYS_NO_PATHCONV=1`, or `/tmp/...` paths get
  rewritten to Windows paths.
- `n8n publish:workflow` only updates the database; n8n must be restarted
  for it to take effect. Publish in the UI instead: unpublish, then
  publish, which re-registers the webhook. Check with a GET on
  `/webhook/foodhub/<path>`: "not registered for GET requests" means a
  POST listener exists; "is not registered" means the workflow is
  inactive.
- **Gmail credential:** select it on the Gmail nodes of 03 and 05, and
  make sure the credential id is stored in n8n's copy. A placeholder can
  survive a UI save if n8n only pre-selects the credential without
  marking the workflow changed; importing an edited copy via the CLI with
  the real credential id attached fixes it. Never commit a real
  credential id (`tests/n8n-workflows.test.mjs` fails if one is
  committed).
- **IF-node gotcha (n8n 2.40.7):** a boolean expression compared to the
  string "true" is false. Wrap `.includes()` expressions in `String(...)`
  (done in 03 and 05; a test enforces it). The first live run of 05
  failed exactly this way.


**Silencing the emails for testing.** The Gmail send nodes of workflows 03 and 05 send
real mail through the connected Gmail account (a fake recipient such as
`demo@example.com` still sends, and the bounce notices go to that account's inbox).
To test without emails, add `"disabled": true` to those two Gmail nodes in the JSON
copies you import (use the one-off-container procedure above, or toggle the node off
in the UI); the status update, auto-assign and the 20-second fallback keep working, only
the email is skipped. Keep the repo JSON files as they are (nodes enabled).

### Duplicate-email caveat

A second `delivered` webhook for the same order (a manual SQL update, a
pg_net retry, or an n8n execution replay) would send a second delivered
email. The app itself cannot write `delivered` twice: the delivery status
route uses a compare-and-set.

## 7. Once verified, activate

Only flip a workflow's `active` flag to `true` in n8n after its test in
section 5 passes. Activating a workflow before its environment variables
are correctly set (most commonly `APP_BASE_URL` pointing at an
unreachable host, per section 1) means it will fire on every matching
Supabase event and silently fail — check n8n's execution log for red
(failed) runs after activating, not just that the webhook received a
request.

## Workflow 05 customer-completion fallback (added 2026-10-02)

Normal path: the customer's app calls `POST /api/customer/orders/:id/complete-delivery`
after its 15 s animation, which sets `delivered` and triggers the delivered email.
Fallback: when workflow 05 sees `picked_up` it waits 20 seconds, then calls
`POST /api/internal/orders/:id/complete-delivery` (X-Internal-Secret). That call
is a no-op (200) if the customer already finished and 409 for cancelled orders.
The workflow must be **active** for the Wait node to resume. Re-import the JSON
into n8n and Publish it after pulling this change (repo JSON = 10 nodes; the
Gmail credential is attached in n8n only). Live-verified 2026-10-02: an untouched
order was completed exactly 5:00.09 after pickup with exactly one delivered email
execution; for customer-completed orders the 20-second wait fires as a harmless
no-op ("already delivered", no second email).

### If an order is stuck in picked_up

The fallback only exists if n8n was up and workflow 05 was active when the
pickup webhook fired (the DB trigger posts once, with a short timeout). If not,
and the customer never reopens the order, it stays `picked_up` and the partner
keeps seeing "Customer is receiving the order…".

Recovery: (a) the customer opening the order page completes it immediately, or
(b) call the internal endpoint:

```bash
curl -X POST -H "X-Internal-Secret: $N8N_INTERNAL_SECRET" "$APP_BASE_URL/api/internal/orders/<order-id>/complete-delivery"
```

To list stale ones (psql against the local Supabase):

```sql
select id, picked_up_at from public.orders
where status = 'picked_up' and picked_up_at < now() - interval '10 minutes';
```

## Workflow 06: Zippy knowledge ingestion

`n8n/workflows/06-zippy-knowledge-ingestion.json` keeps the Ask Zippy
knowledge base (pgvector table `zippy_chunks`) in sync with the markdown files
in the repo's `knowledge/` folder.

- **Triggers:** a Webhook (`POST /webhook/foodhub/zippy-ingest`) and a Schedule
  (nightly at 03:00). Both feed one HTTP Request node.
- **What it calls:** `POST {APP_BASE_URL}/api/internal/zippy/ingest` with the
  `X-Internal-Secret` header (`$env.N8N_INTERNAL_SECRET`). No n8n credential is
  needed.
- **Where the work happens:** the app reads `knowledge/*.md`, splits it into
  chunks, embeds only chunks whose hash changed and upserts them. The OpenAI key
  stays in the app's `.env.local`; n8n never sees it. The response is
  `{total, embedded, unchanged, deleted}`.
- **Empty-folder guard:** if no `knowledge/*.md` files are found the route fails
  with HTTP 500 "No knowledge/*.md files found" before touching the database, so
  a missing folder can never wipe the existing chunks.
- **Run on demand** (after editing a knowledge file), with the workflow
  published:

  ```bash
  curl -s -X POST http://localhost:5678/webhook/foodhub/zippy-ingest
  ```

  Re-running with no file changes returns `embedded: 0`.
- `APP_BASE_URL` must be `http://host.docker.internal:3000` on the n8n
  container (already set), as for workflows 01-05. Import and Publish it like
  the others (section 3).

## Workflow 07: Zippy catalog sync

`n8n/workflows/07-zippy-catalog-sync.json` keeps Zippy's store and dish
discovery index (the catalog tables in pgvector) in sync with the active stores
and their dishes in the database.

- **Triggers:** a Webhook (`POST /webhook/foodhub/zippy-catalog-sync`) and a
  Schedule (nightly at 03:15 in the n8n instance's timezone). Both feed one
  HTTP Request node.
- **What it calls:** `POST {APP_BASE_URL}/api/internal/zippy/catalog-sync` with
  the `X-Internal-Secret` header (`$env.N8N_INTERNAL_SECRET`). No n8n credential
  is needed.
- **Where the work happens:** the app reads active stores and their dishes,
  embeds only rows whose content changed and upserts them. The OpenAI key stays
  in the app's `.env.local`; n8n never sees it. The response is
  `{total, embedded, unchanged, deleted}`. Prices and open status are never
  embedded; Zippy reads them live.
- **Run on demand** (after big menu or store changes), with the workflow
  published:

  ```bash
  curl -s -X POST http://localhost:5678/webhook/foodhub/zippy-catalog-sync
  ```

  Re-running with no changes returns `embedded: 0`.
- **Import separately:** import this file on its own and publish it; doing so
  does not touch workflows 01-06. `APP_BASE_URL` must be
  `http://host.docker.internal:3000` on the n8n container (already set), as for
  the other workflows.

## Workflow 08: Zippy chat retention

`n8n/workflows/08-zippy-chat-retention.json` deletes saved Zippy chats that
have had no activity for 30 days (`ZIPPY_RETENTION_DAYS` in the app's
`.env.local`, integer 1 to 3650, default 30), so the privacy policy's promise
is real. Orders, accounts and everything else are never touched.

- **Triggers:** a Webhook (`POST /webhook/foodhub/zippy-purge`) and a Schedule
  (nightly at 03:45 in the n8n instance's timezone). Each has its own HTTP
  Request node.
- **What it calls:** `POST {APP_BASE_URL}/api/internal/zippy/purge` with the
  `X-Internal-Secret` header (`$env.N8N_INTERNAL_SECRET`). No n8n credential is
  needed.
- **Timezone:** the workflow sets `settings.timezone` to `Asia/Kolkata`, so 03:45 is
  India time. Scheduled runs only happen while Docker, n8n and the app are up;
  n8n does not catch up missed runs.
- **Dry run first:** the webhook is a DRY RUN unless the body is
  `{"dryRun": false}`; it returns `{dryRun, retentionDays, conversations,
  messages, usageRows}` (what would be deleted). The nightly schedule really
  deletes, so run a dry run before publishing the workflow:

  ```bash
  curl -s -X POST http://localhost:5678/webhook/foodhub/zippy-purge
  ```

- **Rule:** a conversation expires when its newest message (or its creation,
  if it has no messages) is older than the window; its messages go with it.
  Rate-limit rows older than 2 days are cleaned too. Deleted data cannot be
  recovered.
- **Needs migration 32** (`purge_zippy_chats`) applied first. Import and
  publish this file on its own; it does not touch workflows 01-07.
