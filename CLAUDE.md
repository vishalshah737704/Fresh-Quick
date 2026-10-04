# CLAUDE.md — Fresh & Quick Project

Project-level instructions for Claude Code working in this repo. Inherits
from `~/.claude/CLAUDE.md` and `c:\Vishal\Projects\CLAUDE.md`; this file adds
project-specific context those don't have.

## What this is

DoorDash-inspired food delivery web platform (functional clone, no brand
assets — own name, colors, and Pexels-licensed photography, not DoorDash's).
Branded "Fresh & Quick" (`lib/branding.ts`). Full design: [docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md](docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md)
and [docs/superpowers/specs/2026-09-25-fresh-and-quick-redesign-design.md](docs/superpowers/specs/2026-09-25-fresh-and-quick-redesign-design.md)
for the visual redesign.
Build proceeds one phase at a time (8 phases total) — see spec §7 for the
full breakdown. Each phase gets its own brainstorm → spec-check → plan →
subagent-driven-development cycle, ends with a merge to `main`.

**Uber Eats-style redesign (post-8-phase, complete):** a separate 6-piece
redesign bringing the customer surface toward Uber Eats' web ordering
flow — design tokens → home/feed rebuild → restaurant page rebuild →
item customization (new DB schema) → cart redesign (slide-out panel) →
checkout polish — all 6 pieces are now merged to `main`. Each piece went
through its own spec/plan/build/merge cycle. See MEMORY.md for per-piece
status and `docs/superpowers/specs/2026-09-25-uber-eats-design-refresh-design.md`
for piece 1's full design (colors, fonts, shape rules every later piece
inherits). Piece 2 added real `restaurants.delivery_fee_paise`/
`promo_text` columns and wired checkout to them — see MEMORY.md's piece 2
entry before assuming delivery fee is still a flat constant anywhere.
**Vendor/delivery/admin visual pass (complete):** a separate 3-sub-project
pass giving the vendor, delivery-partner, and admin portals the same
route-group-shell + restyled-layout treatment (sidebar/top-bar nav, tables/
kanban instead of stacked plain lists), on the design tokens the Uber Eats
redesign established. All 3 sub-projects merged to local `main`. See
MEMORY.md for per-sub-project status, defects found, and fixes.
**React Native + Expo mobile app (v1 built + UberEats-style redesign
complete, local `main`, not pushed):** Customer + Delivery Partner portals
only (Vendor/Admin stay web-only), same backend/API routes as web, no new
backend code. See `md_version/MOBILE_APP_SPEC.md` for v1 architecture and
`md_version/MOBILE_UBEREATS_REDESIGN_SPEC.md` for the redesign (bottom
tab nav, UberEats-style Home/store/cart/checkout/tracking, new
reorder row, floating cart pill). See MEMORY.md's "Mobile app" and
"Mobile app — UberEats-style redesign" entries for build history, review
findings, and what's still outstanding (the Customer App has now been run
on Vishal's phone, and so has Delivery (two 2026-10-01 screen
recordings); `Mobile_App_User_Manual.docx`/`.pdf` in `docs/` was
refreshed to v4.0 on 2026-10-01, see the sub-project D paragraph below).
**Figma community kit redesign (complete, merged to `main` 2026-09-29):**
full rebrand of ALL 6 surfaces (web Customer/Vendor/Delivery/Admin,
mobile Customer/Delivery) in one pass, using a Figma community UI kit's
palette/shape language (orange/navy/green, pill buttons, rounded-16px
cards, Poppins-700 headings) as the new single source of truth for
`lib/branding.ts` / `app/globals.css` / `mobile/theme.ts`, replacing the
Uber-Eats-era tokens. Built via `superpowers:subagent-driven-development`,
13 tasks, one final whole-branch review + fix wave. See MEMORY.md's
"Figma community kit redesign" entry for full detail, including two
mid-execution corrections to this file's own prior claims (see next
paragraph).
**Color-density revision (complete, same branch, same day):** a
same-day follow-on after Vishal reviewed the redesign live and asked
for denser colored-section backgrounds (less flat white/gray) plus a
real bug fix (checkout name/email/address should never persist across
sessions). 12 more tasks + 1 final-review fix wave — see MEMORY.md's
"Color-density revision" entry for full detail, including 6 real bugs
the final review caught (a mobile scroll-offset regression, a
checkout/order page overflow, a false success checkmark on failed
orders, unreadable checkout error text, an address-field session leak,
missing sidebar gradients — all fixed).
**Post-redesign follow-on (complete, merged to `main` 2026-09-29):**
resolved the WCAG contrast decision (new `-text-safe` darker brand
tokens, not a navy-text swap) and restored delivery-location
persistence (separate localStorage key from checkout fields), plus two
new asks — fresh session on every server/app startup, and a profile
name + password-reset control in every portal's nav (web + mobile). See
MEMORY.md's "Post-redesign follow-on" entry for full detail, including
a hydration-mismatch bug found and fixed in the location-persistence
code and 9 contrast misses the delegated implementer's own self-check
didn't catch (only found by live Playwright verification across all 4
web portals).
**Order visibility, sub-projects A + B (A merged to `main`; B on branch
`order-visibility-b`, merged to `main` and pushed 2026-09-30):** A gave customer/vendor a
shared order-detail model and 6-step timeline; B added order status
timestamps (migration 27 trigger), a redacted delivery-partner view
(Dashboard active-only + History, `lib/delivery-order-view.ts`), and an
admin sidebar with KPI-only Overview, Orders table + order detail
(reassign), and Vendors/Partners pages with Add forms. The legacy
`/api/delivery/orders` and `/available-orders` routes were deleted in
sub-project D once mobile moved to `/api/delivery/active` + `/history`.
The public-signup 1-char password gap was fixed
afterwards (shared `MIN_PASSWORD_LENGTH` in `lib/signup-validation.ts`).
Open items (deferred minors, leftover test partners in the dev DB) are in MEMORY.md's
"Order visibility — sub-project B" entry.
**Order visibility — sub-project C (n8n delivered email, branch
`order-visibility-c`, merged to `main` and pushed 2026-09-30):** `lib/delivered-email.ts`
builds the escaped HTML; `notification-details` returns the checkout email
plus ready `emailSubject`/`deliveredEmailHtml`; workflow 05's delivered
branch emails the customer via Gmail (verified live 2026-09-30, with 03's
accepted email). n8n 2.40.7 IF nodes need `String(...)` around `.includes()`;
never commit a real n8n credential id (a test guards it). See MEMORY.md's
"Order visibility — sub-project C" entry and `docs/n8n-webhook-setup.md`.
**Order visibility — sub-project D (mobile Customer + Delivery, branch
`order-visibility-d`, merged to `main` and pushed 2026-10-01):** mobile status
labels/colors/steps are byte-identical copies of the web ones
(`mobile/lib/order-status.ts`, `order-detail.ts`; `tests/mobile-parity.test.mjs`
guards drift); Customer Orders list + full Order detail (6-step tracker, 3 s
poll), Delivery Active dashboard on `/api/delivery/active` + History screen,
customer sign-up on mobile (and the web signup route now validates fields +
6-char password), migration 28 (orders outlive deleted customers; all customer
accounts were dropped 2026-10-01 — `customer@foodhub.local` no longer exists,
sign up a fresh one). Both manuals refreshed (web v3.0, mobile v4.0 — Customer
and Delivery figures from Vishal's real phone recordings with personal data
blurred; only the Available-order card is a labeled wireframe, since n8n
auto-assigns before it can be photographed).
**Delivery animation (2026-10-02, merged to `main` and pushed; the worktree and
branch `worktree-delivery-animation` were removed):** partners only mark
`picked_up`; the customer's order page (web `DeliveryAnimationDialog`, mobile
`DeliveryAnimation` modal) plays a full 15 s animation from the moment it appears
(not anchored to `picked_up_at` — that cut it short on a phone), then calls
`POST /api/customer/orders/[id]/complete-delivery` (server-enforced 14 s rule in
`lib/complete-delivery.ts`; 425 if too early). If the customer never opens the
order, n8n workflow 05 completes it after 20 seconds (one delivered email either
way). Run on Vishal's phone 2026-10-02: only issue was the animation length
(fixed in `65ee6d0`; web live re-check passed 2026-10-02). A second phone run
showed the scene frozen while the countdown ran: root cause was the deliberate
Reduce Motion freeze (`riderPose(reduced ? 0 : ms)`) with iOS Reduce Motion on;
the check was removed in web + mobile (Vishal's call: always play), and he
confirmed on his iPhone 2026-10-02 that it now plays perfectly. Main's `mobile/`
was reset to Expo SDK 57 (his Expo Go is SDK 57). Manuals: web v3.2, mobile v4.3
(real iPhone figures for the customer animation and for the partner "Mark picked
up" / "Customer is receiving the order…" cards, drop-off details mosaic-masked; the
old "Mark delivered" screenshot was removed).
See MEMORY.md's "Delivery animation", "Test emails", "Animation length follow-up",
"Session close-out 2026-10-02" and "Reduce Motion fix" entries.
**Ask Zippy Z1 (2026-10-03, branch `ask-zippy-z1`, built and live-verified, pushed to origin, merged into `main` 2026-10-03 (fast-forward) and pushed to `origin/main`):**
in-app AI assistant. Floating bubble on all web portals (one widget in the root
layout) plus a chat button in mobile Customer + Delivery; answers how-to questions
from `knowledge/**/*.md` via pgvector (migrations 29-30, tables `zippy_*`, all
service-role only) and Claude (`claude-sonnet-5-5`, raw fetch (superseded by Z2: the Anthropic SDK; eval now 46/47)) through
`POST /api/zippy/chat`; OpenAI `text-embedding-3-small` for embeddings. Signed-in
chats are saved (web + mobile share history); visitors get a temporary chat.
To re-ingest after editing `knowledge/`: POST the n8n webhook `foodhub/zippy-ingest`
(workflow 06) or `POST /api/internal/zippy/ingest`; check quality with
`node scripts/zippy-eval.mjs` (last 35/36, now 46/47 after Z2). Needs `ANTHROPIC_API_KEY` (workspace-scoped,
with credits) and `OPENAI_API_KEY` in `.env.local`. Z2 (live lookups) is built (next paragraph); Z3 (my orders) is merged (PR #7, `2cd0a4f`, paragraph after it); Z4a (cart
actions) is built on branch `ask-zippy-z4a` (last Zippy paragraph), Z4b is next. See MEMORY.md's "Ask Zippy Z1" entry and the spec's Amendments.
**Ask Zippy Z2 (2026-10-03, branch `ask-zippy-z2`, built and live-verified, merged to `main` 2026-10-03):**
Zippy now answers store, menu, price, option and open/closed questions from LIVE data (web and
mobile, same `POST /api/zippy/chat`); it cannot act (cart actions arrived in Z4a); order lookups arrived in Z3 (see the Z3 paragraph). The question is
embedded once and searches the Z1 knowledge AND a catalog index (migration 31, `zippy_catalog_chunks`
+ `match_zippy_catalog`, service-role only; text is names/descriptions/categories/cuisines, never
prices, fees or open status); hits are hydrated live into a `<catalog>` prompt block, then a bounded
Claude tool loop runs on `@anthropic-ai/sdk` (`lib/zippy/agent.ts` + pure `agent-loop.ts`; four
read-only tools in `tools.ts`: `search_catalog`, `find_stores`, `get_store_menu`, `get_item_options`;
data in `catalog.ts` (pure) / `catalog-data.ts`; index sync in `catalog-sync.ts`). Max 4 tool rounds, max 6 tool calls per round (extras get an error result)
(env `ZIPPY_MAX_TOOL_ROUNDS`, 1-6). **The answer now arrives in one piece, not word by word.** Kill
switch: `ZIPPY_TOOLS=off` (no tools, no catalog = Z1 content). Web sends the delivery pin
(`lib/zippy/client-location.ts`: stored pin, or the default pin on `/customer*` only); mobile sends the phone's foreground GPS fix
(`mobile/lib/zippy-location.ts`; permission is asked only when the question is about nearby stores; denied = no location, so "nearest" is unavailable). Rate limits as of 2026-10-03: signed-in 10/min + 60/day, visitors 5/min + 20/day per IP (global backstop unchanged). The location is never saved or logged. Keep the index
fresh with `POST /api/internal/zippy/catalog-sync` (n8n workflow 07, webhook
`foodhub/zippy-catalog-sync`, nightly; imported and published in the local n8n 2026-10-03, webhook verified: `embedded: 0`). Developer routes: `POST /api/internal/zippy/tool` (run
one tool) and `/search` (returns `{matches, catalog}`). Checks: `scripts/zippy-eval.mjs` (46/47) and
`scripts/zippy-facts-check.mjs` (compares answers to the database; 6/6). See MEMORY.md's "Ask Zippy
Z2" entry and the spec's section 13 Amendments.
**Ask Zippy Z3 (2026-10-03, branch `ask-zippy-z3`, built, live-verified, merged to `main` as PR #7 `2cd0a4f`; Vishal validated "Where is my order?" on his phone):**
a SIGNED-IN CUSTOMER can ask Zippy about their OWN orders (status, items with options and notes,
subtotal/delivery fee/total, payment status and method, store, and the name, phone, email and delivery
address on the order) on web and mobile, via two read-only tools, `list_my_orders` and `get_my_order`
(same `POST /api/zippy/chat`). It cannot see anyone else's orders and cannot place, change, cancel or
pay for an order (customers cannot cancel in this app). Visitors, vendors, delivery partners and admins
get no order data (a signed-in non-customer asking about orders is told Zippy cannot see orders, by
design). Order details go to the AI provider only when a question needs them. Kill switch
`ZIPPY_ORDERS=off` (`ZIPPY_TOOLS=off` also disables); Zippy then says it cannot look up your order
from chat. **Identity comes only from the verified session token, and every order query filters on the
customer id** (`ToolContext` gained `customerId` / `ordersEnabled`); never take an order or customer id
from the model's tool input as proof of identity. Files: `lib/zippy/orders.ts` (pure parsers, shapers,
tool definitions and the reader, with its database access INJECTED so node's test runner can run it -
`tools.ts` is `server-only` and cannot be imported by tests), `lib/zippy/orders-data.ts` (server wiring),
`tools.ts` / `agent.ts` / the chat route, `prompt.ts` (order rules), plus `knowledge/customer/ask-zippy.md`,
the policy privacy Q&A and the glossary. Spec `docs/superpowers/specs/2026-10-03-ask-zippy-z3-design.md`,
plan `docs/superpowers/plans/2026-10-03-ask-zippy-z3.md`. Live results (2026-10-03, local): an own order
matched the database; asking for another customer's order id returned "couldn't find"; a delivery-note
injection was not followed; a visitor and a vendor got no order data; `ZIPPY_ORDERS=off` behaved as
described. Tests: 205 pass. Not done: re-ingest of `knowledge/` plus a `node scripts/zippy-eval.mjs`
re-run (since done: knowledge re-ingested, eval 48/50, PR #8 fixed one fixture); Z4 (actions) became Z4a. Both manuals' Ask Zippy chapters were edited
in place for Z3 (page numbers unchanged, TOC untouched). See MEMORY.md's "Ask Zippy Z3" entry.
**Ask Zippy Z4a (2026-10-04, branch `ask-zippy-z4a`, built and live-verified locally, not yet merged to `main`):**
a SIGNED-IN CUSTOMER can ask Zippy to change their CART: add a dish, add a past order's items again
(reorder), change a line's quantity, remove a line, or clear the cart. Zippy only PROPOSES, with five
side-effect-free tools (`get_my_cart`, `propose_add_to_cart`, `propose_reorder`, `propose_cart_change`,
`propose_clear_cart`); `POST /api/zippy/chat` now returns `{reply, conversationId, actions}`, the client shows
confirm cards (Confirm / Dismiss), and **nothing changes until the customer taps Confirm**, which runs the
existing cart store through `executeAction`. The tap uses the atomic `addItems(storeId, storeName, items,
replace)` because calling `clearCart()` then `addItem()` in the same tick still opened the "clear cart?"
modal. The cart is client state (mobile AsyncStorage per device; web saved by a debounced PUT), so the client
sends a cart snapshot with every chat request and the server only validates and sanitizes it. Adding from a
different store than the cart REPLACES the cart on Confirm (no modal) and the card says so ("Confirming
replaces the N items from <store> in your cart."). Closed or suspended stores and unavailable dishes are
refused (on reorder unavailable lines are skipped and listed); quantity 1-20; at most 3 cards per reply; a
dish with required options makes Zippy ask which option first. Zippy does NOT place, pay for or cancel orders
and does not edit the order note; checkout stays manual (Z4b may add a "Go to checkout" card). Visitors,
vendors, delivery partners and admins get no actions. Web: Confirm works on `/customer*` pages (the cart
provider is mounted only there; elsewhere the card links to the customer area, see `lib/cart-bridge.ts`).
Mobile: Confirm always works. Kill switch `ZIPPY_ACTIONS=off` (`ZIPPY_TOOLS=off` also disables). Files:
`lib/zippy/actions.ts` (pure, dependencies injected), `actions-data.ts`, `components/zippy/ActionCards.tsx`,
`mobile/components/ZippyActionCards.tsx`, `lib/cart-bridge.ts`. These client files are shared BYTE-IDENTICAL
between web and mobile and guarded by tests: `lib/cart-line.ts`, `lib/zippy/action-types.ts`, `action-exec.ts`,
`client-cart.ts` <-> their copies under `mobile/lib/`. Live results (2026-10-04, spare instances): add cards
matched database prices and quantities; update/remove/clear cards matched the snapshot's lineIds, an empty
cart gave no card; reorder used today's prices and another customer's order id returned "not found"; an
unavailable dish was refused or skipped and a closed store refused; visitor, vendor and `ZIPPY_ACTIONS=off`
got no actions; a dish-description injection was ignored; a 5-dish request was capped at 3 cards; Z2/Z3 did
not regress; a required option was asked for, then the card carried it; the web card tap was verified in a
real browser with Playwright (Confirm showed "Added to your cart.", a double click added once, a cross-store
confirm replaced the cart with no modal). THREE defects were found only by live verification (all had passed
unit tests and reviews): `get_item_options` returned options without ids so required options could never be
chosen (`89871b3`); the web widget sits outside `CartProvider` so `useOptionalCart()` was always null and
Confirm never appeared (`772f2b7`, the cart bridge); the cross-store replacement was not disclosed and Zippy
claimed the app would ask to clear the cart (`0a7c5b3`). Tests: 251 pass. Not verified: a card tap on a real
phone. Open: phone check of card taps; after merge, re-ingest `knowledge/` and re-run
`node scripts/zippy-eval.mjs`; Z4b (checkout hand-off) is next. Deferred minors are listed in MEMORY.md's
"Ask Zippy Z4a" entry. Manuals: web v3.4 (chapter 8), mobile v4.5 (chapter 6), edited in place; no new
screenshot (the mobile card figure needs a new phone recording). Also: Vishal validated "Where is my order?"
on his phone; the Z3 eval was 48/50 after re-ingest and PR #8 replaced one mis-specified fixture (49/50
expected).
**Ask Zippy Z4b (2026-10-04, branch `ask-zippy-z4b`, built and live-verified locally, not yet merged to `main`):**
a signed-in customer who asks Zippy to check out gets a "Go to checkout" card (one per reply) that opens the
Checkout page/screen for the CURRENT cart; one tap, the chat closes. It is a navigation card, not a purchase:
Zippy never places or pays for an order and never asks for name, contact, address or card numbers (the
customer enters them on checkout). Zippy refuses, with no card, when the cart is empty, the store is closed or
suspended, or a dish is unavailable. The card is server-built from live data and shows no prices. Tool
`propose_go_to_checkout` + `buildCheckoutCard` + `proposalStatus` in `lib/zippy/actions.ts`; the `tools.ts` case
re-checks after its await because concurrent tool calls run in parallel (`Promise.all`); prompt rules; a
`go_to_checkout` variant in the shared byte-identical `action-types.ts` / `action-exec.ts` (web + mobile); web
`ActionCards` uses `router.push` and `onNavigate` closes the widget; mobile `ZippyActionCards` closes the modal
then `router.navigate` (no stacked second Checkout screen). Web: works wherever the website shows the customer's cart (the customer pages); on vendor, admin and delivery pages Zippy cannot see the cart, so it cannot prepare the card there; on mobile it always works
(outside `/customer/*` the widget sends `cart: null`, and the tool says it cannot see the cart). Mobile: always
works. A checkout card and cart cards never share a reply (`checkoutConflict` / `cartChangeConflict` in `actions.ts`);
per-card state lives in the widget/Fab so it survives close and reopen. If the live cart's store changed since the card was made, the tap says "Your cart changed, ask me
again." `ZIPPY_ACTIONS=off` disables it too. Visitors, vendors, delivery partners and admins never get it.
Live findings (2026-10-04): the reply said "Tap Confirm" but the button is "Go to checkout" (fixed by
`proposalStatus` and a prompt rule); the first review caught a duplicate-card race and an orders-off prompt
contradiction (both fixed). Not verified: a phone tap (iOS may be flaky pushing a route right after dismissing
a Modal). Open for Vishal: after merge re-ingest `knowledge/` and re-run `node scripts/zippy-eval.mjs` (two new
cases: "can zippy check out for me", "take me to checkout"); phone check. See MEMORY.md's "Ask Zippy Z4b"
entry and `docs/superpowers/specs/2026-10-04-ask-zippy-z4b-design.md`. Manuals: web v3.5, mobile v4.6, edited in
place (no page start changed, so the static TOCs were untouched).
**Zippy chat retention (2026-10-04, branch `zippy-retention`, built and live-verified, merge pending):**
SQL function `purge_zippy_chats(retention_days, dry_run)` deletes Zippy conversations (messages go by cascade)
whose last activity (newest message, or the conversation's creation time if it has none) is older than the
window (30 days; env `ZIPPY_RETENTION_DAYS` 1..3650, else 30), plus `zippy_usage` rate-limit rows older than
2 days; it touches nothing else and defaults to a dry run. Internal route `POST /api/internal/zippy/purge`
(internal secret). n8n workflow 08 "Zippy Chat Retention" runs the real purge nightly at 03:45; its webhook
`foodhub/zippy-purge` is a DRY RUN unless the body is `{"dryRun": false}`. Orders are not purged. Policy text
and both manuals (web v3.5.1, mobile v4.6.1, PDFs regenerated, page counts unchanged) now say chats are deleted
automatically 30 days after the last message. After merge Vishal must: re-ingest `knowledge/`, import and publish
workflow 08 in the local n8n (never stop or restart the n8n container), then run the dry run first:
`Invoke-RestMethod -Method Post http://localhost:5678/webhook/foodhub/zippy-purge`. See MEMORY.md's
"Zippy chat retention" entry and `docs/n8n-webhook-setup.md` (Workflow 08).
**Gotcha for demos/tests:** workflow 04 auto-assigns a `ready` order within
~10 s to the NEAREST ONLINE partner by stored lat/lng, so it never reaches the
"Available" list while any online partner has coordinates — a leftover online
test partner (`partner-b1@foodhub.local`, Bangalore coords) silently took
orders meant for `delivery@foodhub.local`. Set stray partners offline first.
**Correction to the "cart redesign (slide-out panel)" claim above
(line ~21) and to any other reference to `CartPanel.tsx` as a
slide-out drawer with Escape-flush/close-before-nav/open-state logic**:
as of the Figma-kit redesign's Task 5 (2026-09-29), `CartPanel.tsx` is
confirmed — by repo-wide grep, not just inspection — to be a plain
always-rendered `<aside>` sidebar with no Escape-keydown handler and no
open/close state. Either a later refactor quietly removed the drawer
model, or this file's own past entries never matched what shipped.
Don't trust this file's description of a component's *current*
behavior without grepping the live code first — MEMORY.md and CLAUDE.md
are snapshots, not standing guarantees (an existing gotcha below already
warns about this for `<a href>` tags; it applies here too).

## Stack

- Next.js (App Router, TypeScript) + Tailwind CSS
- Supabase (Postgres + Auth + Storage + Realtime), **self-hosted locally via
  Docker** — no cloud/hosted Supabase project, ever (see spec §2)
- n8n for cross-actor automation — `/api/internal/*` routes and
  `n8n/workflows/*.json` exist (Phase 7), verified end-to-end against a
  real local n8n instance as of 2026-09-25 (see MEMORY.md's Phase 7
  addendum and `docs/n8n-webhook-setup.md` for the confirmed-working
  docker run command and per-workflow results).
- Google Maps JS SDK for address picking + live tracking (not wired yet —
  no API key available as of Phase 2; address picker is a manual lat/lng
  stub in the meantime, swappable later)
- React Native + Expo mobile app (customer + delivery-partner surfaces) is a
  planned follow-on sub-project after all 8 web phases ship — not started

## Local setup

See [README.md](README.md) for run instructions and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for a full deployment walkthrough
(local/self-hosted only — no cloud target). Requires Docker Desktop
running before `npx supabase start`. `scripts/` has build/start/stop/seed
entry points (`npm run app:build` / `app:start` / `app:stop` / `app:seed`,
Node `.mjs` canonical + PowerShell `.ps1` wrappers). Every started service
runs as a true detached background process (`scripts/lib/
background-service.mjs`) with a log-viewer window that can be closed
without stopping the service. `--all-roles` (`app:start:all-roles` /
`.\scripts\start.ps1 -Dev -AllRoles`) runs 4 instances of the app on
ports 3000-3003, one per role, so customer/vendor/delivery/admin can all
be logged in at once — each port is its own browser origin, so Supabase
Auth sessions (which live in per-origin `localStorage`) don't collide.

## Status

See [MEMORY.md](MEMORY.md) for phase-by-phase progress and decisions.

## Project-specific rules

- **Every `"use client"` dynamic detail page (`app/**/[id]/page.tsx`) that
  fetches its own data after mount needs a sibling `loading.tsx`.**
  Without one, Next shows nothing at all during the client-side route
  transition, which a real user reads as "the click did nothing" — this
  is exactly what happened with restaurant/store cards on the home feed
  (confirmed live by Vishal, root-caused 2026-09-28: `/customer/
  stores/[id]` had no `loading.js`, navigation always worked but took
  ~900ms with zero visual feedback). See MEMORY.md's "Checkout/cart/
  account UX fixes" entry for the full investigation.
- **A Postgres trigger function that fires an n8n webhook must be checked
  for what it actually puts in the request body, not just that it fires
  — `create or replace function` silently succeeding is not evidence the
  payload is populated.** `n8n_notify()` (wiring `orders`/`payments`
  inserts to n8n webhooks since Phase 7) had been sending an empty
  `'{}'::jsonb` body the entire time — every webhook fired on schedule,
  every n8n workflow execution showed as a success, but no node reading
  a field out of that body could ever have worked, because there was no
  data to read. This is exactly the "looked right, never verified live"
  gotcha this file already tracks several instances of (the `users` RLS
  recursion bug, the `APP_BASE_URL`/`host.docker.internal` container
  networking bug) — a trigger firing successfully only proves the HTTP
  call happened, not that its payload was ever exercised end-to-end.
  Found and fixed in the checkout-payment-details plan's Task 1, only
  because that task's own live verification actually inspected the
  webhook payload n8n received, not just whether the workflow execution
  showed green.
- **No hosted Supabase, ever.** Local Docker stack only (Vishal's explicit
  cost/scale preference — see spec §2).
- **Cart is single-restaurant only.** Adding an item from a different
  restaurant must prompt to clear the cart, never silently mix.
- **Branding stays isolated** to `lib/branding.ts` + Tailwind `@theme`
  tokens (`app/globals.css`) — never hardcode the brand name/color in a
  component. Six color tokens as of the redesign: `brand-primary`,
  `brand-accent`, `brand-bg`, `brand-surface`, `brand-ink`,
  `brand-ink-muted`.
- **Build one phase at a time.** Don't start Phase N+1 work until Phase N is
  merged to `main`. Each phase gets its own git worktree + branch during
  execution, per `superpowers:subagent-driven-development`.
- **External API keys** (Google Maps, Pexels, etc.) go in `.env.local`
  (gitignored) with a placeholder line added to `.env.example` — never
  hardcoded, never committed.
- **Images fetched from external APIs** (e.g. Pexels) are fetched once and
  the resulting URLs are hardcoded into `supabase/seed.sql` / migrations —
  not called live at runtime, to keep API keys server-side only and avoid a
  network dependency on every `db reset`.
- **Any code that touches money (prices, subtotal, delivery fee, total)
  must use integer-cents/paise arithmetic**, never plain JS float
  multiplication — Postgres's exact-numeric CHECK constraints reject float
  rounding errors that whole-number seed data won't reveal until real
  decimal prices are used (found the hard way in Phase 3).
- **Run `npm run build` before marking any new page/route task done**, not
  just `tsc --noEmit` — a missing Suspense boundary around
  `useSearchParams()` broke the production build in Phase 3 and `tsc`
  alone didn't catch it.
- **Service-role Supabase key** (`SUPABASE_SERVICE_ROLE_KEY`) is only ever
  imported in server-side files guarded by the `server-only` package
  (see `lib/supabase-server.ts`) — never importable from a client
  component's bundle.
- **API routes that create data on a customer's behalf must derive the
  customer's identity from a verified session token** (`Authorization:
  Bearer <token>` checked via `supabaseServer.auth.getUser(token)`),
  never from a client-supplied id in the request body — a Phase 3 review
  caught a route that trusted a body-supplied `customerId`.
- **Any redirect target taken from a URL query param must be validated by
  parsing it with `new URL(raw, window.location.origin)` and comparing
  `.origin`, returning `.href` (never reassembling `pathname + search +
  hash`) if it matches** — reassembling parts reintroduces an open-redirect
  bypass via dot-segment/protocol-relative tricks (took 3 review rounds to
  close in Phase 3's login page).
- **Never add an RLS write policy (insert/update/delete) "for defense in
  depth" on a table that only ever gets written through a service-role API
  route.** An unused RLS write policy isn't dead code — it's a live,
  directly-reachable PostgREST bypass for anyone with their own anon-key
  session token, and it skips every check the API route enforces (status
  chains, ownership, field-level restrictions). Phase 4's final review
  caught three such policies (vendor order/restaurant updates, restaurant
  inserts) that let any authenticated user skip the vendor order-status
  chain or create their own orderable restaurant. Only add an RLS write
  policy for a table a client is actually meant to write to directly; read
  policies are fine since they're the intended defense layer for session-
  scoped browser reads. Recurred a fourth time in the customer cart
  persistence feature — this time the *spec itself* (not just the
  migration) assumed direct client writes, then the actual implementation
  correctly routed writes through a service-role API route instead,
  leaving the spec's 3 write policies live and unused. A per-task review
  approving RLS SQL against its own migration's stated intent is not
  enough — the final whole-branch review must also check what the rest
  of the codebase actually does with that table, since a self-consistent
  RLS design can still be wrong once you see how it's really used. Caught
  before merge only because the migration hadn't shipped to `main` yet.
- **When adding RLS policies to a table in a new migration, first list
  every EXISTING policy on that table (`select * from pg_policies where
  tablename = '...'`, or just grep every prior migration file for the
  table name) — don't just review the policies being added.** Phase 1's
  original permissive `stub_allow_authenticated_read` policies were meant
  to be replaced table-by-table as each table gained real data, but
  `delivery_partners` was missed by both the phase that should have
  caught it (there wasn't one, until Phase 5) and Phase 5's own first
  pass — live verification caught it only because a live cross-customer
  read test happened to be run, not because any code review inspected
  the table's full policy list. A new policy that looks correctly scoped
  in isolation can still sit next to an old one that quietly overrides
  it (RLS policies are OR'd together — the strictest new policy doesn't
  narrow an existing permissive one). `reviews` still has its original
  Phase 1 stub as of Phase 5 — deliberately left for whichever phase
  first gives that table real write traffic to close, see MEMORY.md.
- **Never write an RLS policy on `users` (or any table) whose own USING
  clause queries that same table** (`exists (select 1 from public.users
  where ...)` inside a policy ON `public.users`) — Postgres cannot
  evaluate this and throws "infinite recursion detected in policy",
  breaking every browser-side read of that table (and transitively any
  table whose policies join through it) for every role, not just the
  one the broken policy was meant to gate. Phase 6 shipped exactly this
  (an "admin can read all users" policy that checked the caller's own
  admin-ness by querying `users` from within a `users` policy) and it
  broke login-time role checks for customer/vendor/delivery/admin alike,
  caught only by a final-review live audit that actually drove the login
  UI in a browser — curl tests against service-role-backed API routes
  never touch RLS at all and cannot catch this class of bug. If a table
  needs a self-referential admin check, either query a different table
  that already carries the caller's role, or use a `security definer`
  helper function (`create function is_admin() ... security definer set
  search_path = ''`) rather than a same-table subquery.
- **A phase's live verification pass must include actually driving the
  browser-facing UI for every login surface the migration could affect**
  — not just curl/REST calls against service-role-backed API routes,
  which bypass RLS entirely and cannot catch an RLS bug at all. Phase 6's
  own Task 6 verification ran entirely via curl and missed a
  login-breaking RLS recursion bug that the final whole-branch review
  only caught by loading `/admin/login` in an actual browser.
- **A client-side "shell" component providing shared session state
  (`VendorShell`, `DeliveryShell`, `AdminShell`, or any future one) must
  live in a Next.js route group that EXCLUDES that role's own login
  page** (`app/<role>/(portal)/...` with `app/<role>/login` outside it) —
  never in a layout applied to the whole top-level `app/<role>/` segment.
  A layout persists across client-side navigation, so one that also wraps
  login runs its session-resolving effect once too early (before a
  session exists) and never again after redirecting away, which silently
  produces two Critical bugs: an infinite post-login "Loading…" hang, and
  stale session/role data shown after signing out and logging in as a
  different account in the same browser tab. The vendor-portal visual
  rebuild shipped this bug and only caught it in final whole-branch
  review; the delivery- and admin-portal rebuilds baked the route-group
  exclusion in from their first task instead and both final reviews
  confirmed live (cleared-storage browser, fresh login, then sign-out +
  re-login) that the bug class cannot occur. Any future per-role portal
  work (the planned mobile app's web-facing admin/vendor surfaces, if
  any, or a new role) should use this route-group structure from its
  first task, not discover it via review.
- **A "no `<a href>` tags exist" claim in MEMORY.md/CLAUDE.md is a
  snapshot, not a standing guarantee — re-grep before trusting it.** The
  post-Phase-8 triage recorded that claim after investigating a stale
  doc entry, but `RestaurantCard.tsx` had a raw `<a href>` the whole time
  (missed because that file wasn't touched by the triage's own search
  scope); found and fixed during the DoorDash-layout-rebuild plan simply
  because that plan happened to touch the file. `npm run build`/`tsc`
  never catches this class of bug — only a deliberate grep does.
- **A UI restructuring that changes *how* existing data is grouped or
  filtered (e.g. flat list → grouped-by-category rows) can silently drop
  rows the old flat view always showed, even with zero logic touched on
  the data-fetching side.** The DoorDash-layout-rebuild's cuisine-grouped
  carousel view initially had no fallback for a restaurant with no
  matching taxonomy tag (e.g. a freshly-signed-up vendor's
  `cuisine_tags: []` default) or an empty/failed `cuisine_taxonomy`
  fetch — both cases silently showed nothing where the old flat grid
  always rendered every open restaurant. Caught only by the final
  whole-branch review reading the diff against the data shape, not by
  any live click-through (every seeded restaurant in this app happens to
  have real cuisine tags, so the missing case never surfaced in
  Playwright testing). When restructuring a listing's grouping/filter
  logic, always add an explicit fallback path for items the new grouping
  doesn't cover, not just for the zero-items-total case.
- **A client-side search filter must match against every string form the
  UI actually displays to the user, not just the underlying data's raw
  value.** The DoorDash-layout-rebuild's home-page search matched
  `cuisine_tags` slugs (`fast_food`) but the visible chips/headings show
  taxonomy labels (`Fast Food`) — typing what's on screen returned zero
  results. Build a slug-to-label lookup whenever a filter's visible
  chrome and its underlying data use different strings for the same
  concept.
- **A status-driven UI component (e.g. a step tracker) that maps a wider
  status enum onto a smaller set of display states should use a
  `Record<T, V>` TypeScript type over the *narrowed* union, not the full
  one, when one value needs special-case handling instead of a mapped
  step.** `OrderStatusTimeline` (customer-flow DoorDash-style polish)
  maps the `OrderStatus` union onto display steps (4 originally; 6 as of
  order-visibility sub-project A, now in `lib/order-status.ts`, where
  `rejected` is also a banner case), with
  `cancelled` handled as an early-return special case rather than a
  mapped index. Typing the lookup table as
  `Record<Exclude<OrderStatus, "cancelled">, number>` makes the
  TypeScript compiler itself reject any future new status value that
  isn't explicitly added to the mapping (verified live during that
  plan's Task 1 by temporarily deleting one key and confirming the build
  fails) — cheaper and more durable than a runtime fallback or a
  code-review checklist item.
- **Every URL an n8n container node calls back into this machine (the
  app, Supabase, or anything else self-hosted) needs `host.docker.internal`,
  not `127.0.0.1`/`localhost` — this isn't unique to `APP_BASE_URL`.**
  Wiring n8n live for the first time (2026-09-25) found `SUPABASE_URL`
  set to `http://127.0.0.1:54321` in the n8n container's environment,
  which is unreachable from inside that container (it resolves to the
  container itself) and broke workflow 04's restaurant lat/lng lookup
  with "The service refused the connection" — silent on JSON/config
  review, only surfaces once the node actually executes. Also needs
  `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` in n8n's environment, or every
  node reading `{{$env.X}}` (the internal-secret header, the base URLs)
  fails with "access to env vars denied" regardless of whether the
  variable is correctly set — n8n blocks node-level env access by
  default. See `docs/n8n-webhook-setup.md` section 1 for the confirmed-
  working docker run command with both fixes applied.

- **`.font-heading` (in `app/globals.css`, Poppins weight 300 for
  hero/section headings) is deliberately defined outside any Tailwind
  `@layer` block** — this was to avoid colliding with a Tailwind-auto-
  generated utility of the same name (it isn't registered as a `--font-*`
  theme token, so no such utility exists, but the plain-CSS placement was
  also chosen so unlayered CSS reliably wins the cascade). The tradeoff:
  if a later redesign piece pairs `font-heading` with a Tailwind weight
  utility (e.g. `className="font-heading font-semibold"`), the unlayered
  `.font-heading` rule's own `font-weight: 300` silently wins regardless
  of utility order — found during piece 1's final review, not yet hit in
  practice since the only current usage (`HeroSearch`) pairs no weight
  class. If a later piece needs to override the weight, wrap the rule in
  `@layer utilities { ... }` or convert it to Tailwind v4's `@utility
  font-heading { ... }` syntax so normal utility-ordering rules apply.
- **When a subagent claims it "verified" something via logic replication
  or a code-path trace, check whether live infrastructure (a running dev
  server, curl, psql, Playwright) was actually available to it before
  trusting that claim as equivalent to live verification.** During piece
  2's final-review fix pass, an implementer verified 3 of 6 findings
  (including two money-display bugs) via throwaway Node scripts re-running
  the isolated validation logic, even though the same environment's
  earlier tasks in that plan had successfully used curl against the local
  Supabase/PostgREST endpoints and direct psql queries. The controller
  independently re-verified all 6 live before merging and found the fixes
  were in fact correct — but the gap between "logic replication passed"
  and "the actual deployed route/page behaves correctly" is real (a
  transcription error between the isolated script and the real file, a
  stale build being served, an integration point the isolated logic
  doesn't exercise, etc.), and would not have been caught by trusting the
  subagent's report alone. When live infra is available and a prior task
  in the same session/plan already used it successfully, a later task
  substituting logic-only verification is a downgrade worth catching, not
  an acceptable equivalent — re-verify live yourself before trusting it,
  especially for money-path or security-relevant changes.

- **Any UI grouping/keying logic derived from a nullable text column
  (e.g. `menu_items.category`) must treat a blank/whitespace string the
  same as `null`, not just check `=== null`.** A vendor-facing edit form
  clearing a text field typically writes `""`, not `null` — piece 3's
  restaurant-page category grouping (`app/customer/restaurants/[id]/
  page.tsx`) originally only bucketed `null` categories into "Other",
  so a vendor-cleared `""` category became its own blank-labeled group
  with an empty pill. Slugifying such a column for use as a React key or
  DOM id also needs explicit de-duplication (trailing-space/case
  variants, non-Latin labels, or a legitimate category value colliding
  with a synthetic fallback bucket's label can all slugify to the same
  string) — a naive `slugify(label)` key will silently let the second
  colliding group overwrite the first in any ref/lookup map keyed by
  that slug. Caught only by piece 3's final whole-branch review reading
  the vendor-form code path, not by the inline execution's own live
  Playwright verification (which only tested seed data, where every
  category is a clean non-empty string).
- **A click handler that scrolls to a target must set any "active"/
  highlighted UI state itself, not rely on a separate scroll-triggered
  observer (`IntersectionObserver`) to catch up.** Piece 3's anchor-nav
  scroll-spy only updated the active pill via the observer, so clicking
  a pill scrolled correctly but left the wrong pill highlighted on any
  menu short enough that the target section never crosses the
  observer's visibility threshold (or during the smooth-scroll itself).
  The fix was one line — set the state directly in the click handler —
  but the bug shipped past the piece's own live-verify pass because that
  pass tested "does clicking scroll to the right place", not "is the
  right pill highlighted immediately after clicking".
- **`scrollIntoView({ block: "start" })` under a `position: sticky`
  element needs `scroll-margin-top` (Tailwind `scroll-mt-*`) on the
  scroll target**, or the sticky element's own background will cover
  the very content the scroll was supposed to reveal. Piece 3's category
  headings landed directly behind the sticky anchor-nav bar until a
  `scroll-mt-16` was added — worth checking any future sticky-nav +
  scroll-to-section pattern in this app for the same gap.
- **A length-comparison dedup check (`array.length !== otherArray.length`)
  that assumes an id column is unique breaks silently the moment a
  feature makes that id legitimately repeatable.** Piece 4's checkout
  route did `menuItemIds = items.map(i => i.menuItemId)` then compared
  `menuItems.length !== menuItemIds.length` to catch invalid ids — safe
  before piece 4, when the cart could only ever hold one line per
  `menuItemId`. Item customization's `lineId` cart model makes two lines
  sharing a `menuItemId` (same dish, different options) the normal case
  it exists to support, and the old check 404'd the whole checkout on
  exactly that case. Fixed with `[...new Set(menuItemIds)]` before the
  length comparison. When a schema/model change makes a previously-unique
  column repeatable, grep for every `.length !==`/`.length ===` check
  against arrays derived from that column, not just the obvious CRUD
  paths — the bug hides in code nobody touched this session.
- **A component mounted persistently in a layout (outside any page's own
  tree) that opens an overlay must close that overlay itself on any
  client-side navigation the overlay's own links trigger — Next.js does
  not remount or reset the component's state across a client-side route
  change.** Piece 5's `CartPanel` lives in `app/customer/layout.tsx` so it
  survives every customer-app navigation; its slide-out drawer's own
  "Checkout" link did a client-side nav to `/customer/checkout` without
  closing the drawer first, leaving the backdrop and panel covering the
  destination page until manually dismissed — and since `clearCart()`
  never reset the drawer's `open` state either, it silently reopened on
  the next add-to-cart after a successful order. Missed by every per-task
  review and the piece's own live-verify pass (which tested the drawer in
  isolation, never followed the Checkout link through), caught only by
  the final whole-branch review. Any future persistent-layout overlay
  needs an explicit `onClick`/route-change handler to close itself, not
  an assumption that navigating away implicitly resets it.
- **A controlled input that only commits its draft to a store on `blur`
  loses that draft if the surrounding UI can be dismissed by a path that
  unmounts the input without a browser-visible blur event** (an Escape
  keydown handler that calls `setOpen(false)`, closing a modal/drawer,
  is exactly such a path — the ✕ button and a backdrop click both
  happen to blur the input first via the mousedown, but Escape does
  not). Piece 5's order-note textarea used this blur-only commit
  pattern (matching piece 4's existing per-line note inputs) and silently
  discarded an unsaved note on Escape. Any keyboard-driven close handler
  for a panel containing blur-committed text inputs must explicitly flush
  their pending draft state before closing, not rely on blur firing as a
  side effect of how the panel happens to get dismissed.
- **When a Postgres RPC function gains a new parameter via a migration,
  `drop function if exists <old-signature>` before `create or replace
  function <new-signature>` is normally correct, not a cargo-culted
  extra step** — Postgres identifies a function by its name **and**
  argument types, so appending a parameter (even one with a `default`)
  changes the function's identity, and `create or replace` alone creates
  a second, ambiguous overload beside the old one. A migration's own
  unqualified `revoke`/`grant execute on function <name>` (no argument
  list) then fails with "function name is not unique." Piece 5's Task 1
  per-task review flagged its migration's drop-then-replace as
  unnecessary; the final whole-branch review corrected this — the
  drop was required, and the per-task reviewer's stated rationale for
  calling it unnecessary was itself wrong. Don't assume `create or
  replace function` is a drop-in replacement for `drop` + `create` just
  because it usually is for same-signature changes.
- **A new git worktree does not inherit the main checkout's gitignored
  `.env.local`** — copy it in explicitly as part of worktree setup for
  any task that needs a working external API key (Pexels, etc.) or that
  runs `npm run build` (which needs `NEXT_PUBLIC_SUPABASE_URL` etc. to
  resolve). Sub-project B's Phase 3 Redo shipped 10 of 12 store tasks
  with mismatched product photos because the Pexels key was silently
  unreachable from inside `.claude/worktrees/phase3-redo` — each task
  fell back to reusing an unrelated existing photo instead of surfacing
  the failure, and no per-task diff-only review could catch a
  wrong-but-well-formed URL. Caught only by the final whole-branch review
  spot-checking fetched photo ids against product names.
- **When multiple content-building tasks each add rows referencing a
  shared `image_url` pool (Pexels or otherwise), every task's "no
  duplicate photos" self-check must grep candidate photo ids against the
  ENTIRE target file (e.g. `seed.sql`), not just that task's own new
  rows.** Sub-project C (Phase 4 Redo) hit this repeatedly — Tasks 3, 11,
  12 (with a 3-way and a 6-way collision), and 16 each shipped a row
  reusing a photo already committed by a *different* task, because the
  implementer's dedup check was scoped only to its own 50 rows (or used a
  grep pattern blind to non-`pexels-photo-N` URL formats). Even after
  every later dispatch was explicitly warned and given a literal
  copy-pasteable whole-file grep command, the final whole-branch review
  still caught 14 more cross-task duplicates that had slipped past every
  individual task's own review. Bake an explicit, runnable whole-file
  dedup command into every dispatch from the start of any future
  multi-task content-building plan — "check your own N rows" instructions
  are not sufficient on their own.
- **When adding new rows to `supabase/seed.sql` (or any file with
  multiple existing `insert ... values (...)` statements), always append
  a brand-new insert statement — never open, edit, or extend an existing
  one, even one for the same table.** Sub-project C's Task 10 accidentally
  deleted an entirely different, already-committed store's whole 50-row
  product catalog by editing an existing insert block instead of adding a
  new one, silently reducing that store to zero products. Caught only by
  task review; fixed by restoring the deleted rows byte-identical from
  git history. Every dispatch touching a shared multi-statement seed file
  should say this explicitly, and a task's own verification step should
  re-check the counts of stores/rows it did NOT intend to touch, not just
  the one it added.
- **The "never edit another store's already-committed row" rule above
  also applies when a task is trying to FIX its own image_url collision
  — the fix must always be "fetch a new photo for MY OWN colliding row,"
  never "edit the other store's row that happens to share the photo."**
  Sub-project D's Task 12 (the last store task) tried to resolve its own
  collisions by directly editing 7 rows across 5 unrelated already-
  committed stores, then got confused mid-fix and corrupted its own
  uncommitted edits with a botched `sed` pass, going BLOCKED. Recovery:
  since the corrupted edits were entirely uncommitted in an isolated
  worktree (nothing pushed or shared), the controller safely discarded
  them with `git checkout -- <file>` and applied the fix directly rather
  than re-dispatching a subagent into the same confusion — restore every
  wrongly-touched row to its exact prior committed content via `git show
  <prior-commit>:<file>`, then re-fetch only the offending task's own
  colliding photos. **When an implementer subagent reports BLOCKED after
  corrupting its own uncommitted work, check `git status`/`git diff
  --stat` first — if the damage is small and entirely uncommitted, the
  controller can discard and reapply the fix directly instead of treating
  it as an unrecoverable failure.**

- **When a subagent is told to invent original names for new seed rows
  (stores, users, anything with a unique-constrained email/name), require
  its own "no collisions" verification to explicitly grep those
  names/emails against the WHOLE existing file — not just the photo-id
  dedup check it may already know to run.** Generating 20 new fictitious
  non-restaurant stores, a subagent reused two already-existing store
  names/emails verbatim (`Green Grocer`/`green-grocer@foodhub.local`,
  `Daily Basket`/`daily-basket@foodhub.local`) despite being told to
  invent originals — its own report claimed a clean dedup check but had
  only verified Pexels photo-id uniqueness, not name/email uniqueness.
  Unlike a duplicate photo (silent, cosmetic), a duplicate email breaks
  `supabase db reset` outright via the `users_email_partial_key`
  constraint, so this class of bug surfaces immediately and loudly — but
  only if someone actually runs a reset before committing, not from
  reading the subagent's self-report alone.
- **When any subagent invents Pexels image URLs without live Pexels API
  access, curl-check every one of them for a 200 status before trusting
  the seed data — a plausible-looking numeric photo id is not evidence
  the photo exists.** The same 20-fictitious-store task above also
  shipped 28 of 92 image URLs as flat-out 404s (guessed ids that don't
  correspond to real Pexels photos); the subagent's own "no collisions"
  verification only checked photo-id uniqueness, not existence, so it
  reported clean. Only surfaced by chance — a broken-image icon spotted
  while taking screenshots for a docs update. Fixed by curl-checking
  every new URL and remapping dead ids to verified-working ones already
  proven live elsewhere in the file.
- **A docx-js `TableOfContents` field is fine for a `.docx` opened in
  Word, but renders permanently blank in any PDF exported from it** —
  Word/LibreOffice only populate a TOC field on an explicit "Update
  Field" action, which nothing in a static PDF export pipeline triggers
  automatically. `docs/User_Manual.docx`/`.pdf` shipped with a blank TOC
  page in the PDF on first build; fixed by hand-editing the docx XML to
  replace the field with a static, pre-computed page-numbered list (page
  numbers read off a rendered proof, not guessed). Any future docx-js
  document whose PDF export matters must either pre-compute a static TOC
  this way or programmatically resolve the field before converting to
  PDF — never ship a bare TOC field as the final PDF deliverable.

- **Update `docs/User_Manual.docx` / `Mobile_App_User_Manual.docx` by
  editing the existing file in place (python-docx), never by re-running
  the old `build.js`** — it no longer matches the shipped docx, and both
  manuals use hand-typed static TOCs that must be renumbered after every
  edit (convert to PDF, read each chapter's start page, then replace the
  whole text after the tab in each TOC line — some lines split the page
  number across two runs). Screenshot the web app from a production
  build (`node scripts/start.mjs --skip-mobile`), not `next dev`, so no
  dev badge appears. See MEMORY.md's "Manuals refreshed" entry.

- **Test orders must never send real Gmail.** n8n workflows 03/05 send a real
  message from Vishal's connected Gmail account to the order's `recipient_email`;
  a fake address such as `demo@example.com` still sends and the bounce notices land
  in HIS inbox (2026-10-02: ~24 test emails + his own phone-testing emails = nearly
  10 "delivered" emails he complained about). Vishal had the Gmail send nodes of
  workflows 03 and 05 re-enabled and published in the local n8n on 2026-10-02, so
  they are LIVE again: every order emails its `recipient_email`. For tests use only
  an address Vishal owns, one order at a time, and ask first — or switch the two
  nodes off again (n8n UI: select node, press `D`, Publish) and verify from n8n's
  execution record instead. A fresh n8n imported from the repo JSON has them on.

- **Claude Sonnet 5.5 API: omit `thinking` and it runs adaptive thinking at
  effort high, which eats `max_tokens`** (Zippy replies came back truncated or
  empty). Send `thinking: {type: "between_tools"}`. Never send
  `{type: "disabled"}`, `budget_tokens`, a forced `tool_choice` or a non-default
  `temperature` - each is a 400 on this model.
- **Anthropic API keys must be workspace-scoped** (or each request needs an
  `anthropic-workspace-id` header). A zero credit balance is an HTTP 400, not a
  401/402, so it looks like a code bug. Log provider error bodies server-side
  (never to the client) - that is how Zippy's credit problem was found.
- **Knowledge-base content must be fact-checked against the code, not written
  from the manuals or memory.** Two review rounds caught wrong claims in
  `knowledge/` (a store "cancel" action that does not exist - only reject - and
  "partners are admin-added" when self sign-up exists). The in-app Help FAQ
  (web + mobile) cancel answer was corrected on 2026-10-03 to match the code (customers cannot
  cancel; a store can only reject while Placed; failed payment cancels). The policy knowledge file
  now holds Vishal's real support contact, simulated-payment terms, a 24-hour wrong-item rule and
  retention wording (as of 2026-10-04 Zippy chats ARE purged automatically 30 days after their last
  message by the retention job, see "Zippy chat retention"; orders are NOT purged and are deleted only on request). Both manuals gained an Ask Zippy chapter on 2026-10-03
  (web v3.3 Chapter 8, mobile v4.4 Chapter 6, edited in place; mobile figure is from Vishal's iPhone
  recording with the Expo gear left in, like the other figures).
- **pgvector: `ALTER FUNCTION ... SET hnsw.*` needs the library loaded first**
  (`select '[1]'::vector;` in the same session). Otherwise the GUC is an unknown
  placeholder and a non-superuser gets 42501. Also: an audience filter after an
  HNSW scan can return fewer rows than asked for - set `hnsw.iterative_scan`.
- **SDD worktree build caveat:** Turbopack rejects a `node_modules` junction
  (outside filesystem root). In a worktree build with `npx next build --webpack`,
  and run the real `npm run build` after merge to `main`.
- **A widget mounted in the ROOT layout cannot know about a page's own sidebar
  by props** - anchor it with CSS (`:has([data-basket-panel])`) so it sits beside
  the basket only when one is rendered. Found live: a fixed offset left the bubble
  floating mid-screen on pages with no basket.
- **Never run the dev app against the same `.next` while a build is running** -
  the two corrupt each other's output.
- **A default value that the UI shows but never stores is invisible to code that
  reads storage.** Z2's first web build read the delivery pin only from localStorage, but
  the default Mumbai pin is never written there, so a fresh customer session sent no
  location and "nearest" could not work. Use `resolveLocation` (stored pin, else the
  default on `/customer*`), and check any "read the user's setting" code path on a
  brand-new session, not just after the setting has been changed.
- **A pure-function unit test and `node --check` do not prove a script runs.** The Zippy eval
  script shipped with a missing import (`caseOk`) that both passed; only running it end to end
  found it. Every CLI script needs a test that runs it against a stub server. In Node CLIs set
  `process.exitCode` instead of calling `process.exit()` while fetch sockets are open - on
  Windows that crashes Node (exit 0xC0000409).
- **An Anthropic tool loop whose history contains `tool_use`/`tool_result` blocks must still send
  the `tools` definitions on every call, including the last "answer now" call**: send them with
  `tool_choice: {type: "none"}`, never drop them (the API rejects it). Pass the whole assistant
  turn back unchanged (thinking blocks included) and return all tool results of a round in ONE
  user message. All of this was confirmed live on `claude-sonnet-5-5` before relying on it.
- **A prompt rule written for one feature silently blocks the next.** Z1's "answer only from the
  knowledge below, otherwise say you do not have that information" made Z2's live lookups
  refuse until it was scoped to how-to questions only. When adding a capability, re-read every
  existing prompt rule for wording that forbids it, and check with a live question, not only a
  prompt snapshot test.
- **The local n8n container runs with `--rm`: `docker stop n8n` DELETES it** (state lives in the
  `n8n_data` volume, so nothing is lost, but the container and its env must be recreated with the
  `docker run` in `docs/n8n-webhook-setup.md`, which needs `N8N_INTERNAL_SECRET` from `.env.local`).
  Never stop it just to import/publish a workflow without first making sure the secret can be
  supplied; the 2026-10-03 workflow 07 import left n8n down until Vishal recreated it by hand, because
  an assistant-run script reading the secret line was blocked. Also `docker restart` is not an option
  here, it only works on a container that still exists.

- **A widget mounted in the ROOT layout cannot use a React context provided by a nested layout.**
  Ask Zippy's web widget lives in the root layout, `CartProvider` only under `/customer`, so
  `useOptionalCart()` was always null there and the Confirm button never rendered - unit tests and reviews
  passed. Use a module-level bridge (`lib/cart-bridge.ts`) that the provider registers into, not a context
  read from outside the provider's subtree.
- **A tool that feeds ids to another tool must itself return those ids; check every tool-to-tool handoff
  live.** `get_item_options` returned option names without ids, so `propose_add_to_cart` could never receive a
  valid required-option id. Every unit test used hand-written fixtures that already contained ids. Run the
  real model through the whole chain (look up, then propose) before calling a multi-tool flow done.
- **A live browser tap test is mandatory for client-side action cards.** The three Z4a defects (missing ids,
  null cart context, undisclosed cart replacement) all passed 251 unit tests and several review rounds and
  were found only by driving the real UI (Playwright) and a real model. Mobile card taps still need a phone
  check. Never claim a Confirm/Dismiss flow works from tests alone.
- **Cart changes are atomic and proposed, not executed, by the AI.** Use `addItems(...)` for add/replace,
  never `clearCart()` then `addItem()` in one tick (it opens the "clear cart?" modal), and never let a tool
  mutate the cart; the server cannot, because the cart is client state.
- **A per-kind status string hard-coded in a generic helper leaks onto the next card kind.** Z4a's shared
  reply text said "tap Confirm"; the new checkout card's button is "Go to checkout", so Zippy told customers to
  tap a button that did not exist (found only live). When adding an action kind, grep the generic helpers and
  prompt for kind-specific wording (`proposalStatus` now supplies the per-kind text).
- **Parallel tool calls need a re-check after any await.** The model may emit several tool calls in one round
  and they run concurrently (`Promise.all`), so a "one card per reply" guard checked before an await can pass
  twice and produce duplicate cards. Re-check the shared state after the await, before pushing the result.

- **Retention/purge functions are tested inside a rolled-back transaction with fake rows, never against
  real data; a destructive scheduled job needs a dry-run default on its manual trigger.** The Zippy purge
  was verified with `begin; ... rollback;` on fabricated conversations, and its webhook only deletes when
  the body says `{"dryRun": false}`; only the scheduled workflow run is real.

## Standing phrases: "start-all-roles.ps1" / "stop-all-roles.ps1"

When Vishal says **"start-all-roles.ps1"** run `npm run app:start:all-roles`;
when he says **"stop-all-roles.ps1"** run `npm run app:stop -- --all-roles`
(stops everything, not just the web servers). `scripts/start-all-roles.ps1` and
`scripts/stop-all-roles.ps1` are thin wrappers that run exactly those commands.

## Standing phrase: "Reset Data" — NON-NEGOTIABLE

When Vishal says **"Reset Data"**, wipe all customer, order, payment and n8n
execution data from the LOCAL stack, without asking for per-step confirmation
(this phrase is the standing authorization; local dev only — never hosted).
Vendors, delivery partners, the admin, restaurants/menus and n8n workflows and
credentials are KEPT. Supabase and n8n containers must be running; if not, say
so and stop. Steps, in order:

1. **Backup first** (cheap restore point, outside git):
   `docker exec supabase_db_phase1-scaffold-db pg_dump -U postgres -Fc -n public -n auth postgres > "<scratchpad>/pre-reset-<epoch>.dump"`
2. **Customers, orders, payments** — one transaction (`psql -U postgres -v ON_ERROR_STOP=1`):
   ```sql
   begin;
   delete from public.orders;  -- cascades order_items, order_item_options, payments, notifications, reviews
   delete from public.addresses
     where user_id in (select id from public.users where role = 'customer') or user_id is null;
   delete from auth.users
     where id in (select id from public.users where role = 'customer');  -- cascades public.users, carts, sessions
   commit;
   ```
   Do not delete vendor/delivery/admin users, restaurants, or vendor addresses.
3. **n8n executions** (the n8n UI works too; the CLI has no command for this).
   Uses n8n's bundled `sqlite3` while n8n keeps running (`MSYS_NO_PATHCONV=1` in Git Bash):
   ```
   docker exec n8n sh -c 'cd /usr/local/lib/node_modules/n8n && node -e "
   const s=require(\"sqlite3\");const db=new s.Database(\"/home/node/.n8n/database.sqlite\");
   db.serialize(()=>{db.run(\"delete from execution_data\");db.run(\"delete from execution_metadata\");db.run(\"delete from execution_annotations\");db.run(\"delete from execution_entity\");
   db.get(\"select count(*) c from execution_entity\",(e,r)=>{console.log(e||JSON.stringify(r));db.close();});});"'
   ```
   Pending 20-second "Wait" executions are deleted too (their orders are gone anyway).
4. **Verify and report** counts: orders, order_items, payments, notifications, customers
   (public.users role customer and auth.users) all 0; vendors/delivery/admin counts unchanged;
   n8n executions 0. Tell Vishal that browser-side data (localStorage cart/location in each
   browser or app) cannot be cleared from here, and that a fresh customer must sign up.
   There is no wallet table (the Wallet page is a placeholder); payments live in `payments`.

## Standing phrase: "Commit Work" — NON-NEGOTIABLE

When Vishal says **"Commit Work"** in this project, perform these three
steps in sequence, every time, without asking for confirmation on each
individual step (this phrase is the standing pre-authorization for all
three, including the push to `origin`):

1. **Update project memory docs** — `CLAUDE.md`, `MEMORY.md`, `README.md`,
   and `AGENTS.md` if it needs a change given what's being committed (per
   the global "Update CLAUDE files" rule — check each one even if a given
   file turns out to need no change).
2. **Commit** the staged/relevant changes with a clear message describing
   what changed and why (per the global commit-message rules — never
   `--no-verify`, never amend, review `git status`/diff for secrets first).
3. **Push to `origin`** on the current branch.

If step 2's commit would include anything that looks like a secret, or if
`origin` isn't reachable/authorized (as has happened before in this repo —
see `md_version/HANDOFF_2.md` for the collaborator-access issue), stop and
report the problem rather than silently skipping the step.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
