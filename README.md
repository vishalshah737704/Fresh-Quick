# Fresh & Quick — Food Delivery Platform

Local-only development stack. No cloud services required. See
[MEMORY.md](MEMORY.md) for what's built so far and
[docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md](docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md)
for the full design.

## Prerequisites
- Node.js 20+
- Docker Desktop (running)

## Setup

1. `npm install`
2. `npx supabase start` — starts local Postgres/Auth/Storage/Realtime in Docker
3. Copy the API URL and anon key printed by step 2 into `.env.local`
   (see `.env.example` for the required variable names). Also add a
   `PEXELS_API_KEY` if you plan to re-run the menu-image fetch (optional —
   the seeded demo data already has image URLs baked in). `N8N_INTERNAL_SECRET`
   only matters if you're wiring up the n8n reference workflows (see below);
   any non-empty value works for local testing of the `/api/internal/*`
   routes directly.
4. `npm run app:seed` — applies migrations and seed data (wraps `npx supabase db reset`)
5. `npm run dev` — starts the Next.js app at http://localhost:3000, redirects to `/customer`

For a production build/start instead of the dev server, or for a full
deployment walkthrough, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) and
the `scripts/` folder (`npm run app:build` / `app:start` / `app:stop` /
`app:seed`, with `.ps1` convenience wrappers for PowerShell).

## Trying the customer flow

Browse restaurants at `/customer` (no login needed). The home page has a
DoorDash-style layout: a left sidebar (Home/Restaurants/Orders/Account),
a header with the address picker, a visual-only Delivery/Pickup toggle
(Pickup is disabled — no pickup flow exists), and cuisine-grouped
horizontal carousel rows (falls back to a flat grid if a cuisine chip is
selected, or if any restaurant doesn't fit a known cuisine row). Search
restaurants or cuisines by name or label in the header search box. Adding
an item to cart and clicking Checkout will prompt you to sign up / log in
first (`/customer/login`, a re-skinned card — same email/password flow,
account created locally). Checkout is a single-page, two-column layout
(address + payment method as selectable cards on the left, a sticky
order-summary card with the place-order button on the right). Checkout
also collects a recipient name/email/phone (phone is required, stored as `+91XXXXXXXXXX`) and payment-method-specific fields
(card number/expiry/name for card, a UPI ID for UPI; nothing extra for
Cash on Delivery) — the Place Order button stays disabled until these
validate. Complete checkout with any mock payment method ("Cash on
Delivery" always succeeds; card/UPI resolve randomly ~80% success) to
land on the order confirmation page, which now shows a 6-step status
timeline (Placed/Accepted/Preparing/Ready/On the way/Delivered) plus the
items, address, phone and totals instead of a plain text line, plus a bordered coordinate box in place of a live map once a
delivery partner is assigned (no Google Maps key yet). Placing an order
resolves its payment via a local n8n workflow if one is running
(typically ~1-3s); if no local n8n instance is running — the default
dev state — the checkout route waits out a full ~10s poll timeout
before its in-process fallback resolves the payment, so **every order
takes the full ~10 seconds to confirm without n8n running**, not less.

## Trying the vendor flow

Sign up a restaurant at `/vendor/login` (toggle to "New restaurant? Sign
up") — collects email/password, restaurant name, cuisine tags, and a
lat/lng stub for location. The new restaurant starts closed (`is_open =
false`); add at least one available menu item at `/vendor/menu`, then use
the "Open restaurant" toggle on `/vendor/dashboard` (it refuses to open
with zero available menu items). Place a customer order
against that restaurant (once opened) to see it appear in `/vendor/orders`
and advance it through accepted → preparing → ready.

## Trying the delivery partner flow

Sign up at `/delivery/login` (toggle to "New partner? Sign up") — collects
email/password, full name, and vehicle type. Toggle online on the
dashboard (`/delivery/dashboard`, which shows only active orders: available
ones plus your own; finished orders are under History in the sidebar,
`/delivery/history`); a `ready` order with no partner
assigned yet will appear under "Available orders" for any online partner
to claim (no admin-assignment step — see MEMORY.md's Phase 5 entry for
why). After claiming, mark the order picked_up from the same dashboard;
partners no longer mark it delivered — the customer's order page plays a ~15 s
courier animation and then completes delivery itself (if the customer never
opens the order, n8n workflow 05 completes it after 20 seconds). The partner's
card shows "Customer is receiving the order…" meanwhile. While online, the dashboard pings a lat/lng every 15 seconds (prefilled
from the browser's own geolocation when permission is granted, falling
back to manual entry); the customer's order-confirmation page shows that
location as a plain coordinate readout once the order reaches `assigned`
(access expires once the order is `delivered`). Once an order is
`assigned` or `picked_up`, the partner's own active card shows the
customer's name, phone and delivery address directly (there is no separate
"View address" action any more). Note that n8n workflow 04 auto-assigns a
`ready` order to the nearest online partner (by stored lat/lng) within ~10
seconds, so an order only stays in "Available orders" when no online partner
has a location — set any stray test partners offline when demoing the claim
flow. The mobile app (`mobile/`, Customer + Delivery Partner, Expo) mirrors
these screens, including a customer sign-up on its login screen.

## Trying the admin flow

Log in at `/admin/login` with the seeded demo account —
`admin@foodhub.local` / `admin-demo-password` (no signup; admin accounts
are seeded, not self-service). The sidebar has Overview
(`/admin/dashboard`, KPI tiles only), Orders (a table; click a row for the
order detail at `/admin/orders/[id]`), Vendors, and Delivery Partners. On
an order in `assigned` or `picked_up` status, use the reassign dropdown on
its detail page (lists currently-online delivery partners). Suspend/
unsuspend a restaurant on the Vendors page to see it disappear from/
reappear on `/customer` browse. "Add vendor" / "Add partner" create an
account with an admin-typed temporary password (minimum 6 characters).

## n8n automation (verified end-to-end 2026-09-25)

`/api/internal/*` routes exist for n8n to call (shared-secret
`X-Internal-Secret` header, `N8N_INTERNAL_SECRET` in `.env.local`) and
`n8n/workflows/*.json` has one exported workflow per spec's automation
list. As of 2026-09-25 all 5 have been imported into a real local n8n
instance, wired to the local Supabase stack via
`supabase/migrations/00000000000015_n8n_webhooks.sql`, and driven
end-to-end through the real app UI — see `docs/n8n-webhook-setup.md`
section 6 for per-workflow results and section 1 for the confirmed-
working docker run command (two env-var gotchas fixed there:
`SUPABASE_URL` needs `host.docker.internal`, and
`N8N_BLOCK_ENV_ACCESS_IN_NODE=false` is required). Everything else in
this README (checkout, vendor, delivery, admin flows) still works today
without n8n running — those synchronous paths stay as the tested demo
behavior regardless of whether n8n is connected. (Exception: the 5-minute
delivery-completion fallback in workflow 05 only exists while n8n is running
with 05 active; see `docs/n8n-webhook-setup.md` for recovering a stuck
`picked_up` order.)

## Ask Zippy (in-app assistant, Z1 built 2026-10-03)

Zippy is a floating chat bubble on every web portal (and a chat button in the
mobile Customer and Delivery apps) that answers how-to questions from a
knowledge base of Markdown files in `knowledge/`. Signed-in users keep their
chat history; visitors get a temporary chat. Spec:
`docs/superpowers/specs/2026-10-03-ask-zippy-z1-design.md` (see its
Amendments section for what was built).

**Environment variables** (in `.env.local`, never committed; placeholders are in `.env.example`):
- `ANTHROPIC_API_KEY` - must be a workspace-scoped key on an account with credit
  (an empty balance shows up as an HTTP 400 in the server log, and Zippy says it is resting).
- `OPENAI_API_KEY` - used for embeddings.
- Optional: `ZIPPY_CLAUDE_MODEL` (default `claude-sonnet-5-5`), `ZIPPY_EMBEDDING_MODEL` (default `text-embedding-3-small`).

**Database:** migrations 29 (pgvector + Zippy tables) and 30 (HNSW iterative
scan) are applied with `npx supabase migration up --local`. Never use
`db reset` for this.

**Refreshing the knowledge base:** edit `knowledge/**/*.md`, then either POST
the n8n webhook `foodhub/zippy-ingest` (workflow 06, see
`docs/n8n-webhook-setup.md`) or call `POST /api/internal/zippy/ingest` with the
`X-Internal-Secret` header. Unchanged files are skipped by content hash.

**Quality check:** with `N8N_INTERNAL_SECRET` exported in your shell and the
app running, `node scripts/zippy-eval.mjs` runs the known-question set against
retrieval. Target is at least 90 % hits; the last run scored 35/36 (superseded by Z2: the Anthropic SDK; eval now 46/47).

**Tests:** `node --test tests/*.test.mjs` (132 passing at the end of Z1).

**Z2: live store and menu lookups (built 2026-10-03, branch `ask-zippy-z2`).** Zippy also answers
store, dish, price, option and open/closed questions from live data using four read-only tools
(`search_catalog`, `find_stores`, `get_store_menu`, `get_item_options`). It cannot place orders; Z3 (below)
added looking up your own. The answer appears word by word (restored by the streaming work, see the Zippy streaming section). "Nearest" works on the website (it sends your delivery
location) but not in the mobile app. Spec: `docs/superpowers/specs/2026-10-03-ask-zippy-z2-design.md`.
- **Database:** migration 31 (catalog index), applied with `npx supabase migration up --local`.
- **Catalog sync:** `POST /api/internal/zippy/catalog-sync` (header `X-Internal-Secret`) re-embeds changed
  stores and dishes and removes deleted or suspended ones; run it after menu edits. n8n workflow 07
  (`n8n/workflows/07-zippy-catalog-sync.json`, webhook `foodhub/zippy-catalog-sync`, nightly) does the same
  once imported.
- **Environment:** optional `ZIPPY_MAX_TOOL_ROUNDS` (1-6, default 4); kill switch `ZIPPY_TOOLS=off`
  (no tools and no catalog, which restores Z1 answers).
- **Developer routes** (secret-guarded): `POST /api/internal/zippy/tool` runs one tool;
  `POST /api/internal/zippy/search` returns knowledge matches and catalog matches.
- **Checks:** `node scripts/zippy-eval.mjs` (last 46/47) and `node scripts/zippy-facts-check.mjs`
  (compares answers with the database; last 6/6). Unit tests: 183 passing.

**Z3: my orders (built 2026-10-03, branch `ask-zippy-z3`).** A signed-in customer can ask Zippy about their
own orders (status, items, totals, payment, delivery details) on the website and in the mobile app, for
example "Where is my order?". Two read-only tools, `list_my_orders` and `get_my_order`, read only the
asker's own orders (identity comes from the verified session token and every query filters on the customer
id). Zippy cannot see anyone else's orders and cannot place, change, cancel or pay for an order. Visitors,
vendors, delivery partners and admins get no order data. Order details are sent to the AI provider only
when a question needs them. Kill switch: `ZIPPY_ORDERS=off` (`ZIPPY_TOOLS=off` also disables it). After
editing `knowledge/`, re-ingest and re-run the eval as above. Spec:
`docs/superpowers/specs/2026-10-03-ask-zippy-z3-design.md`. Unit tests: 205 passing.

**Z4a: cart actions (built 2026-10-04, merged to `main` as PR #9).** A signed-in customer can ask Zippy to add a
dish, add a past order's items again, change a quantity, remove a line or empty the cart, on the website and in
the mobile app. Zippy only proposes: it shows a card with Confirm and Dismiss, and the cart changes only when
the customer taps Confirm. Adding from a different store replaces the cart on Confirm, and the card says so.
Closed stores and unavailable dishes are refused, quantity is 1 to 20, and a reply has at most 3 cards. Zippy
does not place, pay for or cancel orders; checkout stays manual. Only signed-in customers get actions. On the
website, Confirm works on the customer pages (the cart lives there). Kill switch: `ZIPPY_ACTIONS=off`
(`ZIPPY_TOOLS=off` also disables it). The client sends a snapshot of the cart with each question because the
cart is client state. Spec: `docs/superpowers/specs/2026-10-04-ask-zippy-z4a-design.md`. Unit tests: 251
passing. Re-ingest and eval re-run done 2026-10-04 (eval 53/54). Phone check of the card taps passed 2026-10-04. Later on 2026-10-04 PR #16 reworded the delivery "How do I go online or offline?" answer (it now says "To start getting deliveries, go online") and, after a re-ingest, the eval reached 54/54.

**Z4b: go to checkout (built 2026-10-04, merged to `main` as PR #10).** When a signed-in customer asks Zippy to check
out, Zippy shows a "Go to checkout" card that opens the Checkout page (web) or screen (mobile) for the current
cart. One tap, and the chat closes. Zippy refuses, with no card, if the cart is empty, the store is closed or
suspended, or a dish is unavailable. The customer still enters their own name, contact details and address and
pays on the checkout page; Zippy never places or pays for an order and never asks for those details or card
numbers. On the website the card works wherever the website shows the customer's cart (the customer pages); on vendor, admin and delivery pages Zippy cannot see the cart, so it cannot prepare the card there; on mobile it always works. If the
cart's store changed after the card was made, the tap says "Your cart changed, ask me again." Visitors, vendors,
delivery partners and admins never get it; one checkout card per reply. Kill switch: `ZIPPY_ACTIONS=off`. Re-ingest
and eval re-run done 2026-10-04; the phone tap on "Go to checkout" passed (Place order was not tapped).

**Rate limits and abuse guards (2026-10-04, merged as PR #14).** Zippy's limits are env-tunable (defaults: signed-in 10/min and
60/day, visitors 5/min and 20/day per IP, plus global buckets for visitors and signed-in users and an overall
8000/day ceiling). A burst check runs before sign-in is verified, oversized bodies get 413, and a limit trip
returns 429 with `Retry-After`. Set `ZIPPY_TRUSTED_PROXY_HOPS` to the number of proxies in front of the app.
See the "Public deployment checklist" in `docs/DEPLOYMENT.md` before exposing the app publicly.

**Ask Zippy Z5 (2026-10-04, branch `zippy-z5`, built; not yet merged):** a signed-in customer with a non-empty cart can ask Zippy to set, replace or clear the cart's order note (the order's delivery note, shown to the store and the delivery partner, at most 500 characters; longer text is refused, not cut; double quotes in the text are shown and saved as single quotes; the text must be the customer's own words, never copied from dishes, stores or orders). It is a card with Confirm; if the cart changed (store changed or emptied) the tap says "Your cart changed, ask me again." Follow-ups in the same branch: cards show option prices like "Spice level: Extra spicy (+₹20)"; a "Try again" button appears when confirming fails with an unexpected error; rate-limit buckets use the IPv6 /64 prefix and an optional `ZIPPY_IP_HASH_SALT`; new brand token `--color-brand-danger-text-safe`; `addItems(replace=false)` clears an open conflict modal in both cart stores; mobile aborts its stream on unmount. Kill switch unchanged (`ZIPPY_ACTIONS=off`). Open items: phone check of the note card; re-ingest `knowledge/` after merge and re-run `node scripts/zippy-eval.mjs`; optionally set `ZIPPY_IP_HASH_SALT`. Manuals: web v3.6.1, mobile v4.7.1 (one bullet each).

**Local only.** This installation is LOCAL ONLY (Vishal's decision, 2026-10-04). The "Public deployment checklist" in `docs/DEPLOYMENT.md` (limits, proxy hops, provider monthly budgets, sign-up throttling or CAPTCHA, HTTPS/reverse proxy, per-user concurrency caps) is NOT needed today and is kept for the day he decides to go public; going public requires those items first.

**Known issues.** npm audit (2026-10-04): the root has 5 high findings and mobile has 29 (10 moderate, 19 high), all in the dev toolchain (the eslint-config-next chain at the root; the Expo CLI/Metro chain in mobile), from `braces` (every published version, 3.0.3 included, is in the advisory range, so no patched release exists on npm), `node-forge`, `uuid` and `decode-uri-component`. `npm audit --omit=dev` is clean at the root. The only offered fixes are breaking (downgrading eslint-config-next to 14.x, installing expo 44, or an Expo SDK 58 / expo-router 58 upgrade while Vishal's Expo Go is SDK 57), so this is accepted risk on a local-only install, not a missed fix. Re-check after a Next lint-chain update or an Expo SDK upgrade: run `npm audit` in both folders, upgrade eslint-config-next and the Expo SDK together, and test on the phone.

**Build caveat:** in a git worktree with a `node_modules` junction, Turbopack
rejects the build; use `npx next build --webpack` there and run the real
`npm run build` once merged to `main`.

## Usage guide

`docs/Usage_Guide.docx` is a screenshot-illustrated walkthrough of the
whole site (customer app + vendor/delivery/admin portals) for anyone
who wants to read how to use it rather than run it.

**Zippy chat retention (2026-10-04, merged as PR #13).** Saved Zippy chats with no activity for 30 days are deleted by a nightly
cleanup (SQL `purge_zippy_chats`, route `POST /api/internal/zippy/purge`, n8n workflow 08 nightly at
03:45; env `ZIPPY_RETENTION_DAYS`, 1..3650). Orders are not purged. Rollout done 2026-10-04: migration 32 applied,
workflow 08 imported and published, the dry run (`Invoke-RestMethod -Method Post
http://localhost:5678/webhook/foodhub/zippy-purge`, a dry run unless the body is `{"dryRun": false}`) returned
`dryRun` true with 0 rows, and `knowledge/` was re-ingested. The first real purge runs from 03:45 Asia/Kolkata. Scheduled runs happen only while Docker, n8n and
the app are up (n8n does not catch up missed runs); the schedule uses n8n's timezone (workflow set to Asia/Kolkata). See `docs/n8n-webhook-setup.md`.

## Status

All 8 phases of the web platform (spec §7) are built: customer browse/
cart/checkout, vendor panel, delivery partner app, admin dashboard, an
n8n-facing internal API and 5 n8n workflows (all verified end-to-end
against a real local n8n instance as of 2026-09-25 — see the n8n section
above), and a Phase 8 polish pass
(loading/error/empty states audited across all four surfaces at a 390px
mobile viewport, no console errors found on any of the eight pages
checked). A post-Phase-8 deferred-items triage then closed most of the
remaining "Known deferred items" — vendor restaurant open/close toggle,
checkout atomicity (Postgres RPC), delivery address visibility,
geolocation-assisted location ping, closed-restaurant menu-page guard,
and several smaller polish items. A second redesign pass (the
DoorDash-layout rebuild) then restructured the customer surface's layout
— sidebar nav, fuller header, cuisine-grouped carousel rows — on top of
the earlier color/brand redesign. A third redesign — an Uber Eats-style
overhaul, 6 pieces (design tokens → home/feed → restaurant page → item
customization → cart → checkout) — is now **complete and fully merged to
`main`**, on top of both prior redesigns: piece 1 (design tokens:
near-black/lime-green/cream palette, Inter + Poppins fonts, 8px card
radius), piece 2 (home/feed rebuild: search dropdown, sort/filter bar,
curated carousels, a real per-restaurant delivery fee replacing the old
flat rate), piece 3 (restaurant page rebuild: sticky category anchor-nav
with scroll-spy, in-menu search, a corner "Quick Add" button restyle),
piece 4 (item customization: vendor-managed option groups/options, an
`ItemCustomizationModal` replacing instant add for items with options, a
`lineId`-keyed cart so different customizations of the same dish coexist
as separate lines), piece 5 (cart redesign: line-item thumbnails, a
whole-order note distinct from per-line special instructions, and a
shared delivery-fee hook so the cart's preview total matches checkout
exactly — **note:** an earlier version of this line described `CartPanel`
as a slide-out drawer; as of the Figma-kit redesign below, `CartPanel` is
confirmed a plain always-rendered sidebar, not a drawer — see MEMORY.md),
and piece 6 (checkout visual polish: a full read-only line-item breakdown
on the order summary, a read-only order-note display, and an icon+card
payment-method picker). A fourth redesign — a full rebrand using a Figma
community UI kit's palette (orange/navy/green, pill buttons, rounded
cards, Poppins-700 headings) across all 6 real surfaces (web Customer/
Vendor/Delivery/Admin, mobile Customer/Delivery) — **complete and
merged to `main`** as of 2026-09-29, followed same-day by a
color-density revision (denser colored-section backgrounds replacing
flat white/gray, plus a checkout blank-every-session fix) and a
post-redesign follow-on (WCAG-safe contrast tokens, delivery-location
persistence restored, fresh session on every startup, profile name +
password reset in every portal's nav) — all merged to `main`.
See [MEMORY.md](MEMORY.md) for the phase-by-phase build
log, including every bug found and fixed along the way, and its "Known
deferred items" section for what's still intentionally left for later.

## Troubleshooting: Supabase will not start on Windows

If `npx supabase start` fails with "bind: An attempt was made to access a
socket in a way forbidden by its access permissions" (e.g. on 54322) while
nothing is listening, Windows has reserved that port range (Hyper-V/WinNAT) —
this is not a busy port. Check with
`netsh interface ipv4 show excludedportrange protocol=tcp`; a port really held
by another process shows up in `netstat -ano` instead. Fix, from an
Administrator PowerShell: `net stop winnat`, then
`netsh int ipv4 add excludedportrange protocol=tcp startport=54320 numberofports=10`,
then `net start winnat` (persistently reserves 54320-54329 for Supabase).

## Local service URLs
- App: http://localhost:3000
- Supabase Studio: http://localhost:54323
- Supabase API: http://localhost:54321

## Stopping
`npm run app:stop` stops the Next.js server and the local Supabase Docker
containers together (`npm run app:stop -- --keep-supabase` to leave the
database running). Or just `npx supabase stop` to stop the database alone.
