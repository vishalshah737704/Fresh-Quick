# n8n Webhook Setup — Reference Only, Untested

This document and the workflow JSON in `n8n/workflows/*.json` were written
by hand to n8n's documented export/config shape. **Neither has been
imported into or run against a real n8n instance** — there is no n8n
available in the environment that built this. Treat everything here as a
starting point for wiring real automation, not verified behavior. See
`docs/superpowers/specs/2026-09-25-phase7-n8n-automation-design.md` for
the full design and what stays on the tested synchronous path in the
meantime (checkout payment, vendor status updates, delivery self-claim all
still work today without n8n).

## Prerequisites

- A running n8n instance (self-hosted, matching the project's "no cloud
  services" preference — e.g. `docker run n8n.io/n8n` locally, same spirit
  as the Supabase stack).
- `N8N_INTERNAL_SECRET` set to the same value in both this app's
  `.env.local` and every n8n workflow's `X-Internal-Secret` header
  parameter (the workflows read it from an n8n environment variable of
  the same name — configure that in n8n's own environment, not this
  repo).
- `APP_BASE_URL` set in n8n's environment to wherever this Next.js app is
  reachable from n8n (e.g. `http://host.docker.internal:3000` if n8n runs
  in Docker and the app runs on the host).
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` set in n8n's environment
  for workflow 4's direct Supabase REST read.

## Supabase Database Webhook configuration

Supabase's Database Webhooks (Dashboard → Database → Webhooks, or via the
`supabase/config.toml` local stack) fire an HTTP POST to n8n's webhook URL
whenever a row is inserted/updated on a chosen table. Configure these,
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

## Importing a workflow

In n8n: **Workflows → Import from File**, pick one of
`n8n/workflows/*.json`. n8n will likely flag missing credentials/node
versions since these were hand-written rather than exported from a real
n8n session — expect to reconnect the HTTP Request nodes' auth and
possibly adjust node type versions to match your n8n version before they
run.

## What to verify once imported (not done here)

1. Each webhook path matches what's configured in Supabase.
2. Each HTTP Request node's URL resolves to the running Next.js app.
3. `X-Internal-Secret` matches `N8N_INTERNAL_SECRET` in `.env.local`.
4. Manually trigger each workflow (n8n's "Execute Workflow" test button)
   against a test order and confirm the expected DB write happens.
5. Only then flip each workflow's `active` flag to `true`.
