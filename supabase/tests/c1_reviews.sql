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

  -- ord1's review is gone; rev2 (store 2, dish A 1, partner 5) is the only visible one left
  select rating, rating_count into s from public.stores where id = v_store;
  if s.rating <> 2.0 or s.rating_count <> 1 then raise exception 'order cascade left store aggregate stale: %', s; end if;
  select rating_sum, rating_count into p from public.products where id = prod_b;
  if p.rating_sum <> 0 or p.rating_count <> 0 then raise exception 'order cascade left dish B aggregate stale: %', p; end if;

  -- deleting the last visible review through the order cascade restores seed and zeroes every aggregate
  delete from public.orders where id = ord2;
  select rating, rating_count, rating_sum into s from public.stores where id = v_store;
  if s.rating <> 4.2 or s.rating_count <> 0 or s.rating_sum <> 0 then raise exception 'order cascade left store aggregate stale: %', s; end if;
  select rating_sum, rating_count into p from public.products where id = prod_a;
  if p.rating_sum <> 0 or p.rating_count <> 0 then raise exception 'order cascade left dish A aggregate stale: %', p; end if;
  select rating_sum, rating_count into d from public.delivery_partners where user_id = partner;
  if d.rating_sum <> 0 or d.rating_count <> 0 then raise exception 'order cascade left partner aggregate stale: %', d; end if;

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
