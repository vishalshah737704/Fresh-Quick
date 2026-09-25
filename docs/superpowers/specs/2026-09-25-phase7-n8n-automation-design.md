# Phase 7 — n8n Automation Wiring — Design

Date: 2026-09-25
Status: Approved (autonomous-mode ruling — see below). **Untested**: no n8n
instance is available in this environment. Workflow JSON and webhook config
are reference material per spec §7 Phase 7's own wording ("n8n workflow
exports checked into repo for reference") — they have not been imported
into a running n8n or exercised end-to-end. Treat as a starting point for
whoever wires this to a real n8n instance, not as verified automation.

## Ruling: existing synchronous paths stay as the working demo path

Phases 3-6 built and *verified* synchronous equivalents of what spec §5's
n8n workflows would eventually own: checkout resolves mock payment
in-process (Phase 3), vendors advance status via direct API (Phase 4),
delivery partners self-claim ready orders instead of being auto-assigned
(Phase 5, itself a ruling that assumed Phase 7 wasn't built yet). Ruling:
Phase 7 adds the n8n-facing internal API surface *alongside* these,
without ripping out or disabling the tested synchronous paths. Rewiring
checkout to depend on an n8n webhook round-trip that cannot be tested here
would trade working, verified behavior for unverified behavior — a bad
trade for a local demo app. `/api/internal/*` routes are real, working,
testable Next.js code; the n8n workflow JSON that would call them is not
verified to actually call them correctly, since nothing here can run n8n.
Cost if wrong: whoever wires real n8n later needs to test the workflow
JSON's HTTP-node configs against the now-real internal routes, which is
expected reference-integration work anyway, not a regression.

## What's built

- `lib/internal-auth.ts` — a shared-secret header check
  (`X-Internal-Secret` against `process.env.N8N_INTERNAL_SECRET`) for
  every `/api/internal/*` route, matching spec §6's "guarded by
  service-role secret header, called only by n8n."
- `POST /api/internal/payments/:id/result` — n8n calls this after
  simulating a payment gateway delay, to write `payments.status` and,
  on success, advance the order (mirrors what Phase 3's checkout already
  does synchronously — this route exists so a *future* async payment
  flow can call it, not to replace the working one).
- `POST /api/internal/orders/:id/assign` — n8n calls this after computing
  nearest-partner assignment (Haversine distance over online
  `delivery_partners`), to write `orders.delivery_partner_id` and flip
  status to `assigned` (mirrors what Phase 5's self-claim already does
  from the partner's side — this is the "push" counterpart to Phase 5's
  "pull").
- `n8n/workflows/*.json` — five workflow export stubs matching spec §5's
  six numbered workflows, built by hand to n8n's export JSON shape
  (nodes + connections), each with a webhook trigger and an HTTP Request
  node pointed at the matching `/api/internal/*` route or Supabase REST
  endpoint. **Not imported into or run against a real n8n instance.**
- `docs/n8n-webhook-setup.md` — the Supabase Database Webhook
  configuration (table, event, URL pattern) a real n8n instance owner
  would need to wire these workflows up, since that configuration lives
  in the Supabase dashboard/CLI, not in this repo's code.

## What's explicitly NOT done

- Workflow 6 (location ping fanout) — spec's own default is to skip n8n
  and use Supabase Realtime directly for this; Phase 5 already reused the
  customer order page's existing poll instead of adding Realtime at all,
  consistent with that default. No workflow 6 JSON is built; noted as a
  future Realtime addition in MEMORY.md if perf ever demands it.
- No changes to Phase 3's checkout, Phase 4's vendor status routes, or
  Phase 5's claim/status routes — see Ruling above.
- No live verification of any workflow JSON's correctness beyond visual
  inspection against n8n's documented node/export format — flagged
  throughout as untested.

## Testing

- `npm run build` to confirm the new internal API routes compile and
  don't break the existing build.
- Manual: call each `/api/internal/*` route directly with curl + the
  shared secret, confirm it writes the expected DB state (this tests the
  Next.js side only, not the n8n side, which can't be tested here).
- Explicitly do NOT claim end-to-end n8n automation works — MEMORY.md
  will record this phase as "internal API + workflow JSON built,
  untested against real n8n."

## Touches

`app/api/internal/*`, `lib/internal-auth.ts`, `n8n/workflows/*.json`,
`docs/n8n-webhook-setup.md`, `.env.example` (new `N8N_INTERNAL_SECRET`
placeholder).
