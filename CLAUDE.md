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
actions, PR #9) and Z4b (checkout card, PR #10) are merged (paragraphs below), as are streaming (#12), retention (#13) and rate limits (#14). See MEMORY.md's "Ask Zippy Z1" entry and the spec's Amendments.
**Ask Zippy Z2 (2026-10-03, branch `ask-zippy-z2`, built and live-verified, merged to `main` 2026-10-03):**
Zippy now answers store, menu, price, option and open/closed questions from LIVE data (web and
mobile, same `POST /api/zippy/chat`); it cannot act (cart actions arrived in Z4a); order lookups arrived in Z3 (see the Z3 paragraph). The question is
embedded once and searches the Z1 knowledge AND a catalog index (migration 31, `zippy_catalog_chunks`
+ `match_zippy_catalog`, service-role only; text is names/descriptions/categories/cuisines, never
prices, fees or open status); hits are hydrated live into a `<catalog>` prompt block, then a bounded
Claude tool loop runs on `@anthropic-ai/sdk` (`lib/zippy/agent.ts` + pure `agent-loop.ts`; four
read-only tools in `tools.ts`: `search_catalog`, `find_stores`, `get_store_menu`, `get_item_options`;
data in `catalog.ts` (pure) / `catalog-data.ts`; index sync in `catalog-sync.ts`). Max 4 tool rounds, max 6 tool calls per round (extras get an error result)
(env `ZIPPY_MAX_TOOL_ROUNDS`, 1-6). The answer streams word by word again (see the streaming paragraph after Z4b). Kill
switch: `ZIPPY_TOOLS=off` (no tools, no catalog = Z1 content). Web sends the delivery pin
(`lib/zippy/client-location.ts`: stored pin, or the default pin on `/customer*` only); mobile sends the phone's foreground GPS fix
(`mobile/lib/zippy-location.ts`; permission is asked only when the question is about nearby stores; denied = no location, so "nearest" is unavailable). Rate limits are env-tunable (defaults: signed-in 10/min + 60/day, visitors 5/min + 20/day per IP; see the rate-limit paragraph below). The location is never saved or logged. Keep the index
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
**Ask Zippy Z4a (2026-10-04, branch `ask-zippy-z4a`, built and live-verified; merged to `main` as PR #9):**
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
claimed the app would ask to clear the cart (`0a7c5b3`). Tests: 251 pass. Phone check of card taps passed on Vishal's phone 2026-10-04 (add, double-tap guard, cross-store replace, quantity/remove/clear);
knowledge re-ingested and eval re-run (53/54) after the merges. Deferred minors are listed in MEMORY.md's
"Ask Zippy Z4a" entry. Manuals: web v3.4 (chapter 8), mobile v4.5 (chapter 6), edited in place; no new
screenshot (the mobile card figure needs a new phone recording). Also: Vishal validated "Where is my order?"
on his phone; the Z3 eval was 48/50 after re-ingest and PR #8 replaced one mis-specified fixture (49/50
expected).
**Ask Zippy Z4b (2026-10-04, branch `ask-zippy-z4b`, built and live-verified; merged to `main` as PR #10):**
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
contradiction (both fixed). Phone tap on "Go to checkout" verified on Vishal's phone 2026-10-04 (it opens Checkout; Place order was not tapped).
Re-ingest and eval re-run done (53/54). Later on 2026-10-04 PR #16 reworded the delivery "How do I go online or offline?" answer (it now says "To start getting deliveries, go online") and, after a re-ingest, the eval reached 54/54. See MEMORY.md's "Ask Zippy Z4b"
entry and `docs/superpowers/specs/2026-10-04-ask-zippy-z4b-design.md`. Manuals: web v3.5, mobile v4.6, edited in
place (no page start changed, so the static TOCs were untouched).
**Ask Zippy streaming (2026-10-04, branch `zippy-streaming`, live-verified on web and phone; merged to `main` as PR #12):**
answers appear word by word on web and mobile again, including answers that use live lookups and the cart and
checkout cards. `POST /api/zippy/chat` with `stream: true` (the default) now returns NDJSON, one event per line:
`delta` (answer text), `reset` (discard what streamed so far), `done` (full final `reply`, `conversationId`,
`actions`, always last on success) and `error` (friendly message). `stream: false` still returns one JSON reply.
The old plain-text stream and its header are gone. `runAgentLoop` yields `delta` / `reset` / `final` events, one
streamed model round at a time; a round that streams text and then ends in tool calls emits `reset`, because
that text was only a lead-in. The client replaces its streamed text with `done.reply`, so a lost delta cannot
corrupt the final text. Cards appear when the answer finishes. The assistant message is saved once, at the end;
starting a New chat, opening History, switching account or leaving the page/app mid-answer aborts the model call (through `request.signal`) and saves nothing, but closing the chat panel does not abort: the reply finishes and is saved. Web:
`lib/zippy/stream-events.ts` (pure line parser) and `ZippyWidget`; mobile uses `expo/fetch` with a
byte-identical parser copy under `mobile/lib/` (parity-tested); phone check passed 2026-10-04 (text arrives incrementally). `knowledge/customer/
ask-zippy.md` changed; re-ingest done 2026-10-04. Spec
`docs/superpowers/specs/2026-10-04-zippy-streaming-design.md`. Manuals: web v3.6, mobile v4.7, edited in place
(web Appendix A-D start pages moved by one, so the static TOC was renumbered). See MEMORY.md's "Ask Zippy
streaming" entry.
**Ask Zippy rate limits and abuse guards (2026-10-04, branch `zippy-rate-limits`, merged to `main` as PR #14):**
every limit is an env var with a validated default (`lib/zippy/rate-limit.ts`; bad values fall back to the default,
never off): per user 10/min + 60/day, per visitor IP 5/min + 20/day, global visitors 60/min + 1000/day, global
signed-in users 120/min + 5000/day, an overall ceiling of 8000/day, and a pre-auth burst of 40/min per IP that runs
before the body is read or the token is verified. `ZIPPY_TRUSTED_PROXY_HOPS` (default 1, 0 to 5) says how many
trusted proxies sit in front of the app (`lib/zippy/client-ip.ts`: the client is the `x-forwarded-for` entry that
many positions from the right; 0 ignores the header). Bodies over 200,000 bytes get 413 (`body-cap.ts`). A trip
returns 429 with `Retry-After` and a message by class (minute / day / busy) and logs the class only. Full table,
proxy examples, cost arithmetic and what is NOT covered (sign-up throttling, CAPTCHA, concurrency caps, provider
monthly budgets) are in `docs/DEPLOYMENT.md` "Public deployment checklist"; spec
`docs/superpowers/specs/2026-10-04-zippy-rate-limits-design.md`. Still open before any PUBLIC deployment: set
`ZIPPY_LIMIT_*` and `ZIPPY_TRUSTED_PROXY_HOPS` per `docs/DEPLOYMENT.md` (local use needs no change), set provider-side
monthly budgets in the Anthropic and OpenAI consoles; sign-up throttling/CAPTCHA is not built.
**Zippy chat retention (2026-10-04, branch `zippy-retention`, built and live-verified; merged to `main` as PR #13):**
SQL function `purge_zippy_chats(retention_days, dry_run)` deletes Zippy conversations (messages go by cascade)
whose last activity (newest message, or the conversation's creation time if it has none) is older than the
window (30 days; env `ZIPPY_RETENTION_DAYS` 1..3650, else 30), plus `zippy_usage` rate-limit rows older than
2 days; it touches nothing else and defaults to a dry run. Internal route `POST /api/internal/zippy/purge`
(internal secret). n8n workflow 08 "Zippy Chat Retention" runs the real purge nightly at 03:45; its webhook
`foodhub/zippy-purge` is a DRY RUN unless the body is `{"dryRun": false}`. Orders are not purged. Policy text
and both manuals (web v3.5.1, mobile v4.6.1, PDFs regenerated, page counts unchanged) now say chats are deleted
by a nightly cleanup once they have had no activity for 30 days. The rollout order was: import and publish workflow 08 in the local n8n (never stop or restart the n8n container), run the
dry run (`Invoke-RestMethod -Method Post http://localhost:5678/webhook/foodhub/zippy-purge`), THEN re-ingest `knowledge/`
(so Zippy never states the promise before the job exists). DONE 2026-10-04: migration 32 present, workflow 08 imported and
published, dry run returned `dryRun` true, `retentionDays` 30, 0 rows; knowledge re-ingested (151 chunks). The first real
purge runs from 03:45 Asia/Kolkata.
Scheduled runs happen only while Docker, n8n and the app are up (n8n does not catch up missed runs; the next night's run does the work), and the schedule uses the workflow's timezone setting (`Asia/Kolkata`). See MEMORY.md's
"Zippy chat retention" entry and `docs/n8n-webhook-setup.md` (Workflow 08).
**Ask Zippy Z5 (2026-10-04, branch `zippy-z5`, built; not yet merged):** a signed-in customer with a non-empty cart can ask Zippy to set, replace or clear the cart's order note (the order's delivery note, shown to the store and the delivery partner, at most 500 characters; longer text is refused, not cut; double quotes in the text are shown and saved as single quotes; the text must be the customer's own words, never copied from dishes, stores or orders). It is a card with Confirm; if the cart changed (store changed or emptied) the tap says "Your cart changed, ask me again." Follow-ups in the same branch: cards show option prices like "Spice level: Extra spicy (+₹20)"; a "Try again" button appears when confirming fails with an unexpected error; rate-limit buckets use the IPv6 /64 prefix and an optional `ZIPPY_IP_HASH_SALT`; new brand token `--color-brand-danger-text-safe`; `addItems(replace=false)` clears an open conflict modal in both cart stores; mobile aborts its stream on unmount. Kill switch unchanged (`ZIPPY_ACTIONS=off`). Open items: phone check of the note card; re-ingest `knowledge/` after merge and re-run `node scripts/zippy-eval.mjs`; optionally set `ZIPPY_IP_HASH_SALT`. Manuals: web v3.6.1, mobile v4.7.1 (one bullet each). See MEMORY.md's "Ask Zippy Z5" entry and `docs/superpowers/specs/2026-10-04-zippy-z5-order-note-and-followups-design.md`.
**Local only.** This installation is LOCAL ONLY (Vishal's decision, 2026-10-04). The "Public deployment checklist" in `docs/DEPLOYMENT.md` (limits, proxy hops, provider monthly budgets, sign-up throttling or CAPTCHA, HTTPS/reverse proxy, per-user concurrency caps) is NOT needed today and is kept for the day he decides to go public; going public requires those items first.
**Known issues.** npm audit (2026-10-04): the root has 5 high findings and mobile has 29 (10 moderate, 19 high), all in the dev toolchain (the eslint-config-next chain at the root; the Expo CLI/Metro chain in mobile), from `braces` (every published version, 3.0.3 included, is in the advisory range, so no patched release exists on npm), `node-forge`, `uuid` and `decode-uri-component`. `npm audit --omit=dev` is clean at the root. The only offered fixes are breaking (downgrading eslint-config-next to 14.x, installing expo 44, or an Expo SDK 58 / expo-router 58 upgrade while Vishal's Expo Go is SDK 57), so this is accepted risk on a local-only install, not a missed fix. Re-check after a Next lint-chain update or an Expo SDK upgrade: run `npm audit` in both folders, upgrade eslint-config-next and the Expo SDK together, and test on the phone.
**Google Maps (2026-10-04, merged to `main` as PR #18, branch removed, live-verified with the real key):** web Customer app only, the phone app is unchanged. Three surfaces: the header location picker `components/AddressPicker.tsx` (Places search and "Use my current location" apply at once; dragging or clicking the pin or typing coordinates needs Save; the coordinates box opens by itself if Maps fails), checkout address search plus "Use my pinned location" (fills only the checkout form state, which is not saved), and `components/maps/OrderTrackingMap.tsx` on the order page (shown for assigned, picked_up and delivered; delivered shows a final route with no partner marker; the dashed line is straight and the distance approximate; coordinates shown as text if Maps fails). Helpers in `lib/maps/*.ts`. The key is the public browser key `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env.local`, restricted by Vishal to HTTP referrers (localhost:3000-3003 for now) and to Maps JavaScript, Places (New) and Geocoding; never read or print it. No new npm packages. Markers are classic `google.maps.Marker` because `AdvancedMarkerElement` needs a cloud Map ID. Knowledge Q&As were added to `knowledge/customer/ordering-web.md` (web manual v3.7). Open items: Vishal must add the `localhost:3010` referrer only for the spare-instance tests; re-ingest `knowledge/` after merge and re-run `node scripts/zippy-eval.mjs`; mobile maps are optional later; Directions API road route and ETA are a possible follow-up; before any public launch add the real domain to the referrer list and set quotas and a budget alert (`docs/DEPLOYMENT.md`, "Google Maps key"). See MEMORY.md's "Google Maps" entry.
**Maps road route and ETA (2026-10-04, branch `maps-route`, built and live-verified):** the web order tracking map now draws a solid road route and the text "About N min · X km by road" (partner to address while assigned/picked up; store to address once delivered, distance only). Uses the Maps JavaScript `routes` library (`Route.computeRoutes`, Routes API, driving, `TRAFFIC_UNAWARE`) with the same browser key, so Routes API must be enabled and in the key's API restrictions (done by Vishal 2026-10-04); no server route, no new package. Pure rules in `lib/maps/route.ts` (request only when the origin moved over 150 m and 30 s passed; 60 s back-off after a failure; delivered requests once). On failure the route is removed and the dashed straight line with its footnote returns. Live checks: live and delivered texts matched Google's route; with the Routes request blocked in the browser the stale ETA cleared and the footnote returned. Spec `docs/superpowers/specs/2026-10-04-maps-road-route-eta-design.md`. Knowledge Q&As updated (re-ingest after merge, then `node scripts/zippy-eval.mjs`); web manual v3.8 (new figures: location picker, checkout address search, live and delivered maps, Zippy cart card; screenshots taken with Claude in Chrome). Phone maps and public-launch hardening remain parked.
**Maps in the phone app (2026-10-04, branch `mobile-maps`, built; merge pending):** the Customer order screen shows a `react-native-maps` map (S store, H address, D partner, dashed straight line, "about X km", "Last seen ... may be out of date" after 5 minutes, text fallback if the map fails) via `mobile/components/OrderTrackingMap.tsx`; the pure logic is shared byte-identical (`mobile/lib/tracking.ts`, `geo-math.ts`, `geo.ts`, guarded in `tests/mobile-parity.test.mjs`). No road route or ETA on mobile (a native Routes call would need a separate unrestricted key). `react-native-maps` 1.27.2 added (Expo SDK 57's version). Verified by tests, types, an Opus review (stale-ping memo bug fixed) and the Android emulator for everything except tiles: the emulator's side-loaded Expo Go fails Google's key authorization for package `host.exp.exponent`, so tiles/markers could not be seen there; iPhone (Apple Maps) is Vishal's check. Docs: mobile manual v4.8.1 (section 2.6 explains launching the Android emulator; order-screen figure with the web map area composited in and labelled, Zippy cart-card figure from the Android emulator), web manual sentence, knowledge `ordering-mobile.md`, `ordering-web.md`, `faq/orders-and-delivery.md` (re-ingest after merge). Public-launch hardening was dropped by Vishal on 2026-10-04 (stays local only).
**Phone delivery location (2026-10-05, branch `mobile-location-picker`, built and live-verified on the Android emulator; PR pending):** the Customer phone app now has a real delivery-location picker. The Home pill opens a full-screen "Delivery location" sheet (`mobile/components/LocationSheet.tsx`, `AddressSearchBox.tsx`): 3+ characters show live Google suggestions (Places API (New) over direct REST with the Android key, `mobile/lib/places-api.ts`; choosing one saves and closes), tapping the map or dragging the pin reverse-geocodes to an address label (falls back to coordinates) and needs "Confirm location", and "Use my current location" uses GPS (15 s timeout with a friendly message). The location is stored on the account (migration 33: `users.saved_lat/saved_lng/saved_label`; `app/api/customer/location/route.ts` GET/PUT/DELETE, customers only; `lib/saved-location.ts`) with a device cache and reconcile rules (`mobile/lib/location-store.tsx`, `location-reconcile.ts`), so it survives sign-in and restart and never shows to a different account on the same phone. Home lists restaurants nearest first (`mobile/lib/nearest.ts`). Checkout has "Search for your address" (fills Address 1, City, State; pincode is often blank and must be typed) and "Use my saved location"; the checkout fields themselves are still not saved. The order's lat/lng use the picked point, else the saved pin only if the fields were filled from "Use my saved location", else 0/0 as before. Ask Zippy uses the saved location for "nearby" questions without asking for permission. Decisions (Vishal): call Google directly with the Android key rather than via a server proxy; store on the account; include the pin. Limits: search works only where Google accepts the Android key (the native Android build; Places API (New), Geocoding API and Routes were enabled on that key); unverified on iPhone Expo Go, whose manifest also carries the key and Android headers, so it may or may not work (if search is unavailable the sheet says so and the pin and GPS still work). Open items: Vishal's iPhone Expo Go check; GPS could not be verified on the emulator (the mock fix never arrived, so it timed out); optional release APK for a real Android phone; mobile manual section and figures not written yet; re-ingest `knowledge/` (`ordering-mobile.md` changed) and re-run `node scripts/zippy-eval.mjs`. Spec `docs/superpowers/specs/2026-10-05-mobile-location-picker-design.md`; setup and test steps in `docs/ANDROID_TESTING.md` ("Delivery location and address search").
**Sign-up address and real store addresses (2026-10-05, branch `signup-address-geocoding`, live-verified on web and phone; not merged):** customer sign-up (web `app/customer/login/page.tsx`, phone `mobile/src/app/login/customer.tsx`) now also requires a 10-digit Indian mobile and an address (Address 1, optional Address 2, City, State, 6-digit Pincode). `POST /api/auth/signup` runs `lib/signup-pipeline.ts` (pure, dependencies injected): validate, then geocode with `GOOGLE_MAPS_SERVER_API_KEY` (`lib/geocode-server.ts`, parsing in `lib/geocode-parse.ts`) BEFORE creating the account. Address not found, vague, partial or approximate gives 400 "We could not find that address..."; key missing or provider down gives 503 and no account. On success the address is the default "Home" `addresses` row (migration 34: one default per user) and `users.phone` plus `users.saved_lat/lng/label` hold the starting delivery location; if a later insert fails the auth user is deleted (500). The web location store lets the account's saved location win at sign-in (`lib/location-reconcile.ts`); the phone shows it after first sign-in (pill "Linking Road, Mumbai", feed nearest-first). The server key is a separate Geocoding-API-only key with Application restriction None, never `NEXT_PUBLIC`, never in the browser or phone app. All 77 stores now have real geocoded Mumbai addresses: `scripts/data/mumbai-store-addresses.json` -> `node scripts/geocode-stores.mjs` (Vishal runs it with the key; resumable, `--force` redoes all) -> `supabase/data/store-locations.json` -> `node scripts/apply-store-locations.mjs --apply` (dry run without `--apply`); `npm run app:seed` re-applies it after a reset. Many addresses are well-known landmarks (malls, markets, stations) because invented street numbers came back as partial matches; 2 stores are in Thane. The demo delivery partners were moved to Mumbai. Open items: OrderTrackingMap still shows a distance from a stale partner ping (see the rule below); re-ingest `knowledge/` after merge (`account-and-signin.md` changed) and re-run `node scripts/zippy-eval.mjs`; manuals updated (web v3.13, phone v4.13, text only, no new figures). Verified on Vishal's iPhone 2026-10-08: push banners arrive and tapping opens the order or the Notifications screen; an EAS project id was added to `mobile/app.json` by Vishal (`npx eas-cli init`), which is what lets Expo Go hand out a push token. Spec `docs/superpowers/specs/2026-10-05-signup-address-and-store-geocoding-design.md`. See MEMORY.md's "Sign-up address and store geocoding" entry.
**Close-out 2026-10-05 (PR #22 merged to `main` as `506f25f`, branches removed):** the stale-partner-ping bug is FIXED on web and phone (`isStalePing` in `lib/maps/tracking.ts`, byte-identical `mobile/lib/tracking.ts`: a ping over 5 minutes old shows only "Last seen ... (location may be out of date)", no km/min figure, no Routes request; unit-tested, not driven live). Knowledge re-ingested (160 chunks). Manuals refreshed: web v3.9 (sign-up fields, registration address as delivery location, real store addresses, stale ping; two Claude-in-Chrome figures added later the same day: 3.9a sign-up form with the password-manager icons painted out, 3.1b header showing the registered address; 52 pages, TOC renumbered), mobile v4.9 (sign-up, new section 3.1.1 delivery location sheet, checkout address search, five emulator figures; 38 pages, TOC renumbered). Reset Data was run (orders, customers, Zippy chats, n8n executions all 0; stores, vendors, partners kept). Open: `node scripts/zippy-eval.mjs` after the 2026-10-05 re-ingest (Vishal runs it, it needs `N8N_INTERNAL_SECRET` in his shell); iPhone Expo Go check of the location sheet and sign-up; fresh customers must sign up again (clear browser site data on localhost:3000 to 3003, reinstall Expo Go on the iPhone).
**C3 favorites and reorder (2026-10-07, branch `c3-favorites-reorder`, built, reviewed and live-verified on web in Chrome and on the Android emulator; PR #23, merged into `main` 2026-10-07):** a signed-in customer can heart stores and reorder past orders on web and phone. Table `favorite_stores` (migration 36, service-role only, cascades from `users`); routes `GET /api/customer/favorites`, `PUT`/`DELETE /api/customer/favorites/[storeId]`, `GET /api/customer/reorder-options` (up to 3 most recent distinct stores from orders that are not cancelled/rejected and whose store is not suspended) and `POST /api/customer/orders/[id]/reorder` (rebuilds the lines at TODAY's prices through the shared `buildReorderLines` that Zippy's reorder card also uses; unavailable dishes are skipped and listed; a closed store is refused; another customer's order id is "not found"). Pure model `lib/favorites-model.ts` is shared BYTE-IDENTICAL with `mobile/lib/favorites-model.ts` (guarded by `tests/mobile-parity.test.mjs`). Web: `lib/favorites-store.tsx` (provider in `app/customer/layout.tsx`), `components/FavoriteHeart.tsx` on store cards and the store page, `lib/use-reorder.ts`, Home "Order again" row (closed store shows "Closed right now" and a disabled button), a "Favorites" chip (signed-in only), Reorder buttons on Your orders and on an order (hidden for cancelled/rejected). Phone: `mobile/lib/favorites-store.tsx`, `use-reorder.ts`, hearts on `StoreCard`, the existing Home "Order again" row now reorders in one tap (closed store shows "Closed"), Favorites chip, Reorder on the Orders tab and order detail. Reorder only FILLS THE CART (same store merges quantities; a different store replaces the cart and the message says so); it never places an order. Favorites sync between web and phone because they live on the account. Tests: 489 pass. Final fix wave (same day) fixed: stale cart read after the reorder await (web hook now reads a ref set in an effect), render-time ref lint errors, rollback after an account switch (only touches state the toggling account owns), rapid taps (per-store in-flight guard), heart before the session loads (disabled until `loaded`), Favorites filter staying on after sign-out, grey phone reorder error, and the reorder route's unhandled 500 (now JSON "Could not reorder right now"); verified live on web (one PUT on a double click, reorder fills cart, sign-out clears the filter); phone fixes verified by tsc + eslint only. Still open (deferred minors): Reorder button nested in a Link, Order-again row refreshes only on pull-to-refresh, no toggle-failure toast on the phone, the pre-existing `set-state-in-effect` lint error in `app/customer/stores/[id]/page.tsx`, (the corrupt generated `.next-delivery/` was deleted on 2026-10-07 and the running delivery dev server recreated it, so `tsc` and the build are clean again); full list in `.superpowers/sdd/2026-10-07-c3-favorites-reorder/progress.md`. Post-merge checks, all done 2026-10-07: `knowledge/` re-ingested (170 chunks, 8 re-embedded) and `node scripts/zippy-eval.mjs` 58/58; a real checkout of a reordered cart to an address Vishal owns with admin automatic order acceptance turned ON (`app_settings.auto_order_acceptance` stays true at his request): the order went placed, preparing, picked_up, delivered in about 30 s and the Gmail send nodes of workflows 03 (accepted) and 05 (delivered) both succeeded (two earlier attempts failed for unrelated reasons: the mock-UPI payment failed at random, workflow 02 fails about 20% of non-COD payments, and a COD order stayed at `placed` because auto-acceptance was off); iPhone Expo Go check passed (customer sign-up, hearts that persist, Order again, Reorder). Manuals: web v3.11, mobile v4.11.1 (an "Update Manuals" pass the same day found two stale phone-manual statements that still called the hearts "local-only" and removed them). Spec `docs/superpowers/specs/2026-10-07-c3-favorites-reorder-design.md`, plan `docs/superpowers/plans/2026-10-07-c3-favorites-reorder.md`. See MEMORY.md's "C3 favorites and reorder" entry.
**C1 ratings and reviews (2026-10-07/08, branch `c1-ratings-reviews`, built, reviewed with subagent-driven development, live-verified, merged to `main` by "Commit Work"):** after an order is `delivered` its customer can review it ONCE (no edit or delete): store stars + comment (1000 chars) + one optional photo (JPEG/PNG/WebP, 3 MB), optional per-dish stars + comment (500) and optional delivery-partner stars + comment (500), on web and phone. Migration 37 (`reviews` gains status/hidden_*/photo_path/vendor_reply*/reported_*; new `review_dishes`, `review_partner`; integer aggregates `rating_sum`/`rating_count` on `stores`, `products`, `delivery_partners`; `stores.seed_rating` so a store with no visible review keeps its seeded rating; `reviews.customer_id` is nullable `on delete set null`; SECURITY DEFINER `create_review` and `recompute_*` helpers, status and delete triggers; private bucket `review-photos`, also declared in `supabase/config.toml`). All three review tables have RLS on and NO policies (service-role only). Routes: customer `GET/POST /api/customer/orders/[id]/review` (JSON or multipart), `POST /api/customer/reviews/[id]/report`; public `GET /api/stores/[id]/reviews|rating`; photos served by `GET /api/reviews/[id]/photo` (visible reviews only; admin gets signed URLs); vendor `/api/vendor/reviews` (list, `[id]/reply` PUT/DELETE, `[id]/report`); `GET /api/delivery/rating`; admin `/api/admin/reviews` + `[id]/hide|unhide|dismiss-report`; internal `GET /api/internal/orders/[id]/review-eligibility` (n8n). Pure shared model `lib/reviews-model.ts` (byte-identical `mobile/lib/reviews-model.ts`, parity-tested), `lib/review-photo.ts`, `lib/review-errors.ts`, `lib/review-eligibility.ts`, `lib/review-moderation.ts`, `lib/review-request-email.ts` import nothing at runtime. Reviewer shown as first name + last initial; customers see a partner's score only after 5 ratings ("New partner" before); vendors reply/report but cannot hide; admin hides (reason required) / unhides / dismisses reports and the partners page shows a Rating column and a "Low score" badge (< 3.0 with 5+ ratings). n8n workflow 05 has a new branch: Wait 1 h, `review-eligibility`, IF, Gmail "Rate your order" email (LIVE once published). Phone photo upload needs `expo-image-picker` (added, `~57.0.20`) and an Expo-SDK-57-specific multipart workaround (base64 + `{name,type,bytes()}` form part, type sniffed from the bytes). Tests 531 pass; Zippy knowledge Q&As added (70-case eval fixture; re-ingest + `node scripts/zippy-eval.mjs` is Vishal's step, needs `N8N_INTERNAL_SECRET`); manuals web v3.12 (60 pages), phone v4.12 (45 pages). Live-verified: all four web roles in Chrome, phone customer + partner on the Android emulator, Vishal's iPhone (HEIC/PNG/large photo, one-tap submit, partner line, store reviews), and a real n8n run (execution 780: delivered + review-request emails both sent). Not driven live: the Report button click on web/phone with a second customer (API checked by curl), Load more in the UIs. Open/deferred minors are in `.superpowers/sdd/2026-10-07-c1-ratings-reviews/progress.md` (git-ignored). One real review (id `4ed0e4c3...`) from Vishal's iPhone check exists on his account. Migration tracker drift (33-37 applied by `psql`) was repaired 2026-10-08 with `npx supabase migration repair --local --status applied 00000000000033 ... 00000000000037`. Spec `docs/superpowers/specs/2026-10-07-c1-ratings-reviews-design.md`, plan `docs/superpowers/plans/2026-10-07-c1-ratings-reviews.md`. See MEMORY.md's "C1 ratings and reviews" entry.
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
**Android (2026-10-04):** Android Studio was installed via winget and an Android emulator set up on this PC (SDK in `%LOCALAPPDATA%\Android\Sdk`, device `Pixel_API_35`, Expo Go 57.0.9; start it with `.\scripts\start-emulator.ps1` from PowerShell (it starts the emulator, then centres and resizes its window because the emulator opens off-screen at 2136 px tall on this 3840x2052 usable area and ignores its saved position; `-OpenApp` also opens the app once the phone has booted; stop it with `.\scripts\stop-emulator.ps1`), open the app with `adb shell am start -a android.intent.action.VIEW -d "exp://10.0.2.2:8081"`). The customer app was walked through on it: sign-in, home feed, Zippy chat with incremental streaming, the add-to-cart Confirm card, the Go to checkout card (opens Checkout; Place order was not tapped) and the hardware Back button all work. Fixed in the same branch: the white strip above the Zippy chat header on Android (statusBarTranslucent plus the header carrying the top inset, light status bar icons) and keyboard-aware customer/delivery login and sign-up screens and checkout (KeyboardAvoidingView plus ScrollView with keyboardShouldPersistTaps). Not verifiable on the emulator: a docked on-screen keyboard (its Gboard floats because a hardware keyboard is attached), so confirm login with the keyboard on a real Android phone. Left for a standalone build: app.json android.package/permissions and a branded adaptive icon. Checklist for a real Android phone: docs/ANDROID_TESTING.md.
- **A third-party SDK integration is not verified by unit tests or tsc: drive it in a real browser with the real key before calling it done.** The Maps work passed 386 tests and clean type-checks yet crashed the order page twice in the first live run (the classic Marker is in the `marker` library and LatLngBounds/SymbolPath in `core`, not in `maps`), and two Google APIs (Places API (New), Geocoding) were simply not enabled on the key. Wrap every map surface in an error boundary plus try/catch with a text fallback so a map problem can never take a page down.
- **Adding a field to a shared model (for example order coordinates in `OrderDetail`) needs a redaction review of EVERY role-scoped route that spreads that model.** The new delivery-address coordinates would have reached delivery partners for orders that are not theirs through the service-role `/api/delivery/active` (available) and `/history` routes; `redactForDelivery` copies the whole order and only blanks named fields. Prefer allow-lists over spreads, and add a redaction test for each scope.

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
  Since C1, workflow 05 also sends a SECOND live email (the review request, "Rate your order") one hour
  after every delivered order that has no review, to the order's `recipient_email`; its Gmail node is
  one more node to switch off. The Gmail OAuth credential can also expire ("Access could not be
  refreshed ... reconnect the credential"): that fails the whole execution, so reconnect it in n8n.

- **Every new capability that spends money or calls a provider needs an abuse-gap audit before the app is
  exposed publicly:** check the limits for a global bucket for EVERY identity class (a per-user limit alone is
  unbounded when sign-up is public), a cheap pre-auth check, proxy trust (how the client IP is derived and what
  happens with the wrong number of proxies), and a request body cap. The Zippy limits had per-user buckets but no
  signed-in global bucket, no overall ceiling, a hard-wired IP rule and no body cap until this audit.
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
  retention wording (as of 2026-10-04 Zippy chats ARE purged by a nightly retention job once they have had no activity
  for 30 days, see "Zippy chat retention"; orders are NOT purged and are deleted only on request). Both manuals gained an Ask Zippy chapter on 2026-10-03
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

- **A streaming model round that ends in tool calls needs a `reset` event for its preamble.** The model often
  writes a lead-in ("Let me check...") before calling a tool; streamed live, that text would stay in the
  customer's bubble in front of the real answer. Emit `reset` when such a round ends, and always let the
  `done` event's full text replace whatever streamed, so the stream is never the source of truth.
- **A Node/Next route handler that streams a model response needs an abort path.** Wire `request.signal` to
  the model stream (and stop writing to the response once it aborts), or a closed tab keeps a paid model call
  running and may still save a partial answer. Save the assistant message once, from the final text only.
- **React Native's global `fetch` does not expose a streaming body.** Use `import { fetch } from "expo/fetch"`
  for the streaming call only (Expo SDK 57); keep the parser shared byte-for-byte with web and guard it with a
  parity test. A streaming client also needs a non-streaming fallback path.
- **Retention/purge functions are tested inside a rolled-back transaction with fake rows, never against
  real data; a destructive scheduled job needs a dry-run default on its manual trigger.** The Zippy purge
  was verified with `begin; ... rollback;` on fabricated conversations, and its webhook only deletes when
  the body says `{"dryRun": false}`; only the scheduled workflow run is real.

## Standing phrases: "start-all-roles.ps1" / "stop-all-roles.ps1"

When Vishal says **"start-all-roles.ps1"** run `.\scripts\start-all-roles.ps1`
(since 2026-10-08 it first starts the Cloudflare tunnel with `node scripts/tunnel-start.mjs --no-restart`,
then runs `npm run app:start:all-roles`; if the tunnel cannot start it warns and starts the app anyway);
when he says **"stop-all-roles.ps1"** run `.\scripts\stop-all-roles.ps1`
(`npm run app:stop -- --all-roles`, which stops everything, then `node scripts/tunnel-stop.mjs --no-restart`,
which stops the tunnel and restores `.env.local`). Running only `npm run app:start:all-roles` skips the tunnel.

## Standing phrase: "Reset Data" — NON-NEGOTIABLE

When Vishal says **"Reset Data"**, wipe ALL customer-created data: customers and their
accounts, saved locations, addresses and carts, favorites (C3), orders, order items, payments,
notifications, reviews with their dish and delivery-partner ratings, vendor replies, reports and
moderation state, review photos (C1), Ask Zippy chat history (every role's, plus the rate-limit
counters) and n8n execution data (including pending review-request and delivery Waits) from the
LOCAL stack, and reset every rating aggregate derived from them, without asking for per-step
confirmation (this phrase is the standing authorization; local dev only — never hosted).
Vendors, delivery partners (their accounts, status and location), the admin, stores/menus (their
seeded ratings are restored), the Zippy knowledge and catalog indexes (`zippy_chunks`,
`zippy_catalog_chunks`), `app_settings` and n8n workflows and credentials are KEPT.
When a later feature adds customer-created data (a table, a Storage bucket, a column that stores
customer activity), extending this rule is part of finishing that feature. Supabase and n8n containers must be running; if not, say
so and stop. Steps, in order:

1. **Backup first** (cheap restore point, outside git):
   `docker exec supabase_db_phase1-scaffold-db pg_dump -U postgres -Fc -n public -n auth postgres > "<scratchpad>/pre-reset-<epoch>.dump"`
2. **Customers, orders, payments, favorites, reviews** — one transaction (`psql -U postgres -v ON_ERROR_STOP=1`):
   ```sql
   begin;
   delete from public.reviews;          -- C1; cascades review_dishes and review_partner (explicit, not only via orders)
   delete from public.favorite_stores;  -- C3 (also cascades from users)
   delete from public.coupon_redemptions;  -- C2 (coupon DEFINITIONS in public.coupons are catalogue data and are KEPT)
   delete from public.wallet_ledger;       -- C2 wallet credit, referral rewards
   delete from public.referrals;           -- C2 (users.referral_code goes with the deleted customers)
   delete from public.carts;            -- all roles' carts (customers' cascade from users, but vendor/delivery/admin accounts can hold carts too)
   delete from public.orders;  -- cascades order_items, order_item_options, payments, notifications, reviews
   delete from public.addresses
     where user_id in (select id from public.users where role = 'customer') or user_id is null;
   delete from auth.users
     where id in (select id from public.users where role = 'customer');  -- cascades public.users (incl. saved location), carts, favorites, sessions
   -- Rating aggregates derived from reviews. The delete triggers already do this; this is the safety net.
   update public.stores set rating_sum = 0, rating_count = 0, rating = coalesce(seed_rating, rating);
   update public.products set rating_sum = 0, rating_count = 0;
   update public.delivery_partners set rating_sum = 0, rating_count = 0;
   commit;
   ```
   Do not delete vendor/delivery/admin users, restaurants, or vendor addresses.
   **Review photos (C1)** are FILES in the private `review-photos` Storage bucket; SQL deletes do not
   remove them. Right after the transaction run `node scripts/purge-review-photos.mjs --dry-run`, then
   `node scripts/purge-review-photos.mjs` (Storage API; local stack only), and confirm `0 object(s)`.
3. **Ask Zippy chats and counters** (all roles, not just customers: chats of vendors,
   delivery partners and the admin survive step 2) — one transaction:
   ```sql
   begin;
   delete from public.user_notifications;      -- C4 inbox of EVERY role (vendors and partners too)
   delete from public.device_tokens;           -- C4 push tokens, all roles
   delete from public.notification_preferences; -- C4 settings, all roles
   delete from public.zippy_conversations;  -- cascades zippy_messages
   delete from public.zippy_usage;           -- rate-limit counters
   commit;
   ```
   Never touch `zippy_chunks` or `zippy_catalog_chunks` (re-ingesting them costs API calls).
4. **n8n executions** (the n8n UI works too; the CLI has no command for this).
   Uses n8n's bundled `sqlite3` while n8n keeps running (`MSYS_NO_PATHCONV=1` in Git Bash):
   ```
   docker exec n8n sh -c 'cd /usr/local/lib/node_modules/n8n && node -e "
   const s=require(\"sqlite3\");const db=new s.Database(\"/home/node/.n8n/database.sqlite\");
   db.serialize(()=>{db.run(\"delete from execution_data\");db.run(\"delete from execution_metadata\");db.run(\"delete from execution_annotations\");db.run(\"delete from execution_entity\");
   db.get(\"select count(*) c from execution_entity\",(e,r)=>{console.log(e||JSON.stringify(r));db.close();});});"'
   ```
   Pending 20-second delivery-fallback Waits and pending 1-hour review-request Waits are deleted too (their orders are gone anyway).
5. **Android emulator app data** (cart, delivery location and session saved in Expo Go
   on the emulator): if `adb devices` lists an emulator, run
   `adb shell pm clear host.exp.exponent` (adb is `$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe`)
   and expect `Success`. If no emulator is running, do not boot one for this; report that it
   was skipped and that Vishal can run the command whenever the emulator is next started.
6. **Verify and report** counts: orders, order_items, payments, notifications, customers
   (public.users role customer and auth.users), carts (all roles), favorite_stores, reviews, review_dishes,
   review_partner, coupon_redemptions, wallet_ledger, referrals, user_notifications, device_tokens, notification_preferences (all 0; `coupons` definitions unchanged), customer addresses (user_id is null or a customer), zippy_conversations,
   zippy_messages and zippy_usage all 0; objects in the `review-photos` bucket 0 (`select count(*) from
   storage.objects where bucket_id = 'review-photos'`, and the purge script's own count);
   `stores` with `rating_count <> 0` or `rating <> seed_rating` 0, `products` and `delivery_partners`
   with `rating_count <> 0` 0; zippy_chunks and zippy_catalog_chunks unchanged; vendors/delivery/admin
   counts unchanged; n8n executions 0. Tell Vishal that browser-side data (localStorage cart/location in each
   browser or app) cannot be cleared from here, and that a fresh customer must sign up.
   How he clears it: web, F12 > Application > Clear site data on each of
   localhost:3000 to 3003 (or the console: `localStorage.clear(); sessionStorage.clear()`);
   iPhone Expo Go, delete and reinstall Expo Go (the Android emulator is cleared by step 5).
   There is no wallet table (the Wallet page is a placeholder); payments live in `payments`.
   Favorites and reviews live on the account/server, so they need no browser or phone clean-up.

## Standing phrase: "Commit Work" — NON-NEGOTIABLE

When Vishal says **"Commit Work"** in this project, perform these steps in
sequence, every time, without asking for confirmation on each individual
step (this phrase is the standing pre-authorization for all of them,
including the push to `origin` and the merge into and push of `main`;
set by Vishal on 2026-10-07):

1. **Update project memory docs** — `CLAUDE.md`, `MEMORY.md`, `README.md`
   and `AGENTS.md` with the latest changes (per the global "Update CLAUDE
   files" rule — check each one every time and say in the report whether
   it needed a change, even if it turns out to need none; also any other
   standing project-memory doc the project has, such as `rules.md` if it
   exists).
2. **Commit** the staged/relevant changes with a clear message describing
   what changed and why (per the global commit-message rules — never
   `--no-verify`, never amend, review `git status`/diff for secrets first).
3. **Push the current branch to `origin`.**
4. **Pull and merge to `main`:** `git checkout main`, `git pull origin main`
   (fast-forward or merge, no rebase of published history), then
   `git merge <branch>` (fast-forward when possible). Run the full test
   suite (`node --test tests/*.test.mjs`) on the merged result.
5. **Push `main` to `origin`** once the merged result is green.

If already on `main`, steps 3 and 4 collapse to `git pull origin main`
before committing, then push `main` (step 5).

Stop and report (never force, never `--no-verify`, never `git reset --hard`,
never delete the branch) when: the commit would include anything that looks
like a secret; `origin` isn't reachable/authorized (as has happened before in
this repo — see `md_version/HANDOFF_2.md` for the collaborator-access issue);
the tests fail on the merged result (leave the merge local and unpushed and
show the failure); or the merge hits a conflict in anything other than
documentation files. A conflict limited to the memory docs themselves
(`CLAUDE.md`, `MEMORY.md`, `README.md`, `AGENTS.md`) may be resolved by keeping
both sides' content; resolve it, say exactly what was merged, and continue.
Keep the feature branch after merging (an open PR may still need it).

## Standing phrase: "Update Manuals" — NON-NEGOTIABLE

When Vishal says **"Update Manuals"**, bring EVERY user manual in `docs/` up to
date with what has changed since they were last refreshed (set by Vishal on
2026-10-07). Today that means `docs/User_Manual.docx` (web) and
`docs/Mobile_App_User_Manual.docx` (phone) plus their `.pdf` exports; any other
`docs/*User_Manual*.docx` added later is included automatically (list
`docs/*User_Manual*` first instead of assuming these two). `Usage_Guide.docx`,
`UserList.docx` and `n8n-workflow-setup-guide.docx` are not user manuals and are
left alone unless Vishal names them. Procedure:

1. **Find what changed:** compare the manuals' current version label and content
   with `git log`, `MEMORY.md` and the knowledge files since the last
   manuals commit; verify each described behaviour against the code (the manuals
   are fact-checked like `knowledge/`, never written from memory).
2. **Edit in place with python-docx**, never by re-running the old `build.js`;
   bump the version label the way earlier edits did; renumber the hand-typed
   static TOC after every edit (convert to PDF with
   `C:\Program Files\LibreOffice\program\soffice.exe --headless --convert-to pdf`,
   read each chapter's start page, replace the whole text after the tab in each
   TOC line — some lines split the page number across two runs); regenerate the
   `.pdf` of every manual you touched and confirm the TOC matches. See the
   "Update `docs/User_Manual.docx` / `Mobile_App_User_Manual.docx` by editing the
   existing file in place" rule and MEMORY.md's "Manuals refreshed" entry.
3. **Screenshots, when a change needs a new or replaced figure — browser order is
   fixed:** use **Claude in Chrome** first (`mcp__claude-in-chrome__*`; load the
   tools with one ToolSearch call, call `tabs_context_mcp` first, work in a NEW
   tab, avoid JS dialogs). Switch to **Playwright** (`mcp__plugin_playwright_*`)
   only if Claude in Chrome cannot connect or keeps failing (2-3 attempts), and say
   in the report that you fell back and why. Web figures come from a production
   build (`npx next build` then `npx next start -p 3000`; never `next dev`, so no
   dev badge), phone figures from the Android emulator (`docs/ANDROID_TESTING.md`).
   Do NOT start n8n or `npm run app:start` for screenshots (the Gmail workflows
   send real email). Use throwaway test data only; blur or mosaic any real
   personal data (emails, phone numbers, addresses) and delete the throwaway
   rows when finished.
4. Report which manuals changed, the new version labels, page counts, and the
   screenshots added or replaced. Committing the result is a separate step
   ("Commit Work").

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- **A geocoder "OK" is not proof of a real address, and the Geocoding web service rejects browser- or Android-restricted keys.** Gibberish street names still returned OK with the pincode centroid (found only by live testing a nonsense address), so `parseGeocodeResponse` accepts only a result that is not `partial_match`, not `APPROXIMATE`, and has a precise type (street_address, route, premise, establishment and similar; not postal_code alone). The server key must have Application restriction None (limit it by API, Geocoding only); a referrer- or Android-restricted key returns REQUEST_DENIED "API keys with referer restrictions cannot be used with this API", and key changes take a few minutes to propagate. Seeding invented street numbers gave partial matches, so store addresses use real landmarks.
- **Never trust a partner's stored location without its age.** The "12,579 km" distance on one order was the delivery partner's stale ping from New Jersey, not a customer problem. OPEN: `OrderTrackingMap` still shows a km figure from a stale partner ping; a ping older than 5 minutes should show no distance (the mobile map already says "Last seen ... may be out of date").
- **Test orders that sit in `picked_up` on the customer order page complete themselves.** Opening the page starts the 15 s delivery animation, whose end calls `complete-delivery`; that sets `delivered` and fires the n8n delivered trigger and the live Gmail node even if the order was inserted by SQL with replica role. For map tests insert the order as `assigned` (no animation), or block the `complete-delivery` request in the browser.
- **Never hand-copy validation into the phone app: share a byte-identical copy and parity-test it.** The phone sign-up pincode check was a retyped regex missing its backslash (`/^d{6}$/`), so every pincode failed while the web version worked. `mobile/lib/signup-validation.ts` is now a guarded copy of `lib/signup-validation.ts`.
- **Delivery-partner location is clamped to Mumbai (Vishal's rule, 2026-10-05).** `POST /api/delivery/ping` stores a reported point only inside the Mumbai box (`lib/mumbai-region.ts`); otherwise it keeps the stored Mumbai point or a Dadar default, so testing from another country never moves a partner or zooms the order map to the whole world. Customer location is the registration address.
- **Address geocoding retries simpler forms before saying "not found"** (`buildFallbackAddresses` in `lib/geocode-parse.ts`: no line 2, unit details stripped, landmark only), each needing a precise result in the typed pincode. Not yet verified live with the real server key.
- **Automatic order acceptance (demo mode, 2026-10-06).** Admin Overview checkbox backed by `app_settings` (migration 35) and n8n workflow 09; see MEMORY.md's "Automatic order acceptance" entry. Importing a workflow JSON via the n8n CLI needs a top-level `id`; `n8n publish:workflow` does not take effect until a restart, so publish in the n8n UI (signed-in browser) and republish after every re-import; never restart the `--rm` n8n container. An n8n Wait of N s gives gaps of about N+1 to N+2 s after webhook delay, so tune by measuring, not by the number.

- **C3 lessons (2026-10-07).** The repo's react-hooks lint (`set-state-in-effect`) rejects "reset state in an effect", so the favorites providers and the Home reorder options store data tagged with its owner user id and derive the visible value (`owner === userId ? data : empty`), which also stops an account switch from showing the previous account's hearts. A heart or button nested inside a `<Link>` needs `preventDefault()` plus `stopPropagation()` or the tap also navigates. Reading `cart` after an `await` in a hook is a stale closure: read it from a ref. The generated `.next-delivery/` (the delivery role's dev dist dir) was corrupt and broke `npx tsc --noEmit` (10 errors) and `npm run build`; it was deleted with Vishal's approval on 2026-10-07 and the running delivery dev server recreated it. Before stopping or rebuilding anything on ports 3000-3003, check what owns the port: a subagent killed the customer all-roles dev server on :3000 and the iPhone sign-up failed with "Could not reach the server" until it was restarted with the project helper (`startBackgroundService` and `set NEXT_ROLE_DIST_DIR=.next-customer&& npm run dev -- -p 3000`); the phone reaches the web app at the PC's LAN address on port 3000.

- **C2 coupons, wallet and referrals + C4 notifications (2026-10-08, branch `c2-c4-coupons-notifications`, built and API-verified live; not merged):** specs `docs/superpowers/specs/2026-10-08-c2-coupons-referral-design.md` (R1-R15 rulings) and `2026-10-08-c4-notifications-design.md`. Migrations 38 (coupons, coupon_redemptions, wallet_ledger, referrals, `users.referral_code`, `orders.discount/credit_used/coupon_code`, constraint `total = subtotal + delivery_fee - discount - credit_used`, `coupon_check` rule engine, new `checkout_place_order(... p_coupon_code, p_use_credit)` that locks coupon row then customer row, triggers for release-on-cancel and the Rs 50/Rs 50 referral reward on the referred customer's first delivered order of subtotal >= Rs 100), 39 (`user_notifications`, `notification_preferences`, `device_tokens`, `inbox_add`, order triggers that fill inboxes for customer/vendor/partner), 40 (trigger posting every new inbox row to n8n workflow 10 `foodhub/notify-dispatch`, which calls `POST /api/internal/notifications/dispatch` to send Expo push; SMS/WhatsApp via Twilio are built but OFF unless `NOTIFY_SMS`/`NOTIFY_WHATSAPP` + Twilio env vars). Pure shared models `lib/coupon-model.ts`, `lib/notify-model.ts` (byte-identical in `mobile/lib/`). Rolled-back SQL tests `supabase/tests/c2_coupons.sql`, `c4_notifications.sql`; a scratch live matrix proved role gates, caps, release, concurrency (two simultaneous checkouts on a 1-use coupon: exactly one wins) and the inbox API. `expo-notifications ~57.0.22` was added to `mobile/`. Open: workflow 10 must be imported and published in n8n by Vishal (until then inbox rows exist but push is not sent); phone checkout/wallet screens were walked by Vishal on his iPhone, the inbox and push were confirmed; push on Android Expo Go is not possible and iPhone Expo Go needs an EAS projectId for a token; knowledge re-ingest + eval; manuals not updated.
- **C1 lessons (2026-10-08).** (1) A `FOR UPDATE` row lock in an aggregate helper deadlocks with the `FOR KEY SHARE` that a child-row insert takes through its foreign key (two concurrent reviews of one store): use `FOR NO KEY UPDATE`, and test concurrency with two real psql sessions, because a single-order double-submit test serialises on the order row and never shows it. (2) A deleted parent must recompute aggregates too: cascades and `Reset Data` delete reviews without touching `UPDATE OF status` triggers, so add AFTER DELETE triggers on every table the aggregate reads. (3) Expo SDK 57 `fetch` rejects a `{uri,name,type}` multipart part and cannot read `file://` picker files; the picker also re-encodes the image when `quality` is set (a PNG comes back as JPEG bytes), so send base64 and let the SERVER sniff the type. (4) A Postgres `text` column rejects NUL bytes and lone UTF-16 surrogates with an error that surfaces as a 500: validate both in the shared comment cleaner. (5) A signed Storage URL embeds the server's `127.0.0.1` host, which a phone cannot reach: serve user media through an app route that checks visibility at request time. (6) The permission classifier blocks an agent's own fixture `UPDATE` statements sometimes; the agent must report that check as not done instead of working around it. (7) A throwaway-fixture live check should create its own store/vendor/partner rather than editing an existing row's owner.

- **Duplicate product photos (2026-10-08).** Study in `docs/DuplicateImages.docx`: all 17 restaurants and 9 grocery/alcohol stores repeat photos inside a store (cause: menu expansion enforced unique names, not photos). Fix in progress and NOT yet applied: Vishal reviews `docs/DishPhotoReview_Pilot.xlsx` (Approve/Reject column), then apply only approved rows to the DB and `seed.sql`, repeat for the other stores, then add a test that fails on two products in a store sharing an `image_url`. Rule for any future content task: check photo uniqueness per store and that the photo shows the dish, not just the name. Also: `mobile/lib/push.ts` skips push on Android Expo Go (no remote push there since SDK 53). See MEMORY.md.

- **Cloudflare named tunnel (2026-10-08, fixed public URLs, not exposed beyond testing).** Domain `demoaiprojects.com` (Cloudflare Free plan, DNS on Cloudflare); one named tunnel `fresh-and-quick` routes `https://freshquick.demoaiprojects.com` to `http://host.docker.internal:3000` and `https://freshquick-db.demoaiprojects.com` to `http://host.docker.internal:54321` (Supabase). `scripts/startCloudFareTunnel.ps1` / `stopCloudFareTunnel.ps1` (helpers `tunnel-start.mjs`, `tunnel-stop.mjs`, `lib/tunnel.mjs`) run ONE detached container `fq-tunnel` (`docker run -d --rm`, survives closing VS Code) with the token passed as the `TUNNEL_TOKEN` environment variable from `CLOUDFLARE_TUNNEL_TOKEN` in `.env.local` (never on the command line, never printed, never committed). Start also sets `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` to the db hostname and restarts the dev server on port 3000 (saved original in git-ignored `.dev-logs/tunnel-state.json`, falls back to `http://127.0.0.1:54321` if the saved value is itself a tunnel URL); stop restores it. `start-all-roles.ps1` / `stop-all-roles.ps1` include the tunnel (`--no-restart`). Works with the DEV server only (NEXT_PUBLIC values are fixed at start). Earlier random `trycloudflare.com` quick tunnels were only a test.
- **Tunnel lessons (2026-10-08).** (1) The browser calls Supabase directly through `NEXT_PUBLIC_SUPABASE_URL`, so a tunnel for the web app alone gives "Failed to fetch" for anyone off the PC; Supabase (54321) needs its own hostname. `lib/supabase-server.ts` reads the same variable, so server calls also go through the tunnel while it is set. (2) `next dev` blocks other hostnames' dev resources: `allowedDevOrigins` in `next.config.ts` lists `*.trycloudflare.com` and `*.demoaiprojects.com`; without it the page hangs on "Loading restaurants..." (the block is only in the dev log). (3) The Google browser key must list `https://freshquick.demoaiprojects.com/*` among its HTTP referrers (plus localhost 3000-3003); the SERVER geocoding key must stay Application restriction None or sign-up shows "Address lookup is unavailable" (503). Sign-up geocoding runs on the server, so the visitor's country is irrelevant. (4) A Cloudflare route's Service URL needs the protocol (`http://host.docker.internal:3000`); there is no separate type field. (5) The named-tunnel setup page keeps Continue disabled until a connector runs (run the shown docker command once). (6) A script that edits `.env.local` must not trust the value it finds: a previous interrupted run had left a dead tunnel URL there, which would have been "restored" later. (7) Public exposure while the tunnel runs: the public-launch hardening in `docs/DEPLOYMENT.md` is still NOT done (local-only decision stands); remove the tunnel when not testing.

- **Customer registration approval, piece 1 (2026-10-08/09, branch `registration-approval`, web and backend; phone is pieces 2 and 3).** A customer sign-up no longer logs in: `POST /api/auth/signup` creates a pending, banned (`ban_duration` 876000h) Auth account and returns `200 {status:"pending"}`; the web shows a popup ("Your registration approval is in progress. We will email you once the admin has reviewed it."). Migration 41 adds `users.approval_status` (pending/approved/rejected, existing rows approved), decision fields and the status/decision/list SQL functions; admin routes `/api/admin/registrations` (list, summary, `[id]/approve`, `[id]/reject` with a reason of 1 to 500 characters), an admin Registrations page with a sidebar badge and Overview tile; `POST /api/auth/registration-status` tells the login page pending/rejected/none (never the reason; rate limit env `REGISTRATION_STATUS_LIMIT_PER_MINUTE`, default 20); a rejected email may register again (`app/api/auth/signup/route.ts` `reRegister`: guarded flip to pending first, revert on failure). Customer routes and Zippy refuse non-approved accounts; Zippy now requires sign-in (visitors get 401 `login_required` and a popup). n8n workflow 11 (`foodhub/registration-event`, 3 s Wait, then `GET /api/internal/registrations/:id/email`) emails the admin account's email on a new registration and the customer on each decision; links use `PUBLIC_APP_URL` and render only for https or localhost. Spec `docs/superpowers/specs/2026-10-08-registration-approval-design.md`, plan `docs/superpowers/plans/2026-10-08-registration-approval.md`. Web manual v3.14. The phone app got its half in piece 2 (next bullet).
- **Registration approval lessons (2026-10-09).** (1) GoTrue's ban is the real gate (`user_banned`, "User is banned"); approving by hand in SQL leaves the ban, so approvals must go through the admin route (it heals a stuck ban on a repeat click). (2) The server geocoding key must have Application restriction None: the live check returned `REQUEST_DENIED: API keys with referer restrictions cannot be used with this API` after the tunnel referrer edit hit the wrong key. (3) An n8n workflow calls the app on port 3000 only, so a route that exists on a feature branch is unreachable for it until the branch is merged into the main checkout the dev server runs. (4) The admin account's email is `admin@foodhub.local`, so the "new registration" email bounces into Vishal's inbox unless the admin email is temporarily swapped for one he owns. (5) A scripted multi-line text replacement can leave literal newlines inside JS string literals; run the test file, not just `tsc`, after one.

- **Customer registration approval, piece 2 (2026-10-09, branch `approval-phone`, phone customer app).** The phone now follows piece 1: sign-up shows a modal with `REGISTRATION_PENDING_POPUP` and does not sign in (OK clears the form and returns to Log in); a refused login (GoTrue "banned" error) asks `POST /api/auth/registration-status` (`mobile/lib/registration-status.ts`) and shows the pending, rejected or "not active yet" text through the shared `resolveLoginErrorText` / `parseStatusAnswer` (added to `lib/registration-model.ts`, used by the web login page too); other errors such as a wrong password keep GoTrue's own text; the Ask Zippy button checks the session at tap time and a signed-out user gets a popup with `ZIPPY_LOGIN_REQUIRED_MESSAGE` (Close, "Register or log in" to `/login/customer`); a 401 `login_required` mid-chat does the same. `lib/registration-model.ts` and `lib/zippy-gate.ts` are byte-identical in `mobile/lib/` (parity-tested). No backend change. Verified live on the Android emulator (second Metro from the worktree on 8082): signed-out Zippy popup, pending and rejected messages, sign-up popup including re-register of a rejected email, wrong password text, approved login to Home, signed-in chat opens. Not driven: the mid-chat 401 path and Vishal's iPhone. Spec `docs/superpowers/specs/2026-10-09-registration-approval-phone-design.md`, plan `docs/superpowers/plans/2026-10-09-registration-approval-phone.md`. Phone manual v4.14; `knowledge/customer/account-and-signin.md` fixed (re-ingest, then `node scripts/zippy-eval.mjs`, are Vishal's steps). Piece 3 (phone admin area) is the next bullet.
- **Piece 2 lessons (2026-10-09).** (1) In the emulator, Android Back with no keyboard open leaves the app: fill long forms with adb `input text` plus `keyevent 61` (Tab) between fields, not Back. (2) The main Metro on 8081 serves the main checkout, so a branch needs its own Metro (`npx expo start --port 8082` from the worktree `mobile/`, with a copy of the git-ignored `mobile/.env`) opened by `exp://10.0.2.2:8082`. (3) Put a decision that both web and phone need into the shared pure model (`resolveLoginErrorText`) instead of a phone-only helper, because tests cannot import phone files with extensionless runtime imports.
- **Customer registration approval, piece 3 (2026-10-09, branch `approval-admin-phone`, phone admin area).** An admin can clear the pending queue from the phone. The role picker has a third "Admin" button to `mobile/src/app/login/admin.tsx` (signs in, requires `users.role === "admin"`, otherwise signs out with "This account is not an admin account."; a refused sign-in uses `resolveLoginErrorText`). New route group `mobile/src/app/admin/(tabs)/` with two tabs: Overview (tiles: registrations awaiting approval, active orders, vendors, revenue; read-only; Sign out) and Registrations (Pending and History, Approve, Reject with a required reason through the shared `cleanRejectionReason`, 30 s poll, stale-response guard via `requestRef` and a `loadRef`, one decision at a time via `busyRef`, a pending badge on the tab fed by `mobile/lib/admin-pending.ts`). No backend change: it reuses `/api/admin/registrations` (list, summary, approve, reject), `/api/admin/orders` and `/api/admin/restaurants`; every route is still gated by `resolveAdmin`, the login role check is a courtesy. `lib/registration-admin.ts` and `lib/admin-order-view.ts` are byte-identical in `mobile/lib/` (parity-tested); `useRequireSession` accepts `"/login/admin"`. Verified live on the Android emulator (second Metro from the worktree on 8082, admin email temporarily swapped to `vishalsshah555@outlook.com` and restored, outlook plus-address throwaway customers, all deleted): Overview tiles matched the database, pending cards, stale-card Approve shows "This request was already decided." and the list reloads, phone Approve and Reject (empty reason blocked, reason saved), History with reasons, Sign out, a customer refused on the Admin login. Not driven: wrong-password text on the admin login, a non-admin deep-linking to an admin screen, iPhone. Spec `docs/superpowers/specs/2026-10-09-registration-approval-admin-phone-design.md`, plan `docs/superpowers/plans/2026-10-09-registration-approval-admin-phone.md`. Phone manual v4.15 (new chapter 7, 51 pages); `knowledge/` needed no change. Tests 606.
- **Piece 3 lessons (2026-10-09).** (1) A plan test that greps for a string the code builds from a template (`//approve/` against `/${kind}`) passes only if someone writes the string into a comment; assert the real template literal and the call sites instead. (2) A reload after an action that calls `setError(null)` on success wipes an error text set just before it; set the failure text AFTER the reload, and reload through a ref (`loadRef.current()`) so a segment switch during the request cannot write the old segment's rows. (3) The root-layout Zippy button floats over every screen: scrolling lists need about 160 px of bottom padding or it covers the last card's buttons (found only on the emulator). (4) A second Metro from a worktree can serve a stale bundle (the new route was missing): restart it with `npx expo start --port 8082 --clear`. (5) Android Back with a modal open closes the modal even if the keyboard is up; tap the visible part of a button when the emulator's floating keyboard toolbar covers its right half. (6) Outlook.com accepts plus-addresses, so one mailbox can stand in for many throwaway customers; swap the admin's auth email to the same mailbox temporarily so the "new registration" mails stay in the inbox.
- **Google keys must be three separate keys (2026-10-09).** Vishal found that `GOOGLE_MAPS_SERVER_API_KEY` and `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` held the SAME key (`Google_Maps_Platform_API_Key`), which is why it had to sit at Application restriction None for sign-up geocoding. The Geocoding web service rejects referrer- and Android-restricted keys, so the browser key cannot get its Websites (HTTP referrer) restriction until the server has its own key. Plan, his steps: create a Geocoding-API-only key with Application restriction None for `GOOGLE_MAPS_SERVER_API_KEY`, restart the apps (`stop-all-roles.ps1` then `start-all-roles.ps1`), then restrict the browser key to Websites (`https://freshquick.demoaiprojects.com/*`, `http://localhost:3000/*` to `3003/*`, `3010` only for spare-instance tests) keeping Maps JavaScript, Places (New), Geocoding and Routes. The Android key ("Fresh & Quick Android key") was set to None by mistake and must be restored to Android apps: package `com.freshquick.app`, SHA-1 `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`. Status when written: not yet done; verify by one sign-up and one geocode call after the change (needs his approval to use the server key).
- **Google keys separated and verified (2026-10-09).** Vishal created `Fresh_Quick_Server_Geocoding_Key` (Application restriction None, Geocoding API only) for `GOOGLE_MAPS_SERVER_API_KEY`, restricted the browser key to Websites (localhost 3000-3003 and `https://freshquick.demoaiprojects.com/*`), and restored the Android key to Android apps (package `com.freshquick.app` plus the Expo debug SHA-1). Checks, without reading the new key: a sign-up with a nonsense address returns 400 "We could not find that address" (not 503) and creates no account; the customer location picker loads the map and Places search on `localhost:3000` and on the tunnel hostname with no referrer or key errors in the console (only the known `google.maps.Marker` deprecation warning). Before the new key was in `.env.local` one direct call showed the old referrer-restricted key still there (`REQUEST_DENIED ... referer restrictions`). Not re-run: a valid-address sign-up with the new server key (it would email the admin address) and the Android native build with the restored restriction.
