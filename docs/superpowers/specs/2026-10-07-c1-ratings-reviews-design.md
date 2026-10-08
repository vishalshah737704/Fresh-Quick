# C1 — Ratings and reviews for stores, dishes and the delivery partner (design)

Date: 2026-10-07. Sub-project 2 of 4 in the "High-impact Customer enhancements" programme
(order: C3 favorites and reorder (done), C1 this document, C2 coupons and referral credit, C4 notifications).
Source: `docs/Enhancements.docx`, item C1, with its dependencies V6 (vendor reply), D6 (partner score),
A7 (review moderation) and N4 (n8n review request).

## 1. Goal and success criteria

After an order is delivered, its customer can rate the store, each dish they ordered and the delivery
partner, with comments and one optional photo on the store review. Everyone else sees honest, moderated
ratings.

- A customer can review each of their delivered orders exactly once, on web and on the phone.
- Store pages show a real average, a review count and a list of visible reviews (reviewer shown as
  "First name + last initial", comment, photo, vendor reply). Dish rows show their average once they have ratings.
- The vendor reads their own store's reviews and replies once (editable).
- The delivery partner sees their own average, count and recent comments.
- The customer sees the assigned partner's average on the order page, only after the partner has at least
  5 ratings; otherwise "New partner".
- The admin sees all reviews, can hide and unhide a review with a reason, and sees partner averages.
  A customer or vendor can report a review; reports queue for the admin.
- Hiding or unhiding a review recomputes every affected average from visible reviews only.
- n8n asks for a review one hour after delivery by email, skipped when the order is already reviewed.

Not in scope: editing or deleting a review by its customer, review voting ("helpful"), photos on dish
reviews, a profanity filter, vendor-side hiding, review notifications other than the n8n email (C4), score
penalties or payouts based on partner rating.

## 2. Existing state this builds on

- `public.reviews` (migration 1, `restaurant_id` renamed `store_id` in migration 20): `id`, `order_id`
  (unique, cascades from `orders`), `customer_id`, `store_id`, `rating` 1 to 5, `comment`, `created_at`.
  Zero rows, no code touches it. Migration 11 left a single "authenticated can read" policy; this design
  replaces it (section 3).
- Tables are `stores`, `products` and `order_items.product_id` (renamed in migration 20). Orders carry
  `delivery_partner_id` (a `users.id`) and `delivered_at` (migration 27).
- `delivery_partners` is keyed by `user_id`. `users.full_name` holds the display name.
- `stores.rating numeric not null default 0` is shown by `RestaurantCard`, the mobile `StoreCard`,
  `StoreRatingSummary` (static), the sort and filter bar, and Zippy's catalog (`rating`, `min_rating`).
- No Storage bucket is used by the app today.
- Workflow 05 already has a delivered branch with a placeholder node "Finalize Payment + Prompt Review"
  and a live Gmail send.
- Auth helpers: `resolveCustomer` (`lib/customer-auth.ts`), `resolveVendorStore`, `resolveDeliveryPartner`,
  `resolveAdmin`, `verifyInternalSecret`.

## 3. Data (migration 37, `00000000000037_reviews.sql`)

### 3.1 Existing table `reviews` gains

| Column | Type | Purpose |
|---|---|---|
| `status` | text, `visible` or `hidden`, default `visible` | moderation state |
| `hidden_reason` | text, nullable, at most 300 chars | shown to admin only |
| `hidden_at` | timestamptz, nullable | |
| `photo_path` | text, nullable | object path inside the `review-photos` bucket |
| `vendor_reply` | text, nullable, at most 600 chars | |
| `vendor_reply_at` | timestamptz, nullable | |
| `reported_at` | timestamptz, nullable | set by the first report; cleared when the admin resolves |
| `report_reason` | text, nullable, at most 300 chars | |
| `reported_by` | text, nullable, `customer` or `vendor` | |

Checks: `comment` at most 1000 characters. Indexes on `(store_id, status, created_at desc)` and on
`reported_at` where not null. `order_id` stays unique, which makes one review per order a database rule.

### 3.2 New child tables

- `review_dishes (id, review_id references reviews on delete cascade, product_id references products,
  stars 1..5, comment at most 500 chars, unique (review_id, product_id))`.
- `review_partner (review_id primary key references reviews on delete cascade, partner_id references users,
  stars 1..5, comment at most 500 chars)`.

### 3.3 Aggregate columns (integers, so no float drift)

- `stores`: `rating_sum integer default 0`, `rating_count integer default 0`, `seed_rating numeric`
  (backfilled from the current `rating`). `rating` stays the column everything reads.
- `products`: `rating_sum`, `rating_count`.
- `delivery_partners`: `rating_sum`, `rating_count`.

### 3.4 Trigger `recompute_review_aggregates`

Runs after insert on `reviews` and after update of `status` on `reviews` (and after insert on the two child
tables, because they are written after the parent row, in one transaction by the RPC in section 4.1). It
recalculates, for the affected store, the affected products and the affected partner, the sum and count over
visible reviews only. `stores.rating` becomes `round(rating_sum::numeric / rating_count, 1)` when the count is
above 0, otherwise `seed_rating`, so seeded stores keep a sensible number until their first real review and
return to it if their only review is hidden. Implemented as one `security definer` function with
`set search_path = ''`, using `for update` row locks on the aggregate rows so concurrent reviews cannot
lose an update.

### 3.5 RLS

All three tables: RLS enabled, **no policies** (service-role only). The migration drops the
"authenticated can read" policy from migration 11. Reads and writes go through API routes with allow-lists.
This follows the project rule that tables written through service-role routes get no write policy, and it
means a client with its own anon token cannot read `customer_id` or hidden reviews. Before adding policies
or dropping them, list the existing ones with `select * from pg_policies where tablename like 'review%'`.

### 3.6 Storage

A private bucket `review-photos`, created in the migration (`insert into storage.buckets ... public = false,
file_size_limit 3145728, allowed_mime_types image/jpeg, image/png, image/webp`). No storage policies, so only the
service role reads or writes. Objects live at `reviews/<review_id>/<random>.<ext>` generated by the server.
Photos are personal data: they are served only as signed URLs valid for one hour, and are deleted with the
review (see 4.1 on failure ordering) and by Reset Data (see 9).

## 4. API

All identity comes from the verified session token; no customer, vendor, partner or store id is taken from a
body as proof of identity. All role-scoped responses are built from allow-lists, never spreads.

### 4.1 Customer

- `POST /api/customer/orders/[id]/review` (multipart: `payload` JSON plus optional `photo` file).
  Payload: `{ storeStars, storeComment?, dishes: [{ productId, stars, comment? }], partner?: { stars, comment? } }`.
  Checks, in order: customer resolved; the order exists, belongs to the customer (filter on customer id,
  otherwise 404 "not found") and has status `delivered` (otherwise 409); no review yet (409 "already reviewed");
  every `productId` is a line of that order (a duplicate or foreign id is a 400); `partner` is accepted only
  when the order has a `delivery_partner_id`, and the partner id is read from the order; text fields are
  trimmed and length-capped; stars are integers 1..5. The photo is checked for size (3 MB), declared type and
  the magic bytes (JPEG, PNG or WebP), and stored under a server-generated path.
  Write order: upload the photo first, then call RPC `create_review(...)`, which inserts the review and its
  children in one transaction (the trigger runs inside it). If the RPC fails, the uploaded object is deleted
  (best effort, logged). A unique violation on `order_id` returns 409.
  Response: the review as in 4.2 (own review view).
- `GET /api/customer/orders/[id]/review` returns the customer's own review of that order (404 if none) or
  `{ eligible: boolean }` so the order screens can decide whether to show the rating card.
- `POST /api/customer/reviews/[id]/report` body `{ reason }`: allowed for a review of any store (a customer
  may report a review that is not theirs and not their own); idempotent (the first report wins; a second
  returns 200 without change). Reporting does not hide anything.

### 4.2 Public read (any customer or visitor, no login needed on web store pages)

- `GET /api/stores/[id]/reviews?cursor=` returns visible reviews, newest first, 10 per page:
  `{ id, reviewerName, stars, comment, photoUrl, dishes: [{ name, stars }], createdAt, vendorReply, vendorReplyAt }`.
  `reviewerName` is derived server-side (4.5). `customer_id`, partner data, report fields and hidden rows are
  never included. `photoUrl` is a one-hour signed URL.
- `GET /api/stores/[id]/rating` returns `{ rating, count, histogram: [n1..n5] }` from visible reviews.
- Dish averages are returned by the existing store and product loaders from `products.rating_sum /
  rating_count` (average rounded to one decimal in a shared pure helper, with the count).

### 4.3 Vendor

- `GET /api/vendor/reviews?status=&cursor=` lists the vendor's own store's reviews (visible and reported;
  hidden ones are shown with a "hidden by admin" label and no content) with the same allow-list as 4.2 plus
  `reported`. Store is derived by `resolveVendorStore`.
- `PUT /api/vendor/reviews/[id]/reply` body `{ reply }` (1..600 chars) sets or replaces the reply;
  `DELETE` clears it. The review must belong to the vendor's store (404 otherwise) and be visible.
- `POST /api/vendor/reviews/[id]/report` body `{ reason }` queues it for the admin (same idempotency).

### 4.4 Delivery partner

- `GET /api/delivery/rating` returns `{ average, count, recent: [{ stars, comment, createdAt }] }` for the
  signed-in partner (last 20 visible reviews that carry a partner rating). No customer names, no order or
  store identifiers. Partner derived by `resolveDeliveryPartner`.
- The customer order response (`lib/order-detail.ts`) gains `partnerScore: { average, count } | { isNew: true }`
  built by a pure helper (threshold constant `PARTNER_SCORE_MIN_RATINGS = 5`). It exposes only the aggregate,
  never an individual rating. The existing redaction tests for the delivery view are extended so the new
  fields cannot reach other roles' responses.

### 4.5 Admin

- `GET /api/admin/reviews?filter=reported|hidden|all&cursor=` returns full review rows, including the
  reporter type and reason, the hidden reason, the customer's name, the store name and the partner rating
  (admin sees everything).
- `POST /api/admin/reviews/[id]/hide` body `{ reason }` and `POST .../unhide`. Each sets `status`,
  `hidden_reason`/`hidden_at`, clears `reported_at` (resolving the report) and lets the trigger recompute.
  Hiding is idempotent.
- `POST /api/admin/reviews/[id]/dismiss-report` clears the report without hiding.
- `GET /api/admin/delivery-partners` (existing) gains `ratingAverage`, `ratingCount` and a `lowScore` flag
  (average below 3.0 with at least 5 ratings).

### 4.6 Internal (n8n)

- `GET /api/internal/orders/[id]/review-eligibility` (internal secret) returns
  `{ eligible, recipientEmail, subject, html }`. `eligible` is true only when the order is `delivered`, has no
  review, and was delivered more than 55 minutes ago (a guard against the wrong order or a duplicate trigger).
  The HTML is built in `lib/review-request-email.ts` (escaped, link to the order page) following
  `lib/delivered-email.ts`.

### 4.7 Reviewer name

`reviewerDisplayName(fullName)` (pure, shared): first word plus the initial of the last word and a full stop
("Vishal S."), a single word stays as is, empty or missing becomes "Customer". Never email, phone or user id.

## 5. Clients

### 5.1 Customer web

- `components/reviews/ReviewForm.tsx`: "Rate your order" card on `app/customer/orders/[id]/page.tsx` once the
  order is `delivered` and `eligible`: store stars (required), comment, photo picker with preview and size
  and type errors shown inline, one star row per distinct dish (optional, skipped dishes send nothing), a
  partner stars row (optional) with the wording "How was the delivery? Rate the rider's handling and
  courtesy, not the restaurant's wait." After submit the card shows the review read-only.
- `components/reviews/StoreReviews.tsx` under `StoreRatingSummary` on the store page: real average, count,
  five-bar histogram, list with "Load more", "Report" link per review (signed-in customers; a signed-out tap
  goes to login). `StoreRatingSummary` becomes data-driven and prints "(N reviews)" only when N > 0.
- Dish rows on the store page show "4.3 (12)" when a dish has ratings.
- Order page shows the partner score line ("Your rider: Ramesh · 4.6 (38 ratings)" or "Your rider · New partner").
- Any new `"use client"` dynamic page gets a sibling `loading.tsx`. Store and order pages already have one.
- A helper hook `lib/use-review.ts` owns the load and submit state. Fetched data is tagged with the owner user
  id and the visible value is derived (repo lint rule `react-hooks/set-state-in-effect`).

### 5.2 Customer phone

- Same screens: rating card on the order detail screen, reviews section on the store screen, dish averages,
  partner score line, report action. Photo picking uses `expo-image-picker` only if it is already in
  `mobile/package.json`; if it is not, **stop and ask Vishal** before installing anything (a package install
  needs approval). The photo field is hidden on the phone if the package is unavailable and Vishal declines.
- Pure shared logic is byte-identical between web and phone and guarded by `tests/mobile-parity.test.mjs`:
  `lib/reviews-model.ts` -> `mobile/lib/reviews-model.ts` (stars and length validation, `reviewerDisplayName`,
  average and histogram helpers, partner score rule, payload builder).

### 5.3 Vendor portal (web only)

`app/vendor/(portal)/reviews/page.tsx` with a sidebar entry: a list with filters (all, no reply, reported),
a reply box per review (save, edit, delete) and a "Report" action. A "needs reply" count badge. A
`loading.tsx` sibling.

### 5.4 Delivery portal (web and phone)

Web `app/delivery/(portal)/rating/page.tsx` and a sidebar entry; phone gets a "My rating" card on the
partner dashboard. Shows average, count and the recent comments without customer identity.

### 5.5 Admin portal (web only)

`app/admin/(portal)/reviews/page.tsx`: tabs Reported, Hidden, All; each row shows store, reviewer,
stars, comment, photo thumbnail (signed URL), report reason, with Hide (reason required), Unhide and Dismiss
report buttons. The Delivery Partners page gains rating columns and a low-score badge. A Reviews entry joins
the admin sidebar with a reported count.

## 6. n8n

Workflow 05's delivered branch gains a second path in parallel with the existing delivered email:
`Wait 1 h` -> `GET /api/internal/orders/:id/review-eligibility` -> `IF eligible` -> `Gmail: Send Review Request`.
The placeholder node "Finalize Payment + Prompt Review (placeholder)" is left in place (it is not part of this
sub-project). The Gmail node reuses the credential already used by workflows 03 and 05 (never commit a real
credential id; a test guards it), uses `String(...)` around any `.includes()` in IF nodes (n8n 2.40.7), and the
repo JSON stays importable (top-level `id`). Publish in the n8n UI, never restart the `--rm` container.
Pending Wait executions are removed by Reset Data. Document in `docs/n8n-webhook-setup.md`.

**Email safety:** the Gmail node is live. Tests of this path use only an address Vishal owns, one order at a
time with his approval, or the node is switched off and verification is done from the execution record. The
eligibility route can be exercised by curl without n8n.

## 7. Abuse and privacy controls

- One review per order (unique constraint) and only for `delivered` orders of the signed-in customer.
- Text is stored as plain text and rendered escaped (React); no HTML anywhere. Lengths are capped in the
  route and in the database.
- Photos: type, size and magic-byte checks, server-generated path, private bucket, one-hour signed URLs,
  deleted with the review.
- Reports are idempotent and only queue; only the admin changes visibility. A burst limit on the review and
  report routes is not added (local-only install; noted in the audit list for any public launch,
  `docs/DEPLOYMENT.md`).
- Partner ratings are visible to the partner and admin; customers see only the aggregate after 5 ratings.
- Stale or missing data: a review of a store later suspended or deleted follows existing cascade rules
  (`reviews` cascades from `orders`; deleting a customer account deletes via the orders cascade, which Reset
  Data already does before deleting users).
- Allow-lists: every response above lists its fields explicitly; tests assert that `customer_id`, report
  fields (except for admin and vendor-own), partner data and hidden rows never reach the wrong role.

## 8. Testing and verification

Unit tests (node test runner, dependencies injected so no server-only import):

- `lib/reviews-model.ts`: star and length validation, display name table, average and histogram, partner
  threshold, payload builder; parity test for the phone copy.
- Review creation logic: not delivered (409), foreign order (404), duplicate (409), foreign productId (400),
  partner taken from the order, photo checks (type, size, bad magic bytes), cleanup of the uploaded object
  when the RPC fails.
- Aggregate maths helpers and a SQL test in a rolled-back transaction: insert reviews, hide one, check
  `stores.rating`, product and partner sums, fall back to `seed_rating` at zero.
- Vendor reply ownership, admin hide/unhide/dismiss, report idempotency, allow-list tests for every
  response, the review-eligibility route (eligible, already reviewed, too early, not delivered), the email
  builder (escaping).
- Workflow JSON test: the new nodes exist and the credential id guard still passes.

Live verification (a third-party and a client action must be driven for real):

- API contract by curl for every route and status code above, including a second customer reading another's
  order review (404), and a hidden review's photo URL no longer appearing in the public list.
- Web in Chrome: submit a review with a photo from a throwaway customer on a delivered order inserted by SQL
  with `set session_replication_role = replica`; store page shows it; vendor (port 3001) replies; customer
  reports; admin (port 3003) hides, store average and count change, unhides, partner sees rating
  (port 3002); a second submit is refused; a 4 MB file and a text file are rejected.
- Android emulator: rating card, store reviews, report, partner "My rating". Vishal checks the iPhone.
- `npm run build` (not only `tsc`), lint, both type-checks, the full test suite.
- Test data hygiene: never insert a `picked_up` order (the delivery animation completes it and fires
  Gmail); create customers through the GoTrue admin API (not `/api/auth/signup`, which calls a paid geocoder);
  delete every row and storage object created; do not touch Vishal's own customer or his order.

## 9. Docs, knowledge and Reset Data

- `knowledge/` Q&As (customer ordering web and phone, vendor, delivery, admin) are fact-checked against the
  code, then re-ingested and `node scripts/zippy-eval.mjs` re-run (58/58 baseline) by Vishal or with his
  approval of the API spend.
- Both user manuals gain a reviews section (web, vendor, delivery and admin parts; phone customer and partner
  parts) through "Update Manuals" at the end; version bumps and TOC renumber follow that procedure.
- "Reset Data" in `CLAUDE.md` gains one step: delete all objects in the `review-photos` bucket (reviews cascade
  from orders, so rows need no SQL change).
- `CLAUDE.md`, `MEMORY.md` and `README.md` get a C1 entry through "Commit Work".

## 10. Rulings made on Vishal's behalf (cost if wrong)

- No edit or delete of a review by its customer (low; add later).
- Vendors can report but not hide (low).
- Partner score visible to customers only from 5 ratings, shown as an average only (a constant, one line to change).
- Customers can report any review; a report only queues (low).
- `stores.rating` falls back to the seeded value when there are no visible reviews (low; shown in the UI without a count).
- One review per order, rating all dishes optional; a missing dish rating sends nothing rather than a default (low).
- Review request email after 1 hour, skipped when already reviewed (low).
- Photo field on the phone depends on `expo-image-picker` already being installed; if not, ask before installing (medium: could delay phone photo support).

## 11. Build order (for the plan)

1. Migration 37 (tables, trigger, bucket, RLS) plus SQL tests.
2. Shared pure model plus parity copy and unit tests.
3. Customer review create/read routes plus photo handling plus tests.
4. Public read routes and customer web UI (form, store reviews, dish averages, partner score).
5. Phone UI.
6. Vendor routes and page.
7. Delivery rating route and web/phone UI.
8. Admin routes and pages, report flow.
9. n8n review request path plus internal route plus email builder.
10. Knowledge, docs, Reset Data step, final whole-branch review, fix wave, live verification, manuals, merge.
