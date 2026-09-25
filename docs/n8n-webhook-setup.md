# n8n Webhook Setup — Reviewed, Not Run Against a Live Instance

This document and the workflow JSON in `n8n/workflows/*.json` were written
by hand to n8n's documented export/config shape, and were reviewed against
n8n's node-parameter documentation as part of the Fresh & Quick redesign
(the previously-known bugs listed in MEMORY.md's Phase 7 entry — IF-node
version mismatches, a legacy-function-node API/parameter mismatch, an
array-indexing bug, a missing empty-candidates guard, missing `webhookId`
fields — are fixed as of that pass). **Neither the JSON nor this guide has
been imported into or executed against a real n8n instance** — there is no
n8n available in the environment that built this. Treat everything here as
a carefully-reviewed starting point for wiring real automation, not
verified behavior. See
`docs/superpowers/specs/2026-09-25-phase7-n8n-automation-design.md` for the
full design and what stays on the tested synchronous path in the meantime
(checkout payment, vendor status updates, delivery self-claim, and the
delivery-address view all still work today without n8n).

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
  for workflow 4's direct Supabase REST read of a restaurant's lat/lng.

## 2. Supabase Database Webhook configuration

Supabase's Database Webhooks (Dashboard → Database → Webhooks, or via the
local stack's `supabase/config.toml`) fire an HTTP POST to n8n's webhook
URL whenever a row is inserted/updated on a chosen table. Configure these,
pointing at your n8n instance's webhook URLs (the `path` field in each
workflow JSON, e.g. `https://<n8n-host>/webhook/foodhub/order-placed`):

| Table     | Events        | n8n webhook path                          | Workflow |
|-----------|---------------|--------------------------------------------|----------|
| `orders`  | INSERT        | `foodhub/order-placed`                     | 01 |
| `payments`| INSERT        | `foodhub/payment-created`                  | 02 |
| `orders`  | UPDATE(status)| `foodhub/order-status-changed`             | 03 |
| `orders`  | UPDATE(status)| `foodhub/order-ready`                      | 04 (filter to status=ready) |
| `orders`  | UPDATE(status)| `foodhub/order-delivery-status-changed`    | 05 (filter to picked_up/delivered) |

Workflows 3, 4, and 5 all listen on `orders` UPDATE — Supabase sends every
column update, so each workflow's own `IF` node filters to the status
values it cares about (see each JSON file's "Filter" node).

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
environmental, not between workflows: only workflows 2 and 4 have HTTP
Request nodes that actually call this app, so only those two need
`APP_BASE_URL` and `N8N_INTERNAL_SECRET` correctly set (workflow 4 also
needs `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` for its direct restaurant
lookup). Workflows 1, 3, and 5 only have webhook/filter/no-op nodes and
don't call out anywhere, so they have no environment-variable
dependency.

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
(status is `placed` on insert), and the placeholder "Notify Restaurant"
no-op node executes (check n8n's execution log — there's no visible
in-app effect yet since the notification channel itself isn't built).

**02 — Payment Mock Confirmation.** This is the async alternative to
Phase 3's synchronous checkout payment resolution — the two paths would
conflict if both are active, since Phase 3 already inserts a payment row
with a final `status` (`success`/`failed`), not `pending`, so this
workflow's own INSERT-triggered logic wouldn't find anything to change
(the payment-result route's `.eq("status", "pending")` guard, see
CLAUDE.md's "real bug worth remembering" note in MEMORY.md's Phase 7
entry, means this workflow only ever affects orders inserted with a
`pending` payment status, which the current checkout flow never produces).
**Don't activate this workflow without first changing checkout to insert
payments as `pending` instead of resolving synchronously** — otherwise
it's inert. Once that change exists, test by placing an order and
confirming the payment's `status` updates from `pending` to
`success`/`failed` a couple of seconds later.

**03 — Restaurant Accepts / Status Change.** As the seeded vendor, advance
an order through `/vendor/orders` (accept → preparing → ready). Expect:
the webhook fires on each `orders` UPDATE, the filter passes for
`accepted`/`preparing`/`ready`, and the placeholder notification node
executes. The customer's own order page already reflects the status
change via its independent 3s poll — this workflow doesn't need to work
for that to be true.

**04 — Delivery Partner Assignment.** Advance an order to `ready` as the
vendor, with at least one delivery partner online (`/delivery/dashboard`,
toggle online). Expect: the webhook fires, the filter passes, the
restaurant's lat/lng is fetched, `GET /api/internal/orders/:id/assign`
returns nearest-first candidates, the empty-candidates guard passes (since
a partner is online), and `POST /api/internal/orders/:id/assign` assigns
the order — check `orders.delivery_partner_id` and `orders.status`
(`assigned`) in Supabase Studio, or that the order disappears from
`/delivery/dashboard`'s "Available orders" list for other partners. Also
test the empty-candidates path: advance an order to `ready` with zero
partners online, and confirm the workflow's execution log shows the
"No candidates available (no-op)" branch instead of a POST with an
undefined `deliveryPartnerId`.

**05 — Delivery Status Propagation.** As the delivery partner, advance an
order through `/delivery/dashboard` (picked up → delivered). Expect: the
webhook fires on each `orders` UPDATE, the filter passes for
`picked_up`/`delivered`, the placeholder notification executes, and on
`delivered` specifically the second filter also passes to the "Finalize
Payment + Prompt Review" placeholder (still a no-op — see that node's own
`notes` field for the unresolved design question around what "finalize"
should actually do, since Phase 3's payment already resolves at checkout
time, not delivery time).

## 6. Once verified, activate

Only flip a workflow's `active` flag to `true` in n8n after its test in
section 5 passes. Activating a workflow before its environment variables
are correctly set (most commonly `APP_BASE_URL` pointing at an
unreachable host, per section 1) means it will fire on every matching
Supabase event and silently fail — check n8n's execution log for red
(failed) runs after activating, not just that the webhook received a
request.
