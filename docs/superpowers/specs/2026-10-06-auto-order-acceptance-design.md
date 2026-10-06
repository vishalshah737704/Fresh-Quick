# Automatic Order Acceptance (demo mode) - Design

Date: 2026-10-06. Status: approved in conversation, spec awaiting review.

## Purpose

For demos, one Admin checkbox makes every paid order run itself from payment to pickup so the
whole flow can be shown start to finish with nobody clicking: the vendor does not accept,
prepare or mark ready, and the delivery partner does not mark picked up. Steps are 3 seconds
apart. The customer's existing 15 s delivery animation then completes delivery as today.

## Decisions (Vishal, 2026-10-06)

- Scope when ticked: new orders AND all open orders (placed, accepted, preparing, ready,
  assigned) are driven through the remaining steps.
- Engine: a new n8n workflow (09), not in-app timers.
- Admin is web-only; the setting affects orders from both the web and the phone customer apps.
  No phone change is needed (status is already polled).

## Sequence per order

payment success -> 3 s -> accepted -> 3 s -> preparing -> 3 s -> ready -> workflow 04 assigns the
nearest online partner (existing, a few seconds) -> 3 s -> picked_up -> existing flow
(customer animation / workflow 05 fallback completes delivery).

## Components

1. **Setting.** Migration 35 creates `public.app_settings (key text primary key, value jsonb not
   null, updated_at timestamptz)`; RLS on, NO policies (service-role only, per the project's
   RLS rule). Seed row `auto_order_acceptance` = `{"enabled": false}`. Off by default.
2. **Pure logic `lib/auto-order.ts`** (import-free): `nextAutoStatus(status)` maps
   placed->accepted, accepted->preparing, preparing->ready, assigned->picked_up; any other
   status (ready, picked_up, terminal) -> null. `parseAutoOrderSetting(value)` returns a boolean,
   defaulting to false on anything malformed.
3. **Admin API** `GET` / `PUT /api/admin/settings/auto-order` (admin session token via the
   existing admin auth helper). PUT body `{ enabled: boolean }` (strict boolean). When enabling,
   after the write the route calls the n8n sweep webhook (best effort; failure is reported in
   the response as `sweepStarted: false`, the setting stays saved).
4. **Admin UI** card on the Admin Overview page: checkbox "Automatic order acceptance (demo
   mode)", helper text that vendor and partner steps run by themselves 3 seconds apart and that
   n8n must be running. Saves on toggle, shows a saving/error state, never optimistic-only.
5. **Internal routes** (internal secret, `verifyInternalSecret`):
   - `POST /api/internal/orders/[id]/auto-step` with `{ expectedStatus }`: reads the setting
     (off -> 200 `{skipped:"off"}`), loads the order (missing -> 200 `{skipped:"missing"}`),
     skips if `order.status !== expectedStatus` (`{skipped:"changed"}`), skips `placed` while
     the payment is not `success`, then updates `status` to `nextAutoStatus(expectedStatus)`
     with `.eq("status", expectedStatus)` so a race cannot skip or double-apply a step.
     Always 200 for skips so n8n treats them as done.
   - `GET /api/internal/auto-order/open`: returns `[{id, status}]` for open orders
     (placed with payment success, accepted, preparing, ready, assigned). Returns an empty list
     when the setting is off.
6. **Database triggers** (migration 35, `n8n_notify`): `orders` after update of `status` and
   `payments` after update of `status` call webhook `foodhub/auto-order-step`. The body already
   carries the record (migration 23 fix); the workflow reads order id and status from it
   (payment events carry `order_id`).
7. **Workflow 09 "Auto Order Flow"** (`n8n/workflows/09-auto-order-flow.json`): webhook
   `foodhub/auto-order-step` -> filter (payment success event, or order status in placed /
   accepted / preparing / assigned) -> Wait 3 s -> POST `auto-step` with the status seen. A second
   webhook `foodhub/auto-order-sweep` -> GET `auto-order/open` -> split in batches -> POST
   `auto-step` for each (no wait; the chain's own waits space the rest). Same container-networking
   rules as other workflows (`host.docker.internal`, `$env` internal secret). Placeholder
   credential ids only.

## Behaviour and failure modes

- n8n down: nothing advances; the setting still saves; the card says n8n must be running.
- No partner online: the order waits at ready; when a partner is assigned the chain resumes.
- Unticked mid-flow: the next step is skipped, the order stays where it is, manual flow resumes.
- Manual action by a vendor or partner during automation: the status check makes the next
  automatic step skip harmlessly.
- Failed payment still cancels the order; no steps run for it (the payment-success filter).
- Duplicate or reordered webhook events are harmless (idempotent by the status check).
- Real Gmail: workflows 03 and 05 send real mail on accepted and delivered. Tests must use only
  an address Vishal owns, one order at a time, asked first.

## Testing

- Unit: `nextAutoStatus`, `parseAutoOrderSetting`; the auto-step decision logic with injected
  data access (off, missing, changed, payment pending, success path, race); the open-orders
  filter; the admin setting route (admin only, strict boolean, sweep failure reported).
- Workflow JSON test for 09: only placeholder credential ids, `String(...)` around any
  `.includes()`, the intended status filters, the 3 s waits.
- Live (mandatory, real browser and n8n): tick the box, place an order with an address Vishal
  owns, watch Vendor, Delivery and customer views move every 3 s to picked up and the animation
  deliver; tick off mid-flow and confirm it stops; tick on with an open order and confirm the
  sweep resumes it. Then Reset Data.

## Docs

`docs/n8n-webhook-setup.md` (workflow 09 import and publish, never stop n8n), knowledge Q&A for
the Admin checkbox (re-ingest, re-run eval), a short line in both manuals, CLAUDE.md and
MEMORY.md entries.

## Out of scope

Per-store or per-order automation, configurable intervals, a phone Admin screen, automatic
partner online status.
