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
- **Phase 7 — n8n automation wiring**: not started.
- **Phase 8 — Polish/testing**: not started.
- **Mobile app (React Native + Expo, sub-project)**: not started — begins
  after Phase 8.

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

- **`menu_items` still has three unused vendor RLS write policies from
  Phase 4** (`vendor_can_insert/update/delete_own_menu_items`, migration
  7) that let a vendor bypass their own API route's validation via direct
  PostgREST — e.g. setting an image URL that skips the allowed-host
  check, or a price of 0.001 that skips the `price > 0`/integer-paise
  rounding. Confirmed live during Phase 6's full-migration audit (a
  rolled-back transaction proved the bypass). Damage is scoped to the
  vendor's own restaurant only, so it wasn't treated as a Phase 6
  blocker, but it's the same class of bug Phase 4's own final review
  fixed for `orders`/`restaurants` and missed for `menu_items` — should
  be closed in its own small migration (drop the three policies; every
  menu-item write already goes through `/api/vendor/menu-items/*`).
- **`reviews` table still has its original Phase 1 permissive
  `stub_allow_authenticated_read` policy** (`using (true)` — anyone,
  including anon, can read every review row with its `customer_id` and
  `order_id`). No phase has written to `reviews` yet, so this isn't
  currently exploitable for writes, but it's the one remaining un-audited
  stub from Phase 1's original 9-table sweep (Phase 5's final review
  confirmed it while auditing all tables for the delivery_partners-class
  leak). Whichever future phase first builds real review functionality
  must replace this with an owner/public-appropriate policy before that
  table holds real user-submitted content.
- Delivery partner location ping uses manual lat/lng inputs only — the
  spec's fallback-to-manual design was kept, but the "use
  `navigator.geolocation` when available" half was dropped from the
  Phase 5 plan for simplicity. Low priority; add if real device testing
  becomes relevant before Google Maps integration.
- Delivery dashboard doesn't auto-refresh the available-orders list —
  only reloads after the partner's own actions (toggle/claim/advance).
  A newly-ready order won't appear until the partner does something.
  Acceptable for now; Phase 7's n8n auto-assignment likely replaces this
  self-claim UI's need for polling entirely.
- Delivery partner has no way to see the customer's delivery address —
  no route returns it and RLS doesn't grant partner read access to
  `addresses`. Needed for a real delivery flow; deferred since Phase 5's
  spec only asked for status/location tracking, not address handoff.
- Vendor and delivery signup routes both have loose input validation
  (no length/type checks on names, no vehicle-type whitelist) — low risk,
  same looseness in both, worth a shared validation helper in a polish
  pass.

- **No in-product way for a vendor to open their restaurant** — signup
  sets `is_open=false` and nothing in Phase 4 ever sets it back to `true`.
  Currently requires a manual Supabase Studio edit. Needs a small
  `/api/vendor/restaurant` PATCH route (service role) + an "Open/Close"
  toggle in the vendor dashboard, ideally refusing to open with zero
  available menu items. Good Phase 5/6 or polish-phase candidate.
- Vendor order queue is not filterable/sortable by status (sorted by
  `placed_at` only) — fine for the current low-volume demo scale.
- Vendor menu UI only supports an availability toggle and delete; there's
  no edit form for name/price/category/veg despite the PATCH route
  supporting all of them. Low priority — add if vendors need it.
- Vendor pages (`menu`, `orders`) don't surface every write failure to the
  UI equally — delete now does (Phase 4 final-review fix), but the
  availability toggle and status-advance buttons still fail silently on a
  non-2xx response. Worth a shared error-surfacing pattern in a polish
  pass rather than three separate fixes.
- Currency display is inconsistent between customer pages (`.toFixed(2)`)
  and the new vendor pages (raw `₹{value}`, no fixed decimals) — cosmetic,
  fine for now.

- No spatial/PostGIS indexing for restaurant lat/lng (Phase 1 review;
  revisit if Phase 2+'s query patterns show it's needed at scale).
- Closed restaurants are still directly orderable by menu-page URL (browse
  list correctly filters them, but the menu page itself doesn't re-check
  `is_open`) — checkout API does independently re-validate at order time
  (Phase 3), so no order can complete against a closed restaurant, but the
  menu page UI itself doesn't warn the customer before they try.
- Every customer-app navigation is a full page reload (`<a href>` instead
  of `next/link`) — plan-specified in Phase 2, worth revisiting.
- No DB transaction across checkout's 4 sequential inserts (addresses/
  orders/order_items/payments) — a partial failure could orphan rows.
  Needs a Postgres RPC function for real atomicity; judged acceptable for
  now given local-only demo traffic (Phase 3 review).
- `order_items` table still has the fully-permissive Phase 1 stub RLS
  policy (any authenticated user can read any order's line items/
  quantities, though not who placed them) — users/addresses/orders/
  payments were tightened to owner-only in Phase 3, `order_items` wasn't
  in scope for that fix.
- Order confirmation page polls forever even after the order reaches a
  terminal state (delivered/cancelled) — only unmount stops it. Low
  severity, Phase 8 polish candidate.
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
