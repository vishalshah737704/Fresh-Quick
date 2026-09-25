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
- **Phase 5 — Delivery partner app + live tracking**: not started.
- **Phase 6 — Admin dashboard**: not started.
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
