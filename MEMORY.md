# MEMORY.md — FoodHub Build Status

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
  **Known remaining issues in the untested JSON** (deferred — fix when
  actually wiring a real n8n instance, since nothing here can verify the
  fix without one): the `IF` nodes declare `typeVersion: 2` but use v1's
  parameter shape; workflow 02's decision node uses a legacy
  `function`-node API (`$input.item.json`) that may not match its
  declared type; workflow 04 indexes the restaurant-lookup HTTP response
  as `$json[0]` when n8n's HTTP Request v4 likely splits a JSON array
  into separate items (`$json` directly); no empty-candidates guard
  before workflow 04's assign POST; webhook nodes are missing
  `webhookId` (may regenerate on import); the setup doc's local n8n
  Docker image name and Supabase-webhooks-in-config.toml instructions
  need double-checking against current tooling.
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
- **Mobile app (React Native + Expo, sub-project)**: not started — begins
  after the deferred-items triage.

## Key decisions carried forward (see spec §2 for full list)

- Self-hosted Supabase only, no cloud project.
- Cart is single-restaurant only.
- Cuisine taxonomy is a fixed predefined list (`cuisine_taxonomy` table +
  DB trigger enforcement, not just UI-level).
- Auth: one `role` column drives redirect (customer/vendor/delivery/admin).
- Branding: placeholder "FoodHub" name + orange/red theme, isolated to
  `lib/branding.ts` + Tailwind tokens.
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
- Every customer-app navigation is a full page reload (`<a href>` instead
  of `next/link`) — plan-specified in Phase 2, worth revisiting.
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
