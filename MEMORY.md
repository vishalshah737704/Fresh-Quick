# MEMORY.md — Fresh & Quick Build Status

Index of what's been built and decided. Not a memory file for Claude's
cross-session memory system — this is the project's own build log, read by
Claude at the start of work in this repo per project CLAUDE.md.

## Phase status (spec: docs/superpowers/specs/2026-09-24-food-delivery-platform-design.md)

- **Phase 1 — Scaffold + DB schema**: ✅ Complete, merged to `main`.
  Next.js scaffold, self-hosted Supabase (Docker), 9-table schema + RLS +
  FK indexes, seeded cuisine taxonomy + demo vendor/restaurant/menu, README.
  Plan: docs/superpowers/plans/2026-09-24-phase1-scaffold-db-schema.md
- **Phase 2 — Customer browse + cart**: ✅ Complete, merged to `main`.
  Anonymous browse/cart flow, single-restaurant enforcement, address-picker
  stub, cart panel with persistence. Plus a follow-on add: real food photos
  from Pexels wired into menu items (seed data + `next/image`).
  Plan: docs/superpowers/plans/2026-09-24-phase2-customer-browse-cart.md
- **Phase 3 — Checkout + mock payment**: ✅ Complete, merged to `main`.
  Minimal customer email/password signup+login, checkout API route
  (server-side re-validation of restaurant-open/item-available/price,
  quantity bounds, payment-method/address validation, reprice guard),
  synchronous mock payment resolution (no n8n dependency yet), checkout
  page, order confirmation page with polling. Mid-phase: checkout auth
  moved from body-trusted `customerId` to a verified
  `Authorization: Bearer <token>` header after a review caught anyone
  could otherwise place orders as any user. Final review also caught and
  fixed: a build-breaking missing Suspense boundary, cart cleared even on
  failed payment, float-precision money math failing the DB's exact
  invariant, and RLS tightened to owner-only reads on
  users/addresses/orders/payments (first phase holding real customer PII).
  An open-redirect on the login page took 3 fix rounds to fully close
  (dot-segment/protocol-relative URL tricks) — fixed by returning
  `url.href` instead of reassembling URL parts.
  Plan: docs/superpowers/plans/2026-09-25-phase3-checkout-mock-payment.md
- **Phase 4 — Restaurant/vendor panel**: ✅ Complete, merged to `main`.
  Vendor signup (email/password + restaurant name/cuisine tags/lat-lng,
  `restaurants.owner_id` as the vendor-restaurant link, `is_open=false`
  until the vendor adds a menu item), vendor login reusing the Phase 3
  auth pattern with a `role='vendor'` check, menu CRUD (create/edit
  availability/delete, plain URL image field, integer-paise pricing),
  order queue with the fixed vendor-drivable status chain
  (placed→accepted→preparing→ready), and a new migration closing the
  Phase 1 `order_items` permissive-read stub with proper customer/vendor
  ownership-scoped RLS. Final whole-branch review caught and fixed a real
  security gap: three RLS write policies (vendor order/restaurant
  updates, restaurant inserts) were reachable directly via PostgREST with
  a vendor's own anon-key token, bypassing every check the service-role
  API routes enforced — letting a vendor skip the status chain or
  reassign another customer's order, and letting any authenticated user
  insert their own orderable restaurant. All three were unused by any
  actual code path (everything writes through service-role routes) and
  were removed rather than tightened. Also fixed: menu-item delete on an
  item with order history now returns a clear 409 instead of a raw
  foreign-key-violation 500; vendor-supplied menu-item image URLs are now
  validated against the same host `next.config.ts` allows (previously an
  arbitrary host would crash the customer-facing restaurant page); the
  order-status-advance update now guards on `restaurant_id` + current
  `status` (closes both a TOCTOU gap and a real lost-update race).
  Plan: docs/superpowers/plans/2026-09-25-phase4-vendor-panel.md
  Spec: docs/superpowers/specs/2026-09-25-phase4-vendor-panel-design.md
- **Phase 5 — Delivery partner app + live tracking**: ✅ Complete, merged
  to `main`. Delivery partner signup/login (mirrors Phase 4's vendor
  pattern), online/offline toggle, a **self-claim model instead of
  admin-assignment** (ruling: the spec's "manual assignment via admin"
  verify step assumed Phase 6's admin dashboard, which doesn't exist yet
  — any online partner can claim one unassigned `ready` order via a
  race-safe atomic UPDATE), status chain
  assigned→picked_up→delivered (ownership+status guarded, same atomic-
  UPDATE pattern), a 15s location-ping loop from the delivery dashboard
  (manual lat/lng inputs, no Google Maps key), and a lat/lng readout
  added to the customer's existing order-confirmation poll (no new
  Realtime subscription — reused the existing 3s poll instead, simpler
  and consistent with Phase 3's pattern). Live verification (not just
  per-task review) caught a real Critical: migration 1's permissive
  `stub_allow_authenticated_read` policy on `delivery_partners` was
  never dropped when Phase 3/4 tightened other tables, so any
  authenticated user — not just a customer's own assigned order — could
  read any delivery partner's live location. Fixed by dropping the stub
  in the new migration. Final whole-branch review then caught a second,
  narrower version of the same class of bug: the new
  `customer_can_read_assigned_partner_location` policy didn't expire —
  a customer could keep reading a partner's live location forever after
  their own delivery was complete. Fixed by scoping the policy to
  `orders.status in ('assigned', 'picked_up')` and removing `delivered`
  from the client's location-display gate. See the new CLAUDE.md rule on
  auditing a table's *existing* policies before adding new ones.
  Plan: docs/superpowers/plans/2026-09-25-phase5-delivery-partner.md
  Spec: docs/superpowers/specs/2026-09-25-phase5-delivery-partner-design.md
- **Phase 6 — Admin dashboard**: ✅ Complete, merged to `main`. One
  seeded demo admin account (`admin@foodhub.local` /
  `admin-demo-password`, seed.sql — no self-service signup, matching real
  admin-provisioning norms), read-only oversight of all
  orders/restaurants/delivery partners, restaurant suspend/unsuspend
  (new `restaurants.is_suspended` column, independent of the vendor's own
  `is_open`), and a manual order-reassignment tool (admin picks a
  different *online* delivery partner for an `assigned`/`picked_up`
  order; rejects offline targets and terminal-status orders). **Ruling**:
  built self-claim-compatible admin oversight rather than the spec's
  literal "manual assignment via admin" as the *only* assignment path,
  since Phase 5 already shipped self-claim (itself a ruling made when
  Phase 6 didn't exist yet) — admin reassignment is additive, not a
  replacement. Final whole-branch review caught the most serious bug of
  the build so far: migration 9's own `admin_can_read_all_users` RLS
  policy queried `public.users` from within a policy defined ON
  `public.users`, which Postgres cannot evaluate — "infinite recursion
  detected in policy" broke every browser-side (anon-key) read of
  `users`, and transitively `orders`/`order_items`/`payments`/
  `delivery_partners`, for every role. This broke the post-login role
  check on all four login pages (customer/vendor/delivery/admin) and the
  customer order-tracking page. The task's own live verification (Task
  6) missed it completely because it tested every admin action via curl
  against service-role-backed API routes, which bypass RLS entirely and
  can't exercise this bug at all — the final review only caught it by
  actually driving `/admin/login` in a real browser. Fixed by deleting
  the three unnecessary admin read policies outright (every admin read
  already goes through service-role routes; nothing needed them). Also
  fixed in the same pass: the plan's promised reassignment UI control had
  been silently dropped during implementation (API-only until final
  review caught the gap); the admin seed account lived in a migration
  with a false justification comment (moved to `seed.sql`, matching
  every other demo account); restaurant visibility only checked
  `is_open`, not independently `is_suspended` (both now checked in
  customer browse and checkout). See new CLAUDE.md rules on
  same-table-referencing RLS policies and on live-verifying through the
  actual browser UI, not just service-role curl calls.
  Plan: docs/superpowers/plans/2026-09-25-phase6-admin-dashboard.md
  Spec: docs/superpowers/specs/2026-09-25-phase6-admin-dashboard-design.md
- **Phase 7 — n8n automation wiring**: ⚠️ Partially complete, merged to
  `main` — **no n8n instance was available in this environment**, so
  this phase built the parts that could be built and verified without
  one, and left the rest as explicitly-untested reference material (see
  spec's own wording: "n8n workflow exports checked into repo for
  reference"). **Built and live-verified**: two real `/api/internal/*`
  Next.js API routes (`payments/[id]/result`, `orders/[id]/assign` with
  a GET candidates-by-distance endpoint using the existing
  `haversineDistanceKm` helper), guarded by a constant-time shared-secret
  comparison (`lib/internal-auth.ts`) rather than a user session since
  n8n has no end-user identity. **Ruling**: Phases 3-6's tested
  synchronous paths (checkout payment resolution, vendor status updates,
  delivery self-claim) stay as the working demo path; these routes are
  additive for whenever real n8n wiring happens, not a replacement.
  **Built but unverified**: five `n8n/workflows/*.json` files
  (hand-authored to n8n's export JSON shape, covering spec's workflows
  1-5; workflow 6 — location fanout — skipped per the spec's own stated
  default of using direct Realtime instead, and Phase 5 already reused
  its existing poll rather than adding Realtime) and
  `docs/n8n-webhook-setup.md`. A review pass caught and fixed a
  systemic error in all five (every expression read `$json["record"]`
  instead of the webhook node's actual output shape,
  `$json["body"]["record"]`) plus a payment-route bug that would have
  been live-triggered the moment workflow 02 was activated (see below).
  ~~**Known remaining issues in the untested JSON**~~ — **closed in the
  Fresh & Quick redesign**: the `IF` nodes' `typeVersion` mismatch (now
  `1`, matching their v1 parameter shape), workflow 02's decision node
  (now a proper `n8n-nodes-base.code` node, not a legacy `function` node
  wrongly using the Code node's API), workflow 04's `$json[0]`
  array-indexing bug, the missing empty-candidates guard before workflow
  04's assign POST, and missing `webhookId` fields are all fixed — see
  the redesign's own phase entry below for one residual bug found and
  fixed after this pass (workflow 02's Code node also needed an explicit
  `runOnceForEachItem` mode). The setup doc's Docker/config.toml
  instructions still need double-checking against current tooling
  whenever someone actually wires up a real n8n instance — nothing here
  can verify that without one.
  **Real bug worth remembering**: the payment-result route originally had
  no state guard (`.eq("id", id)` only) — since checkout never actually
  inserts a `pending` payment row (Phase 3 resolves payment synchronously
  before insert), the route as first written could have flipped an
  already-resolved payment's status on any call, which workflow 02's
  "insert triggers a fresh random success/failure roll" design would
  have done to ~20% of real payments the moment it was activated. Fixed
  by adding `.eq("status", "pending")` to the update and returning 409
  when nothing matches — the same "state must match at the mutating
  query itself" pattern proven in Phases 4-6.
  Plan: (none — built directly given explicitly-untested nature, see
  spec's own "Ruling" section on scope)
  Spec: docs/superpowers/specs/2026-09-25-phase7-n8n-automation-design.md
  **Update (2026-09-25, later session) — now live-verified end-to-end**:
  the "no n8n available" gap above is closed. A real local n8n instance
  was started in Docker, all 5 workflows imported and published, and
  Supabase Database Webhooks wired via a new migration
  (`supabase/migrations/00000000000015_n8n_webhooks.sql` — enables
  `pg_net`, creates one trigger per row in the setup doc's table calling
  `supabase_functions.http_request`; chosen over `supabase/config.toml`
  because the local CLI doesn't actually support declaring webhooks there
  despite this doc's earlier wording). All 5 workflows driven end-to-end
  through the real UI (Playwright) and direct status updates: 01, 03, 04,
  05 all succeeded; 02 fires correctly but stays expected-inert (see
  above, confirmed live via the "Payment is not pending" guard message).
  **Two real environment-variable bugs found and fixed, neither visible
  from the original hand-review**: n8n blocks `{{$env.X}}` node access by
  default (needs `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`), and `SUPABASE_URL`
  pointed at `127.0.0.1` is unreachable from inside the n8n container —
  same class of bug already known for `APP_BASE_URL`, needs
  `host.docker.internal` too. Both fixed in `docs/n8n-webhook-setup.md`'s
  confirmed-working docker run command. See that doc's section 6 for full
  per-workflow verified results.
- **Phase 8 — Polish/testing**: ✅ Complete, merged to `main`. Smoke-tested
  all four surfaces (customer, vendor, delivery, admin) at a 390×844
  mobile viewport via Playwright — no console errors found on any of the
  eight pages checked (customer home, restaurant detail, and all four
  role login pages, spot-checked further after fixes). Confirmed existing
  loading/error/empty-state coverage on every data-fetching page (added
  during Phases 2-7, not new here) and closed the two real gaps found:
  admin dashboard's three lists (orders/restaurants/partners) had no
  empty-state message (just showed "(0)" with a blank list — now says
  "No orders/restaurants/delivery partners yet."), and — closing the
  deferred item below — vendor menu's availability toggle plus vendor
  orders' and delivery dashboard's claim/status-advance buttons now
  surface a write failure instead of silently no-op'ing. **Deliberately
  not touched**: the four login pages' benign "password field not in a
  form" browser console hint — fixing it means editing Phase 3's
  already-reviewed, security-sensitive redirect-safe login/signup flow
  across 4 files for a cosmetic-only warning, not a real bug; judged not
  worth the risk of reopening tested auth code for this.
  Plan: (none — direct polish pass given the phase's own "various" scope
  per spec §7, matching how review/fix work was done throughout this
  build rather than the full brainstorm→plan cycle)
- **Post-Phase-8 deferred-items triage**: ✅ Complete, merged to `main`
  (13 tasks via subagent-driven-development in an isolated worktree).
  Closed: `reviews` RLS tightened to authenticated-only; vendor open/close
  restaurant toggle (`PATCH /api/vendor/restaurant`); delivery partner can
  view an assigned order's delivery address (new RLS policy + route,
  scoped to `assigned`/`picked_up` like the existing location-share
  policy); delivery location ping now prefills from
  `navigator.geolocation` with manual fallback; order-confirmation page
  stops polling on terminal status; shared vendor/delivery signup
  validation helper (length checks + vehicle-type whitelist); customer
  menu page re-checks `is_open`/`is_suspended` with a banner; currency
  display standardized to `.toFixed(2)` across vendor/admin/delivery
  pages; checkout's 4 sequential inserts wrapped in a Postgres RPC
  transaction; vendor order queue filter/sort by status; vendor menu
  inline edit form; delivery dashboard auto-refreshes available orders.
  Also corrected a stale doc entry (`order_items` RLS was already fixed
  in Phase 4, not still open). **Real bug caught only by final
  whole-branch review, not any per-task review**: the checkout RPC
  (`security definer`, bypasses RLS) was granted `execute` to
  `authenticated` instead of `service_role`-only, which would have let
  any logged-in customer call `checkout_place_order` directly via
  PostgREST with their own session token — skipping the route's identity
  check, price re-validation, and restaurant-open/suspended check
  entirely, and letting them set arbitrary prices or order as another
  customer. Every per-task review of that migration checked the
  RLS-recursion and same-table-policy rules correctly but missed this
  privilege-escalation angle; only the final cross-cutting review, done
  after all tasks landed together, caught it. Fixed and live-verified
  (a customer's own token against the RPC now gets permission denied;
  the real checkout flow still works). Also created `scripts/`
  (build/start/stop/seed, Node `.mjs` canonical + PowerShell `.ps1`
  wrappers) and `docs/DEPLOYMENT.md`.
- **Fresh & Quick DoorDash-inspired redesign**: ✅ Complete, merged to
  `main` (14 tasks, executed inline in an isolated worktree per
  `superpowers:executing-plans`). Rebranded from placeholder "FoodHub" to
  "Fresh & Quick" (`lib/branding.ts`, richer 6-token red/orange/cream
  color system in `app/globals.css`'s `@theme` block). Added 4 new
  presentational components (`CuisineChip`, `CuisineChipRow`,
  `HeroSearch`, `PromoBanner`) and restyled `RestaurantCard`/
  `MenuItemRow` with a photo-forward, DoorDash-structured layout (hero →
  promo banner → cuisine-filter chip row → photo card grid). Redesigned
  the customer homepage and restaurant-detail page (banner image using
  the previously-unused `restaurants.banner_url` column, placeholder
  graphic when null) and re-skinned all vendor/delivery/admin
  dashboards and all 4 login/signup pages to the new brand tokens
  (class-only changes, zero logic touched — verified every
  `getSafeRedirect` redirect-validation function byte-identical
  before/after across all 4 login pages). Expanded the seed catalog from
  1 to 17 restaurants across 12 cuisines (4 new taxonomy slugs: mexican,
  thai, bakery, healthy — `supabase/migrations/00000000000014`), ~44
  menu items, real photos sourced via a new one-off
  `scripts/fetch-catalog-images.mjs` (Pexels Search API, fetch-once
  pattern, never called at runtime) and hardcoded into `seed.sql`. Fixed
  all previously-known n8n workflow JSON bugs (IF-node `typeVersion`
  mismatches, workflow 02's function/code-node type+parameter mismatch,
  workflow 04's `$json[0]` array-indexing bug, missing empty-candidates
  guard, missing `webhookId` fields) and rewrote
  `docs/n8n-webhook-setup.md` into a full walkthrough — still explicitly
  **reviewed, not run against a live n8n instance**. **Real bug found
  during Task 5's live-verify, not any earlier review**: `HeroSearch`
  originally embedded a second `AddressPicker` instance, duplicating the
  one `app/customer/layout.tsx` already renders globally above every
  customer page — visually broken (two address bars) but not caught
  until actually loading the page in a browser; fixed by dropping the
  embedded picker from `HeroSearch`, keeping it a pure headline/subtext
  hero. **Session-level bug**: while writing `docs/n8n-webhook-setup.md`,
  found that workflow 02 (async payment mock) would be inert if activated
  as-is, since Phase 3's checkout inserts payments with a final
  `success`/`failed` status, never `pending`, so workflow 02's
  INSERT-triggered logic has nothing to act on — documented as an
  explicit prerequisite (checkout would need to start inserting `pending`
  payments) rather than silently shipping a guide that implies the
  workflow just works once imported. **Bug caught only by the final
  whole-branch review, not any per-task review**: converting workflow
  02's decision node from a legacy `function` node to a proper
  `n8n-nodes-base.code` node (fixing the type/API mismatch above) still
  left it broken — a Code node defaults to "Run Once for All Items"
  mode, where `$input.item` doesn't exist, so the node would have thrown
  on first execution. Fixed by adding `"mode": "runOnceForEachItem"` and
  changing the return from an array (`return [{ json: ... }]`, valid
  only in all-items mode) to a single object (`return { json: ... }`,
  required in per-item mode). **Ruling**: the catalog expansion (Task 11)
  shipped with 42 menu items across the 16 new restaurants rather than
  the plan's estimated 60-90 (six restaurants got 2 items instead of
  3-5, a few prices/prep-times fall slightly outside the plan's stated
  ranges) — the final review flagged this as an undisclosed deviation;
  judged not user-harmful (every restaurant still has a real, varied
  menu with photos) and left as-is rather than padding content to hit an
  estimate, but recorded here since the original ledger entry didn't
  flag it. Two n8n setup-doc claims were also corrected after the final
  review: not every workflow needs `APP_BASE_URL`/`N8N_INTERNAL_SECRET`
  (only 02 and 04 have HTTP Request nodes that use them), and
  pre-activation testing must use n8n's `/webhook-test/` URL, not the
  production `/webhook/` path the Supabase webhook config points at
  (n8n only serves the production path once a workflow is active).
- **DoorDash-layout rebuild**: ✅ Complete, executed inline via
  `superpowers:executing-plans` in an isolated worktree (9 tasks). Second
  redesign pass on top of the Fresh & Quick redesign — restructured the
  customer surface's *layout*, not just its color tokens, to match
  doordash.com/home's structure: persistent left `SidebarNav` (4 items:
  Home, Restaurants, Orders, Account — deliberately not a full DoorDash
  product-vertical list, per brainstorm ruling), a rebuilt header
  (`AddressPicker` relocated inline from its own bar, a visual-only
  `DeliveryPickupToggle` with Pickup permanently disabled since the app
  has no pickup flow, cart icon, sign-in link), and a `HeaderSearchBox` +
  cuisine-grouped `CuisineCarouselRow`s replacing the flat restaurant
  grid on the home page (grid still used when a cuisine chip is
  selected, or as a fallback — see below). Also fixed a real standing-
  rule violation found while touching `RestaurantCard.tsx`: a raw
  `<a href>` that MEMORY.md's post-Phase-8 triage had previously
  (incorrectly) recorded as not existing anywhere in the app — see new
  CLAUDE.md rule on re-grepping such claims rather than trusting them.
  Plan: docs/superpowers/plans/2026-09-25-doordash-layout-rebuild.md
  Spec: docs/superpowers/specs/2026-09-25-doordash-layout-rebuild-design.md
  **Final whole-branch review (opus) caught 1 Critical + 2 Important,
  all fixed before merge**: (1) Critical — the sidebar's "Orders" link
  pointed at `/customer/orders`, a route that has never existed (only
  `/customer/orders/[id]` does), 404ing on every click; no orders-list
  page exists to link to and building one was out of this plan's
  presentation-only scope, so the link now points at the existing login
  page, matching the spec's own stated "or prompts login" fallback
  wording. (2) Important — the new cuisine-grouped carousel view could
  silently drop restaurants that don't belong to any taxonomy cuisine
  slug (e.g. a freshly-signed-up vendor's restaurant, which defaults to
  `cuisine_tags: []`) or show a blank page entirely if the
  `cuisine_taxonomy` fetch failed/returned empty — the old flat grid had
  no such failure mode. Fixed with an explicit fallback to the flat grid
  whenever any searched restaurant isn't represented in a carousel row,
  or the cuisine list is empty. (3) Important — the search box matched
  raw cuisine slugs (`fast_food`) but not the human-readable labels
  users actually see on the chips/headings (`Fast Food`), so typing a
  visible cuisine name returned zero results; fixed with a slug-to-label
  lookup. None of the three were caught by any per-task build check or
  the implementer's own live Playwright walkthroughs during task
  execution — all three needed either a fresh reviewer's read of the
  diff against the data shape (findings 2-3) or a link nobody happened
  to click during task-level verification (finding 1). See new CLAUDE.md
  rules on both. **Deferred minors** (below fix-pass threshold,
  ledgered, not fixed this session): `AddressPicker`'s dropdown panel
  isn't absolutely positioned, so opening it shifts the header layout
  instead of overlaying (would require editing the panel's own markup,
  beyond this plan's wrapper-only constraint on that file); the header's
  "Sign In" link doesn't reflect a logged-in session (pre-existing gap,
  not a regression — the old layout had no account UI at all);
  `HeaderSearchBox`'s missing `"use client"` directive (currently safe,
  would break if ever imported into a server component); a small
  cluster of accessibility gaps (search input's accessible name relies
  on placeholder only, sidebar icon emoji aren't `aria-hidden`, the
  disabled Pickup button can't receive keyboard focus so its `title`
  tooltip is unreachable via keyboard).
- **Customer-flow DoorDash-style polish**: ✅ Complete, executed inline via
  `superpowers:executing-plans` in an isolated worktree (6 tasks). Third
  redesign pass, extending the DoorDash-layout rebuild's visual system to
  the remaining customer-flow pages Vishal explicitly called out —
  checkout, order tracking, login/signup — plus a home-page density fix.
  Checkout stays single-page (DoorDash's *web* pattern, not a step
  wizard — Vishal's explicit ruling that step-by-step flow is deferred to
  the future mobile app) but gets a two-column layout: address + payment
  on the left (payment methods now selectable bordered cards instead of
  bare radio inputs), a sticky order-summary card on the right. Order
  tracking gets a new `OrderStatusTimeline` component (4-step
  Placed/Preparing/On the way/Delivered tracker, `cancelled` handled as
  its own early-return state) in place of a plain text status line, and
  the existing lat/lng coordinate readout is now styled as a bordered
  map-placeholder box (still no Google Maps key, no new dependency — see
  new CLAUDE.md rule on the `Record<Exclude<T, "special">, V>` typing
  pattern that made the status mapping compiler-enforced total, verified
  live by temporarily deleting a mapping key and watching `npm run build`
  fail). Login/signup got a re-skin only (bordered/shadowed card wrapper)
  — `getSafeRedirect` verified byte-identical against `main` at the end
  of the branch, not just after its own task, per CLAUDE.md's standing
  rule on that function. Home page's cuisine-carousel cards went from
  `w-64`/`gap-4` to `w-56`/`gap-3` and both flat-grid fallbacks gained an
  `xl:grid-cols-4` breakpoint, directly answering Vishal's "remove
  whitespace, add more items, make the page fully packed" instruction —
  live-verified via a real order lifecycle (placed → advanced via direct
  Supabase REST PATCH to `picked_up` → `delivered`, all through the
  existing 3s poll, no page reload) rather than just static screenshots.
  Plan: docs/superpowers/plans/2026-09-25-customer-flow-doordash-polish.md
  Spec: docs/superpowers/specs/2026-09-25-customer-flow-doordash-polish-design.md
- **Uber Eats-style redesign — Piece 1: Design token refresh**: ✅
  Complete, merged to `main`. First of a 6-piece redesign (design tokens →
  home/feed rebuild → restaurant page rebuild → item customization → cart
  redesign → checkout polish) bringing the customer surface toward Uber
  Eats' web ordering flow, based on live Playwright research of
  `ubereats.com` and two refero.design style references (`Uber` +
  `sweetgreen`, blended per a visual-companion preview Vishal picked from).
  This piece: all 6 brand tokens swapped (near-black ink/primary
  `#12140f`, toned green accent `#b6e02e`, cream background `#faf9f4`),
  fonts swapped from Geist to Inter (body/UI) + Poppins weight 300
  (hero/section headings only, via a new `.font-heading` class), and
  every card's border-radius normalized to 8px with shadows removed from
  static cards (kept only on `RestaurantCard`'s hover state and on the two
  genuine overlay/chrome elements — `CartPanel`, `CartConflictDialog`).
  Built in an isolated worktree, verified via `npm run build` +
  Playwright screenshots across all 4 role surfaces at desktop and 390px
  width, fresh-reviewer-approved with zero findings. One forward note for
  piece 2+: `.font-heading` sits outside any Tailwind cascade layer, so
  pairing it with a weight utility later will silently lose to its own
  `font-weight: 300` — wrap in `@layer utilities` or use `@utility` if a
  later piece needs to override the weight.
  Plan: docs/superpowers/plans/2026-09-25-uber-eats-design-refresh.md
  Spec: docs/superpowers/specs/2026-09-25-uber-eats-design-refresh-design.md
- **Uber Eats-style redesign — Piece 2: Home/feed rebuild**: ✅ Complete,
  merged to `main`. Built subagent-driven (fresh implementer + reviewer
  per task, worktree-isolated), 8 tasks. Real feature, not just visual:
  added `restaurants.delivery_fee_paise`/`promo_text` columns (migration
  `00000000000016`), vendor dashboard fields to set them, and wired
  checkout to each restaurant's real fee instead of the old flat
  `DELIVERY_FEE_RUPEES` constant (removed entirely). Restaurant card
  redesigned to Uber Eats' "•"-delimited metadata line (`⭐ 4.4 · 25 min ·
  ₹30 Delivery Fee`) plus a promo badge. Home page gained a live search
  dropdown (restaurant + cross-restaurant dish matches, dish query
  correctly excludes closed/suspended restaurants via `restaurants!inner`
  + `.eq(is_open/is_suspended)`), a sort/filter bar (Rating/Delivery
  fee/Under 30 min/Sort-by), and 3 curated carousels (Popular near you /
  Offers near you / Quick delivery) above the existing cuisine-grouped
  rows.
  **Ruling worth knowing**: the sort control only reorders the two
  flat-grid render paths (selected-cuisine grid, no-carousel fallback) —
  it never reorders the curated/cuisine carousels, which keep their own
  fixed ordering. "Under 30 min" is a true filter and narrows everything.
  With today's seed data (every restaurant has a cuisine tag), the home
  page always takes the carousel path, so in practice the sort control is
  currently a no-op until a cuisine chip is picked — confirmed correct
  against the design twice (task review + final review), left as-is
  pending Vishal's call on whether a future piece should make picking a
  non-default sort switch to the flat grid.
  **Update (piece 3 session)**: Vishal decided — picking a non-default
  sort (`sortBy !== "distance"`) now switches the no-cuisine-selected view
  from the curated/cuisine carousels to the flat sorted grid
  (`app/customer/page.tsx`'s `useCarouselView` condition gained a
  `sortBy === "distance"` clause). The 3 curated carousels (Popular/
  Offers/Quick delivery) still render above it unconditionally and keep
  their own fixed ordering, unaffected — only the cuisine-grouped rows
  below them are swapped for the flat grid. Reverting to "Sort: Distance"
  restores the carousel view. Live-verified via Playwright (rating sort
  produced a grid correctly ordered 4.7→4.0).
  **Two real bugs caught late, both worth remembering**: (1) a fix-pass
  subagent verified 3 of 6 final-review findings via throwaway-script
  logic replication instead of live infra that was actually available and
  had been used successfully by earlier tasks — the controller
  independently re-verified all 6 live (curl, Playwright, a real
  end-to-end order placement with a ₹45.50 fee checked byte-exact against
  the DB) before trusting the fix; (2) the fix itself found and closed a
  genuine money-display bug (card/checkout rounding a fee with paise to
  whole rupees, disagreeing with the actual charge) and a silent-error bug
  (a failed fee fetch left checkout stuck on "Loading…" forever). See
  CLAUDE.md's "don't trust a subagent's logic-replication claim over live
  verification when live infra is available" rule, added from this.
  Plan: docs/superpowers/plans/2026-09-25-uber-eats-home-feed-rebuild.md
  Spec: docs/superpowers/specs/2026-09-25-uber-eats-home-feed-rebuild-design.md
- **Uber Eats-style redesign — Piece 3: Restaurant page rebuild**: ✅
  Complete, merged to `main`. Built inline via `superpowers:executing-plans`
  in an isolated worktree (4 tasks), no new schema. Rebuilt
  `app/customer/restaurants/[id]/page.tsx`: menu items now group by the
  existing `menu_items.category` column into a sticky pill anchor-nav
  with `IntersectionObserver`-driven scroll-spy, falling back to the
  original flat vertical list whenever fewer than 2 real groups exist
  (a null/blank category is bucketed into a trailing "Other" group, not
  its own group). Added a client-side in-menu search box (name/
  description match) that hides empty groups and their pills, showing a
  "No items match" message if every group empties. `MenuItemRow`
  restyled — image-right layout with a circular accent "+" Quick Add
  button overlaid on the image's corner (same instant `addItem` call as
  before, restyle only; true customization with option groups stays
  piece 4's scope). New `components/RestaurantMenuAnchorNav.tsx`
  (presentational pill row).
  **3 Important bugs caught only by the final whole-branch review
  (opus), not the inline execution's own live-verify pass**: (1) the
  vendor menu-item edit form writes `category: ""` when a vendor clears
  the field, not `null` — `buildGroups` originally checked `=== null`
  only, so a blank category became its own blank-labeled group with an
  empty pill; separately, different category labels could collide on
  the same slug (trailing-space/case variants, non-Latin labels, or a
  real "Other" category colliding with the synthetic null-bucket
  "Other"), giving duplicate React keys and duplicate section ids where
  the second section silently overwrote the first in the scroll-spy's
  ref map. Fixed by trimming/treating blank as uncategorized and
  de-duplicating slugs with a numeric suffix on collision. (2) clicking
  an anchor-nav pill scrolled to the section but didn't set the active
  highlight itself — only the `IntersectionObserver` did, which never
  fires for a short menu's trailing sections or mid-smooth-scroll, so
  the wrong pill stayed highlighted after clicking the last one on a
  short menu. Fixed by having the click handler set `activeKey`
  directly. (3) `scrollIntoView({ block: "start" })` landed the target
  section's heading directly behind the sticky anchor-nav (which has an
  opaque background), making it invisible right after the scroll it was
  supposed to reveal. Fixed with `scroll-mt-16` on each section. All
  three were live-reproduced and re-verified via Playwright before
  merge (an empty-string category plus a literal "Other" category on
  the same restaurant correctly produced two distinct "Other"
  pills/sections with no blank group; the click-highlight fix was
  confirmed on that same collision case).
  **Deferred minors** (ledgered, not fixed): `activeKey` can point at a
  group a search query just removed, leaving no pill highlighted until
  the next click; the scroll-spy's "most visible" comparison only
  considers entries whose intersection changed in the current observer
  callback rather than every section currently in the sticky zone; the
  in-menu search matches item name/description only, not the visible
  category/pill labels (a product-decision-worthy gap, not a bug per
  the spec); accessibility gaps (search input has no `aria-label`, pills
  have no `aria-current`/`aria-pressed`, the corner `+` button is below
  the 44px touch-target guideline at mobile width); a search that empties
  a category switches the page from grouped view to the flat list
  mid-search (matches the spec's stated threshold, a UX choice to
  confirm later, not a bug); the `IntersectionObserver`'s `-88px`
  `rootMargin` is an unexplained magic number not tied to a measured nav
  height.
  Plan: docs/superpowers/plans/2026-09-25-uber-eats-restaurant-page-rebuild.md
  Spec: docs/superpowers/specs/2026-09-25-uber-eats-restaurant-page-rebuild-design.md
- **Uber Eats-style redesign — Piece 4: Item customization**: ✅ Complete,
  built via `superpowers:subagent-driven-development` in worktree
  `worktree-uber-eats-item-customization` (10 tasks). New schema:
  `menu_item_option_groups`/`menu_item_options` (vendor-owned option
  groups with `min_select`/`max_select`, options with
  `price_delta_paise`) and `order_item_options` (a per-order snapshot of
  `group_name`/`option_name`/`price_delta_paise`, `menu_item_option_id`
  nullable via `on delete set null` so order history survives a deleted
  option). `checkout_place_order` RPC rewritten to accept and persist
  option selections. 5 new vendor CRUD routes for option groups/options,
  gated by `resolveVendorRestaurant` + `assertOwnsGroup`/
  `assertOwnsOption` ownership checks (no restaurant-scoping predicate on
  the write query itself — ruled acceptable, see final-review note
  below). Cart store (`lib/cart-store.tsx`) rewritten around a `lineId`
  (menuItemId + sorted selected option ids) instead of bare
  `menuItemId`, so two customizations of the same dish coexist as
  separate lines while identical selections merge by quantity; carries
  `normalizeStoredItem` for backward-compatible localStorage migration
  from the old flat shape. New `components/ItemCustomizationModal.tsx`
  replaces instant Quick Add for any item with option groups; a required
  group with zero options shows "No options available yet." and keeps
  Add-to-cart permanently disabled rather than crashing. Checkout route
  validates every selected option belongs to the item's own groups and
  every required group's min is met, rejecting cross-item option ids and
  missing-required-group submissions with 400s; server recomputes price
  from paise, never trusts a client-sent total. Vendor order queue shows
  selected option names and special-instructions notes from the
  snapshot, unaffected by later option deletion.
  **1 load-bearing bug found and fixed mid-plan (Task 8, plan-mandated
  pattern predating this piece)**: checkout's
  `items.map(i => i.menuItemId)` had no dedup, so two cart lines sharing
  a `menuItemId` (the exact case item customization exists to create —
  same dish, different options) tripped a `menuItems.length !==
  menuItemIds.length` check and 404'd the whole checkout. Harmless before
  piece 4 (the old cart could never hold two lines with the same
  `menuItemId`); load-bearing now. Fixed with `[...new
  Set(menuItemIds)]`. Same fix round also rejected duplicate option ids
  in one item's selection and capped `special_instructions` at 500
  characters server-side (`CartPanel`'s note textarea still has no
  client-side `maxLength`, deferred minor).
  **Live verification (Task 10) run end-to-end after a session
  interruption resumed mid-plan**: vendor option-group/option CRUD,
  cross-vendor write rejection (404), modal-blocks-instant-add +
  disabled-until-valid + lineId merge/split behavior, zero-option
  required group, per-line special instructions surviving reload,
  old-shape localStorage migration, a real order placed and checked
  byte-exact against `order_items`/`order_item_options`, cross-item
  option id and skipped-required-group checkout rejections (400s),
  order-history survival of a deleted option (verified live via psql
  after deleting an option vendor-side), vendor order-queue display, and
  a clean `npm run build`.
  **Final whole-branch review (opus)**: no Critical/Important findings.
  Verified the Task 1 migration adds no write policies on the 3 new
  tables (relying on service-role-only writes, per this project's RLS
  rule) and no self-referential or stub-overridden read policies — the
  RLS-recursion and stub-policy classes of bug that hit Phases 5-6 did
  not recur here. 3 new deferred minors: a vendor can create a required
  option group with fewer options than its `min_select` (or delete down
  to fewer), making the item unorderable — fails closed (Add-to-cart
  stays disabled, checkout would reject it) but silent, no admin/vendor
  warning; a group PATCH sending only one of `minSelect`/`maxSelect` can
  hit the DB's `max_select >= min_select` CHECK constraint and return a
  raw 500 instead of a 400 (data stays safe, only the status/message is
  wrong); `CartPanel`'s note textarea has no `maxLength=500` client-side
  (server already enforces it).
  Plan: docs/superpowers/plans/2026-09-25-uber-eats-item-customization.md
  Spec: docs/superpowers/specs/2026-09-25-uber-eats-item-customization-design.md
- **Mobile app (React Native + Expo, sub-project)**: not started — begins
  after the Uber Eats redesign's remaining pieces (5-6).

## Key decisions carried forward (see spec §2 for full list)

- Self-hosted Supabase only, no cloud project.
- Cart is single-restaurant only.
- Cuisine taxonomy is a fixed predefined list (`cuisine_taxonomy` table +
  DB trigger enforcement, not just UI-level).
- Auth: one `role` column drives redirect (customer/vendor/delivery/admin).
- Branding: "Fresh & Quick" name + richer DoorDash-inspired red/orange/
  cream theme (6 tokens as of the redesign), isolated to
  `lib/branding.ts` + Tailwind `@theme` tokens.
- No Google Maps API key yet — address picker is a manual lat/lng stub.
- Mobile app is in scope but sequenced after the web platform ships.

## Known deferred items (carried from phase reviews, not yet addressed)

- ~~`menu_items` unused vendor RLS write policies~~ — **closed**, see
  `supabase/migrations/00000000000010_close_menu_items_rls_bypass.sql`.
  Found live during Phase 6's full-migration audit (Phase 4's
  `vendor_can_insert/update/delete_own_menu_items` policies let a vendor
  bypass their API route's validation via direct PostgREST — e.g. a
  price of 0.001, or skipping the allowed-image-host check), fixed
  immediately after Phase 6 merged rather than left deferred again, since
  it was the third instance this session of the same "leftover RLS write
  policy on a service-role-only table" bug class (Phase 4: orders/
  restaurants; Phase 5: delivery_partners; this: menu_items). Verified
  live post-fix: the legit `/api/vendor/menu-items` route still works,
  a direct PostgREST write with the vendor's own token now silently
  affects 0 rows (RLS-blocked) instead of succeeding.
- ~~`reviews` table still has its original Phase 1 permissive
  `stub_allow_authenticated_read` policy~~ — **closed in
  deferred-items-triage**. Tightened to `authenticated`-only read (full
  owner/public-scoped policy still deferred until a real review feature
  is built and gives this table real write traffic).
- ~~Delivery partner location ping uses manual lat/lng inputs only~~ —
  **closed in deferred-items-triage**. Now prefills from
  `navigator.geolocation` when permission is granted, falling back to the
  existing manual inputs on denial/unavailability.
- ~~Delivery dashboard doesn't auto-refresh the available-orders list~~ —
  **closed in deferred-items-triage**. Polls every 10s while the partner
  is online, alongside the existing 15s location ping.
- ~~Delivery partner has no way to see the customer's delivery address~~ —
  **closed in deferred-items-triage**. New RLS policy on `addresses`
  scoped to the partner's own `assigned`/`picked_up` orders (mirrors the
  existing location-share policy's expiry) + a route with its own
  independent ownership+status check (service-role bypasses RLS, so the
  route can't rely on the policy alone).
- ~~Vendor and delivery signup routes both have loose input
  validation~~ — **closed in deferred-items-triage**. Shared
  `lib/signup-validation.ts` helper (length/type checks, vehicle-type
  whitelist) wired into both routes.

- ~~No in-product way for a vendor to open their restaurant~~ — **closed
  in deferred-items-triage**. `PATCH /api/vendor/restaurant` + a toggle on
  `/vendor/dashboard`, refuses to open with zero available menu items.
- ~~Vendor order queue is not filterable/sortable by status~~ — **closed
  in deferred-items-triage**. Client-side status filter + sort-order
  toggle. Final whole-branch review caught the sort as backwards (default
  labeled "Oldest first" but the API already returns newest-first, so the
  toggle wasn't actually reordering anything) — fixed by sorting a copy
  of the list explicitly by `placed_at` instead of relying on the API's
  implicit order.
- ~~Vendor menu UI only supports an availability toggle and delete~~ —
  **closed in deferred-items-triage**. Inline edit form for
  name/description/category/veg/price/image URL, using the existing
  PATCH route (no route change needed).
- ~~Vendor pages don't surface every write failure~~ — **closed in
  Phase 8**. Vendor menu's availability toggle, vendor orders' and
  delivery dashboard's status-advance/claim buttons now all show an
  error message on a non-2xx response, matching the pattern the delete
  button and admin dashboard's reassign control already used.
- ~~Currency display is inconsistent between customer pages and vendor
  pages~~ — **closed in deferred-items-triage**. All pages now use
  `.toFixed(2)`.

- No spatial/PostGIS indexing for restaurant lat/lng (Phase 1 review;
  revisit if Phase 2+'s query patterns show it's needed at scale).
- ~~Closed restaurants are still directly orderable by menu-page URL~~ —
  **closed in deferred-items-triage**. The menu page now re-checks
  `is_open`/`is_suspended` and warns the customer before checkout, matching
  the checkout API's existing independent re-validation.
- ~~Every customer-app navigation is a full page reload (`<a href>`
  instead of `next/link`)~~ — **closed in the DoorDash-layout rebuild**.
  `RestaurantCard.tsx` was the one remaining raw `<a href>` (the
  post-Phase-8 triage's "no `<a href>` tags exist" note was wrong —
  never re-checked after the triage's own file scope missed it); now
  uses `next/link`'s `Link`. Grepped clean across all customer-app files
  as of this session.
- New deferred minors from the DoorDash-layout rebuild's final review
  (see that phase's entry above for full context): `AddressPicker`'s
  dropdown isn't absolutely positioned (shifts header layout instead of
  overlaying); header's "Sign In" link doesn't reflect a logged-in
  session; `HeaderSearchBox` missing `"use client"` (safe today, latent
  risk if ever imported server-side); minor accessibility gaps (search
  input accessible name, sidebar icon `aria-hidden`, disabled Pickup
  button's unreachable-via-keyboard tooltip).
- ~~No DB transaction across checkout's 4 sequential inserts~~ — **closed
  in deferred-items-triage**. Checkout now runs through a single
  `checkout_place_order` `security definer` Postgres RPC
  (`supabase/migrations/00000000000013_checkout_rpc.sql`) so all inserts
  are atomic. Final review of that migration caught a critical grant bug:
  the function was granted `execute` to `authenticated`, which would have
  let any logged-in customer call it directly via PostgREST with their own
  token, bypassing the checkout route's identity check, price
  re-validation, and restaurant-open/suspended check entirely. Fixed by
  revoking from public/anon/authenticated and granting only to
  `service_role` (the checkout route's own client). Verified live: a
  customer's own bearer token against `POST /rest/v1/rpc/
  checkout_place_order` is now rejected with permission denied, while the
  real `/customer/checkout` UI flow still places orders successfully.
- `order_items` RLS was already fixed in Phase 4 (migration 7: dropped the
  Phase 1 permissive stub and created owner + vendor-specific read policies)
  — this entry was stale, discovered during post-Phase-8 deferred-items
  triage.
- ~~Order confirmation page polls forever even after the order reaches a
  terminal state~~ — **closed in deferred-items-triage**. Polling now stops
  once the order status is `delivered` or `cancelled`.
- No automated test suite exists yet — all verification so far has been
  `tsc`/`build`/manual + Playwright walkthroughs documented per task.
- **Always run `npm run build` (not just `tsc --noEmit`) before marking a
  UI-page task done** — Phase 3 shipped a build-breaking missing Suspense
  boundary that `tsc` alone didn't catch, because only one early task
  happened to run a full build.
- **Any code touching money math must use integer-cents/paise arithmetic**,
  never plain JS float multiplication — Postgres's exact-numeric CHECK
  constraints will reject float rounding errors that don't show up with
  whole-number seed data. Add this explicitly as a Global Constraint in
  any future plan that touches prices/totals.

## External API keys in use

- `PEXELS_API_KEY` — Pexels Search API, used once (not at runtime) to fetch
  menu item photo URLs baked into `supabase/seed.sql`. Key lives in
  `.env.local` only.
