# C1 Ratings and Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After an order is delivered, its customer can rate the store, each dish and the delivery partner (with comments and one optional store-review photo); vendors reply, admins moderate, partners see their rating, and n8n asks for a review an hour after delivery.

**Architecture:** Extend the existing `reviews` table with moderation, photo and reply columns; add `review_dishes` and `review_partner` child tables and integer aggregate columns on `stores`, `products` and `delivery_partners`. All writes go through service-role API routes (customer derived from the session token) and two `security definer` SQL functions (`create_review`, `recompute_review_aggregates`); no RLS policies on the review tables. Pure logic (validation, display name, averages, row shapers, photo sniffing, email HTML) lives in import-free modules so `node --test` runs them; the pure model is shared byte-identical with the phone app.

**Tech Stack:** Next.js App Router (this repo's version, see the warning in CLAUDE.md: read `node_modules/next/dist/docs/` before writing route code), TypeScript, Supabase Postgres + Storage (local Docker), n8n workflow JSON, Expo SDK 57 / React Native, node `--test`.

**Spec:** `docs/superpowers/specs/2026-10-07-c1-ratings-reviews-design.md`

## Global Constraints

- Indentation 2 spaces; ES modules; `async/await`, never `.then()` chains; comments only when the WHY is non-obvious.
- Money not involved. Averages are integer sums and counts; the average is `Math.round(sum * 10 / count) / 10` in TypeScript and `round(sum::numeric / count, 1)` in SQL.
- Tables are `stores`, `products`, `order_items.product_id` (renamed in migration 20). `orders.customer_id` is nullable (migration 28: orders outlive customers).
- No RLS policy on `reviews`, `review_dishes`, `review_partner` (service-role only). Never add a write policy.
- Customer identity only from the verified session token (`resolveCustomer`). Never a customer, vendor, partner or store id from a request body as proof of identity. The partner rated is read from the order, never from the body.
- Role-scoped responses are built field by field (allow-lists), never by spreading a row.
- Pure modules (`lib/reviews-model.ts`, `lib/review-photo.ts`, `lib/review-request-email.ts`) import NOTHING at runtime (type-only imports are fine) so `node --test` can load them. Tests import with an explicit `.ts` extension.
- `lib/reviews-model.ts` and `mobile/lib/reviews-model.ts` are byte-identical; `tests/mobile-parity.test.mjs` guards it.
- Every new `"use client"` dynamic page `app/**/[id]/page.tsx` that fetches after mount needs a sibling `loading.tsx`. The new vendor/delivery/admin pages are static routes inside route groups that already exist; they do not need one, but keep their loading state visible in the page.
- Repo lint rules: `react-hooks/set-state-in-effect` (store fetched data tagged with its owner key and derive the visible value) and `react-hooks/refs` (assign refs in `useEffect`, never during render).
- Run `npm run build` (not only `tsc`) before calling a route or page task done; the mobile app is type-checked with `cd mobile && npx tsc --noEmit`.
- Do NOT: start n8n, run `npm run app:start`, `scripts/start.mjs` or `start-all-roles`, read or print any `.env*` file or key, run `supabase db reset`, install packages, delete anything you did not create, push, or `git add -A`. Stage files by name. Check what owns a port (`netstat -ano | findstr :3000`) before stopping or rebuilding anything on ports 3000 to 3003 or 8081. The dev servers on 3000 (customer), 3001 (vendor), 3002 (delivery), 3003 (admin) are running; edits hot-reload.
- Test data: never touch Vishal's own iPhone customer account or his one order. Create throwaway customers through the GoTrue admin API and orders by SQL with `set session_replication_role = replica` (no webhook, no email), status `delivered` or `assigned`, never `picked_up`. Delete every row and storage object you create (Task 1 gives a script).
- Gmail is LIVE: no real checkout, no fake recipient emails on orders that could trigger workflow 03 or 05. SQL-inserted orders with replica role fire no webhook.
- Steps marked (controller) are done by the main session, not by an implementer subagent: anything that asks Vishal a question, imports into n8n, installs a package, or needs a secret.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work happens on branch `c1-ratings-reviews` in the main checkout.

## Review Focus

Failure modes the spec implies but no obvious task test covers; each has a test in the named task.

1. **Hiding the only review of a store** returns `stores.rating` to its seeded value with count 0, not 0.0 or NaN (Task 1 SQL test; Task 2 `averageOf` returns null for count 0).
2. **Two simultaneous submits for one order** produce exactly one review and one 409, with aggregates counted once (Task 1 SQL unique-violation test; Task 3 parallel curl).
3. **Odd text:** whitespace-only comment means "no comment"; a NUL byte is a 400 (Postgres rejects it and would 500); `<script>` is stored as plain text; names that are one word, empty, email-like, emoji or non-Latin never crash or leak the email (Task 2 tests).
4. **Customer account deleted after reviewing:** the review stays, shows "Customer", and the delete does not fail on a foreign key (Task 1 SQL test sets `customer_id` null; Task 2 `reviewerDisplayName(null)`).
5. **Photo edge cases:** PNG bytes sent as `image/jpeg`, a 0-byte file, 3 MB + 1 byte, a text file named `.jpg`; photo uploaded but the RPC fails leaves no orphan object; a hidden review never returns a photo URL (Task 2 `checkPhoto` tests; Task 3 cleanup path and curl; Task 4 public list test).

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/00000000000037_reviews.sql` | schema, aggregates, `create_review`, `recompute_review_aggregates`, status trigger, private bucket |
| `supabase/tests/c1_reviews.sql` | rolled-back SQL checks for the migration |
| `scripts/c1-fixtures.mjs` | create/clean throwaway customer, delivered orders, partner for live tests |
| `lib/reviews-model.ts` (+ `mobile/lib/reviews-model.ts`) | types, limits, paths, validation, display name, averages, shapers (pure, shared) |
| `lib/review-photo.ts` | magic-byte sniffing and photo checks (pure, web/server only) |
| `lib/reviews-server.ts` | server-only: Storage upload/delete/sign, RPC error mapping |
| `lib/review-request-email.ts` | pure HTML builder for the n8n review request |
| `app/api/customer/orders/[id]/review/route.ts` | POST create, GET state for the order screens |
| `app/api/customer/reviews/[id]/report/route.ts` | customer report |
| `app/api/stores/[id]/reviews/route.ts`, `.../rating/route.ts` | public reads |
| `app/api/vendor/reviews/route.ts`, `[id]/reply/route.ts`, `[id]/report/route.ts` | vendor |
| `app/api/delivery/rating/route.ts` | partner's own rating |
| `app/api/admin/reviews/route.ts`, `[id]/hide`, `[id]/unhide`, `[id]/dismiss-report` | admin moderation |
| `app/api/internal/orders/[id]/review-eligibility/route.ts` | n8n |
| `components/reviews/*`, `lib/use-order-review.ts` | web customer UI |
| `mobile/components/reviews/*`, `mobile/lib/use-order-review.ts` | phone customer + partner UI |
| `app/vendor/(portal)/reviews/page.tsx`, `app/delivery/(portal)/rating/page.tsx`, `app/admin/(portal)/reviews/page.tsx` | portal pages |
| `n8n/workflows/05-delivery-status-propagation.json`, `docs/n8n-webhook-setup.md` | review request path |
| `tests/reviews-model.test.mjs`, `tests/review-photo.test.mjs`, `tests/review-request-email.test.mjs`, `tests/review-request-n8n.test.mjs`, `tests/mobile-parity.test.mjs` | tests |

Refinements of the spec made while planning (call these out in the final report): (a) aggregates are recomputed by an explicit `perform recompute_review_aggregates(...)` inside `create_review` plus a trigger on `reviews.status` changes, instead of an insert trigger (the children are inserted after the parent row); (b) photo objects live at `reviews/<order_id>/<random>.<ext>` because the review id does not exist when the photo is uploaded; (c) `reviews.customer_id` becomes nullable with `on delete set null` so a deleted customer account never blocks on, or deletes, a public review; (d) the partner score for the customer comes from `GET /api/customer/orders/[id]/review` (the order page reads `orders` straight from the browser, so there is no server hop to attach it to); (e) the review route accepts JSON (no photo) or multipart (with photo). (f) photos are served by a proxy route `GET /api/reviews/[id]/photo` (visible reviews only, no signed URL) because a signed URL carries the server's `127.0.0.1` host, which the phone cannot reach, and this also makes "a hidden review never serves its photo" true at request time; the admin list gets a one-hour signed URL instead, because an `<img>` tag cannot send an Authorization header.

---

### Task 1: Migration 37, SQL checks and test-fixture script

**Files:**
- Create: `supabase/migrations/00000000000037_reviews.sql`
- Create: `supabase/tests/c1_reviews.sql`
- Create: `scripts/c1-fixtures.mjs`

**Interfaces:**
- Produces (SQL): table columns on `reviews` (`status`, `hidden_reason`, `hidden_at`, `photo_path`, `vendor_reply`, `vendor_reply_at`, `reported_at`, `report_reason`, `reported_by`); tables `review_dishes(review_id, product_id, stars, comment)`, `review_partner(review_id, partner_id, stars, comment)`; columns `rating_sum`, `rating_count` on `stores`, `products`, `delivery_partners`; `stores.seed_rating`; function `public.create_review(p_order_id uuid, p_customer_id uuid, p_store_stars integer, p_store_comment text, p_photo_path text, p_dishes jsonb, p_partner_stars integer, p_partner_comment text) returns uuid` raising `review_order_not_found` (P0002), `review_not_delivered`, `review_dish_not_in_order`, `review_no_partner` (P0001) and a `23505` unique violation on a second review; function `public.recompute_review_aggregates(p_review_id uuid)`; bucket `review-photos` (private).
- Produces (script): `node scripts/c1-fixtures.mjs create` prints JSON `{ customer: {id,email,password}, partner: {id}, store: {id, ownerId}, orders: [{id, productIds}] }` and writes it to `.superpowers/sdd/c1-fixtures.json`; `node scripts/c1-fixtures.mjs cleanup` deletes everything it created.

- [ ] **Step 1: Create the branch state check**

Run: `git branch --show-current`
Expected: `c1-ratings-reviews`

- [ ] **Step 2: Write the SQL test first**

Create `supabase/tests/c1_reviews.sql`:

```sql
-- Checks migration 37 (reviews). Runs in one transaction that is rolled back, so nothing persists.
--   docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/c1_reviews.sql
begin;

do $$
declare
  cust uuid := gen_random_uuid();
  cust2 uuid := gen_random_uuid();
  owner uuid := gen_random_uuid();
  partner uuid := gen_random_uuid();
  v_store uuid := gen_random_uuid();
  prod_a uuid := gen_random_uuid();
  prod_b uuid := gen_random_uuid();
  other_prod uuid := gen_random_uuid();
  addr uuid := gen_random_uuid();
  ord1 uuid := gen_random_uuid();
  ord2 uuid := gen_random_uuid();
  ord_placed uuid := gen_random_uuid();
  rev1 uuid;
  rev2 uuid;
  seed numeric;
  s record;
  p record;
  d record;
  failed boolean;
  msg text;
begin
  insert into auth.users (id, email, aud, role) values
    (cust, 'c1-cust@example.invalid', 'authenticated', 'authenticated'),
    (cust2, 'c1-cust2@example.invalid', 'authenticated', 'authenticated'),
    (owner, 'c1-owner@example.invalid', 'authenticated', 'authenticated'),
    (partner, 'c1-partner@example.invalid', 'authenticated', 'authenticated');
  insert into public.users (id, role, full_name) values
    (cust, 'customer', 'Asha Verma'), (cust2, 'customer', 'Ravi K'),
    (owner, 'vendor', 'C1 Owner'), (partner, 'delivery', 'C1 Partner');
  insert into public.delivery_partners (user_id) values (partner);

  -- the store goes in with triggers ON, so the seed_rating trigger is exercised
  insert into public.stores (id, owner_id, name, lat, lng, category_type, rating)
    values (v_store, owner, 'C1TEST store', 19.07, 72.87, 'restaurant', 4.2);

  -- orders go in with triggers off (no n8n webhooks), then triggers come back on
  set local session_replication_role = replica;
  insert into public.products (id, store_id, name, price) values
    (prod_a, v_store, 'C1TEST dish A', 100), (prod_b, v_store, 'C1TEST dish B', 120),
    (other_prod, v_store, 'C1TEST not ordered', 90);
  insert into public.addresses (id, user_id, line1, lat, lng) values (addr, cust, 'C1 street', 19.07, 72.87);
  insert into public.orders (id, customer_id, store_id, delivery_partner_id, delivery_address_id, status, subtotal, total, recipient_name, recipient_email, recipient_phone, delivered_at)
    values
    (ord1, cust, v_store, partner, addr, 'delivered', 220, 220, 'Asha', 'c1@example.invalid', '9999999999', now() - interval '2 hours'),
    (ord2, cust2, v_store, partner, addr, 'delivered', 100, 100, 'Ravi', 'c1b@example.invalid', '9999999999', now() - interval '2 hours'),
    (ord_placed, cust, v_store, partner, addr, 'placed', 100, 100, 'Asha', 'c1@example.invalid', '9999999999', null);
  insert into public.order_items (order_id, product_id, quantity, unit_price) values
    (ord1, prod_a, 1, 100), (ord1, prod_b, 1, 120), (ord2, prod_a, 1, 100), (ord_placed, prod_a, 1, 100);
  set local session_replication_role = origin;

  select seed_rating into seed from public.stores where id = v_store;
  if seed is distinct from 4.2 then raise exception 'seed_rating trigger did not copy the rating: %', seed; end if;

  -- ineligible: not delivered
  failed := false;
  begin perform public.create_review(ord_placed, cust, 5, null, null, '[]'::jsonb, null, null);
  exception when others then failed := true; msg := sqlerrm; end;
  if not failed or msg <> 'review_not_delivered' then raise exception 'placed order reviewable (%)', msg; end if;

  -- ineligible: someone else's order
  failed := false;
  begin perform public.create_review(ord1, cust2, 5, null, null, '[]'::jsonb, null, null);
  exception when others then failed := true; msg := sqlerrm; end;
  if not failed or msg <> 'review_order_not_found' then raise exception 'foreign order reviewable (%)', msg; end if;

  -- ineligible: dish not in the order
  failed := false;
  begin perform public.create_review(ord2, cust2, 5, null, null,
    jsonb_build_array(jsonb_build_object('product_id', prod_b, 'stars', 4)), null, null);
  exception when others then failed := true; msg := sqlerrm; end;
  if not failed or msg <> 'review_dish_not_in_order' then raise exception 'foreign dish accepted (%)', msg; end if;
  if exists (select 1 from public.reviews where order_id = ord2) then raise exception 'failed review left a row behind'; end if;

  -- happy path: store 4, dish A 5, dish B 3, partner 4
  rev1 := public.create_review(ord1, cust, 4, 'Good <script>x</script>', null,
    jsonb_build_array(jsonb_build_object('product_id', prod_a, 'stars', 5, 'comment', 'great'),
                      jsonb_build_object('product_id', prod_b, 'stars', 3)), 4, 'polite');
  select rating, rating_sum, rating_count into s from public.stores where id = v_store;
  if s.rating <> 4.0 or s.rating_sum <> 4 or s.rating_count <> 1 then raise exception 'store aggregate wrong: %', s; end if;
  select rating_sum, rating_count into p from public.products where id = prod_a;
  if p.rating_sum <> 5 or p.rating_count <> 1 then raise exception 'dish A aggregate wrong: %', p; end if;
  select rating_sum, rating_count into d from public.delivery_partners where user_id = partner;
  if d.rating_sum <> 4 or d.rating_count <> 1 then raise exception 'partner aggregate wrong: %', d; end if;
  if (select comment from public.reviews where id = rev1) <> 'Good <script>x</script>' then
    raise exception 'comment was altered';
  end if;

  -- a second review for the same order is a unique violation (the double-submit race)
  failed := false;
  begin perform public.create_review(ord1, cust, 5, null, null, '[]'::jsonb, null, null);
  exception when unique_violation then failed := true; end;
  if not failed then raise exception 'second review for one order was accepted'; end if;
  select rating_count into s from public.stores where id = v_store;
  if s.rating_count <> 1 then raise exception 'duplicate attempt changed the count'; end if;

  -- second review: store 2 (average (4+2)/2 = 3.0), dish A 1 (average 3.0)
  rev2 := public.create_review(ord2, cust2, 2, null, null,
    jsonb_build_array(jsonb_build_object('product_id', prod_a, 'stars', 1)), 5, null);
  select rating, rating_count into s from public.stores where id = v_store;
  if s.rating <> 3.0 or s.rating_count <> 2 then raise exception 'two-review store average wrong: %', s; end if;
  select rating_sum, rating_count into p from public.products where id = prod_a;
  if p.rating_sum <> 6 or p.rating_count <> 2 then raise exception 'two-review dish A wrong: %', p; end if;

  -- hide one: aggregates ignore it
  update public.reviews set status = 'hidden', hidden_reason = 'test', hidden_at = now() where id = rev2;
  select rating, rating_count into s from public.stores where id = v_store;
  if s.rating <> 4.0 or s.rating_count <> 1 then raise exception 'hide did not recompute store: %', s; end if;
  select rating_sum, rating_count into p from public.products where id = prod_a;
  if p.rating_sum <> 5 or p.rating_count <> 1 then raise exception 'hide did not recompute dish: %', p; end if;
  select rating_sum, rating_count into d from public.delivery_partners where user_id = partner;
  if d.rating_sum <> 4 or d.rating_count <> 1 then raise exception 'hide did not recompute partner: %', d; end if;

  -- hide the only remaining visible review: rating goes back to the seed, count 0
  update public.reviews set status = 'hidden' where id = rev1;
  select rating, rating_count, rating_sum into s from public.stores where id = v_store;
  if s.rating <> 4.2 or s.rating_count <> 0 or s.rating_sum <> 0 then raise exception 'store did not return to seed: %', s; end if;

  -- unhide restores
  update public.reviews set status = 'visible', hidden_reason = null, hidden_at = null where id in (rev1, rev2);
  select rating, rating_count into s from public.stores where id = v_store;
  if s.rating <> 3.0 or s.rating_count <> 2 then raise exception 'unhide did not recompute: %', s; end if;

  -- constraints
  failed := false;
  begin update public.reviews set comment = repeat('x', 1001) where id = rev1; exception when check_violation then failed := true; end;
  if not failed then raise exception '1001-character comment accepted'; end if;
  failed := false;
  begin insert into public.review_dishes (review_id, product_id, stars) values (rev1, prod_a, 6); exception when check_violation then failed := true; end;
  if not failed then raise exception 'star rating 6 accepted'; end if;

  -- a deleted customer keeps the review (customer_id set null) and the delete is not blocked
  delete from public.users where id = cust2;
  if (select customer_id from public.reviews where id = rev2) is not null then raise exception 'customer_id not nulled'; end if;
  if not exists (select 1 from public.reviews where id = rev2) then raise exception 'review vanished with its customer'; end if;

  -- deleting the order removes the review and its children
  delete from public.orders where id = ord1;
  if exists (select 1 from public.reviews where id = rev1) or exists (select 1 from public.review_dishes where review_id = rev1)
     or exists (select 1 from public.review_partner where review_id = rev1) then
    raise exception 'order delete left review rows behind';
  end if;

  -- RLS: enabled with no policies on the three tables
  if exists (select 1 from pg_policies where tablename in ('reviews', 'review_dishes', 'review_partner')) then
    raise exception 'a review table has an RLS policy';
  end if;
  if (select count(*) from pg_class where relname in ('reviews', 'review_dishes', 'review_partner') and relrowsecurity) <> 3 then
    raise exception 'RLS not enabled on all review tables';
  end if;

  -- private bucket
  if not exists (select 1 from storage.buckets where id = 'review-photos' and public = false) then
    raise exception 'review-photos bucket missing or public';
  end if;
end $$;

rollback;
```

- [ ] **Step 3: Run it to verify it fails**

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/c1_reviews.sql`
Expected: FAIL (`column "seed_rating" ... does not exist` or `function public.create_review ... does not exist`).

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/00000000000037_reviews.sql`:

```sql
-- C1: ratings and reviews. Written only through service-role API routes and the
-- security-definer functions below, so RLS is on with NO policies (an unused write
-- policy would be a direct PostgREST bypass). The old "authenticated can read" policy
-- from migration 11 is dropped: public reads go through allow-listed routes.

drop policy if exists "stub_allow_authenticated_read_reviews" on public.reviews;
drop policy if exists "stub_allow_authenticated_read" on public.reviews;

alter table public.reviews
  add column status text not null default 'visible' check (status in ('visible', 'hidden')),
  add column hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 300),
  add column hidden_at timestamptz,
  add column photo_path text,
  add column vendor_reply text check (vendor_reply is null or char_length(vendor_reply) <= 600),
  add column vendor_reply_at timestamptz,
  add column reported_at timestamptz,
  add column report_reason text check (report_reason is null or char_length(report_reason) <= 300),
  add column reported_by text check (reported_by is null or reported_by in ('customer', 'vendor')),
  add constraint reviews_comment_len check (comment is null or char_length(comment) <= 1000);

-- Orders already outlive their customer (migration 28); a public review does too.
alter table public.reviews alter column customer_id drop not null;
alter table public.reviews drop constraint reviews_customer_id_fkey;
alter table public.reviews
  add constraint reviews_customer_id_fkey
  foreign key (customer_id) references public.users (id) on delete set null;

create index idx_reviews_store_status_created on public.reviews (store_id, status, created_at desc);
create index idx_reviews_reported on public.reviews (reported_at) where reported_at is not null;

create table public.review_dishes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  unique (review_id, product_id)
);
create index idx_review_dishes_product on public.review_dishes (product_id);

create table public.review_partner (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  partner_id uuid references public.users(id) on delete set null,
  stars integer not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500)
);
create index idx_review_partner_partner on public.review_partner (partner_id);

alter table public.reviews enable row level security;
alter table public.review_dishes enable row level security;
alter table public.review_partner enable row level security;
revoke all on public.review_dishes, public.review_partner from anon, authenticated;
revoke all on public.reviews from anon, authenticated;

-- Aggregates are integer sums and counts over VISIBLE reviews; stores.rating stays the column everything reads.
alter table public.stores
  add column rating_sum integer not null default 0,
  add column rating_count integer not null default 0,
  add column seed_rating numeric;
update public.stores set seed_rating = rating;
alter table public.products
  add column rating_sum integer not null default 0,
  add column rating_count integer not null default 0;
alter table public.delivery_partners
  add column rating_sum integer not null default 0,
  add column rating_count integer not null default 0;

-- New stores get their entered rating as the seed, so hiding every review falls back to it.
create function public.stores_set_seed_rating() returns trigger language plpgsql as $$
begin
  if new.seed_rating is null then new.seed_rating := new.rating; end if;
  return new;
end $$;
create trigger stores_seed_rating before insert on public.stores
  for each row execute function public.stores_set_seed_rating();

create function public.recompute_review_aggregates(p_review_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
  v_products uuid[];
  v_partner uuid;
begin
  select store_id into v_store from public.reviews where id = p_review_id;
  if v_store is null then return; end if;
  select coalesce(array_agg(product_id), '{}') into v_products from public.review_dishes where review_id = p_review_id;
  select partner_id into v_partner from public.review_partner where review_id = p_review_id;

  -- Lock first, compute in a NEW statement: under READ COMMITTED a concurrent review's
  -- recompute then sees our committed row instead of overwriting it with a stale sum.
  perform 1 from public.stores where id = v_store for update;
  update public.stores s set
    rating_sum = coalesce((select sum(r.rating) from public.reviews r where r.store_id = s.id and r.status = 'visible'), 0),
    rating_count = (select count(*) from public.reviews r where r.store_id = s.id and r.status = 'visible')
  where s.id = v_store;
  update public.stores s set
    rating = case when s.rating_count > 0 then round(s.rating_sum::numeric / s.rating_count, 1) else coalesce(s.seed_rating, 0) end
  where s.id = v_store;

  if array_length(v_products, 1) is not null then
    perform 1 from public.products where id = any (v_products) order by id for update;
    update public.products p set
      rating_sum = coalesce((select sum(rd.stars) from public.review_dishes rd join public.reviews r on r.id = rd.review_id
                             where rd.product_id = p.id and r.status = 'visible'), 0),
      rating_count = (select count(*) from public.review_dishes rd join public.reviews r on r.id = rd.review_id
                      where rd.product_id = p.id and r.status = 'visible')
    where p.id = any (v_products);
  end if;

  if v_partner is not null then
    perform 1 from public.delivery_partners where user_id = v_partner for update;
    update public.delivery_partners dp set
      rating_sum = coalesce((select sum(rp.stars) from public.review_partner rp join public.reviews r on r.id = rp.review_id
                             where rp.partner_id = dp.user_id and r.status = 'visible'), 0),
      rating_count = (select count(*) from public.review_partner rp join public.reviews r on r.id = rp.review_id
                      where rp.partner_id = dp.user_id and r.status = 'visible')
    where dp.user_id = v_partner;
  end if;
end $$;

create function public.reviews_status_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_review_aggregates(new.id);
  return new;
end $$;
create trigger reviews_recompute_on_status after update of status on public.reviews
  for each row when (old.status is distinct from new.status)
  execute function public.reviews_status_changed();

create function public.create_review(
  p_order_id uuid,
  p_customer_id uuid,
  p_store_stars integer,
  p_store_comment text,
  p_photo_path text,
  p_dishes jsonb,
  p_partner_stars integer,
  p_partner_comment text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_order record;
  v_review_id uuid;
  v_dish jsonb;
begin
  select id, customer_id, store_id, status, delivery_partner_id into v_order
    from public.orders where id = p_order_id for update;
  if not found or v_order.customer_id is distinct from p_customer_id then
    raise exception 'review_order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'delivered' then
    raise exception 'review_not_delivered' using errcode = 'P0001';
  end if;

  -- the unique (order_id) constraint raises 23505 for a second review
  insert into public.reviews (order_id, customer_id, store_id, rating, comment, photo_path)
    values (p_order_id, p_customer_id, v_order.store_id, p_store_stars, p_store_comment, p_photo_path)
    returning id into v_review_id;

  for v_dish in select * from jsonb_array_elements(coalesce(p_dishes, '[]'::jsonb)) loop
    if not exists (select 1 from public.order_items oi
                   where oi.order_id = p_order_id and oi.product_id = (v_dish ->> 'product_id')::uuid) then
      raise exception 'review_dish_not_in_order' using errcode = 'P0001';
    end if;
    insert into public.review_dishes (review_id, product_id, stars, comment)
      values (v_review_id, (v_dish ->> 'product_id')::uuid, (v_dish ->> 'stars')::integer, nullif(v_dish ->> 'comment', ''));
  end loop;

  if p_partner_stars is not null then
    if v_order.delivery_partner_id is null then
      raise exception 'review_no_partner' using errcode = 'P0001';
    end if;
    insert into public.review_partner (review_id, partner_id, stars, comment)
      values (v_review_id, v_order.delivery_partner_id, p_partner_stars, p_partner_comment);
  end if;

  perform public.recompute_review_aggregates(v_review_id);
  return v_review_id;
end $$;

revoke all on function public.create_review(uuid, uuid, integer, text, text, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.create_review(uuid, uuid, integer, text, text, jsonb, integer, text) to service_role;
revoke all on function public.recompute_review_aggregates(uuid) from public, anon, authenticated;
grant execute on function public.recompute_review_aggregates(uuid) to service_role;

-- Private bucket for review photos: no storage policies, so only the service role reads or writes.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('review-photos', 'review-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;
```

- [ ] **Step 5: Apply the migration**

Run: `npx supabase migration up --local`
Expected: applies `00000000000037_reviews.sql` and reports success. Never use `db reset`.

- [ ] **Step 6: Run the SQL test to verify it passes**

Run: `docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/c1_reviews.sql`
Expected: finishes with `ROLLBACK` and no `ERROR`. If an assertion trips, fix the migration (not the test) unless the test fixture itself violates a NOT NULL column; in that case read `\d public.<table>` and fix the fixture insert.

- [ ] **Step 7: Confirm nothing leaked and existing data is intact**

Run:
```
docker exec supabase_db_phase1-scaffold-db psql -U postgres -At -c "select count(*) from public.reviews; select count(*) from public.stores where name like 'C1TEST%'; select count(*) from public.stores where seed_rating is null;"
```
Expected: `0`, `0`, `0`.

- [ ] **Step 8: Write the fixtures script**

Create `scripts/c1-fixtures.mjs` (throwaway customer, delivered orders and a store owner for live checks; reads the service-role key from `npx supabase status -o env` at run time, never from a `.env` file; never prints it):

```js
// Live-check fixtures for C1. `create` makes a throwaway customer (GoTrue admin API), reuses an existing
// store, its owner and an existing delivery partner, and inserts two DELIVERED orders by SQL with triggers
// off (no webhook, no email). `cleanup` removes exactly what `create` made (state in .superpowers/sdd/c1-fixtures.json).
// Never touches other customers or orders. Local stack only.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";

const STATE = ".superpowers/sdd/c1-fixtures.json";
const DB = "supabase_db_phase1-scaffold-db";
const API = "http://127.0.0.1:54321";

const sh = (cmd, args, input) =>
  execFileSync(cmd, args, { encoding: "utf8", input, shell: process.platform === "win32" && cmd === "npx" });
const psql = (sql) =>
  sh("docker", ["exec", "-i", DB, "psql", "-U", "postgres", "-At", "-v", "ON_ERROR_STOP=1"], sql).trim();

function serviceKey() {
  const out = sh("npx", ["supabase", "status", "-o", "env"]);
  const match = out.match(/^SERVICE_ROLE_KEY="?([^"\r\n]+)"?/m);
  if (!match) throw new Error("SERVICE_ROLE_KEY not found in supabase status");
  return match[1];
}

async function create() {
  if (existsSync(STATE)) throw new Error(`${STATE} exists; run cleanup first`);
  const key = serviceKey();
  const email = `c1-test-${Date.now()}@example.invalid`;
  const password = `C1test-${Math.random().toString(36).slice(2)}A1`;
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const created = await res.json();
  if (!res.ok) throw new Error(`create user failed: ${JSON.stringify(created)}`);
  const customerId = created.id;

  // One store that has at least two products, its owner, and any existing delivery partner.
  const row = psql(`
    select s.id || '|' || s.owner_id || '|' || (select user_id from public.delivery_partners limit 1) || '|' ||
           (select string_agg(id::text, ',') from (select id from public.products where store_id = s.id and is_available order by id limit 2) p)
    from public.stores s
    where (select count(*) from public.products where store_id = s.id and is_available) >= 2
    order by s.id limit 1;`);
  const [storeId, ownerId, partnerId, productCsv] = row.split("|");
  const productIds = productCsv.split(",");

  const orderIds = [crypto.randomUUID(), crypto.randomUUID()];
  const addressId = crypto.randomUUID();
  psql(`
    begin;
    set local session_replication_role = replica;
    insert into public.users (id, role, full_name) values ('${customerId}', 'customer', 'C1 Tester');
    insert into public.addresses (id, user_id, line1, lat, lng) values ('${addressId}', '${customerId}', 'C1 test street', 19.07, 72.87);
    ${orderIds
      .map(
        (id) => `insert into public.orders (id, customer_id, store_id, delivery_partner_id, delivery_address_id, status, subtotal, total, recipient_name, recipient_email, recipient_phone, delivered_at)
      values ('${id}', '${customerId}', '${storeId}', '${partnerId}', '${addressId}', 'delivered', 200, 200, 'C1 Tester', 'c1@example.invalid', '9999999999', now() - interval '2 hours');
    ${productIds
      .map((p) => `insert into public.order_items (order_id, product_id, quantity, unit_price) values ('${id}', '${p}', 1, 100);`)
      .join("\n    ")}`
      )
      .join("\n    ")}
    commit;`);

  const state = {
    customer: { id: customerId, email, password },
    partner: { id: partnerId },
    store: { id: storeId, ownerId },
    orders: orderIds.map((id) => ({ id, productIds })),
    addressId,
  };
  mkdirSync(".superpowers/sdd", { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ ...state, customer: { id: customerId, email, password } }, null, 2));
}

async function cleanup() {
  if (!existsSync(STATE)) {
    console.log("nothing to clean");
    return;
  }
  const state = JSON.parse(readFileSync(STATE, "utf8"));
  const key = serviceKey();
  const ids = state.orders.map((o) => `'${o.id}'`).join(",");
  // review photos first (the bucket objects are not covered by cascades)
  const photos = psql(`select photo_path from public.reviews where order_id in (${ids}) and photo_path is not null;`)
    .split("\n").filter(Boolean);
  for (const path of photos) {
    await fetch(`${API}/storage/v1/object/review-photos/${path}`, {
      method: "DELETE",
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
  }
  psql(`
    begin;
    delete from public.orders where id in (${ids});
    delete from public.addresses where id = '${state.addressId}';
    commit;`);
  await fetch(`${API}/auth/v1/admin/users/${state.customer.id}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  // aggregates of the store/products/partner are recomputed from what remains
  psql(`
    update public.stores s set rating_sum = coalesce((select sum(rating) from public.reviews r where r.store_id = s.id and r.status = 'visible'), 0),
      rating_count = (select count(*) from public.reviews r where r.store_id = s.id and r.status = 'visible') where s.id = '${state.store.id}';
    update public.stores set rating = case when rating_count > 0 then round(rating_sum::numeric / rating_count, 1) else coalesce(seed_rating, 0) end where id = '${state.store.id}';
    update public.products p set rating_sum = coalesce((select sum(stars) from public.review_dishes rd join public.reviews r on r.id = rd.review_id where rd.product_id = p.id and r.status = 'visible'), 0),
      rating_count = (select count(*) from public.review_dishes rd join public.reviews r on r.id = rd.review_id where rd.product_id = p.id and r.status = 'visible')
      where p.store_id = '${state.store.id}';
    update public.delivery_partners dp set rating_sum = coalesce((select sum(stars) from public.review_partner rp join public.reviews r on r.id = rp.review_id where rp.partner_id = dp.user_id and r.status = 'visible'), 0),
      rating_count = (select count(*) from public.review_partner rp join public.reviews r on r.id = rp.review_id where rp.partner_id = dp.user_id and r.status = 'visible')
      where dp.user_id = '${state.partner.id}';`);
  rmSync(STATE);
  console.log("cleaned");
}

const command = process.argv[2];
if (command === "create") await create();
else if (command === "cleanup") await cleanup();
else {
  console.error("usage: node scripts/c1-fixtures.mjs create|cleanup");
  process.exitCode = 1;
}
```

- [ ] **Step 9: Smoke-test the script, then clean up**

Run: `node scripts/c1-fixtures.mjs create` then `node scripts/c1-fixtures.mjs cleanup`
Expected: `create` prints JSON with a customer, store, partner and two orders; `cleanup` prints `cleaned`. Then:
`docker exec supabase_db_phase1-scaffold-db psql -U postgres -At -c "select count(*) from public.users where full_name = 'C1 Tester'; select count(*) from public.orders where recipient_email = 'c1@example.invalid';"`
Expected: `0` and `0`. If `create` fails on a NOT NULL column, read `\d public.orders` and fix the insert; if the Windows `npx` spawn fails, run it through `shell: true` as written.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/00000000000037_reviews.sql supabase/tests/c1_reviews.sql scripts/c1-fixtures.mjs
git commit -m "feat(c1): reviews schema, aggregates, create_review RPC and fixtures script

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared pure model, photo checks and tests

**Files:**
- Create: `lib/reviews-model.ts`, `mobile/lib/reviews-model.ts` (byte-identical copy), `lib/review-photo.ts`
- Create: `tests/reviews-model.test.mjs`, `tests/review-photo.test.mjs`
- Modify: `tests/mobile-parity.test.mjs` (one assertion line)

**Interfaces:**
- Produces (`lib/reviews-model.ts`): constants `REVIEW_LIMITS`, `REVIEW_PHOTO_TYPES`, `PARTNER_SCORE_MIN_RATINGS`, `LOW_PARTNER_SCORE`, `REVIEWS_PAGE_SIZE`, `REVIEW_SELECT`; path helpers `storeReviewsPath(storeId)`, `storeRatingPath(storeId)`, `orderReviewPath(orderId)`, `reportReviewPath(reviewId)`, `reviewPhotoPath(reviewId)`, `DELIVERY_RATING_PATH`; functions `parseStars(v)`, `cleanComment(v, max)`, `validateReviewPayload(raw, ctx)`, `reviewerDisplayName(name)`, `averageOf(sum, count)`, `buildHistogram(stars)`, `partnerScore(sum, count)`, `isLowPartnerScore(sum, count)`, `toPublicReview(raw, photoUrl)`, `toOwnReview(raw, photoUrl)`, `toVendorReview(raw, photoUrl)`, `toAdminReview(raw, photoUrl)`, `toPartnerReviewRow(raw)`; types `PartnerRating`, `PartnerReviewRow`, `ReviewInput`, `RawReviewRow`, `PublicReview`, `OwnReview`, `VendorReview`, `AdminReview`, `PartnerScore`, `OrderReviewState`, `Parsed<T>`.
- Produces (`lib/review-photo.ts`): `sniffImageType(bytes)`, `checkPhoto({ size, declaredType, bytes })`.

- [ ] **Step 1: Write the failing model tests**

Create `tests/reviews-model.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  REVIEW_LIMITS,
  PARTNER_SCORE_MIN_RATINGS,
  parseStars,
  cleanComment,
  validateReviewPayload,
  reviewerDisplayName,
  averageOf,
  buildHistogram,
  partnerScore,
  isLowPartnerScore,
  toPublicReview,
  toOwnReview,
  toVendorReview,
  toAdminReview,
  toPartnerReviewRow,
} from "../lib/reviews-model.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ctx = { orderProductIds: [A, B], hasPartner: true };

test("parseStars accepts only integers 1 to 5", () => {
  for (const ok of [1, 2, 3, 4, 5]) assert.equal(parseStars(ok), ok);
  for (const bad of [0, 6, -1, 2.5, "3", null, undefined, NaN, Infinity]) assert.equal(parseStars(bad), null, String(bad));
});

test("cleanComment: trims, whitespace-only is no comment, counts code points, rejects NUL and non-text", () => {
  assert.deepEqual(cleanComment("  nice  ", 10), { ok: true, value: "nice" });
  assert.deepEqual(cleanComment("   \n ", 10), { ok: true, value: null });
  assert.deepEqual(cleanComment(undefined, 10), { ok: true, value: null });
  assert.deepEqual(cleanComment(null, 10), { ok: true, value: null });
  assert.equal(cleanComment("a".repeat(11), 10).ok, false);
  assert.equal(cleanComment("😀".repeat(10), 10).ok, true);
  assert.equal(cleanComment("😀".repeat(11), 10).ok, false);
  assert.equal(cleanComment("bad\u0000byte", 100).ok, false);
  assert.equal(cleanComment(42, 10).ok, false);
  assert.equal(cleanComment("<script>alert(1)</script>", 100).value, "<script>alert(1)</script>");
});

test("validateReviewPayload: minimal valid payload", () => {
  const out = validateReviewPayload({ storeStars: 4 }, ctx);
  assert.deepEqual(out, { ok: true, value: { storeStars: 4, storeComment: null, dishes: [], partner: null } });
});

test("validateReviewPayload: full payload, product ids normalised to lower case", () => {
  const out = validateReviewPayload(
    {
      storeStars: 5,
      storeComment: " great ",
      dishes: [{ productId: A.toUpperCase(), stars: 4, comment: "tasty" }, { productId: B, stars: 2 }],
      partner: { stars: 5, comment: "polite" },
    },
    ctx
  );
  assert.equal(out.ok, true);
  assert.equal(out.value.storeComment, "great");
  assert.deepEqual(out.value.dishes, [
    { productId: A, stars: 4, comment: "tasty" },
    { productId: B, stars: 2, comment: null },
  ]);
  assert.deepEqual(out.value.partner, { stars: 5, comment: "polite" });
});

test("validateReviewPayload: rejects bad input with a message, never throws", () => {
  const bad = [
    null,
    "x",
    [],
    {},
    { storeStars: 0 },
    { storeStars: 6 },
    { storeStars: 3, dishes: "no" },
    { storeStars: 3, dishes: [{ productId: "not-a-uuid", stars: 3 }] },
    { storeStars: 3, dishes: [{ productId: "33333333-3333-4333-8333-333333333333", stars: 3 }] },
    { storeStars: 3, dishes: [{ productId: A, stars: 3 }, { productId: A, stars: 4 }] },
    { storeStars: 3, dishes: [{ productId: A, stars: 9 }] },
    { storeStars: 3, dishes: [null] },
    { storeStars: 3, storeComment: "x".repeat(REVIEW_LIMITS.storeComment + 1) },
    { storeStars: 3, dishes: [{ productId: A, stars: 3, comment: "x".repeat(REVIEW_LIMITS.dishComment + 1) }] },
    { storeStars: 3, partner: { stars: 7 } },
    { storeStars: 3, partner: "x" },
    { storeStars: 3, dishes: Array.from({ length: 51 }, () => ({ productId: A, stars: 3 })) },
  ];
  for (const raw of bad) {
    const out = validateReviewPayload(raw, ctx);
    assert.equal(out.ok, false, JSON.stringify(raw)?.slice(0, 80));
    assert.equal(typeof out.error, "string");
  }
});

test("validateReviewPayload: a partner rating needs an order with a partner", () => {
  const out = validateReviewPayload({ storeStars: 3, partner: { stars: 4 } }, { orderProductIds: [A], hasPartner: false });
  assert.equal(out.ok, false);
  assert.match(out.error, /delivery partner/i);
});

test("reviewerDisplayName: first name plus last initial, safe fallbacks", () => {
  const cases = [
    ["Vishal Shah", "Vishal S."],
    ["  vishal   shah  ", "vishal S."],
    ["Asha Devi Verma", "Asha V."],
    ["Madonna", "Madonna"],
    ["", "Customer"],
    ["   ", "Customer"],
    [null, "Customer"],
    [undefined, "Customer"],
    ["asha@example.com", "Customer"],
    ["Asha asha@example.com", "Customer"],
    ["9876543210", "Customer"],
    ["Ravi 9876543210", "Customer"],
    ["अनु शर्मा", "अनु श."],
    ["😀 Smile", "😀 S."],
    ["Zoë Émile", "Zoë É."],
  ];
  for (const [input, expected] of cases) assert.equal(reviewerDisplayName(input), expected, String(input));
});

test("averageOf: one decimal, null when there are no ratings", () => {
  assert.equal(averageOf(0, 0), null);
  assert.equal(averageOf(5, 0), null);
  assert.equal(averageOf(Number.NaN, 3), null);
  assert.equal(averageOf(4, 1), 4);
  assert.equal(averageOf(13, 3), 4.3);
  assert.equal(averageOf(14, 3), 4.7);
  assert.equal(averageOf(9, 2), 4.5);
  assert.equal(averageOf(9, 4), 2.3); // 2.25 rounds half up, same as SQL round(numeric, 1)
});

test("buildHistogram counts stars one to five and ignores junk", () => {
  assert.deepEqual(buildHistogram([5, 5, 4, 1, 3, 3, 3]), [1, 0, 3, 1, 2]);
  assert.deepEqual(buildHistogram([]), [0, 0, 0, 0, 0]);
  assert.deepEqual(buildHistogram([0, 6, 2.5, 5]), [0, 0, 0, 0, 1]);
});

test("partnerScore: New partner below the threshold, average after", () => {
  assert.deepEqual(partnerScore(0, 0), { isNew: true });
  assert.deepEqual(partnerScore(16, PARTNER_SCORE_MIN_RATINGS - 1), { isNew: true });
  assert.deepEqual(partnerScore(23, 5), { isNew: false, average: 4.6, count: 5 });
});

test("isLowPartnerScore needs enough ratings and an average under 3.0", () => {
  assert.equal(isLowPartnerScore(8, 4), false);
  assert.equal(isLowPartnerScore(14, 5), true);
  assert.equal(isLowPartnerScore(15, 5), false);
  assert.equal(isLowPartnerScore(0, 0), false);
});

const raw = (over = {}) => ({
  id: "r1",
  store_id: "s1",
  rating: 4,
  comment: "Good <b>food</b>",
  photo_path: "reviews/o1/a.jpg",
  status: "visible",
  vendor_reply: "Thanks!",
  vendor_reply_at: "2026-10-07T12:00:00Z",
  created_at: "2026-10-07T10:00:00Z",
  reported_at: null,
  report_reason: null,
  reported_by: null,
  hidden_reason: null,
  hidden_at: null,
  customer: { full_name: "Asha Verma" },
  stores: { name: "Dosa Corner" },
  review_dishes: [{ stars: 5, comment: "great", products: { name: "Masala Dosa" } }],
  review_partner: { stars: 4, comment: "polite" },
  ...over,
});

test("toPublicReview exposes only the allow-listed fields", () => {
  const out = toPublicReview(raw(), "https://signed/photo");
  assert.deepEqual(Object.keys(out).sort(), [
    "comment", "createdAt", "dishes", "id", "photoUrl", "reviewerName", "stars", "vendorReply", "vendorReplyAt",
  ]);
  assert.equal(out.reviewerName, "Asha V.");
  assert.equal(out.comment, "Good <b>food</b>");
  assert.deepEqual(out.dishes, [{ name: "Masala Dosa", stars: 5 }]);
  const text = JSON.stringify(out);
  assert.ok(!text.includes("polite"), "partner comment leaked");
  assert.ok(!text.includes("customer_id"));
});

test("toPublicReview: deleted customer, array embeds and missing dish product do not crash", () => {
  const out = toPublicReview(
    raw({ customer: null, review_dishes: [{ stars: 3, comment: null, products: [{ name: "Idli" }] }, { stars: 2, comment: null, products: null }] }),
    null
  );
  assert.equal(out.reviewerName, "Customer");
  assert.deepEqual(out.dishes, [{ name: "Idli", stars: 3 }, { name: "Dish", stars: 2 }]);
  assert.equal(out.photoUrl, null);
});

test("toOwnReview adds dish comments and the customer's own partner rating", () => {
  const out = toOwnReview(raw(), "u");
  assert.deepEqual(out.dishes, [{ name: "Masala Dosa", stars: 5, comment: "great" }]);
  assert.deepEqual(out.partner, { stars: 4, comment: "polite" });
  assert.equal(out.status, "visible");
  assert.deepEqual(toOwnReview(raw({ review_partner: null }), null).partner, null);
  assert.deepEqual(toOwnReview(raw({ review_partner: [{ stars: 2, comment: null }] }), null).partner, { stars: 2, comment: null });
});

test("toVendorReview: hidden reviews carry no content; visible ones never expose partner data", () => {
  const hidden = toVendorReview(raw({ status: "hidden", comment: "secret" }), "u");
  assert.deepEqual(hidden, { id: "r1", hidden: true, createdAt: "2026-10-07T10:00:00Z" });
  const shown = toVendorReview(raw({ reported_at: "2026-10-07T11:00:00Z" }), "u");
  assert.equal(shown.hidden, false);
  assert.equal(shown.reported, true);
  const text = JSON.stringify(shown);
  assert.ok(!text.includes("polite"), "partner comment leaked to vendor");
  assert.ok(!text.includes("Asha Verma"), "full name leaked to vendor");
});

test("toAdminReview shows everything moderation needs", () => {
  const out = toAdminReview(
    raw({ status: "hidden", hidden_reason: "abusive", reported_at: "2026-10-07T11:00:00Z", report_reason: "rude", reported_by: "vendor" }),
    null
  );
  assert.equal(out.customerName, "Asha Verma");
  assert.equal(out.storeName, "Dosa Corner");
  assert.equal(out.status, "hidden");
  assert.equal(out.hiddenReason, "abusive");
  assert.equal(out.reportReason, "rude");
  assert.equal(out.reportedBy, "vendor");
  assert.deepEqual(out.partner, { stars: 4, comment: "polite" });
  assert.equal(toAdminReview(raw({ customer: null }), null).customerName, "Customer");
});

test("toPartnerReviewRow: stars, comment and date only", () => {
  const out = toPartnerReviewRow({ created_at: "2026-10-07T10:00:00Z", review_partner: [{ stars: 5, comment: null }] });
  assert.deepEqual(out, { stars: 5, comment: null, createdAt: "2026-10-07T10:00:00Z" });
  assert.equal(toPartnerReviewRow({ created_at: "x", review_partner: null }), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/reviews-model.test.mjs`
Expected: FAIL (`Cannot find module ... reviews-model.ts`).

- [ ] **Step 3: Write the model**

Create `lib/reviews-model.ts`:

```ts
// Shared by the web and phone reviews features.
// mobile/lib/reviews-model.ts is a byte-identical copy (tests/mobile-parity.test.mjs guards drift), so this file imports nothing.

export const REVIEW_LIMITS = {
  storeComment: 1000,
  dishComment: 500,
  partnerComment: 500,
  reply: 600,
  reason: 300,
  photoBytes: 3 * 1024 * 1024,
} as const;

export const REVIEW_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PARTNER_SCORE_MIN_RATINGS = 5;
export const LOW_PARTNER_SCORE = 3.0;
export const REVIEWS_PAGE_SIZE = 10;
const MAX_DISH_RATINGS = 50;

export const storeReviewsPath = (storeId: string): string => `/api/stores/${storeId}/reviews`;
export const storeRatingPath = (storeId: string): string => `/api/stores/${storeId}/rating`;
export const orderReviewPath = (orderId: string): string => `/api/customer/orders/${orderId}/review`;
export const reportReviewPath = (reviewId: string): string => `/api/customer/reviews/${reviewId}/report`;
export const reviewPhotoPath = (reviewId: string): string => `/api/reviews/${reviewId}/photo`;
export const DELIVERY_RATING_PATH = "/api/delivery/rating";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export type ReviewDishInput = { productId: string; stars: number; comment: string | null };
export type ReviewInput = {
  storeStars: number;
  storeComment: string | null;
  dishes: ReviewDishInput[];
  partner: { stars: number; comment: string | null } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseStars(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5 ? value : null;
}

// Whitespace-only text means "no comment". A NUL byte is refused here because Postgres rejects it (it would be a 500).
export function cleanComment(value: unknown, max: number): Parsed<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "Comment must be text" };
  const trimmed = value.replace(/\r\n/g, "\n").trim();
  if (trimmed === "") return { ok: true, value: null };
  if (trimmed.includes("\u0000")) return { ok: false, error: "Comment contains an invalid character" };
  if ([...trimmed].length > max) return { ok: false, error: `Comment must be at most ${max} characters` };
  return { ok: true, value: trimmed };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateReviewPayload(
  raw: unknown,
  ctx: { orderProductIds: string[]; hasPartner: boolean }
): Parsed<ReviewInput> {
  if (!isRecord(raw)) return { ok: false, error: "Invalid review" };
  const storeStars = parseStars(raw.storeStars);
  if (storeStars === null) return { ok: false, error: "Rate the store from 1 to 5 stars" };
  const storeComment = cleanComment(raw.storeComment, REVIEW_LIMITS.storeComment);
  if (!storeComment.ok) return storeComment;

  const allowed = new Set(ctx.orderProductIds.map((id) => id.toLowerCase()));
  const dishes: ReviewDishInput[] = [];
  if (raw.dishes !== undefined && raw.dishes !== null) {
    if (!Array.isArray(raw.dishes)) return { ok: false, error: "Dishes must be a list" };
    if (raw.dishes.length > MAX_DISH_RATINGS) return { ok: false, error: "Too many dish ratings" };
    const seen = new Set<string>();
    for (const entry of raw.dishes) {
      if (!isRecord(entry)) return { ok: false, error: "Invalid dish rating" };
      const productId = typeof entry.productId === "string" ? entry.productId.toLowerCase() : "";
      if (!UUID.test(productId) || !allowed.has(productId)) return { ok: false, error: "A rated dish is not part of this order" };
      if (seen.has(productId)) return { ok: false, error: "A dish was rated twice" };
      seen.add(productId);
      const stars = parseStars(entry.stars);
      if (stars === null) return { ok: false, error: "Rate each dish from 1 to 5 stars" };
      const comment = cleanComment(entry.comment, REVIEW_LIMITS.dishComment);
      if (!comment.ok) return comment;
      dishes.push({ productId, stars, comment: comment.value });
    }
  }

  let partner: ReviewInput["partner"] = null;
  if (raw.partner !== undefined && raw.partner !== null) {
    if (!ctx.hasPartner) return { ok: false, error: "This order has no delivery partner to rate" };
    if (!isRecord(raw.partner)) return { ok: false, error: "Invalid delivery partner rating" };
    const stars = parseStars(raw.partner.stars);
    if (stars === null) return { ok: false, error: "Rate the delivery partner from 1 to 5 stars" };
    const comment = cleanComment(raw.partner.comment, REVIEW_LIMITS.partnerComment);
    if (!comment.ok) return comment;
    partner = { stars, comment: comment.value };
  }

  return { ok: true, value: { storeStars, storeComment: storeComment.value, dishes, partner } };
}

// "First name + last initial". Never an email or a phone-like string.
export function reviewerDisplayName(fullName: string | null | undefined): string {
  const words = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Customer";
  if (words.some((word) => word.includes("@") || /\d{5,}/.test(word))) return "Customer";
  if (words.length === 1) return words[0];
  const initial = [...words[words.length - 1]][0];
  return `${words[0]} ${initial.toUpperCase()}.`;
}

// Integer sum and count in, one decimal out (half up, like SQL round(numeric, 1)).
export function averageOf(sum: number, count: number): number | null {
  if (!Number.isFinite(sum) || !Number.isFinite(count) || count <= 0) return null;
  return Math.round((sum * 10) / count) / 10;
}

export function buildHistogram(stars: number[]): [number, number, number, number, number] {
  const out: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const value of stars) {
    if (Number.isInteger(value) && value >= 1 && value <= 5) out[value - 1] += 1;
  }
  return out;
}

export type PartnerScore = { isNew: true } | { isNew: false; average: number; count: number };

export function partnerScore(sum: number, count: number): PartnerScore {
  const average = count >= PARTNER_SCORE_MIN_RATINGS ? averageOf(sum, count) : null;
  return average === null ? { isNew: true } : { isNew: false, average, count };
}

export function isLowPartnerScore(sum: number, count: number): boolean {
  const average = count >= PARTNER_SCORE_MIN_RATINGS ? averageOf(sum, count) : null;
  return average !== null && average < LOW_PARTNER_SCORE;
}

// ---- Row shapers (allow-lists: every field is named, nothing is spread) ----

type OneOrMany<T> = T | T[] | null | undefined;

function first<T>(value: OneOrMany<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export const REVIEW_SELECT =
  "id, store_id, rating, comment, photo_path, status, vendor_reply, vendor_reply_at, created_at, " +
  "reported_at, report_reason, reported_by, hidden_reason, hidden_at, " +
  "customer:users!customer_id(full_name), stores(name), " +
  "review_dishes(stars, comment, products(name)), review_partner(stars, comment)";

export type RawReviewRow = {
  id: string;
  store_id: string;
  rating: number;
  comment: string | null;
  photo_path: string | null;
  status: "visible" | "hidden";
  vendor_reply: string | null;
  vendor_reply_at: string | null;
  created_at: string;
  reported_at: string | null;
  report_reason: string | null;
  reported_by: string | null;
  hidden_reason: string | null;
  hidden_at: string | null;
  customer: OneOrMany<{ full_name: string | null }>;
  stores?: OneOrMany<{ name: string }>;
  review_dishes: { stars: number; comment: string | null; products: OneOrMany<{ name: string }> }[] | null;
  review_partner: OneOrMany<{ stars: number; comment: string | null }>;
};

function dishName(entry: { products: OneOrMany<{ name: string }> }): string {
  return first(entry.products)?.name ?? "Dish";
}

export type PublicReview = {
  id: string;
  reviewerName: string;
  stars: number;
  comment: string | null;
  photoUrl: string | null;
  dishes: { name: string; stars: number }[];
  createdAt: string;
  vendorReply: string | null;
  vendorReplyAt: string | null;
};

export function toPublicReview(row: RawReviewRow, photoUrl: string | null): PublicReview {
  return {
    id: row.id,
    reviewerName: reviewerDisplayName(first(row.customer)?.full_name),
    stars: row.rating,
    comment: row.comment,
    photoUrl,
    dishes: (row.review_dishes ?? []).map((entry) => ({ name: dishName(entry), stars: entry.stars })),
    createdAt: row.created_at,
    vendorReply: row.vendor_reply,
    vendorReplyAt: row.vendor_reply_at,
  };
}

export type OwnReview = {
  id: string;
  status: "visible" | "hidden";
  stars: number;
  comment: string | null;
  photoUrl: string | null;
  dishes: { name: string; stars: number; comment: string | null }[];
  partner: { stars: number; comment: string | null } | null;
  createdAt: string;
  vendorReply: string | null;
};

export function toOwnReview(row: RawReviewRow, photoUrl: string | null): OwnReview {
  const partner = first(row.review_partner);
  return {
    id: row.id,
    status: row.status,
    stars: row.rating,
    comment: row.comment,
    photoUrl,
    dishes: (row.review_dishes ?? []).map((entry) => ({ name: dishName(entry), stars: entry.stars, comment: entry.comment })),
    partner: partner ? { stars: partner.stars, comment: partner.comment } : null,
    createdAt: row.created_at,
    vendorReply: row.vendor_reply,
  };
}

export type VendorReview =
  | { id: string; hidden: true; createdAt: string }
  | (PublicReview & { hidden: false; reported: boolean });

export function toVendorReview(row: RawReviewRow, photoUrl: string | null): VendorReview {
  if (row.status === "hidden") return { id: row.id, hidden: true, createdAt: row.created_at };
  return { ...toPublicReview(row, photoUrl), hidden: false, reported: row.reported_at !== null };
}

export type AdminReview = {
  id: string;
  storeId: string;
  storeName: string;
  customerName: string;
  status: "visible" | "hidden";
  stars: number;
  comment: string | null;
  photoUrl: string | null;
  dishes: { name: string; stars: number; comment: string | null }[];
  partner: { stars: number; comment: string | null } | null;
  createdAt: string;
  vendorReply: string | null;
  reportedAt: string | null;
  reportReason: string | null;
  reportedBy: string | null;
  hiddenReason: string | null;
  hiddenAt: string | null;
};

export function toAdminReview(row: RawReviewRow, photoUrl: string | null): AdminReview {
  const partner = first(row.review_partner);
  return {
    id: row.id,
    storeId: row.store_id,
    storeName: first(row.stores)?.name ?? "Store",
    customerName: first(row.customer)?.full_name?.trim() || "Customer",
    status: row.status,
    stars: row.rating,
    comment: row.comment,
    photoUrl,
    dishes: (row.review_dishes ?? []).map((entry) => ({ name: dishName(entry), stars: entry.stars, comment: entry.comment })),
    partner: partner ? { stars: partner.stars, comment: partner.comment } : null,
    createdAt: row.created_at,
    vendorReply: row.vendor_reply,
    reportedAt: row.reported_at,
    reportReason: row.report_reason,
    reportedBy: row.reported_by,
    hiddenReason: row.hidden_reason,
    hiddenAt: row.hidden_at,
  };
}

export type PartnerReviewRow = { stars: number; comment: string | null; createdAt: string };

// What GET /api/delivery/rating returns to the signed-in partner (own aggregate and recent comments, no customer identity).
export type PartnerRating = { average: number | null; count: number; recent: PartnerReviewRow[] };

export function toPartnerReviewRow(row: {
  created_at: string;
  review_partner: OneOrMany<{ stars: number; comment: string | null }>;
}): PartnerReviewRow | null {
  const partner = first(row.review_partner);
  if (!partner) return null;
  return { stars: partner.stars, comment: partner.comment, createdAt: row.created_at };
}

// What the order screens need from GET /api/customer/orders/[id]/review.
export type OrderReviewState = {
  eligible: boolean;
  dishes: { productId: string; name: string }[];
  hasPartner: boolean;
  review: OwnReview | null;
  partnerScore: PartnerScore | null;
};
```

- [ ] **Step 4: Run to verify the model tests pass**

Run: `node --test tests/reviews-model.test.mjs`
Expected: all pass. If `averageOf(9, 4)` gives 2.2, floating point bit you: the product `sum * 10` is an integer so `Math.round(22.5)` is 23; check the expected value in the test, not the maths.

- [ ] **Step 5: Write the failing photo tests**

Create `tests/review-photo.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { sniffImageType, checkPhoto } from "../lib/review-photo.ts";
import { REVIEW_LIMITS } from "../lib/reviews-model.ts";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
const text = new TextEncoder().encode("hello, I am not an image");

test("sniffImageType recognises JPEG, PNG and WebP and nothing else", () => {
  assert.equal(sniffImageType(jpeg), "image/jpeg");
  assert.equal(sniffImageType(png), "image/png");
  assert.equal(sniffImageType(webp), "image/webp");
  assert.equal(sniffImageType(text), null);
  assert.equal(sniffImageType(new Uint8Array([])), null);
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8])), null);
  assert.equal(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45])), null); // RIFF/WAVE
});

test("checkPhoto accepts a matching declared type", () => {
  assert.deepEqual(checkPhoto({ size: jpeg.length, declaredType: "image/jpeg", bytes: jpeg }), { ok: true, type: "image/jpeg", ext: "jpg" });
  assert.deepEqual(checkPhoto({ size: png.length, declaredType: "image/png", bytes: png }), { ok: true, type: "image/png", ext: "png" });
  assert.deepEqual(checkPhoto({ size: webp.length, declaredType: "image/webp", bytes: webp }), { ok: true, type: "image/webp", ext: "webp" });
});

test("checkPhoto refuses empty, oversize, mislabelled and non-image files", () => {
  assert.equal(checkPhoto({ size: 0, declaredType: "image/jpeg", bytes: new Uint8Array([]) }).ok, false);
  assert.equal(checkPhoto({ size: REVIEW_LIMITS.photoBytes + 1, declaredType: "image/jpeg", bytes: jpeg }).ok, false);
  assert.equal(checkPhoto({ size: REVIEW_LIMITS.photoBytes, declaredType: "image/jpeg", bytes: jpeg }).ok, true);
  assert.equal(checkPhoto({ size: png.length, declaredType: "image/jpeg", bytes: png }).ok, false); // PNG bytes labelled JPEG
  assert.equal(checkPhoto({ size: text.length, declaredType: "image/jpeg", bytes: text }).ok, false); // text named .jpg
  assert.equal(checkPhoto({ size: jpeg.length, declaredType: "image/gif", bytes: jpeg }).ok, false);
  assert.equal(checkPhoto({ size: jpeg.length, declaredType: "", bytes: jpeg }).ok, false);
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `node --test tests/review-photo.test.mjs`
Expected: FAIL (`Cannot find module ... review-photo.ts`).

- [ ] **Step 7: Write the photo module**

Create `lib/review-photo.ts`:

```ts
// Pure checks for review photos. Imports nothing at runtime so `node --test` can load it.
// The limits here mirror REVIEW_LIMITS.photoBytes / REVIEW_PHOTO_TYPES in lib/reviews-model.ts.
export type PhotoType = "image/jpeg" | "image/png" | "image/webp";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const EXT: Record<PhotoType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function ascii(bytes: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...bytes.subarray(from, to));
}

// The declared type comes from the client, so the bytes decide.
export function sniffImageType(bytes: Uint8Array): PhotoType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && pngSignature.every((value, index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function checkPhoto(input: {
  size: number;
  declaredType: string;
  bytes: Uint8Array;
}): { ok: true; type: PhotoType; ext: string } | { ok: false; error: string } {
  if (input.size <= 0) return { ok: false, error: "The photo is empty" };
  if (input.size > MAX_PHOTO_BYTES) return { ok: false, error: "The photo must be 3 MB or smaller" };
  const sniffed = sniffImageType(input.bytes);
  if (!sniffed) return { ok: false, error: "The photo must be a JPEG, PNG or WebP image" };
  if (input.declaredType !== sniffed) return { ok: false, error: "The photo type does not match its contents" };
  return { ok: true, type: sniffed, ext: EXT[sniffed] };
}
```

- [ ] **Step 8: Run both test files**

Run: `node --test tests/reviews-model.test.mjs tests/review-photo.test.mjs`
Expected: all pass.

- [ ] **Step 9: Create the phone copy and the parity assertion**

Run: `cp lib/reviews-model.ts mobile/lib/reviews-model.ts`

Modify `tests/mobile-parity.test.mjs`: in the "shared modules are byte-identical copies of the web files" test, after the line `assert.equal(read("../mobile/lib/favorites-model.ts"), read("../lib/favorites-model.ts"));` add:

```js
  assert.equal(read("../mobile/lib/reviews-model.ts"), read("../lib/reviews-model.ts"));
```

- [ ] **Step 10: Full verification**

Run: `node --test tests/*.test.mjs` (Expected: all pass, 489 + new), `npx tsc --noEmit` (silent), `cd mobile && npx tsc --noEmit` (silent).

- [ ] **Step 11: Commit**

```bash
git add lib/reviews-model.ts mobile/lib/reviews-model.ts lib/review-photo.ts tests/reviews-model.test.mjs tests/review-photo.test.mjs tests/mobile-parity.test.mjs
git commit -m "feat(c1): shared reviews model, photo checks and tests

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Customer review routes, photo storage helpers and photo proxy

**Files:**
- Create: `lib/reviews-server.ts`
- Create: `app/api/customer/orders/[id]/review/route.ts`
- Create: `app/api/customer/reviews/[id]/report/route.ts`
- Create: `app/api/reviews/[id]/photo/route.ts`

**Interfaces:**
- Consumes: `resolveCustomer(request)` from `lib/customer-auth.ts`; `uuidsOnly` from `lib/zippy/actions.ts`; everything exported by `lib/reviews-model.ts` and `lib/review-photo.ts` (Task 2); RPC `create_review` (Task 1).
- Produces (HTTP):
  - `GET /api/customer/orders/[id]/review` -> `OrderReviewState` (`eligible`, `dishes`, `hasPartner`, `review`, `partnerScore`). 401/403 from `resolveCustomer`; 404 `{error:"not found"}` for an unknown or foreign order.
  - `POST /api/customer/orders/[id]/review` (JSON `ReviewInput` shape, or multipart with a `payload` JSON string field and an optional `photo` file) -> 201 `{ review: OwnReview | null }`; 400 invalid input; 404 foreign/unknown order; 409 not delivered or already reviewed.
  - `POST /api/customer/reviews/[id]/report` body `{ reason?: string }` -> 200 `{ reported: true }` (idempotent); 400 own review; 404 unknown or hidden review.
  - `GET /api/reviews/[id]/photo` -> image bytes for a VISIBLE review with a photo, else 404.
- Produces (TS): `uploadReviewPhoto(orderId, bytes, type, ext): Promise<string>`, `deleteReviewPhotos(paths): Promise<void>`, `signReviewPhoto(path): Promise<string | null>`, `mapCreateReviewError(error): { status: number; error: string }`, `REVIEW_BUCKET`.

- [ ] **Step 1: Read the framework guide**

Read the route-handler section of `node_modules/next/dist/docs/` (this Next version differs from older releases; check how `params` is typed in route handlers and how `request.formData()` behaves). Follow `app/api/customer/favorites/[storeId]/route.ts` for the `params: Promise<...>` convention.

- [ ] **Step 2: Write the server helpers**

Create `lib/reviews-server.ts`:

```ts
import "server-only";
import { randomUUID } from "crypto";
import { supabaseServer } from "@/lib/supabase-server";
import type { PhotoType } from "@/lib/review-photo";

export const REVIEW_BUCKET = "review-photos";

// The review id does not exist yet when the photo is uploaded, so the object lives under the order id.
export async function uploadReviewPhoto(orderId: string, bytes: Uint8Array, type: PhotoType, ext: string): Promise<string> {
  const path = `reviews/${orderId}/${randomUUID()}.${ext}`;
  const { error } = await supabaseServer.storage.from(REVIEW_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (error) throw new Error(`photo upload failed: ${error.message}`);
  return path;
}

export async function deleteReviewPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabaseServer.storage.from(REVIEW_BUCKET).remove(paths);
  if (error) console.error("review photo cleanup failed", error.message);
}

// Only the admin list uses signed URLs (an <img> cannot send a bearer token); everyone else goes through
// /api/reviews/[id]/photo, which refuses hidden reviews.
export async function signReviewPhoto(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabaseServer.storage.from(REVIEW_BUCKET).createSignedUrl(path, 3600);
  if (error || !data) {
    console.error("review photo signing failed", error?.message);
    return null;
  }
  return data.signedUrl;
}

export function mapCreateReviewError(error: { code?: string; message?: string }): { status: number; error: string } {
  switch (error.message) {
    case "review_order_not_found":
      return { status: 404, error: "not found" };
    case "review_not_delivered":
      return { status: 409, error: "You can review an order once it has been delivered" };
    case "review_dish_not_in_order":
      return { status: 400, error: "A rated dish is not part of this order" };
    case "review_no_partner":
      return { status: 400, error: "This order has no delivery partner to rate" };
  }
  if (error.code === "23505") return { status: 409, error: "You have already reviewed this order" };
  return { status: 500, error: "Could not save your review right now" };
}
```

- [ ] **Step 3: Write the create/read route**

Create `app/api/customer/orders/[id]/review/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import {
  REVIEW_SELECT,
  partnerScore,
  reviewPhotoPath,
  toOwnReview,
  validateReviewPayload,
  type OrderReviewState,
  type RawReviewRow,
} from "@/lib/reviews-model";
import { checkPhoto } from "@/lib/review-photo";
import { deleteReviewPhotos, mapCreateReviewError, uploadReviewPhoto } from "@/lib/reviews-server";

type Ctx = { params: Promise<{ id: string }> };

type OrderRow = {
  id: string;
  status: string;
  delivery_partner_id: string | null;
  order_items: { product_id: string; products: { name: string } | { name: string }[] | null }[];
};

// Filtering on the verified customer id makes another customer's order simply "not found".
async function loadOrder(orderId: string, customerId: string): Promise<OrderRow | null | "error"> {
  const { data, error } = await supabaseServer
    .from("orders")
    .select("id, status, delivery_partner_id, order_items(product_id, products(name))")
    .eq("id", orderId)
    .eq("customer_id", customerId)
    .maybeSingle();
  if (error) return "error";
  return (data as unknown as OrderRow | null) ?? null;
}

function distinctDishes(order: OrderRow): { productId: string; name: string }[] {
  const byId = new Map<string, string>();
  for (const line of order.order_items) {
    if (byId.has(line.product_id)) continue;
    const product = Array.isArray(line.products) ? line.products[0] : line.products;
    byId.set(line.product_id, product?.name ?? "Dish");
  }
  return [...byId].map(([productId, name]) => ({ productId, name }));
}

async function loadReview(orderId: string): Promise<RawReviewRow | null> {
  const { data } = await supabaseServer.from("reviews").select(REVIEW_SELECT).eq("order_id", orderId).maybeSingle();
  return (data as unknown as RawReviewRow | null) ?? null;
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });
  const order = await loadOrder(id.toLowerCase(), who.userId);
  if (order === "error") return NextResponse.json({ error: "Failed to load review" }, { status: 500 });
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });

  const review = await loadReview(order.id);
  let score: OrderReviewState["partnerScore"] = null;
  if (order.delivery_partner_id) {
    const { data: partner } = await supabaseServer
      .from("delivery_partners")
      .select("rating_sum, rating_count")
      .eq("user_id", order.delivery_partner_id)
      .maybeSingle();
    score = partnerScore(partner?.rating_sum ?? 0, partner?.rating_count ?? 0);
  }
  const eligible = order.status === "delivered" && !review;
  const state: OrderReviewState = {
    eligible,
    dishes: eligible ? distinctDishes(order) : [],
    hasPartner: order.delivery_partner_id !== null,
    review: review ? toOwnReview(review, review.photo_path ? reviewPhotoPath(review.id) : null) : null,
    partnerScore: score,
  };
  return NextResponse.json(state);
}

async function readSubmission(request: NextRequest): Promise<{ raw: unknown; photo: File | null } | { error: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const payload = form.get("payload");
      if (typeof payload !== "string") return { error: "Missing review" };
      const photo = form.get("photo");
      return { raw: JSON.parse(payload), photo: photo instanceof File ? photo : null };
    }
    return { raw: await request.json(), photo: null };
  } catch {
    return { error: "Invalid request body" };
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });
  const orderId = id.toLowerCase();

  const order = await loadOrder(orderId, who.userId);
  if (order === "error") return NextResponse.json({ error: "Could not save your review right now" }, { status: 500 });
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (order.status !== "delivered") {
    return NextResponse.json({ error: "You can review an order once it has been delivered" }, { status: 409 });
  }
  if (await loadReview(orderId)) {
    return NextResponse.json({ error: "You have already reviewed this order" }, { status: 409 });
  }

  const submission = await readSubmission(request);
  if ("error" in submission) return NextResponse.json({ error: submission.error }, { status: 400 });
  const parsed = validateReviewPayload(submission.raw, {
    orderProductIds: distinctDishes(order).map((dish) => dish.productId),
    hasPartner: order.delivery_partner_id !== null,
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;

  let photoPath: string | null = null;
  if (submission.photo) {
    const bytes = new Uint8Array(await submission.photo.arrayBuffer());
    const checked = checkPhoto({ size: bytes.length, declaredType: submission.photo.type, bytes });
    if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
    try {
      photoPath = await uploadReviewPhoto(orderId, bytes, checked.type, checked.ext);
    } catch (err) {
      console.error("review photo upload failed", err);
      return NextResponse.json({ error: "Could not upload the photo right now" }, { status: 500 });
    }
  }

  const { data: reviewId, error } = await supabaseServer.rpc("create_review", {
    p_order_id: orderId,
    p_customer_id: who.userId,
    p_store_stars: input.storeStars,
    p_store_comment: input.storeComment,
    p_photo_path: photoPath,
    p_dishes: input.dishes.map((dish) => ({ product_id: dish.productId, stars: dish.stars, comment: dish.comment })),
    p_partner_stars: input.partner?.stars ?? null,
    p_partner_comment: input.partner?.comment ?? null,
  });
  if (error || typeof reviewId !== "string") {
    if (photoPath) await deleteReviewPhotos([photoPath]);
    const failure = mapCreateReviewError(error ?? {});
    if (failure.status === 500) console.error("create_review failed", error?.message);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }

  const review = await loadReview(orderId);
  return NextResponse.json(
    { review: review ? toOwnReview(review, review.photo_path ? reviewPhotoPath(review.id) : null) : null },
    { status: 201 }
  );
}
```

- [ ] **Step 4: Write the report route**

Create `app/api/customer/reviews/[id]/report/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveCustomer } from "@/lib/customer-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import { REVIEW_LIMITS, cleanComment } from "@/lib/reviews-model";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const who = await resolveCustomer(request);
  if ("error" in who) return NextResponse.json({ error: who.error }, { status: who.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { reason?: unknown } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }
  const reason = cleanComment(body.reason, REVIEW_LIMITS.reason);
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });

  const { data: review, error } = await supabaseServer
    .from("reviews")
    .select("id, status, customer_id, reported_at")
    .eq("id", id.toLowerCase())
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not report this review right now" }, { status: 500 });
  if (!review || review.status !== "visible") return NextResponse.json({ error: "not found" }, { status: 404 });
  if (review.customer_id === who.userId) {
    return NextResponse.json({ error: "You cannot report your own review" }, { status: 400 });
  }
  if (review.reported_at) return NextResponse.json({ reported: true });

  const { error: updateError } = await supabaseServer
    .from("reviews")
    .update({ reported_at: new Date().toISOString(), report_reason: reason.value, reported_by: "customer" })
    .eq("id", review.id)
    .is("reported_at", null);
  if (updateError) return NextResponse.json({ error: "Could not report this review right now" }, { status: 500 });
  return NextResponse.json({ reported: true });
}
```

- [ ] **Step 5: Write the photo proxy route**

Create `app/api/reviews/[id]/photo/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { uuidsOnly } from "@/lib/zippy/actions";
import { REVIEW_BUCKET } from "@/lib/reviews-server";

type Ctx = { params: Promise<{ id: string }> };

const TYPE_BY_EXT: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Only a VISIBLE review serves its photo; hiding a review stops the photo at request time.
export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return new NextResponse(null, { status: 404 });
  const { data: review } = await supabaseServer
    .from("reviews")
    .select("photo_path, status")
    .eq("id", id.toLowerCase())
    .maybeSingle();
  if (!review || review.status !== "visible" || !review.photo_path) return new NextResponse(null, { status: 404 });
  const { data: blob, error } = await supabaseServer.storage.from(REVIEW_BUCKET).download(review.photo_path);
  if (error || !blob) return new NextResponse(null, { status: 404 });
  const ext = review.photo_path.split(".").pop() ?? "";
  return new NextResponse(await blob.arrayBuffer(), {
    headers: {
      "Content-Type": TYPE_BY_EXT[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

- [ ] **Step 6: Type-check and lint**

Run: `npx tsc --noEmit` (silent) and `npx eslint lib/reviews-server.ts "app/api/customer/orders/[id]/review/route.ts" "app/api/customer/reviews/[id]/report/route.ts" "app/api/reviews/[id]/photo/route.ts"` (no errors).

- [ ] **Step 7: Live API check with curl (customer dev server on :3000 is running)**

Set up (do not echo keys):
```bash
node scripts/c1-fixtures.mjs create > /dev/null
eval "$(npx supabase status -o env | sed 's/^/export /')"
F=.superpowers/sdd/c1-fixtures.json
EMAIL=$(node -p "require('./$F').customer.email"); PW=$(node -p "require('./$F').customer.password")
ORDER1=$(node -p "require('./$F').orders[0].id"); ORDER2=$(node -p "require('./$F').orders[1].id")
P1=$(node -p "require('./$F').orders[0].productIds[0]"); P2=$(node -p "require('./$F').orders[0].productIds[1]")
TOKEN=$(curl -s "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PW\"}" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).access_token")
python -c "import base64,sys;sys.stdout.buffer.write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='))" > /tmp/c1.png
```
(`API_URL` may be named differently in the status output; use whichever variable holds `http://127.0.0.1:54321`.)

Run each and compare with the expectation:
1. `curl -s -o /dev/null -w "%{http_code}" localhost:3000/api/customer/orders/$ORDER1/review` -> `401`.
2. `curl -s localhost:3000/api/customer/orders/$ORDER1/review -H "Authorization: Bearer $TOKEN"` -> `eligible:true`, `dishes` with two entries, `hasPartner:true`, `review:null`, `partnerScore:{"isNew":true}`.
3. Foreign order: `curl -s -w " %{http_code}" localhost:3000/api/customer/orders/00000000-0000-4000-8000-000000000000/review -H "Authorization: Bearer $TOKEN"` -> `404`.
4. Bad input: POST `{"storeStars":0}` -> 400; POST `{"storeStars":4,"dishes":[{"productId":"33333333-3333-4333-8333-333333333333","stars":3}]}` -> 400; POST with `"storeComment":"bad\u0000x"` -> 400 (not 500).
5. Fake-type photo: `curl -s -w " %{http_code}" -X POST localhost:3000/api/customer/orders/$ORDER1/review -H "Authorization: Bearer $TOKEN" -F 'payload={"storeStars":4}' -F "photo=@/tmp/c1.png;type=image/jpeg"` -> 400 "type does not match". Then `printf 'hello' > /tmp/c1.jpg` and send it as `image/jpeg` -> 400.
6. Race: run two valid POSTs for ORDER1 at once with `&` and `wait` (JSON body `{"storeStars":5,"storeComment":"<script>alert(1)</script>","dishes":[{"productId":"'$P1'","stars":5},{"productId":"'$P2'","stars":3}],"partner":{"stars":4,"comment":"polite"}}`). Expected: exactly one 201 and one 409. Then in SQL: `select count(*) from reviews where order_id = '<ORDER1>'` -> 1, and `stores.rating_count` for the fixture store went up by exactly 1.
7. Photo: POST for ORDER2 with `-F "photo=@/tmp/c1.png;type=image/png"` -> 201 with `photoUrl` like `/api/reviews/<id>/photo`. `curl -s -o /dev/null -w "%{http_code} %{content_type}" localhost:3000<photoUrl>` -> `200 image/png`. Check the object exists: `select photo_path from reviews where order_id='<ORDER2>'`.
8. GET again -> `eligible:false`, `review` populated, `partnerScore` still `isNew:true`.
9. Report: second customer is needed to report a foreign review. Report as the SAME customer -> 400 "own review". Use SQL `update reviews set customer_id = null where id = '<review of ORDER1>'` to simulate a deleted customer, then report -> 200, report again -> 200 and `reported_at` unchanged; hidden: `update reviews set status='hidden'` -> report -> 404 and the photo URL -> 404. Restore nothing: cleanup removes the orders.
10. Cleanup: `node scripts/c1-fixtures.mjs cleanup` -> `cleaned`; confirm `select count(*) from reviews` is 0 and the bucket has no objects for these orders: `select count(*) from storage.objects where bucket_id='review-photos'` -> 0.

- [ ] **Step 8: Build and commit**

Run: `npm run build` (Expected: succeeds; if a worktree/turbopack message appears, you are in the main checkout so it should not). Then:
```bash
git add lib/reviews-server.ts "app/api/customer/orders/[id]/review/route.ts" "app/api/customer/reviews/[id]/report/route.ts" "app/api/reviews/[id]/photo/route.ts"
git commit -m "feat(c1): customer review routes, photo storage helpers and photo proxy

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
Do not leave `npm run build` output staged (`.next*` is git-ignored). Never build while the dev app uses the same `.next` directory: the four dev servers use `.next-customer`, `.next-vendor`, `.next-delivery`, `.next-admin`, so the default `.next` is free; if `git status` shows otherwise, stop and ask.

---

### Task 4: Public read routes and the web customer UI

**Files:**
- Create: `app/api/stores/[id]/reviews/route.ts`, `app/api/stores/[id]/rating/route.ts`
- Create: `components/reviews/Stars.tsx`, `components/reviews/ReviewForm.tsx`, `components/reviews/OwnReviewView.tsx`, `components/reviews/StoreReviews.tsx`, `components/reviews/ReportReviewButton.tsx`, `components/reviews/PartnerScoreLine.tsx`
- Create: `lib/use-order-review.ts`
- Modify: `lib/customer-api.ts`, `components/StoreRatingSummary.tsx`, `components/MenuItemRow.tsx`, `app/customer/stores/[id]/page.tsx`, `app/customer/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 2 model exports; Task 3 routes (`orderReviewPath`, `reportReviewPath`, `reviewPhotoPath`).
- Produces (HTTP): `GET /api/stores/[id]/reviews?before=<created_at>` -> `{ reviews: PublicReview[], nextCursor: string | null }` (visible only, 10 per page); `GET /api/stores/[id]/rating` -> `{ rating: number | null, count: number, histogram: [n,n,n,n,n] }`.
- Produces (TS): `useOrderReview(orderId, status)` -> `{ state: OrderReviewState | null, loading, error, submitting, submit(input, photo): Promise<boolean> }`; components `StarsDisplay`, `StarInput`, `ReviewForm`, `OwnReviewView`, `StoreReviews`, `ReportReviewButton`, `PartnerScoreLine`.

- [ ] **Step 1: Public read routes**

Create `app/api/stores/[id]/reviews/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { uuidsOnly } from "@/lib/zippy/actions";
import { REVIEWS_PAGE_SIZE, REVIEW_SELECT, reviewPhotoPath, toPublicReview, type RawReviewRow } from "@/lib/reviews-model";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });
  const before = request.nextUrl.searchParams.get("before");
  if (before !== null && Number.isNaN(Date.parse(before))) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }
  let query = supabaseServer
    .from("reviews")
    .select(REVIEW_SELECT)
    .eq("store_id", id.toLowerCase())
    .eq("status", "visible")
    .order("created_at", { ascending: false })
    .limit(REVIEWS_PAGE_SIZE + 1);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  const rows = (data ?? []) as unknown as RawReviewRow[];
  const page = rows.slice(0, REVIEWS_PAGE_SIZE);
  return NextResponse.json({
    reviews: page.map((row) => toPublicReview(row, row.photo_path ? reviewPhotoPath(row.id) : null)),
    nextCursor: rows.length > REVIEWS_PAGE_SIZE ? page[page.length - 1].created_at : null,
  });
}
```

Create `app/api/stores/[id]/rating/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { uuidsOnly } from "@/lib/zippy/actions";
import { averageOf, buildHistogram } from "@/lib/reviews-model";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });
  const storeId = id.toLowerCase();
  const [{ data: store, error: storeError }, { data: stars, error: starsError }] = await Promise.all([
    supabaseServer.from("stores").select("rating_sum, rating_count").eq("id", storeId).maybeSingle(),
    supabaseServer.from("reviews").select("rating").eq("store_id", storeId).eq("status", "visible").range(0, 4999),
  ]);
  if (storeError || starsError) return NextResponse.json({ error: "Failed to load rating" }, { status: 500 });
  if (!store) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    rating: averageOf(store.rating_sum, store.rating_count),
    count: store.rating_count,
    histogram: buildHistogram((stars ?? []).map((row) => row.rating as number)),
  });
}
```

- [ ] **Step 2: Let `customerFetch` send a FormData body**

In `lib/customer-api.ts`, replace the `fetch` call so a `FormData` body is passed through untouched (the browser sets the multipart boundary itself):

```ts
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const res = await fetch(path, {
    method: init.method ?? "GET",
    headers: isForm
      ? { Authorization: `Bearer ${token}` }
      : { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
  });
```


- [ ] **Step 3: Star components**

Create `components/reviews/Stars.tsx`:

```tsx
"use client";

export function StarsDisplay({ value, className = "" }: { value: number; className?: string }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <span aria-label={`${value} out of 5 stars`} role="img" className={`text-brand-primary-text-safe ${className}`}>
      {"★".repeat(filled)}
      <span className="text-brand-ink-muted/40">{"★".repeat(5 - filled)}</span>
    </span>
  );
}

export function StarInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (stars: number) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((stars) => (
        <button
          key={stars}
          type="button"
          role="radio"
          aria-checked={value === stars}
          aria-label={`${stars} star${stars === 1 ? "" : "s"}`}
          onClick={() => onChange(value === stars ? 0 : stars)}
          className={`text-2xl leading-none ${stars <= value ? "text-brand-primary-text-safe" : "text-brand-ink-muted/40"}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
```

(`brand-primary-text-safe` is the existing darker text-safe token; confirm the exact Tailwind class names with `grep -n "text-safe" app/globals.css` and use the real token names.)

- [ ] **Step 4: The order-review hook**

Create `lib/use-order-review.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { customerFetch } from "@/lib/customer-api";
import { orderReviewPath, type OrderReviewState, type ReviewInput } from "@/lib/reviews-model";

const STATUSES_WITH_STATE = ["assigned", "picked_up", "delivered"];

type Tagged = { key: string; state: OrderReviewState };

// The loaded state is tagged with its order and status; the visible value is derived, never reset in an effect.
export function useOrderReview(orderId: string, status: string | null) {
  const [tagged, setTagged] = useState<Tagged | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const key = `${orderId}:${status}`;
  const enabled = status !== null && STATUSES_WITH_STATE.includes(status);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const state = await customerFetch<OrderReviewState>(orderReviewPath(orderId));
        if (!cancelled) setTagged({ key, state });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the review");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, key, enabled]);

  const submit = useCallback(
    async (input: ReviewInput, photo: File | null): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      try {
        let body: unknown = input;
        if (photo) {
          const form = new FormData();
          form.append("payload", JSON.stringify(input));
          form.append("photo", photo);
          body = form;
        }
        await customerFetch(orderReviewPath(orderId), { method: "POST", body });
        const state = await customerFetch<OrderReviewState>(orderReviewPath(orderId));
        setTagged({ key, state });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save your review");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [orderId, key]
  );

  const state = tagged && tagged.key === key ? tagged.state : null;
  return { state, loading: enabled && state === null && error === null, error, submitting, submit };
}
```

- [ ] **Step 5: Form, read-only view, partner line, report button**

Create `components/reviews/ReviewForm.tsx`:

```tsx
"use client";

import { useState } from "react";
import { StarInput } from "@/components/reviews/Stars";
import {
  REVIEW_LIMITS,
  REVIEW_PHOTO_TYPES,
  type OrderReviewState,
  type ReviewInput,
} from "@/lib/reviews-model";

export function ReviewForm({
  state,
  submitting,
  error,
  onSubmit,
}: {
  state: OrderReviewState;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: ReviewInput, photo: File | null) => Promise<boolean>;
}) {
  const [storeStars, setStoreStars] = useState(0);
  const [storeComment, setStoreComment] = useState("");
  const [dishStars, setDishStars] = useState<Record<string, number>>({});
  const [dishComments, setDishComments] = useState<Record<string, string>>({});
  const [partnerStars, setPartnerStars] = useState(0);
  const [partnerComment, setPartnerComment] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  function pickPhoto(file: File | null) {
    setLocalError(null);
    if (file && !(REVIEW_PHOTO_TYPES as readonly string[]).includes(file.type)) {
      setLocalError("The photo must be a JPEG, PNG or WebP image");
      return;
    }
    if (file && file.size > REVIEW_LIMITS.photoBytes) {
      setLocalError("The photo must be 3 MB or smaller");
      return;
    }
    setPhoto(file);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (storeStars === 0) {
      setLocalError("Rate the store from 1 to 5 stars");
      return;
    }
    setLocalError(null);
    await onSubmit(
      {
        storeStars,
        storeComment: storeComment.trim() || null,
        dishes: state.dishes
          .filter((dish) => (dishStars[dish.productId] ?? 0) > 0)
          .map((dish) => ({
            productId: dish.productId,
            stars: dishStars[dish.productId],
            comment: (dishComments[dish.productId] ?? "").trim() || null,
          })),
        partner: partnerStars > 0 ? { stars: partnerStars, comment: partnerComment.trim() || null } : null,
      },
      photo
    );
  }

  const shownError = localError ?? error;
  const field = "w-full rounded-[var(--radius-card)] border border-brand-ink-muted/30 bg-brand-surface p-2 text-sm";

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow">
      <h2 className="font-heading text-lg text-brand-ink">Rate your order</h2>

      <div className="flex flex-col gap-2">
        <span className="font-semibold text-brand-ink">The store</span>
        <StarInput label="Store rating" value={storeStars} onChange={setStoreStars} />
        <textarea
          className={field}
          rows={3}
          maxLength={REVIEW_LIMITS.storeComment}
          placeholder="Tell others about the food and the packaging (optional)"
          value={storeComment}
          onChange={(event) => setStoreComment(event.target.value)}
        />
        <label className="text-sm text-brand-ink-muted">
          Photo (optional, JPEG, PNG or WebP, up to 3 MB)
          <input
            type="file"
            accept={REVIEW_PHOTO_TYPES.join(",")}
            className="mt-1 block text-sm"
            onChange={(event) => pickPhoto(event.target.files?.[0] ?? null)}
          />
        </label>
        {photo && (
          <p className="text-sm text-brand-ink-muted">
            {photo.name} ({Math.max(1, Math.round(photo.size / 1024))} KB){" "}
            <button type="button" className="underline" onClick={() => setPhoto(null)}>
              Remove
            </button>
          </p>
        )}
      </div>

      {state.dishes.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="font-semibold text-brand-ink">The dishes (optional)</span>
          {state.dishes.map((dish) => (
            <div key={dish.productId} className="flex flex-col gap-1">
              <span className="text-sm text-brand-ink">{dish.name}</span>
              <StarInput
                label={`Rating for ${dish.name}`}
                value={dishStars[dish.productId] ?? 0}
                onChange={(stars) => setDishStars((prev) => ({ ...prev, [dish.productId]: stars }))}
              />
              {(dishStars[dish.productId] ?? 0) > 0 && (
                <input
                  className={field}
                  maxLength={REVIEW_LIMITS.dishComment}
                  placeholder="A word about this dish (optional)"
                  value={dishComments[dish.productId] ?? ""}
                  onChange={(event) => setDishComments((prev) => ({ ...prev, [dish.productId]: event.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {state.hasPartner && (
        <div className="flex flex-col gap-2">
          <span className="font-semibold text-brand-ink">The delivery (optional)</span>
          <span className="text-sm text-brand-ink-muted">
            How was the delivery? Rate the rider&apos;s handling and courtesy, not the restaurant&apos;s wait.
          </span>
          <StarInput label="Delivery partner rating" value={partnerStars} onChange={setPartnerStars} />
          {partnerStars > 0 && (
            <input
              className={field}
              maxLength={REVIEW_LIMITS.partnerComment}
              placeholder="A word about the delivery (optional)"
              value={partnerComment}
              onChange={(event) => setPartnerComment(event.target.value)}
            />
          )}
        </div>
      )}

      {shownError && (
        <p role="alert" className="text-sm text-brand-danger-text-safe">
          {shownError}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="self-start rounded-[var(--radius-pill)] bg-brand-primary px-5 py-2 font-semibold text-white disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Submit review"}
      </button>
    </form>
  );
}
```

Create `components/reviews/OwnReviewView.tsx`:

```tsx
"use client";

import { StarsDisplay } from "@/components/reviews/Stars";
import type { OwnReview } from "@/lib/reviews-model";

export function OwnReviewView({ review }: { review: OwnReview }) {
  return (
    <section className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow">
      <h2 className="font-heading text-lg text-brand-ink">Your review</h2>
      {review.status === "hidden" && (
        <p className="text-sm text-brand-ink-muted">This review is currently hidden by the Fresh &amp; Quick team.</p>
      )}
      <StarsDisplay value={review.stars} />
      {review.comment && <p className="whitespace-pre-wrap text-sm text-brand-ink">{review.comment}</p>}
      {review.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={review.photoUrl} alt="Your review" className="max-h-48 w-auto rounded-[var(--radius-card)] object-cover" />
      )}
      {review.dishes.map((dish) => (
        <p key={dish.name} className="text-sm text-brand-ink">
          {dish.name}: <StarsDisplay value={dish.stars} />
          {dish.comment ? ` · ${dish.comment}` : ""}
        </p>
      ))}
      {review.partner && (
        <p className="text-sm text-brand-ink">
          Delivery: <StarsDisplay value={review.partner.stars} />
          {review.partner.comment ? ` · ${review.partner.comment}` : ""}
        </p>
      )}
      {review.vendorReply && (
        <p className="rounded-[var(--radius-card)] bg-brand-bg p-2 text-sm text-brand-ink">
          <strong>Reply from the store:</strong> {review.vendorReply}
        </p>
      )}
    </section>
  );
}
```

Create `components/reviews/PartnerScoreLine.tsx`:

```tsx
import type { PartnerScore } from "@/lib/reviews-model";

export function PartnerScoreLine({ score }: { score: PartnerScore }) {
  return (
    <p className="text-sm text-brand-ink-muted">
      {score.isNew ? "Your delivery partner · New partner" : `Your delivery partner · ★ ${score.average.toFixed(1)} (${score.count} ratings)`}
    </p>
  );
}
```

Create `components/reviews/ReportReviewButton.tsx`:

```tsx
"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { customerFetch } from "@/lib/customer-api";
import { reportReviewPath } from "@/lib/reviews-model";

const REASONS = ["Offensive or abusive", "Spam or fake", "Not about this store"];

export function ReportReviewButton({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function report(reason: string) {
    setError(null);
    try {
      await customerFetch(reportReviewPath(reviewId), { method: "POST", body: { reason } });
      setDone(true);
      setOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not report";
      if (message === "Not signed in") router.push(`/customer/login?redirectTo=${encodeURIComponent(pathname)}`);
      else setError(message);
    }
  }

  if (done) return <span className="text-xs text-brand-ink-muted">Reported, thank you</span>;
  return (
    <span className="text-xs text-brand-ink-muted">
      <button type="button" className="underline" onClick={() => setOpen((value) => !value)}>
        Report
      </button>
      {open && (
        <span className="ml-2 inline-flex flex-wrap gap-2">
          {REASONS.map((reason) => (
            <button key={reason} type="button" className="rounded-full border px-2 py-0.5" onClick={() => report(reason)}>
              {reason}
            </button>
          ))}
        </span>
      )}
      {error && <span className="ml-2 text-brand-danger-text-safe">{error}</span>}
    </span>
  );
}
```

- [ ] **Step 6: Store reviews section and the summary**

Replace `components/StoreRatingSummary.tsx` with:

```tsx
export function StoreRatingSummary({
  rating,
  count = 0,
  histogram,
}: {
  rating: number;
  count?: number;
  histogram?: number[];
}) {
  const filled = Math.round(rating);
  const max = Math.max(1, ...(histogram ?? [0]));
  return (
    <section className="mb-6 rounded-[var(--radius-card)] border border-brand-ink-muted/10 bg-brand-primary-tint p-4">
      <h2 className="mb-3 font-heading text-lg text-brand-ink">Rating</h2>
      <div className="flex items-center gap-3">
        <span className="text-3xl font-bold text-brand-ink">{rating.toFixed(1)}</span>
        <span aria-hidden className="text-xl">
          {"⭐".repeat(filled)}
          {"☆".repeat(5 - filled)}
        </span>
        {count > 0 && <span className="text-sm text-brand-ink-muted">({count} {count === 1 ? "review" : "reviews"})</span>}
      </div>
      {histogram && count > 0 && (
        <div className="mt-3 flex flex-col gap-1" aria-label="Rating breakdown">
          {[5, 4, 3, 2, 1].map((stars) => (
            <div key={stars} className="flex items-center gap-2 text-xs text-brand-ink-muted">
              <span className="w-6">{stars}★</span>
              <div className="h-2 flex-1 rounded-full bg-brand-ink-muted/15">
                <div
                  className="h-2 rounded-full bg-brand-primary"
                  style={{ width: `${(histogram[stars - 1] / max) * 100}%` }}
                />
              </div>
              <span className="w-6 text-right">{histogram[stars - 1]}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

Create `components/reviews/StoreReviews.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { StoreRatingSummary } from "@/components/StoreRatingSummary";
import { StarsDisplay } from "@/components/reviews/Stars";
import { ReportReviewButton } from "@/components/reviews/ReportReviewButton";
import { storeRatingPath, storeReviewsPath, type PublicReview } from "@/lib/reviews-model";

type Summary = { rating: number | null; count: number; histogram: number[] };
type Page = { reviews: PublicReview[]; nextCursor: string | null };
type Loaded = { storeId: string; summary: Summary; reviews: PublicReview[]; nextCursor: string | null };

// seedRating is the stores.rating shown before any real review exists.
export function StoreReviews({ storeId, seedRating }: { storeId: string; seedRating: number }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [summaryRes, pageRes] = await Promise.all([fetch(storeRatingPath(storeId)), fetch(storeReviewsPath(storeId))]);
        if (!summaryRes.ok || !pageRes.ok) throw new Error("load failed");
        const summary = (await summaryRes.json()) as Summary;
        const page = (await pageRes.json()) as Page;
        if (!cancelled) setLoaded({ storeId, summary, reviews: page.reviews, nextCursor: page.nextCursor });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const current = loaded && loaded.storeId === storeId ? loaded : null;

  const loadMore = useCallback(async () => {
    if (!current?.nextCursor) return;
    setMoreBusy(true);
    try {
      const res = await fetch(`${storeReviewsPath(storeId)}?before=${encodeURIComponent(current.nextCursor)}`);
      if (!res.ok) throw new Error("load failed");
      const page = (await res.json()) as Page;
      setLoaded({ ...current, reviews: [...current.reviews, ...page.reviews], nextCursor: page.nextCursor });
    } catch {
      setFailed(true);
    } finally {
      setMoreBusy(false);
    }
  }, [current, storeId]);

  const count = current?.summary.count ?? 0;
  const rating = count > 0 && current?.summary.rating != null ? current.summary.rating : seedRating;

  return (
    <>
      <StoreRatingSummary rating={rating} count={count} histogram={current?.summary.histogram} />
      {failed && <p className="mb-4 text-sm text-brand-ink-muted">Reviews are unavailable right now.</p>}
      {current && current.reviews.length > 0 && (
        <section className="mb-6 flex flex-col gap-3" aria-label="Customer reviews">
          <h2 className="font-heading text-lg text-brand-ink">Reviews</h2>
          {current.reviews.map((review) => (
            <article key={review.id} className="flex flex-col gap-1 rounded-[var(--radius-card)] bg-brand-surface p-3 shadow">
              <div className="flex items-center gap-2 text-sm">
                <strong className="text-brand-ink">{review.reviewerName}</strong>
                <StarsDisplay value={review.stars} />
                <span className="text-brand-ink-muted">{new Date(review.createdAt).toLocaleDateString()}</span>
              </div>
              {review.comment && <p className="whitespace-pre-wrap text-sm text-brand-ink">{review.comment}</p>}
              {review.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={review.photoUrl} alt="From a customer" loading="lazy" className="max-h-48 w-auto rounded-[var(--radius-card)] object-cover" />
              )}
              {review.dishes.length > 0 && (
                <p className="text-xs text-brand-ink-muted">
                  {review.dishes.map((dish) => `${dish.name} ${dish.stars}★`).join(" · ")}
                </p>
              )}
              {review.vendorReply && (
                <p className="rounded-[var(--radius-card)] bg-brand-bg p-2 text-sm text-brand-ink">
                  <strong>Reply from the store:</strong> {review.vendorReply}
                </p>
              )}
              <ReportReviewButton reviewId={review.id} />
            </article>
          ))}
          {current.nextCursor && (
            <button
              type="button"
              disabled={moreBusy}
              onClick={loadMore}
              className="self-start rounded-[var(--radius-pill)] border border-brand-primary px-4 py-1 text-sm text-brand-primary-text-safe disabled:opacity-50"
            >
              {moreBusy ? "Loading…" : "Load more reviews"}
            </button>
          )}
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 7: Wire the store page and dish averages**

In `app/customer/stores/[id]/page.tsx`: replace the import `StoreRatingSummary` with `import { StoreReviews } from "@/components/reviews/StoreReviews";`; replace `<StoreRatingSummary rating={restaurant.rating} />` with `<StoreReviews storeId={restaurant.id} seedRating={restaurant.rating} />`; in the `products` select string append `, rating_sum, rating_count` right after `category`; in the page's local `MenuItem` type add `rating_sum: number; rating_count: number;`. In `components/MenuItemRow.tsx` add the same two fields to its `MenuItem` type, import `averageOf` from `@/lib/reviews-model`, and next to the dish name render (use the file's own markup around the name):

```tsx
{item.rating_count > 0 && (
  <span className="text-xs text-brand-ink-muted">★ {averageOf(item.rating_sum, item.rating_count)?.toFixed(1)} ({item.rating_count})</span>
)}
```

Also make `FeaturedItemsRow`/other consumers of `MenuItem` compile (TypeScript will list them); give optional fields `rating_sum?: number; rating_count?: number;` where they build items by hand, and guard with `(item.rating_count ?? 0) > 0`.

- [ ] **Step 8: Wire the order page**

In `app/customer/orders/[id]/page.tsx` add imports for `useOrderReview`, `ReviewForm`, `OwnReviewView`, `PartnerScoreLine`. Because hooks must run before the early returns, add right after the existing `useReorder()` line:

```tsx
  const review = useOrderReview(params.id, order?.status ?? null);
```

and inside the main JSX, immediately after `<OrderDetailView order={order} />`:

```tsx
            {review.state?.partnerScore && order.deliveryPartnerId && <PartnerScoreLine score={review.state.partnerScore} />}
            {review.state?.eligible && (
              <ReviewForm state={review.state} submitting={review.submitting} error={review.error} onSubmit={review.submit} />
            )}
            {review.state?.review && <OwnReviewView review={review.state.review} />}
```

- [ ] **Step 9: Checks**

Run: `npx tsc --noEmit`, `npx eslint components/reviews lib/use-order-review.ts components/StoreRatingSummary.tsx components/MenuItemRow.tsx "app/customer/orders/[id]/page.tsx" "app/customer/stores/[id]/page.tsx" lib/customer-api.ts "app/api/stores"` (the pre-existing `set-state-in-effect` error in the store page, if it still shows, is known and not yours), `node --test tests/*.test.mjs`, then `npm run build`.

- [ ] **Step 10: Live check in a real browser (Claude in Chrome first; load its tools in ONE ToolSearch call, `tabs_context_mcp` first, a NEW tab)**

`node scripts/c1-fixtures.mjs create`, then on `http://localhost:3000`:
1. Sign in as the fixture customer (email and password are in `.superpowers/sdd/c1-fixtures.json`; the customer login page is `/customer/login`).
2. Open `/customer/orders/<ORDER1>`: the "Rate your order" card shows the store stars, two dishes, the delivery section and the "New partner" line. Submit with 3 store stars, a `<b>bold</b>` comment, a rating on one dish and no photo. The card becomes "Your review" and the comment shows as literal `<b>bold</b>` text.
3. Open `/customer/orders/<ORDER2>`, pick a real PNG or JPEG through the file input (Chrome `file_upload` tool), submit: photo shows in "Your review".
4. Open `/customer/stores/<store id>`: the summary shows the average and "(2 reviews)", the histogram, both reviews with "C1 T." as the name and the photo; "Load more" is absent. Reload the page: unchanged. Check the rated dish row shows the average.
5. Click Report on a review: it needs another account's review, so for the fixture's own reviews the button is expected to answer "You cannot report your own review" via the page error text. Verify that message, then verify reporting works with curl against the other fixture review after `update reviews set customer_id = null`.
6. Console and network: no errors; the photo request is `/api/reviews/<id>/photo` with status 200.
Cleanup: `node scripts/c1-fixtures.mjs cleanup`; confirm 0 reviews, 0 storage objects.

- [ ] **Step 11: Commit**

```bash
git add app/api/stores components/reviews lib/use-order-review.ts lib/customer-api.ts components/StoreRatingSummary.tsx components/MenuItemRow.tsx "app/customer/stores/[id]/page.tsx" "app/customer/orders/[id]/page.tsx"
git commit -m "feat(c1): public review routes and web customer review UI

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```
If the type check made you touch other files (for example `FeaturedItemsRow.tsx`), add them by name too.

---

### Task 5: Phone customer UI (rating card, store reviews, dish averages, partner line, report)

**Files:**
- Create: `mobile/lib/use-order-review.ts`
- Create: `mobile/components/reviews/StarRow.tsx`, `ReviewForm.tsx`, `OwnReviewCard.tsx`, `StoreReviews.tsx`, `ReportReviewRow.tsx`
- Modify: `mobile/lib/api.ts` (export `absoluteUrl`), `mobile/src/app/customer/orders/[id].tsx`, `mobile/src/app/customer/store/[id].tsx`

**Interfaces:**
- Consumes: `mobile/lib/reviews-model.ts` (byte-identical copy from Task 2); routes from Tasks 3 and 4 through `apiFetch`.
- Produces: `useOrderReview(orderId, status)` with the same return shape as the web hook (`state`, `loading`, `error`, `submitting`, `submit(input)`); `absoluteUrl(path)` turning `/api/reviews/<id>/photo` into `${EXPO_PUBLIC_API_BASE_URL}/api/reviews/<id>/photo`. No photo picking yet (Task 10).

- [ ] **Step 1: Read the neighbours first**

Read `mobile/components/OrderStatusPill.tsx` (style conventions: `BRAND` tokens from `../theme`, `StyleSheet.create`, Inter font names), `mobile/lib/use-reorder.ts` (how a hook calls `apiFetch`), and the two screens named above.

- [ ] **Step 2: Export an absolute-URL helper**

In `mobile/lib/api.ts`, after the `ApiError` class add:

```ts
// Review photo URLs come back as app-relative paths (/api/reviews/<id>/photo); an <Image> needs the full address.
export function absoluteUrl(path: string): string {
  return path.startsWith("/") ? `${API_BASE_URL}${path}` : path;
}
```

- [ ] **Step 3: The hook**

Create `mobile/lib/use-order-review.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { orderReviewPath, type OrderReviewState, type ReviewInput } from "./reviews-model";

const STATUSES_WITH_STATE = ["assigned", "picked_up", "delivered"];

type Tagged = { key: string; state: OrderReviewState };

// Same shape as the web hook (lib/use-order-review.ts), without photos: the loaded state is tagged with its
// order and status, and the visible value is derived instead of being reset in an effect.
export function useOrderReview(orderId: string, status: string | null) {
  const [tagged, setTagged] = useState<Tagged | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const key = `${orderId}:${status}`;
  const enabled = status !== null && STATUSES_WITH_STATE.includes(status);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const state = await apiFetch<OrderReviewState>(orderReviewPath(orderId));
        if (!cancelled) setTagged({ key, state });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the review");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId, key, enabled]);

  const submit = useCallback(
    async (input: ReviewInput): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      try {
        await apiFetch(orderReviewPath(orderId), { method: "POST", body: input });
        const state = await apiFetch<OrderReviewState>(orderReviewPath(orderId));
        setTagged({ key, state });
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save your review");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [orderId, key]
  );

  const state = tagged && tagged.key === key ? tagged.state : null;
  return { state, loading: enabled && state === null && error === null, error, submitting, submit };
}
```

- [ ] **Step 4: Star row and the form**

Create `mobile/components/reviews/StarRow.tsx`:

```tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BRAND } from "../../theme";

export function StarDisplay({ value }: { value: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(value)));
  return (
    <Text accessibilityLabel={`${value} out of 5 stars`} style={styles.display}>
      {"★".repeat(filled)}
      <Text style={styles.empty}>{"★".repeat(5 - filled)}</Text>
    </Text>
  );
}

export function StarInput({ label, value, onChange }: { label: string; value: number; onChange: (stars: number) => void }) {
  return (
    <View accessibilityLabel={label} style={styles.row}>
      {[1, 2, 3, 4, 5].map((stars) => (
        <Pressable
          key={stars}
          accessibilityRole="button"
          accessibilityLabel={`${stars} star${stars === 1 ? "" : "s"}`}
          accessibilityState={{ selected: value === stars }}
          hitSlop={6}
          onPress={() => onChange(value === stars ? 0 : stars)}
        >
          <Text style={[styles.star, stars <= value ? styles.on : styles.off]}>★</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  display: { fontSize: 16, color: BRAND.colors.primaryTextSafe },
  empty: { color: "#D1D5DB" },
  row: { flexDirection: "row", gap: 6 },
  star: { fontSize: 30 },
  on: { color: BRAND.colors.primaryTextSafe },
  off: { color: "#D1D5DB" },
});
```

Create `mobile/components/reviews/ReviewForm.tsx`:

```tsx
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { BRAND } from "../../theme";
import { StarInput } from "./StarRow";
import { REVIEW_LIMITS, type OrderReviewState, type ReviewInput } from "../../lib/reviews-model";

export function ReviewForm({
  state,
  submitting,
  error,
  onSubmit,
}: {
  state: OrderReviewState;
  submitting: boolean;
  error: string | null;
  onSubmit: (input: ReviewInput) => Promise<boolean>;
}) {
  const [storeStars, setStoreStars] = useState(0);
  const [storeComment, setStoreComment] = useState("");
  const [dishStars, setDishStars] = useState<Record<string, number>>({});
  const [dishComments, setDishComments] = useState<Record<string, string>>({});
  const [partnerStars, setPartnerStars] = useState(0);
  const [partnerComment, setPartnerComment] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit() {
    if (storeStars === 0) {
      setLocalError("Rate the store from 1 to 5 stars");
      return;
    }
    setLocalError(null);
    await onSubmit({
      storeStars,
      storeComment: storeComment.trim() || null,
      dishes: state.dishes
        .filter((dish) => (dishStars[dish.productId] ?? 0) > 0)
        .map((dish) => ({
          productId: dish.productId,
          stars: dishStars[dish.productId],
          comment: (dishComments[dish.productId] ?? "").trim() || null,
        })),
      partner: partnerStars > 0 ? { stars: partnerStars, comment: partnerComment.trim() || null } : null,
    });
  }

  const shownError = localError ?? error;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Rate your order</Text>

      <Text style={styles.label}>The store</Text>
      <StarInput label="Store rating" value={storeStars} onChange={setStoreStars} />
      <TextInput
        style={styles.input}
        multiline
        maxLength={REVIEW_LIMITS.storeComment}
        placeholder="Tell others about the food and the packaging (optional)"
        value={storeComment}
        onChangeText={setStoreComment}
      />

      {state.dishes.length > 0 && <Text style={styles.label}>The dishes (optional)</Text>}
      {state.dishes.map((dish) => (
        <View key={dish.productId} style={styles.block}>
          <Text style={styles.body}>{dish.name}</Text>
          <StarInput
            label={`Rating for ${dish.name}`}
            value={dishStars[dish.productId] ?? 0}
            onChange={(stars) => setDishStars((prev) => ({ ...prev, [dish.productId]: stars }))}
          />
          {(dishStars[dish.productId] ?? 0) > 0 && (
            <TextInput
              style={styles.input}
              maxLength={REVIEW_LIMITS.dishComment}
              placeholder="A word about this dish (optional)"
              value={dishComments[dish.productId] ?? ""}
              onChangeText={(text) => setDishComments((prev) => ({ ...prev, [dish.productId]: text }))}
            />
          )}
        </View>
      ))}

      {state.hasPartner && (
        <View style={styles.block}>
          <Text style={styles.label}>The delivery (optional)</Text>
          <Text style={styles.muted}>How was the delivery? Rate the rider&apos;s handling and courtesy, not the restaurant&apos;s wait.</Text>
          <StarInput label="Delivery partner rating" value={partnerStars} onChange={setPartnerStars} />
          {partnerStars > 0 && (
            <TextInput
              style={styles.input}
              maxLength={REVIEW_LIMITS.partnerComment}
              placeholder="A word about the delivery (optional)"
              value={partnerComment}
              onChangeText={setPartnerComment}
            />
          )}
        </View>
      )}

      {shownError && <Text style={styles.error}>{shownError}</Text>}
      <Pressable
        accessibilityRole="button"
        disabled={submitting}
        onPress={submit}
        style={[styles.button, submitting && { opacity: 0.5 }]}
      >
        <Text style={styles.buttonText}>{submitting ? "Sending…" : "Submit review"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 16, padding: 16, gap: 10 },
  title: { fontFamily: BRAND.fonts.heading, fontSize: 18, color: BRAND.colors.ink },
  label: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 15, color: BRAND.colors.ink },
  body: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.ink },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted },
  block: { gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 10,
    fontFamily: BRAND.fonts.body,
    fontSize: 14,
    color: BRAND.colors.ink,
    minHeight: 40,
  },
  error: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.dangerTextSafe },
  button: { alignSelf: "flex-start", backgroundColor: BRAND.colors.primaryTextSafe, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 10 },
  buttonText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.surface },
});
```

- [ ] **Step 5: Own review card, report row and store reviews**

Create `mobile/components/reviews/OwnReviewCard.tsx`:

```tsx
import { Image, StyleSheet, Text, View } from "react-native";
import { BRAND } from "../../theme";
import { absoluteUrl } from "../../lib/api";
import { StarDisplay } from "./StarRow";
import type { OwnReview } from "../../lib/reviews-model";

export function OwnReviewCard({ review }: { review: OwnReview }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Your review</Text>
      {review.status === "hidden" && <Text style={styles.muted}>This review is currently hidden by the Fresh &amp; Quick team.</Text>}
      <StarDisplay value={review.stars} />
      {review.comment && <Text style={styles.body}>{review.comment}</Text>}
      {review.photoUrl && <Image source={{ uri: absoluteUrl(review.photoUrl) }} style={styles.photo} accessibilityLabel="Your review photo" />}
      {review.dishes.map((dish) => (
        <Text key={dish.name} style={styles.body}>
          {dish.name}: {"★".repeat(dish.stars)}
          {dish.comment ? ` · ${dish.comment}` : ""}
        </Text>
      ))}
      {review.partner && (
        <Text style={styles.body}>
          Delivery: {"★".repeat(review.partner.stars)}
          {review.partner.comment ? ` · ${review.partner.comment}` : ""}
        </Text>
      )}
      {review.vendorReply && <Text style={styles.reply}>Reply from the store: {review.vendorReply}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 16, padding: 16, gap: 6 },
  title: { fontFamily: BRAND.fonts.heading, fontSize: 18, color: BRAND.colors.ink },
  body: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.ink },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted },
  photo: { width: "100%", height: 180, borderRadius: 12 },
  reply: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.ink, backgroundColor: BRAND.colors.background, borderRadius: 8, padding: 8 },
});
```

Create `mobile/components/reviews/ReportReviewRow.tsx`:

```tsx
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BRAND } from "../../theme";
import { apiFetch } from "../../lib/api";
import { reportReviewPath } from "../../lib/reviews-model";

const REASONS = ["Offensive or abusive", "Spam or fake", "Not about this store"];

export function ReportReviewRow({ reviewId }: { reviewId: string }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function report(reason: string) {
    setError(null);
    try {
      await apiFetch(reportReviewPath(reviewId), { method: "POST", body: { reason } });
      setDone(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not report");
    }
  }

  if (done) return <Text style={styles.muted}>Reported, thank you</Text>;
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" onPress={() => setOpen((value) => !value)}>
        <Text style={styles.link}>Report</Text>
      </Pressable>
      {open && (
        <View style={styles.reasons}>
          {REASONS.map((reason) => (
            <Pressable key={reason} accessibilityRole="button" style={styles.pill} onPress={() => report(reason)}>
              <Text style={styles.muted}>{reason}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  link: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted, textDecorationLine: "underline" },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  error: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.dangerTextSafe },
});
```

Create `mobile/components/reviews/StoreReviews.tsx`:

```tsx
import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { BRAND } from "../../theme";
import { apiFetch, absoluteUrl } from "../../lib/api";
import { StarDisplay } from "./StarRow";
import { ReportReviewRow } from "./ReportReviewRow";
import { storeRatingPath, storeReviewsPath, type PublicReview } from "../../lib/reviews-model";

type Summary = { rating: number | null; count: number; histogram: number[] };
type Page = { reviews: PublicReview[]; nextCursor: string | null };
type Loaded = { storeId: string; summary: Summary; reviews: PublicReview[]; nextCursor: string | null };

export function StoreReviews({ storeId }: { storeId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [summary, page] = await Promise.all([
          apiFetch<Summary>(storeRatingPath(storeId)),
          apiFetch<Page>(storeReviewsPath(storeId)),
        ]);
        if (!cancelled) setLoaded({ storeId, summary, reviews: page.reviews, nextCursor: page.nextCursor });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  const current = loaded && loaded.storeId === storeId ? loaded : null;

  const loadMore = useCallback(async () => {
    if (!current?.nextCursor) return;
    setMoreBusy(true);
    try {
      const page = await apiFetch<Page>(`${storeReviewsPath(storeId)}?before=${encodeURIComponent(current.nextCursor)}`);
      setLoaded({ ...current, reviews: [...current.reviews, ...page.reviews], nextCursor: page.nextCursor });
    } catch {
      setFailed(true);
    } finally {
      setMoreBusy(false);
    }
  }, [current, storeId]);

  if (failed && !current) return <Text style={styles.muted}>Reviews are unavailable right now.</Text>;
  if (!current || current.summary.count === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.title}>
        Reviews · ★ {current.summary.rating?.toFixed(1)} ({current.summary.count})
      </Text>
      {current.reviews.map((review) => (
        <View key={review.id} style={styles.card}>
          <Text style={styles.name}>
            {review.reviewerName} <StarDisplay value={review.stars} />
          </Text>
          {review.comment && <Text style={styles.body}>{review.comment}</Text>}
          {review.photoUrl && <Image source={{ uri: absoluteUrl(review.photoUrl) }} style={styles.photo} accessibilityLabel="Photo from a customer" />}
          {review.dishes.length > 0 && <Text style={styles.muted}>{review.dishes.map((dish) => `${dish.name} ${dish.stars}★`).join(" · ")}</Text>}
          {review.vendorReply && <Text style={styles.reply}>Reply from the store: {review.vendorReply}</Text>}
          <ReportReviewRow reviewId={review.id} />
        </View>
      ))}
      {current.nextCursor && (
        <Pressable accessibilityRole="button" disabled={moreBusy} onPress={loadMore} style={[styles.more, moreBusy && { opacity: 0.5 }]}>
          <Text style={styles.moreText}>{moreBusy ? "Loading…" : "Load more reviews"}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10, padding: 16 },
  title: { fontFamily: BRAND.fonts.heading, fontSize: 18, color: BRAND.colors.ink },
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 16, padding: 12, gap: 6 },
  name: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 14, color: BRAND.colors.ink },
  body: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.ink },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 12, color: BRAND.colors.inkMuted },
  photo: { width: "100%", height: 160, borderRadius: 12 },
  reply: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.ink, backgroundColor: BRAND.colors.background, borderRadius: 8, padding: 8 },
  more: { alignSelf: "flex-start", borderWidth: 1, borderColor: BRAND.colors.primary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6 },
  moreText: { fontFamily: BRAND.fonts.bodySemiBold, color: BRAND.colors.primaryTextSafe },
});
```

- [ ] **Step 6: Wire the order screen**

In `mobile/src/app/customer/orders/[id].tsx`: import `useOrderReview`, `ReviewForm`, `OwnReviewCard`. Right after the `useReorder()` line add `const review = useOrderReview(id, order?.status ?? null);` (use the screen's actual order-id variable, and keep the call above every early return so hook order is stable). In the main `ScrollView` content, after the items section and before the final section block, add:

```tsx
{review.state?.partnerScore && order.deliveryPartnerId && (
  <Text style={styles.mutedText}>
    {review.state.partnerScore.isNew
      ? "Your delivery partner · New partner"
      : `Your delivery partner · ★ ${review.state.partnerScore.average.toFixed(1)} (${review.state.partnerScore.count} ratings)`}
  </Text>
)}
{review.state?.eligible && (
  <ReviewForm state={review.state} submitting={review.submitting} error={review.error} onSubmit={review.submit} />
)}
{review.state?.review && <OwnReviewCard review={review.state.review} />}
```

- [ ] **Step 7: Wire the store screen**

In `mobile/src/app/customer/store/[id].tsx`: add `, rating_sum, rating_count` to the `products` select and to the local menu-item type; in the dish row's name area render `★ {averageOf(item.rating_sum, item.rating_count)?.toFixed(1)} ({item.rating_count})` (import `averageOf` from `../../../../lib/reviews-model`) only when `rating_count > 0`; and render `<StoreReviews storeId={store.id} />` as the last child inside the content `ScrollView` (after the last menu section, before `</ScrollView>` at the end of the main content; the sticky-header index stays 1 so do not insert above it).

- [ ] **Step 8: Checks**

Run: `cd mobile && npx tsc --noEmit` (silent), `npx eslint mobile/components/reviews mobile/lib/use-order-review.ts` from the repo root if the repo lint config covers `mobile/` (if it does not, say so and skip), and `node --test tests/*.test.mjs`.

- [ ] **Step 9: Live check on the Android emulator**

Start it with `.\scripts\start-emulator.ps1` (PowerShell; see `docs/ANDROID_TESTING.md` and HANDOFF_26 section 3b; Metro is already on 8081; open Expo Go at `exp://10.0.2.2:8081`). `node scripts/c1-fixtures.mjs create`. Sign in as the fixture customer (customer login screen, email and password from `.superpowers/sdd/c1-fixtures.json`), open Orders, open a delivered order: the rating card shows, submit 4 stars with a dish rating and a comment (no photo yet), the card becomes "Your review". Open the store: reviews section shows "C1 T." with the comment and stars; the dish shows its average. Tap Report on someone else's review (use SQL to null the `customer_id` first) and see "Reported, thank you". Cleanup with `node scripts/c1-fixtures.mjs cleanup`.

- [ ] **Step 10: Commit**

```bash
git add mobile/lib/api.ts mobile/lib/use-order-review.ts mobile/components/reviews "mobile/src/app/customer/orders/[id].tsx" "mobile/src/app/customer/store/[id].tsx"
git commit -m "feat(c1): phone rating card, store reviews, dish averages and report

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Vendor reviews (routes and portal page)

**Files:**
- Create: `app/api/vendor/reviews/route.ts`, `app/api/vendor/reviews/[id]/reply/route.ts`, `app/api/vendor/reviews/[id]/report/route.ts`
- Create: `app/vendor/(portal)/reviews/page.tsx`
- Modify: `components/vendor/VendorShell.tsx` (one nav entry)

**Interfaces:**
- Consumes: `resolveVendorStore(token)` and `tokenFromRequest(request)` from `lib/vendor-auth.ts`; model exports.
- Produces (HTTP): `GET /api/vendor/reviews?status=all|no_reply|reported&before=` -> `{ reviews: VendorReview[], nextCursor, needsReply: number }`; `PUT /api/vendor/reviews/[id]/reply` body `{reply}` -> `{ ok: true }`; `DELETE` same path -> `{ ok: true }`; `POST /api/vendor/reviews/[id]/report` body `{reason?}` -> `{ reported: true }`. All 404 `{error:"not found"}` for a review of another store or a hidden review.

- [ ] **Step 1: List route**

Create `app/api/vendor/reviews/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";
import { REVIEWS_PAGE_SIZE, REVIEW_SELECT, reviewPhotoPath, toVendorReview, type RawReviewRow } from "@/lib/reviews-model";

export async function GET(request: NextRequest) {
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const status = request.nextUrl.searchParams.get("status") ?? "all";
  if (!["all", "no_reply", "reported"].includes(status)) return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  const before = request.nextUrl.searchParams.get("before");
  if (before !== null && Number.isNaN(Date.parse(before))) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

  let query = supabaseServer
    .from("reviews")
    .select(REVIEW_SELECT)
    .eq("store_id", resolved.storeId)
    .order("created_at", { ascending: false })
    .limit(REVIEWS_PAGE_SIZE + 1);
  if (status === "no_reply") query = query.eq("status", "visible").is("vendor_reply", null);
  if (status === "reported") query = query.eq("status", "visible").not("reported_at", "is", null);
  if (before) query = query.lt("created_at", before);

  const [{ data, error }, { count }] = await Promise.all([
    query,
    supabaseServer
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("store_id", resolved.storeId)
      .eq("status", "visible")
      .is("vendor_reply", null),
  ]);
  if (error) return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  const rows = (data ?? []) as unknown as RawReviewRow[];
  const page = rows.slice(0, REVIEWS_PAGE_SIZE);
  return NextResponse.json({
    reviews: page.map((row) => toVendorReview(row, row.photo_path ? reviewPhotoPath(row.id) : null)),
    nextCursor: rows.length > REVIEWS_PAGE_SIZE ? page[page.length - 1].created_at : null,
    needsReply: count ?? 0,
  });
}
```

- [ ] **Step 2: Reply and report routes**

Create `app/api/vendor/reviews/[id]/reply/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import { REVIEW_LIMITS, cleanComment } from "@/lib/reviews-model";

type Ctx = { params: Promise<{ id: string }> };

async function setReply(request: NextRequest, ctx: Ctx, mode: "set" | "clear") {
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });

  let reply: string | null = null;
  if (mode === "set") {
    let body: { reply?: unknown } = {};
    try {
      body = (await request.json()) ?? {};
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const cleaned = cleanComment(body.reply, REVIEW_LIMITS.reply);
    if (!cleaned.ok) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    if (cleaned.value === null) return NextResponse.json({ error: "Write a reply first" }, { status: 400 });
    reply = cleaned.value;
  }

  // Filtering on the resolved store id makes another store's review simply "not found".
  const { data, error } = await supabaseServer
    .from("reviews")
    .update({ vendor_reply: reply, vendor_reply_at: reply === null ? null : new Date().toISOString() })
    .eq("id", id.toLowerCase())
    .eq("store_id", resolved.storeId)
    .eq("status", "visible")
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not save the reply right now" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export const PUT = (request: NextRequest, ctx: Ctx) => setReply(request, ctx, "set");
export const DELETE = (request: NextRequest, ctx: Ctx) => setReply(request, ctx, "clear");
```

Create `app/api/vendor/reviews/[id]/report/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveVendorStore, tokenFromRequest } from "@/lib/vendor-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import { REVIEW_LIMITS, cleanComment } from "@/lib/reviews-model";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const resolved = await resolveVendorStore(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });

  let body: { reason?: unknown } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }
  const reason = cleanComment(body.reason, REVIEW_LIMITS.reason);
  if (!reason.ok) return NextResponse.json({ error: reason.error }, { status: 400 });

  const { data: review, error } = await supabaseServer
    .from("reviews")
    .select("id, reported_at")
    .eq("id", id.toLowerCase())
    .eq("store_id", resolved.storeId)
    .eq("status", "visible")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not report this review right now" }, { status: 500 });
  if (!review) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (review.reported_at) return NextResponse.json({ reported: true });

  const { error: updateError } = await supabaseServer
    .from("reviews")
    .update({ reported_at: new Date().toISOString(), report_reason: reason.value, reported_by: "vendor" })
    .eq("id", review.id)
    .is("reported_at", null);
  if (updateError) return NextResponse.json({ error: "Could not report this review right now" }, { status: 500 });
  return NextResponse.json({ reported: true });
}
```

- [ ] **Step 3: The page and the nav entry**

In `components/vendor/VendorShell.tsx` add `{ href: "/vendor/reviews", label: "Reviews" },` to the nav array after the Orders entry.

Create `app/vendor/(portal)/reviews/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { StarsDisplay } from "@/components/reviews/Stars";
import { REVIEW_LIMITS, type VendorReview } from "@/lib/reviews-model";

type Filter = "all" | "no_reply" | "reported";
type Listing = { filter: Filter; reviews: VendorReview[]; nextCursor: string | null; needsReply: number };

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function VendorReviewsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/vendor/reviews?status=${filter}`, { headers: await authHeader() });
      const body = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) {
        setError(body?.error ?? "Failed to load reviews");
        return;
      }
      setError(null);
      setListing({ filter, reviews: body.reviews, nextCursor: body.nextCursor, needsReply: body.needsReply });
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, reloadKey]);

  const current = listing && listing.filter === filter ? listing : null;

  const loadMore = useCallback(async () => {
    if (!current?.nextCursor) return;
    const res = await fetch(`/api/vendor/reviews?status=${filter}&before=${encodeURIComponent(current.nextCursor)}`, {
      headers: await authHeader(),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to load reviews");
      return;
    }
    setListing({ ...current, reviews: [...current.reviews, ...body.reviews], nextCursor: body.nextCursor });
  }, [current, filter]);

  async function act(id: string, request: () => Promise<Response>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await request();
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error ?? "That did not work");
      else setReloadKey((value) => value + 1);
    } finally {
      setBusyId(null);
    }
  }

  const saveReply = (id: string) =>
    act(id, async () =>
      fetch(`/api/vendor/reviews/${id}/reply`, {
        method: "PUT",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ reply: drafts[id] ?? "" }),
      })
    );
  const clearReply = (id: string) =>
    act(id, async () => fetch(`/api/vendor/reviews/${id}/reply`, { method: "DELETE", headers: await authHeader() }));
  const report = (id: string) =>
    act(id, async () =>
      fetch(`/api/vendor/reviews/${id}/report`, {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Reported by the store" }),
      })
    );

  const tab = (value: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`rounded-full px-4 py-1 text-sm ${filter === value ? "bg-brand-ink text-white" : "bg-brand-surface text-brand-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-heading text-2xl text-brand-ink">Reviews</h1>
        {current && current.needsReply > 0 && (
          <span className="rounded-full bg-brand-primary-text-safe px-3 py-0.5 text-xs text-white">{current.needsReply} need a reply</span>
        )}
      </div>
      <div className="flex gap-2">
        {tab("all", "All")}
        {tab("no_reply", "Needs reply")}
        {tab("reported", "Reported")}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!current && !error && <p className="text-brand-ink-muted">Loading…</p>}
      {current && current.reviews.length === 0 && <p className="text-brand-ink-muted">No reviews here yet.</p>}
      {current?.reviews.map((review) =>
        review.hidden ? (
          <p key={review.id} className="rounded-[var(--radius-card)] bg-brand-surface p-3 text-sm text-brand-ink-muted">
            A review from {new Date(review.createdAt).toLocaleDateString()} was hidden by the Fresh &amp; Quick team.
          </p>
        ) : (
          <article key={review.id} className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <strong className="text-brand-ink">{review.reviewerName}</strong>
              <StarsDisplay value={review.stars} />
              <span className="text-brand-ink-muted">{new Date(review.createdAt).toLocaleDateString()}</span>
              {review.reported && <span className="rounded-full bg-brand-ink-tint px-2 py-0.5 text-xs">Reported to admin</span>}
            </div>
            {review.comment && <p className="whitespace-pre-wrap text-sm text-brand-ink">{review.comment}</p>}
            {review.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={review.photoUrl} alt="From a customer" className="max-h-40 w-auto rounded-[var(--radius-card)] object-cover" />
            )}
            {review.dishes.length > 0 && (
              <p className="text-xs text-brand-ink-muted">{review.dishes.map((dish) => `${dish.name} ${dish.stars}★`).join(" · ")}</p>
            )}
            {review.vendorReply ? (
              <div className="rounded-[var(--radius-card)] bg-brand-bg p-2 text-sm text-brand-ink">
                <strong>Your reply:</strong> {review.vendorReply}{" "}
                <button type="button" className="underline" disabled={busyId === review.id} onClick={() => clearReply(review.id)}>
                  Remove
                </button>
              </div>
            ) : null}
            <textarea
              rows={2}
              maxLength={REVIEW_LIMITS.reply}
              className="w-full rounded-[var(--radius-card)] border border-brand-ink-muted/30 p-2 text-sm"
              placeholder={review.vendorReply ? "Edit your reply" : "Reply to this review"}
              value={drafts[review.id] ?? ""}
              onChange={(event) => setDrafts((prev) => ({ ...prev, [review.id]: event.target.value }))}
            />
            <div className="flex gap-3">
              <button
                type="button"
                disabled={busyId === review.id || !(drafts[review.id] ?? "").trim()}
                onClick={() => saveReply(review.id)}
                className="rounded-[var(--radius-pill)] bg-brand-primary px-4 py-1 text-sm font-semibold text-white disabled:opacity-50"
              >
                {review.vendorReply ? "Update reply" : "Reply"}
              </button>
              {!review.reported && (
                <button type="button" disabled={busyId === review.id} onClick={() => report(review.id)} className="text-sm underline">
                  Report to admin
                </button>
              )}
            </div>
          </article>
        )
      )}
      {current?.nextCursor && (
        <button type="button" onClick={loadMore} className="self-start rounded-[var(--radius-pill)] border border-brand-primary px-4 py-1 text-sm">
          Load more
        </button>
      )}
    </div>
  );
}
```

(`StarsDisplay` is the client component from Task 4; importing it into the vendor portal is fine, it has no customer-only dependency.)

- [ ] **Step 4: Checks**

`npx tsc --noEmit`, `npx eslint "app/api/vendor/reviews" "app/vendor/(portal)/reviews" components/vendor/VendorShell.tsx`, `node --test tests/*.test.mjs`.

- [ ] **Step 5: Live check (vendor dev server on :3001)**

`node scripts/c1-fixtures.mjs create`. Create two reviews through the customer API as in Task 3 (one with a comment). The fixture store's owner is `store.ownerId` in the fixtures JSON; you cannot sign in as them (you do not know their password), so create a throwaway vendor instead: use the GoTrue admin API to create a user, insert `public.users` (role `vendor`, full_name `C1 Vendor`) and `update public.stores set owner_id = '<new vendor id>' where id = '<fixture store>'` after saving the original `owner_id`; restore the original owner in the cleanup step (this is the only edit to existing data; do it inside one SQL statement each way and verify both). Then:
1. curl `GET /api/vendor/reviews` with the vendor token -> both reviews, `needsReply: 2`; the other vendors' reviews do not appear (there are none, so also check with a SECOND store's vendor token if one is available: expected `reviews: []`).
2. `PUT .../reply` with `{"reply":"Thanks!"}` -> `{ok:true}`; `needsReply` drops to 1; the public list at `GET /api/stores/<id>/reviews` shows `vendorReply`; `PUT` with `{"reply":"   "}` -> 400; with 601 characters -> 400; a review id of another store -> 404.
3. `POST .../report` -> `{reported:true}`; `select reported_by from reviews` -> `vendor`.
4. In Chrome on `http://localhost:3001/vendor/login` sign in as the throwaway vendor; open Reviews; reply, edit, remove, filter Needs reply and Reported; reload.
5. Hide one review by SQL (`update reviews set status='hidden'`) and check the vendor list shows the "was hidden" line with no content, while the API JSON for that row contains only `id`, `hidden`, `createdAt`.
6. Cleanup: restore the store owner, delete the throwaway vendor (auth user and `public.users`), then `node scripts/c1-fixtures.mjs cleanup`.

- [ ] **Step 6: Build and commit**

`npm run build`, then:
```bash
git add app/api/vendor/reviews "app/vendor/(portal)/reviews/page.tsx" components/vendor/VendorShell.tsx
git commit -m "feat(c1): vendor reviews list, reply and report

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Delivery partner rating (route, web page, phone card)

**Files:**
- Create: `app/api/delivery/rating/route.ts`, `app/delivery/(portal)/rating/page.tsx`, `mobile/components/reviews/PartnerRatingCard.tsx`
- Modify: `components/delivery/DeliveryShell.tsx` (one nav entry), `mobile/src/app/delivery/dashboard.tsx`

**Interfaces:**
- Consumes: `resolveDeliveryPartner(token)`, `tokenFromRequest` from `lib/delivery-auth.ts`; `averageOf`, `toPartnerReviewRow`, `DELIVERY_RATING_PATH`, `PartnerRating` from the model.
- Produces: `GET /api/delivery/rating` -> `PartnerRating` (`{ average: number | null, count, recent: [{stars, comment, createdAt}] }`, last 20 visible partner ratings, no customer identity, no order or store ids).

- [ ] **Step 1: Route**

Create `app/api/delivery/rating/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveDeliveryPartner, tokenFromRequest } from "@/lib/delivery-auth";
import { averageOf, toPartnerReviewRow, type PartnerRating, type PartnerReviewRow } from "@/lib/reviews-model";

export async function GET(request: NextRequest) {
  const resolved = await resolveDeliveryPartner(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const [{ data: partner, error: partnerError }, { data: rows, error: rowsError }] = await Promise.all([
    supabaseServer.from("delivery_partners").select("rating_sum, rating_count").eq("user_id", resolved.partnerId).maybeSingle(),
    supabaseServer
      .from("reviews")
      .select("created_at, review_partner!inner(stars, comment, partner_id)")
      .eq("status", "visible")
      .eq("review_partner.partner_id", resolved.partnerId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (partnerError || rowsError) return NextResponse.json({ error: "Failed to load rating" }, { status: 500 });

  const recent = ((rows ?? []) as unknown as Parameters<typeof toPartnerReviewRow>[0][])
    .map(toPartnerReviewRow)
    .filter((row): row is PartnerReviewRow => row !== null);
  const body: PartnerRating = {
    average: averageOf(partner?.rating_sum ?? 0, partner?.rating_count ?? 0),
    count: partner?.rating_count ?? 0,
    recent,
  };
  return NextResponse.json(body);
}
```

- [ ] **Step 2: Web page and nav entry**

In `components/delivery/DeliveryShell.tsx` add `{ href: "/delivery/rating", label: "My rating" },` after the History entry.

Create `app/delivery/(portal)/rating/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { StarsDisplay } from "@/components/reviews/Stars";
import { DELIVERY_RATING_PATH, PARTNER_SCORE_MIN_RATINGS, type PartnerRating } from "@/lib/reviews-model";

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function DeliveryRatingPage() {
  const [rating, setRating] = useState<PartnerRating | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(DELIVERY_RATING_PATH, { headers: await authHeader() });
      const body = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) setError(body?.error ?? "Failed to load your rating");
      else setRating(body as PartnerRating);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p role="alert" className="text-red-600">{error}</p>;
  if (!rating) return <p className="text-brand-ink-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl text-brand-ink">My rating</h1>
      <section className="rounded-[var(--radius-card)] bg-brand-surface p-4 shadow">
        {rating.average === null ? (
          <p className="text-brand-ink-muted">No ratings yet. Customers can rate your delivery after an order is delivered.</p>
        ) : (
          <>
            <p className="text-3xl font-bold text-brand-ink">{rating.average.toFixed(1)}</p>
            <StarsDisplay value={rating.average} />
            <p className="text-sm text-brand-ink-muted">
              {rating.count} {rating.count === 1 ? "rating" : "ratings"}
              {rating.count < PARTNER_SCORE_MIN_RATINGS
                ? ` · customers see "New partner" until you have ${PARTNER_SCORE_MIN_RATINGS}`
                : ""}
            </p>
          </>
        )}
      </section>
      {rating.recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="font-heading text-lg text-brand-ink">Recent comments</h2>
          {rating.recent.map((row) => (
            <article key={row.createdAt + row.stars} className="rounded-[var(--radius-card)] bg-brand-surface p-3 shadow">
              <StarsDisplay value={row.stars} />{" "}
              <span className="text-xs text-brand-ink-muted">{new Date(row.createdAt).toLocaleDateString()}</span>
              {row.comment && <p className="mt-1 whitespace-pre-wrap text-sm text-brand-ink">{row.comment}</p>}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Phone card**

Create `mobile/components/reviews/PartnerRatingCard.tsx`:

```tsx
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { BRAND } from "../../theme";
import { apiFetch } from "../../lib/api";
import { DELIVERY_RATING_PATH, PARTNER_SCORE_MIN_RATINGS, type PartnerRating } from "../../lib/reviews-model";

export function PartnerRatingCard() {
  const [rating, setRating] = useState<PartnerRating | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const body = await apiFetch<PartnerRating>(DELIVERY_RATING_PATH);
          if (!cancelled) {
            setRating(body);
            setFailed(false);
          }
        } catch {
          if (!cancelled) setFailed(true);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (failed && !rating) return null;
  if (!rating) return null;
  return (
    <View style={styles.card}>
      <Text style={styles.title}>My rating</Text>
      {rating.average === null ? (
        <Text style={styles.muted}>No ratings yet.</Text>
      ) : (
        <>
          <Text style={styles.score}>
            ★ {rating.average.toFixed(1)} <Text style={styles.muted}>({rating.count} {rating.count === 1 ? "rating" : "ratings"})</Text>
          </Text>
          {rating.count < PARTNER_SCORE_MIN_RATINGS && (
            <Text style={styles.muted}>Customers see &quot;New partner&quot; until you have {PARTNER_SCORE_MIN_RATINGS} ratings.</Text>
          )}
        </>
      )}
      {rating.recent.slice(0, 3).map((row) =>
        row.comment ? (
          <Text key={row.createdAt + row.stars} style={styles.body}>
            {"★".repeat(row.stars)} · {row.comment}
          </Text>
        ) : null
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: BRAND.colors.surface, borderRadius: 16, padding: 16, gap: 4 },
  title: { fontFamily: BRAND.fonts.heading, fontSize: 18, color: BRAND.colors.ink },
  score: { fontFamily: BRAND.fonts.bodySemiBold, fontSize: 22, color: BRAND.colors.ink },
  body: { fontFamily: BRAND.fonts.body, fontSize: 14, color: BRAND.colors.ink },
  muted: { fontFamily: BRAND.fonts.body, fontSize: 13, color: BRAND.colors.inkMuted },
});
```

In `mobile/src/app/delivery/dashboard.tsx`, import `PartnerRatingCard` and render `<PartnerRatingCard />` inside the main `ScrollView` (line ~258, `contentContainerStyle={{ gap: 20 }}`) as its first child.

- [ ] **Step 4: Checks**

`npx tsc --noEmit`, `cd mobile && npx tsc --noEmit`, `npx eslint app/api/delivery/rating "app/delivery/(portal)/rating" components/delivery/DeliveryShell.tsx`, `node --test tests/*.test.mjs`.

- [ ] **Step 5: Live check**

`node scripts/c1-fixtures.mjs create`; submit a customer review with a partner rating of 2 and comment `rude <i>x</i>` for ORDER1 and 5 for ORDER2 (Task 3 recipe). The fixture partner is an existing partner whose password you do not know: create a throwaway delivery user, `update public.orders set delivery_partner_id = '<throwaway>' where id in (<fixture orders>)` BEFORE submitting the reviews, and delete the throwaway partner (both rows) at the end. Then:
1. `GET /api/delivery/rating` with the partner token -> `average 3.5`, `count 2`, `recent` has two rows holding only `stars`, `comment`, `createdAt`. No other keys anywhere in the JSON.
2. A customer token and a vendor token on the same URL -> 403.
3. Customer order GET -> `partnerScore: {isNew:true}` (2 ratings is below 5). Insert three more partner ratings by SQL (`insert into review_partner` needs reviews; simpler: `update public.delivery_partners set rating_sum = 20, rating_count = 5 where user_id = '<throwaway>'`) -> the customer GET now returns `{isNew:false, average:4, count:5}`.
4. Hide the review with the 2-star partner rating by SQL: the partner API drops it and `rating_count` falls by 1 (trigger).
5. Chrome on `http://localhost:3002/delivery/login`: sign in as the throwaway partner, open "My rating": average and comments render; `<i>x</i>` shows as literal text.
6. Emulator: sign in as the throwaway partner on the phone delivery login, dashboard shows the "My rating" card.
7. Cleanup (throwaway partner, `c1-fixtures cleanup`).

- [ ] **Step 6: Build and commit**

`npm run build`, then:
```bash
git add app/api/delivery/rating "app/delivery/(portal)/rating/page.tsx" components/delivery/DeliveryShell.tsx mobile/components/reviews/PartnerRatingCard.tsx mobile/src/app/delivery/dashboard.tsx
git commit -m "feat(c1): delivery partner rating route, web page and phone card

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Admin moderation (routes, pure patch builder, page, partner rating columns)

**Files:**
- Create: `lib/review-moderation.ts`, `tests/review-moderation.test.mjs`
- Create: `app/api/admin/reviews/route.ts`, `app/api/admin/reviews/[id]/hide/route.ts`, `.../unhide/route.ts`, `.../dismiss-report/route.ts`
- Create: `app/admin/(portal)/reviews/page.tsx`
- Modify: `app/api/admin/delivery-partners/route.ts` (GET only), `app/admin/(portal)/delivery-partners/page.tsx`, `components/admin/AdminShell.tsx` (one nav entry)

**Interfaces:**
- Consumes: `resolveAdmin(token)`, `tokenFromRequest` from `lib/admin-auth.ts`; `signReviewPhoto` from `lib/reviews-server.ts`; model exports (`REVIEW_SELECT`, `toAdminReview`, `AdminReview`, `isLowPartnerScore`, `averageOf`, `cleanComment`, `REVIEW_LIMITS`).
- Produces (TS): `buildModerationPatch(action, reason, nowIso)` returning `{ ok: true, patch } | { ok: false, error }`.
- Produces (HTTP): `GET /api/admin/reviews?filter=reported|hidden|all&before=` -> `{ reviews: AdminReview[], nextCursor }`; `POST /api/admin/reviews/[id]/hide` body `{reason}` (required); `POST .../unhide`; `POST .../dismiss-report`; each -> `{ ok: true }` or 404. `GET /api/admin/delivery-partners` partners gain `ratingAverage: number | null`, `ratingCount: number`, `lowScore: boolean` and no longer expose the raw sums.

- [ ] **Step 1: Write the failing patch tests**

Create `tests/review-moderation.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildModerationPatch } from "../lib/review-moderation.ts";

const NOW = "2026-10-07T12:00:00.000Z";

test("hide needs a reason, trims it, stamps hidden_at and resolves the open report", () => {
  assert.deepEqual(buildModerationPatch("hide", "  abusive  ", NOW), {
    ok: true,
    patch: { status: "hidden", hidden_reason: "abusive", hidden_at: NOW, reported_at: null },
  });
  for (const reason of [undefined, null, "", "   ", 42]) {
    assert.equal(buildModerationPatch("hide", reason, NOW).ok, false, String(reason));
  }
  assert.equal(buildModerationPatch("hide", "x".repeat(301), NOW).ok, false);
  assert.equal(buildModerationPatch("hide", "bad\u0000", NOW).ok, false);
});

test("unhide clears the hidden fields and makes the review visible again", () => {
  assert.deepEqual(buildModerationPatch("unhide", undefined, NOW), {
    ok: true,
    patch: { status: "visible", hidden_reason: null, hidden_at: null },
  });
});

test("dismiss-report clears only the open report flag", () => {
  assert.deepEqual(buildModerationPatch("dismiss", undefined, NOW), { ok: true, patch: { reported_at: null } });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/review-moderation.test.mjs`
Expected: FAIL (`Cannot find module ... review-moderation.ts`).

- [ ] **Step 3: Write the pure builder**

Create `lib/review-moderation.ts`:

```ts
// Pure patch builder for admin moderation. Imports nothing at runtime so `node --test` can load it.
// The 300-character limit mirrors REVIEW_LIMITS.reason in lib/reviews-model.ts.
export type ModerationAction = "hide" | "unhide" | "dismiss";
type Result = { ok: true; patch: Record<string, string | null> } | { ok: false; error: string };

export function buildModerationPatch(action: ModerationAction, reason: unknown, nowIso: string): Result {
  if (action === "unhide") return { ok: true, patch: { status: "visible", hidden_reason: null, hidden_at: null } };
  if (action === "dismiss") return { ok: true, patch: { reported_at: null } };
  if (typeof reason !== "string") return { ok: false, error: "Give a reason for hiding this review" };
  const trimmed = reason.trim();
  if (trimmed === "") return { ok: false, error: "Give a reason for hiding this review" };
  if (trimmed.includes("\u0000")) return { ok: false, error: "The reason contains an invalid character" };
  if ([...trimmed].length > 300) return { ok: false, error: "The reason must be at most 300 characters" };
  // The report (if any) is resolved by the hide; report_reason / reported_by stay for the audit trail.
  return { ok: true, patch: { status: "hidden", hidden_reason: trimmed, hidden_at: nowIso, reported_at: null } };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/review-moderation.test.mjs` -> all pass.

- [ ] **Step 5: Admin list route**

Create `app/api/admin/reviews/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { signReviewPhoto } from "@/lib/reviews-server";
import { REVIEWS_PAGE_SIZE, REVIEW_SELECT, toAdminReview, type RawReviewRow } from "@/lib/reviews-model";

export async function GET(request: NextRequest) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });

  const filter = request.nextUrl.searchParams.get("filter") ?? "reported";
  if (!["reported", "hidden", "all"].includes(filter)) return NextResponse.json({ error: "Invalid filter" }, { status: 400 });
  const before = request.nextUrl.searchParams.get("before");
  if (before !== null && Number.isNaN(Date.parse(before))) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });

  let query = supabaseServer
    .from("reviews")
    .select(REVIEW_SELECT)
    .order("created_at", { ascending: false })
    .limit(REVIEWS_PAGE_SIZE + 1);
  if (filter === "reported") query = query.eq("status", "visible").not("reported_at", "is", null);
  if (filter === "hidden") query = query.eq("status", "hidden");
  if (before) query = query.lt("created_at", before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 });
  const rows = (data ?? []) as unknown as RawReviewRow[];
  const page = rows.slice(0, REVIEWS_PAGE_SIZE);
  const reviews = await Promise.all(page.map(async (row) => toAdminReview(row, await signReviewPhoto(row.photo_path))));
  return NextResponse.json({
    reviews,
    nextCursor: rows.length > REVIEWS_PAGE_SIZE ? page[page.length - 1].created_at : null,
  });
}
```

- [ ] **Step 6: Hide, unhide and dismiss routes**

Create `lib/reviews-admin.ts` (server-only helper shared by the three routes):

```ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { resolveAdmin, tokenFromRequest } from "@/lib/admin-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import { buildModerationPatch, type ModerationAction } from "@/lib/review-moderation";

export async function moderate(request: NextRequest, ctx: { params: Promise<{ id: string }> }, action: ModerationAction) {
  const resolved = await resolveAdmin(tokenFromRequest(request));
  if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { id } = await ctx.params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "not found" }, { status: 404 });

  let reason: unknown;
  if (action === "hide") {
    try {
      reason = ((await request.json()) as { reason?: unknown } | null)?.reason;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
  }
  const built = buildModerationPatch(action, reason, new Date().toISOString());
  if (!built.ok) return NextResponse.json({ error: built.error }, { status: 400 });

  // The status trigger in migration 37 recomputes the store, dish and partner averages.
  const { data, error } = await supabaseServer.from("reviews").update(built.patch).eq("id", id.toLowerCase()).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update the review right now" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

Create the three route files, each two lines of logic:

`app/api/admin/reviews/[id]/hide/route.ts`:
```ts
import { NextRequest } from "next/server";
import { moderate } from "@/lib/reviews-admin";

export const POST = (request: NextRequest, ctx: { params: Promise<{ id: string }> }) => moderate(request, ctx, "hide");
```
`.../unhide/route.ts` is identical with `"unhide"`; `.../dismiss-report/route.ts` identical with `"dismiss"`.

- [ ] **Step 7: Partner rating columns in the admin API**

In `app/api/admin/delivery-partners/route.ts` GET: add `rating_sum, rating_count` to the select and replace `return NextResponse.json({ partners: data });` with:

```ts
  return NextResponse.json({
    partners: (data ?? []).map((row) => ({
      user_id: row.user_id,
      is_online: row.is_online,
      current_lat: row.current_lat,
      current_lng: row.current_lng,
      last_ping_at: row.last_ping_at,
      vehicle_type: row.vehicle_type,
      users: row.users,
      ratingAverage: averageOf(row.rating_sum, row.rating_count),
      ratingCount: row.rating_count,
      lowScore: isLowPartnerScore(row.rating_sum, row.rating_count),
    })),
  });
```
with `import { averageOf, isLowPartnerScore } from "@/lib/reviews-model";`. In `app/admin/(portal)/delivery-partners/page.tsx` extend `PartnerRow` with `ratingAverage: number | null; ratingCount: number; lowScore: boolean;` and add a "Rating" column to the partners table (read the table markup first and match its cell classes): cell content `{p.ratingCount > 0 ? \`★ ${p.ratingAverage?.toFixed(1)} (${p.ratingCount})\` : "No ratings"}` plus, when `p.lowScore`, a badge `<span className="ml-2 rounded-full bg-brand-danger-text-safe px-2 py-0.5 text-xs text-white">Low score</span>`.

- [ ] **Step 8: Admin page and nav entry**

In `components/admin/AdminShell.tsx` add `{ href: "/admin/reviews", label: "Reviews" },` after the Delivery Partners entry.

Create `app/admin/(portal)/reviews/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { StarsDisplay } from "@/components/reviews/Stars";
import type { AdminReview } from "@/lib/reviews-model";

type Filter = "reported" | "hidden" | "all";
type Listing = { filter: Filter; reviews: AdminReview[]; nextCursor: string | null };

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return { Authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

export default function AdminReviewsPage() {
  const [filter, setFilter] = useState<Filter>("reported");
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/reviews?filter=${filter}`, { headers: await authHeader() });
      const body = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) {
        setError(body?.error ?? "Failed to load reviews");
        return;
      }
      setError(null);
      setListing({ filter, reviews: body.reviews, nextCursor: body.nextCursor });
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, reloadKey]);

  const current = listing && listing.filter === filter ? listing : null;

  const loadMore = useCallback(async () => {
    if (!current?.nextCursor) return;
    const res = await fetch(`/api/admin/reviews?filter=${filter}&before=${encodeURIComponent(current.nextCursor)}`, {
      headers: await authHeader(),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      setError(body?.error ?? "Failed to load reviews");
      return;
    }
    setListing({ ...current, reviews: [...current.reviews, ...body.reviews], nextCursor: body.nextCursor });
  }, [current, filter]);

  async function moderate(id: string, action: "hide" | "unhide" | "dismiss-report") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/reviews/${id}/${action}`, {
        method: "POST",
        headers: { ...(await authHeader()), "Content-Type": "application/json" },
        body: action === "hide" ? JSON.stringify({ reason: reasons[id] ?? "" }) : undefined,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error ?? "That did not work");
      else setReloadKey((value) => value + 1);
    } finally {
      setBusyId(null);
    }
  }

  const tab = (value: Filter, label: string) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      className={`rounded-full px-4 py-1 text-sm ${filter === value ? "bg-brand-ink text-white" : "bg-brand-surface text-brand-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl text-brand-ink">Reviews</h1>
      <div className="flex gap-2">
        {tab("reported", "Reported")}
        {tab("hidden", "Hidden")}
        {tab("all", "All")}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!current && !error && <p className="text-brand-ink-muted">Loading…</p>}
      {current && current.reviews.length === 0 && <p className="text-brand-ink-muted">Nothing here.</p>}
      {current?.reviews.map((review) => (
        <article key={review.id} className="flex flex-col gap-2 rounded-[var(--radius-card)] bg-brand-surface p-4 shadow">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <strong className="text-brand-ink">{review.storeName}</strong>
            <span className="text-brand-ink-muted">by {review.customerName}</span>
            <StarsDisplay value={review.stars} />
            <span className="text-brand-ink-muted">{new Date(review.createdAt).toLocaleString()}</span>
            {review.status === "hidden" && <span className="rounded-full bg-brand-ink px-2 py-0.5 text-xs text-white">Hidden</span>}
          </div>
          {review.comment && <p className="whitespace-pre-wrap text-sm text-brand-ink">{review.comment}</p>}
          {review.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={review.photoUrl} alt="Review photo" className="max-h-40 w-auto rounded-[var(--radius-card)] object-cover" />
          )}
          {review.dishes.length > 0 && (
            <p className="text-xs text-brand-ink-muted">
              {review.dishes.map((dish) => `${dish.name} ${dish.stars}★${dish.comment ? ` "${dish.comment}"` : ""}`).join(" · ")}
            </p>
          )}
          {review.partner && (
            <p className="text-xs text-brand-ink-muted">
              Delivery: {review.partner.stars}★{review.partner.comment ? ` "${review.partner.comment}"` : ""}
            </p>
          )}
          {review.vendorReply && <p className="text-sm text-brand-ink"><strong>Store reply:</strong> {review.vendorReply}</p>}
          {review.reportReason && (
            <p className="text-sm text-brand-ink-muted">
              Reported by {review.reportedBy ?? "someone"}: {review.reportReason}
              {review.reportedAt ? "" : " (resolved)"}
            </p>
          )}
          {review.status === "hidden" && review.hiddenReason && (
            <p className="text-sm text-brand-ink-muted">Hidden because: {review.hiddenReason}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {review.status === "visible" ? (
              <>
                <input
                  className="min-w-[12rem] flex-1 rounded-lg border border-brand-ink-muted/30 px-2 py-1 text-sm"
                  placeholder="Reason for hiding (required)"
                  maxLength={300}
                  value={reasons[review.id] ?? ""}
                  onChange={(event) => setReasons((prev) => ({ ...prev, [review.id]: event.target.value }))}
                />
                <button
                  type="button"
                  disabled={busyId === review.id || !(reasons[review.id] ?? "").trim()}
                  onClick={() => moderate(review.id, "hide")}
                  className="rounded-[var(--radius-pill)] bg-brand-ink px-4 py-1 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Hide
                </button>
                {review.reportedAt && (
                  <button type="button" disabled={busyId === review.id} onClick={() => moderate(review.id, "dismiss-report")} className="text-sm underline">
                    Dismiss report
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                disabled={busyId === review.id}
                onClick={() => moderate(review.id, "unhide")}
                className="rounded-[var(--radius-pill)] bg-brand-primary px-4 py-1 text-sm font-semibold text-white disabled:opacity-50"
              >
                Unhide
              </button>
            )}
          </div>
        </article>
      ))}
      {current?.nextCursor && (
        <button type="button" onClick={loadMore} className="self-start rounded-[var(--radius-pill)] border border-brand-primary px-4 py-1 text-sm">
          Load more
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 9: Checks**

`npx tsc --noEmit`, `npx eslint lib/review-moderation.ts lib/reviews-admin.ts "app/api/admin/reviews" "app/admin/(portal)/reviews" components/admin/AdminShell.tsx "app/api/admin/delivery-partners/route.ts" "app/admin/(portal)/delivery-partners/page.tsx"`, `node --test tests/*.test.mjs`.

- [ ] **Step 10: Live check (admin dev server :3003; the seeded admin login is in HANDOFF_25; do not print its password into reports)**

`node scripts/c1-fixtures.mjs create`; create two reviews through the customer API (one with a photo). Then:
1. Admin token (password grant against GoTrue): `GET /api/admin/reviews?filter=all` -> both, with full customer name and a SIGNED photo URL that returns 200 when fetched; customer and vendor tokens -> 403.
2. Customer reports review A (a second reviewer is needed; set `customer_id` null by SQL as in Task 3). `GET ...?filter=reported` -> A only.
3. `POST /hide` with no body reason -> 400; with reason -> `{ok:true}`; `stores.rating_count` fell by 1 and `rating` matches the remaining review; the public list and the photo proxy no longer return A; the signed URL in the admin list for a hidden review is still produced (admin may see it).
4. `POST /unhide` restores counts. `POST /dismiss-report` clears `reported_at`. Unknown id -> 404.
5. Chrome on `http://localhost:3003/admin/login` (admin): Reviews page, tabs, hide with a reason, unhide, dismiss; Delivery Partners page shows the Rating column, a "Low score" badge for a partner with an average under 3.0 and 5+ ratings (set `rating_sum`/`rating_count` on a throwaway partner by SQL and restore it).
6. Cleanup.

- [ ] **Step 11: Build and commit**

`npm run build`, then:
```bash
git add lib/review-moderation.ts lib/reviews-admin.ts tests/review-moderation.test.mjs app/api/admin/reviews "app/admin/(portal)/reviews/page.tsx" "app/api/admin/delivery-partners/route.ts" "app/admin/(portal)/delivery-partners/page.tsx" components/admin/AdminShell.tsx
git commit -m "feat(c1): admin review moderation and partner rating columns

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 9: n8n review request (email builder, eligibility route, workflow 05 branch)

**Files:**
- Create: `lib/review-request-email.ts`, `tests/review-request-email.test.mjs`, `tests/review-request-n8n.test.mjs`
- Create: `app/api/internal/orders/[id]/review-eligibility/route.ts`
- Modify: `n8n/workflows/05-delivery-status-propagation.json`, `docs/n8n-webhook-setup.md`, `.env.example` (one placeholder line)

**Interfaces:**
- Consumes: `verifyInternalSecret` from `lib/internal-auth.ts`.
- Produces (TS): `buildReviewRequestEmail({ orderId, storeName, recipientName, orderUrl }): { subject: string; html: string }` (no runtime imports; escapes everything; refuses a non-http(s) URL by returning a link-less body).
- Produces (HTTP): `GET /api/internal/orders/[id]/review-eligibility?minAgeMinutes=55` (header `X-Internal-Secret`) -> `{ eligible: false, reason }` or `{ eligible: true, customerEmail, emailSubject, reviewRequestHtml }`. `minAgeMinutes` is 0 to 1440 (default 55) so tests can use 0.

- [ ] **Step 1: Write the failing email tests**

Create `tests/review-request-email.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildReviewRequestEmail } from "../lib/review-request-email.ts";

const base = { orderId: "abcdef12-0000-4000-8000-000000000000", storeName: "Dosa Corner", recipientName: "Asha", orderUrl: "http://localhost:3000/customer/orders/abcdef12-0000-4000-8000-000000000000" };

test("subject names the store and strips line breaks", () => {
  assert.equal(buildReviewRequestEmail(base).subject, "How was your order from Dosa Corner?");
  assert.equal(buildReviewRequestEmail({ ...base, storeName: "A\r\nBcc: x@evil" }).subject, "How was your order from A Bcc: x@evil?");
});

test("html greets the customer, shows the short order id and links to the order page", () => {
  const { html } = buildReviewRequestEmail(base);
  assert.match(html, /Hi Asha,/);
  assert.match(html, /#abcdef12/);
  assert.ok(html.includes(`href="${base.orderUrl}"`));
});

test("everything dynamic is escaped", () => {
  const { html } = buildReviewRequestEmail({ ...base, storeName: "<img src=x onerror=1>", recipientName: "\"><script>alert(1)</script>" });
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img src=x"));
  assert.match(html, /&lt;script&gt;/);
});

test("a non-http(s) link is dropped rather than emitted", () => {
  for (const orderUrl of ["javascript:alert(1)", "data:text/html,x", "", "not a url"]) {
    const { html } = buildReviewRequestEmail({ ...base, orderUrl });
    assert.ok(!html.includes("href="), orderUrl);
  }
});
```

- [ ] **Step 2: Run to verify it fails**, then **write the builder**

Run: `node --test tests/review-request-email.test.mjs` -> FAIL (missing module). Create `lib/review-request-email.ts`:

```ts
// Builds the "how was your order?" email n8n sends one hour after delivery.
// Imports nothing at runtime so `node --test` can load it (escapeHtml is a deliberate small copy of lib/delivered-email.ts).
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHttp(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

const FONT = "font-family:Arial,Helvetica,sans-serif;";

export function buildReviewRequestEmail(input: {
  orderId: string;
  storeName: string;
  recipientName: string;
  orderUrl: string;
}): { subject: string; html: string } {
  const subject = `How was your order from ${input.storeName.replace(/[\r\n]+/g, " ")}?`;
  const link = isHttp(input.orderUrl)
    ? `<p style="margin:20px 0 0;"><a href="${escapeHtml(input.orderUrl)}" style="${FONT}display:inline-block;background:#A85800;color:#ffffff;text-decoration:none;font-weight:bold;font-size:15px;padding:12px 24px;border-radius:999px;">Rate your order</a></p>`
    : "";
  const html =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f6f6;"><tr><td align="center" style="padding:16px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:12px;"><tr><td style="padding:24px;">` +
    `<p style="margin:0 0 12px;${FONT}font-size:16px;color:#222222;">Hi ${escapeHtml(input.recipientName)},</p>` +
    `<p style="margin:0 0 12px;${FONT}font-size:16px;color:#222222;">Thanks for ordering from ${escapeHtml(input.storeName)} (order #${escapeHtml(input.orderId.slice(0, 8))}). We would love to hear how it went.</p>` +
    `<p style="margin:0;${FONT}font-size:14px;color:#444444;">You can rate the store, the dishes and the delivery in less than a minute.</p>` +
    link +
    `</td></tr></table></td></tr></table>`;
  return { subject, html };
}
```
Run the test again -> pass.

- [ ] **Step 3: Eligibility route and the base-URL setting**

Add this line (placeholder only; never read `.env.local`) to `.env.example`: `PUBLIC_APP_URL=http://localhost:3000` with the comment line `# Public address customers open from emails (the review request link).` above it. If `PUBLIC_APP_URL` is unset the route falls back to `http://localhost:3000`.

Create `app/api/internal/orders/[id]/review-eligibility/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyInternalSecret } from "@/lib/internal-auth";
import { uuidsOnly } from "@/lib/zippy/actions";
import { buildReviewRequestEmail } from "@/lib/review-request-email";

// Called by n8n workflow 05, one hour after an order is delivered. Eligible only if the order is delivered,
// at least `minAgeMinutes` old (default 55: a guard against a wrong or duplicate trigger), still unreviewed,
// and its customer account still exists (a deleted account has nobody to ask).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!verifyInternalSecret(request)) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await params;
  if (uuidsOnly([id]).length !== 1) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const rawMin = request.nextUrl.searchParams.get("minAgeMinutes");
  const minAge = rawMin === null ? 55 : Number(rawMin);
  if (!Number.isFinite(minAge) || minAge < 0 || minAge > 1440) {
    return NextResponse.json({ error: "minAgeMinutes must be 0 to 1440" }, { status: 400 });
  }

  const { data: order, error } = await supabaseServer
    .from("orders")
    .select("id, status, delivered_at, customer_id, recipient_name, recipient_email, stores(name)")
    .eq("id", id.toLowerCase())
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Failed to load order" }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const no = (reason: string) => NextResponse.json({ eligible: false, reason });
  if (order.status !== "delivered") return no("not delivered");
  if (!order.customer_id) return no("customer account deleted");
  if (!order.delivered_at || Date.now() - Date.parse(order.delivered_at) < minAge * 60_000) return no("too early");
  if (!order.recipient_email?.trim()) return no("no email");

  const { data: review, error: reviewError } = await supabaseServer.from("reviews").select("id").eq("order_id", order.id).maybeSingle();
  if (reviewError) return NextResponse.json({ error: "Failed to check reviews" }, { status: 500 });
  if (review) return no("already reviewed");

  const store = Array.isArray(order.stores) ? order.stores[0] : order.stores;
  const base = (process.env.PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const { subject, html } = buildReviewRequestEmail({
    orderId: order.id,
    storeName: store?.name ?? "the store",
    recipientName: order.recipient_name,
    orderUrl: `${base}/customer/orders/${order.id}`,
  });
  return NextResponse.json({
    eligible: true,
    customerEmail: order.recipient_email,
    emailSubject: subject,
    reviewRequestHtml: html,
  });
}
```

- [ ] **Step 4: Write the failing workflow test**

Create `tests/review-request-n8n.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const wf = JSON.parse(readFileSync(new URL("../n8n/workflows/05-delivery-status-propagation.json", import.meta.url), "utf8"));
const byName = Object.fromEntries(wf.nodes.map((n) => [n.name, n]));
const targets = (name) => (wf.connections[name]?.main ?? []).flat().map((t) => t.node);

test("workflow 05 gains Wait 1 h, an eligibility call, an IF and a Gmail send", () => {
  const wait = byName["Wait 1 h (review request)"];
  const get = byName["GET /api/internal/orders/:id/review-eligibility"];
  const gate = byName["IF: review request eligible"];
  const gmail = byName["Gmail: Send Review Request"];
  assert.ok(wait && get && gate && gmail, "a review request node is missing");
  assert.equal(wait.type, "n8n-nodes-base.wait");
  assert.equal(wait.parameters.amount, 1);
  assert.equal(wait.parameters.unit, "hours");
  assert.match(get.parameters.url, /\/api\/internal\/orders\/.*review-eligibility/);
  assert.ok(JSON.stringify(get.parameters.headerParameters).includes("X-Internal-Secret"));
  assert.equal(gmail.type, "n8n-nodes-base.gmail");
  assert.equal(gmail.parameters.emailType, "html");
  assert.ok(String(gmail.credentials.gmailOAuth2.id).startsWith("PLACEHOLDER_"), "real credential id committed");
});

test("the IF wraps its value in String() (n8n 2.40.7) and checks for true", () => {
  const gate = byName["IF: review request eligible"];
  const cond = gate.parameters.conditions.string[0];
  assert.match(cond.value1, /String\(/);
  assert.equal(cond.value2, "true");
});

test("the delivered branch starts the review chain without touching the delivered email path", () => {
  assert.ok(targets("Filter: status = delivered").includes("Wait 1 h (review request)"));
  assert.ok(targets("Filter: status = delivered").includes("GET /api/internal/orders/:id/notification-details"));
  assert.deepEqual(targets("Wait 1 h (review request)"), ["GET /api/internal/orders/:id/review-eligibility"]);
  assert.deepEqual(targets("GET /api/internal/orders/:id/review-eligibility"), ["IF: review request eligible"]);
  assert.deepEqual(wf.connections["IF: review request eligible"].main[0].map((t) => t.node), ["Gmail: Send Review Request"]);
  assert.deepEqual(wf.connections["IF: review request eligible"].main[1] ?? [], [], "false branch must end");
});

test("the Gmail node sends to customerEmail with the built subject and html", () => {
  const gmail = byName["Gmail: Send Review Request"];
  assert.match(gmail.parameters.sendTo, /customerEmail/);
  assert.match(gmail.parameters.subject, /emailSubject/);
  assert.match(gmail.parameters.message, /reviewRequestHtml/);
});
```

Run: `node --test tests/review-request-n8n.test.mjs` -> FAIL (nodes missing).

- [ ] **Step 5: Edit workflow 05**

In `n8n/workflows/05-delivery-status-propagation.json` add these four nodes to `nodes` (unique `id`s; generate a new UUID for the Wait node's `webhookId`, for example with `node -e "console.log(crypto.randomUUID())"`):

```json
    {
      "id": "wait-review-request",
      "name": "Wait 1 h (review request)",
      "type": "n8n-nodes-base.wait",
      "typeVersion": 1.1,
      "position": [900, 700],
      "webhookId": "<NEW UUID>",
      "parameters": { "resume": "timeInterval", "amount": 1, "unit": "hours" },
      "notes": "C1: one hour after delivery, ask the customer for a review. Workflow must stay active for the wait to resume; Reset Data deletes pending waits."
    },
    {
      "id": "get-review-eligibility",
      "name": "GET /api/internal/orders/:id/review-eligibility",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [1120, 700],
      "parameters": {
        "method": "GET",
        "url": "={{$env.APP_BASE_URL}}/api/internal/orders/{{$json[\"body\"][\"record\"][\"id\"]}}/review-eligibility",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "X-Internal-Secret", "value": "={{$env.N8N_INTERNAL_SECRET}}" }] }
      },
      "notes": "Returns eligible:false (already reviewed, too early, account deleted) or the email subject and HTML."
    },
    {
      "id": "if-review-eligible",
      "name": "IF: review request eligible",
      "type": "n8n-nodes-base.if",
      "typeVersion": 1,
      "position": [1340, 700],
      "parameters": { "conditions": { "string": [{ "value1": "={{String($json[\"eligible\"])}}", "value2": "true" }] } }
    },
    {
      "id": "send-review-request-email",
      "name": "Gmail: Send Review Request",
      "type": "n8n-nodes-base.gmail",
      "typeVersion": 2,
      "position": [1560, 700],
      "parameters": {
        "resource": "message",
        "operation": "send",
        "sendTo": "={{$json[\"customerEmail\"]}}",
        "subject": "={{$json[\"emailSubject\"]}}",
        "emailType": "html",
        "message": "={{$json[\"reviewRequestHtml\"]}}",
        "options": {}
      },
      "credentials": { "gmailOAuth2": { "id": "PLACEHOLDER_CONNECT_YOUR_GMAIL_CREDENTIAL", "name": "Gmail account (connect in n8n UI)" } },
      "notes": "Credential intentionally left as a placeholder -- select your own Gmail OAuth2 credential after importing. This send is LIVE once published: test only with an address you own."
    }
```

In `connections`: add `"Wait 1 h (review request)"` as a third target of `Filter: status = delivered`'s first output, and add:

```json
    "Wait 1 h (review request)": { "main": [[{ "node": "GET /api/internal/orders/:id/review-eligibility", "type": "main", "index": 0 }]] },
    "GET /api/internal/orders/:id/review-eligibility": { "main": [[{ "node": "IF: review request eligible", "type": "main", "index": 0 }]] },
    "IF: review request eligible": { "main": [[{ "node": "Gmail: Send Review Request", "type": "main", "index": 0 }], []] }
```

Also extend the `_note` field with one sentence: `C1 (2026-10-07): added the 1 h review request path (Wait, eligibility call, IF, Gmail); not yet run live.` Keep the existing placeholder node "Finalize Payment + Prompt Review (placeholder)" untouched.

- [ ] **Step 6: Run the workflow tests and the whole suite**

Run: `node --test tests/review-request-n8n.test.mjs tests/n8n-workflows.test.mjs` then `node --test tests/*.test.mjs` -> all pass (the existing credential-placeholder, connection and unique-id tests still hold).

- [ ] **Step 7: Document**

In `docs/n8n-webhook-setup.md`, in the Workflow 05 section, add a paragraph: the review-request path (Wait 1 h, `review-eligibility`, IF, Gmail), the `minAgeMinutes` test override, that `PUBLIC_APP_URL` controls the link, that the Gmail send is live after publishing, and that the workflow must be re-imported with a top-level `id` and republished in the n8n UI (never restart the `--rm` container).

- [ ] **Step 8: Live check of the route (no n8n, no email)**

The route needs the `X-Internal-Secret` value, which lives in `.env.local`; you must NOT read that file. (controller) Ask Vishal with `AskUserQuestion` whether he will run the curl lines himself in PowerShell (give him the lines with `$env:N8N_INTERNAL_SECRET`, he pastes the output back) or approve a one-off load of the secret into the shell. If neither, record "review-eligibility route verified by build and tests only" in the ledger and skip to Step 9.

`node scripts/c1-fixtures.mjs create`. Checks (replace `$SECRET`):
1. No header -> 401. Wrong header -> 401.
2. `GET /api/internal/orders/<ORDER1>/review-eligibility` (delivered 2 hours ago by the fixture) -> `eligible:true`, `customerEmail: c1@example.invalid`, subject and HTML present.
3. `?minAgeMinutes=300` -> `eligible:false, reason:"too early"`. `?minAgeMinutes=-1` -> 400.
4. After a customer review exists for the order -> `eligible:false, reason:"already reviewed"`.
5. `update public.orders set customer_id = null` -> `eligible:false, reason:"customer account deleted"`.
6. A `placed` order id -> `not delivered`. Unknown id -> 404.
Open the returned HTML in the browser tab to eyeball it (save to the scratchpad directory and open the file URL) and confirm the link points to `http://localhost:3000/customer/orders/<id>`.
Cleanup.

- [ ] **Step 9: Ask Vishal about importing workflow 05 (controller, live email)**

Use `AskUserQuestion` (recommended option first): import the updated workflow 05 into the local n8n now, or skip the live n8n run. If he agrees: the controller imports it per `docs/n8n-webhook-setup.md` (top-level `id` needed for the CLI import; never stop or restart the `--rm` n8n container) and Vishal republishes it in the n8n UI and, for the test only, shortens the "Wait 1 h (review request)" node to about 10 seconds, restoring it to 1 hour afterwards. The live test then uses a fixture order whose `recipient_email` is an address Vishal owns: insert it as `assigned`, then `update public.orders set status = 'delivered'` by SQL. That fires the orders webhook, so the EXISTING delivered email and the new review request are both sent to him (two emails). Check the n8n execution record for both Gmail nodes and open the review link. If he skips, the final report must list "n8n review-request path not run live" as unverified.

- [ ] **Step 10: Commit**

```bash
git add lib/review-request-email.ts tests/review-request-email.test.mjs tests/review-request-n8n.test.mjs "app/api/internal/orders/[id]/review-eligibility/route.ts" n8n/workflows/05-delivery-status-propagation.json docs/n8n-webhook-setup.md .env.example
git commit -m "feat(c1): n8n review request path and eligibility route

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Phone photo upload (GATED on Vishal's approval to install a package)

**Files (only if approved):**
- Modify: `mobile/package.json` and `mobile/package-lock.json` (by the install command), `mobile/lib/api.ts`, `mobile/lib/use-order-review.ts`, `mobile/components/reviews/ReviewForm.tsx`

- [ ] **Step 0: Ask before anything else**

`expo-image-picker` is NOT in `mobile/package.json`. Use `AskUserQuestion` (recommended option first): "Install `expo-image-picker` (the SDK-57-compatible version, via `npx expo install expo-image-picker` in `mobile/`) so reviewers can attach a photo on the phone?" Options: install now (recommended), skip (the phone form keeps no photo field and the web form still has it). If skipped, mark this task skipped in the ledger and move on; the final report must say phone photos are web-only. Never put `expo-dev-client` into `package.json`.

- [ ] **Step 1: Install (approved only)**

Run in `mobile/`: `npx expo install expo-image-picker`. Expected: the dependency is added with an Expo-57-compatible version. Commit the two package files with the code below.

- [ ] **Step 2: Let `apiFetch` send a FormData body**

In `mobile/lib/api.ts` change the request construction so a `FormData` body is sent as is (React Native sets the multipart boundary):

```ts
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: isForm
      ? { Authorization: `Bearer ${token}` }
      : { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: options.body === undefined ? undefined : isForm ? (options.body as FormData) : JSON.stringify(options.body),
  });
```

- [ ] **Step 3: Hook and form**

In `mobile/lib/use-order-review.ts` change `submit` to `submit(input: ReviewInput, photo: ReviewPhoto | null)` where `export type ReviewPhoto = { uri: string; name: string; type: string };`, and when `photo` is set send:

```ts
const form = new FormData();
form.append("payload", JSON.stringify(input));
form.append("photo", { uri: photo.uri, name: photo.name, type: photo.type } as unknown as Blob);
await apiFetch(orderReviewPath(orderId), { method: "POST", body: form });
```

In `mobile/components/reviews/ReviewForm.tsx` add an "Add a photo" button below the store comment:

```tsx
import * as ImagePicker from "expo-image-picker";
// state: const [photo, setPhoto] = useState<ReviewPhoto | null>(null);
async function pickPhoto() {
  setLocalError(null);
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.7, allowsEditing: false });
  if (result.canceled) return;
  const asset = result.assets[0];
  const type = asset.mimeType ?? "image/jpeg";
  if (!(REVIEW_PHOTO_TYPES as readonly string[]).includes(type)) {
    setLocalError("The photo must be a JPEG, PNG or WebP image");
    return;
  }
  if (asset.fileSize !== undefined && asset.fileSize > REVIEW_LIMITS.photoBytes) {
    setLocalError("The photo must be 3 MB or smaller");
    return;
  }
  setPhoto({ uri: asset.uri, name: asset.fileName ?? `review.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`, type });
}
```
Show the chosen file name with a Remove button, pass `photo` to `onSubmit(input, photo)` (update the `onSubmit` prop type to `(input: ReviewInput, photo: ReviewPhoto | null) => Promise<boolean>`), and import `REVIEW_PHOTO_TYPES` from the model.

- [ ] **Step 4: Checks and live check**

`cd mobile && npx tsc --noEmit`. On the emulator (Expo Go) add a photo from the gallery (push a test image with `adb push` to `/sdcard/Pictures` and trigger a media scan, or use the emulator camera roll), submit, then open the store screen and see the photo. Vishal checks the iPhone (HEIC photos are converted to JPEG by the picker when `quality` is set; if the iPhone sends something the server rejects, the error text must be readable on screen).

- [ ] **Step 5: Commit**

```bash
git add mobile/package.json mobile/package-lock.json mobile/lib/api.ts mobile/lib/use-order-review.ts mobile/components/reviews/ReviewForm.tsx
git commit -m "feat(c1): phone review photo upload

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Knowledge, Reset Data support, whole-branch review and close-out

**Files:**
- Create: `scripts/purge-review-photos.mjs`, `tests/purge-review-photos.test.mjs`
- Modify: `knowledge/**` (Q&As), `docs/DEPLOYMENT.md` (one line in the public-launch checklist)

- [ ] **Step 1: Photo purge script (used by "Reset Data")**

Deleting orders cascades the review rows but not the Storage objects, and deleting `storage.objects` rows in SQL does not remove the files. Create `scripts/purge-review-photos.mjs`:

```js
// Deletes every object in the private review-photos bucket through the Storage API (the bucket's rows alone are
// not enough: SQL deletes leave the files on disk). Used by "Reset Data". Local stack only.
// Usage: node scripts/purge-review-photos.mjs [--dry-run]
import { execFileSync } from "node:child_process";

const API = "http://127.0.0.1:54321";
const BUCKET = "review-photos";

export function collectPaths(entries, prefix = "") {
  // The list API returns folders as entries without an id; files have an id.
  return entries.filter((entry) => entry.id).map((entry) => `${prefix}${entry.name}`);
}

async function listFolder(key, prefix) {
  const res = await fetch(`${API}/storage/v1/object/list/${BUCKET}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 1000, offset: 0 }),
  });
  if (!res.ok) throw new Error(`list ${prefix || "/"} failed: ${res.status}`);
  return res.json();
}

async function walk(key, prefix = "") {
  const entries = await listFolder(key, prefix);
  const files = collectPaths(entries, prefix);
  for (const folder of entries.filter((entry) => !entry.id)) {
    files.push(...(await walk(key, `${prefix}${folder.name}/`)));
  }
  return files;
}

async function main() {
  const out = execFileSync("npx", ["supabase", "status", "-o", "env"], { encoding: "utf8", shell: process.platform === "win32" });
  const key = out.match(/^SERVICE_ROLE_KEY="?([^"\r\n]+)"?/m)?.[1];
  if (!key) throw new Error("SERVICE_ROLE_KEY not found in supabase status");
  const files = await walk(key);
  console.log(`${files.length} object(s) in ${BUCKET}`);
  if (process.argv.includes("--dry-run") || files.length === 0) return;
  const res = await fetch(`${API}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: files }),
  });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
  console.log("deleted");
}

if (process.argv[1]?.endsWith("purge-review-photos.mjs")) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
```

Create `tests/purge-review-photos.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { collectPaths } from "../scripts/purge-review-photos.mjs";

test("collectPaths keeps files (entries with an id) and skips folders", () => {
  const entries = [{ name: "a.jpg", id: "1" }, { name: "reviews", id: null }, { name: "b.png", id: "2" }];
  assert.deepEqual(collectPaths(entries, "reviews/o1/"), ["reviews/o1/a.jpg", "reviews/o1/b.png"]);
  assert.deepEqual(collectPaths([], ""), []);
});
```
Run: `node --test tests/purge-review-photos.test.mjs` -> pass. Then `node scripts/purge-review-photos.mjs --dry-run` -> `0 object(s) in review-photos` (leave no objects behind from earlier tasks; if it reports objects you did not create, STOP and report: they belong to Vishal).

- [ ] **Step 2: Knowledge Q&As (fact-check against the code)**

List `knowledge/` and read how an existing Q&A is written (front matter, headings, audience). Add short Q&As to the matching files: customer web and phone ordering (rating an order after delivery, one review per order, photos up to 3 MB, optional dish and delivery ratings, "New partner" until 5 ratings, reviews can be reported), vendor (Reviews page, reply once and edit it, report to admin, cannot hide), delivery (My rating, comments without customer names), admin (Reviews page, hide with reason, unhide, dismiss, low-score badge), the policy/privacy file (review photos and comments are public on the store page; a hidden review disappears everywhere; chats unaffected), and the glossary. Every statement must be checked against the routes and components built in Tasks 3 to 9; do not write from this plan. Run `node --test tests/zippy-knowledge.test.mjs` (the knowledge structure test) and the whole suite. Do NOT re-ingest or run the eval yourself (it spends API credit and needs the internal secret): leave that to Vishal.

- [ ] **Step 3: Deployment note**

In `docs/DEPLOYMENT.md`, in the "Public deployment checklist", add one bullet: review and report routes have no rate limit (local-only install); before going public add per-user and per-IP limits, a CAPTCHA or email-verified sign-up requirement before reviews, and image scanning for the `review-photos` bucket.

- [ ] **Step 4: Full verification**

Run, and paste the tail of each into the ledger: `node --test tests/*.test.mjs`, `npx tsc --noEmit`, `cd mobile && npx tsc --noEmit`, `npx eslint .` (or the repo's lint script; known pre-existing errors only), `npm run build`, the SQL test (`docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/c1_reviews.sql`), and a leak check: `select count(*) from public.reviews; select count(*) from public.users where full_name = 'C1 Tester'; select count(*) from storage.objects where bucket_id='review-photos';` all `0`, and `git status` shows only intended files.

- [ ] **Step 5: Whole-branch review and one fix wave (controller)**

Dispatch ONE Opus reviewer over `git diff main...c1-ratings-reviews` with this brief: correctness of the aggregate maths and the migration under concurrency; every role-scoped response is an allow-list and none leaks `customer_id`, report fields to the wrong role, partner comments to vendors or customers, or hidden-review content or photos; no route trusts a body id for identity; the pure modules import nothing at runtime; web/phone parity; lint rules (`set-state-in-effect`, `refs`) respected; the Review Focus list at the top of this plan is covered by tests. Apply ONE fix wave and one scoped re-review. Defer minors to the ledger.

- [ ] **Step 6: Close-out (controller, with Vishal)**

1. Report: "Rulings I made" (spec section 10 plus the six refinements listed under File Structure), verified live versus checked only by types/reading, and the steps Vishal still runs: apply nothing (the migration is already applied locally), re-ingest `knowledge/` and run `node scripts/zippy-eval.mjs` (needs his `N8N_INTERNAL_SECRET`), import and publish workflow 05 in the n8n UI and do one live email test with an address he owns, iPhone Expo Go check of the rating card and store reviews (and photo, if Task 10 ran).
2. When Vishal says "Update Manuals": add the reviews sections to both manuals per the standing procedure. When he says "Commit Work": update `CLAUDE.md` (new "C1 ratings and reviews" paragraph; "Reset Data" gains a step: `node scripts/purge-review-photos.mjs`, run after deleting orders, because reviews cascade from orders but Storage objects do not), `MEMORY.md`, `README.md`, `AGENTS.md`; commit, push, merge to `main`, run the full tests, push `main`.
