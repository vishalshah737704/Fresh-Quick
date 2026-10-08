-- Checks migration 38 (coupons, wallet, referrals). One transaction, rolled back.
--   docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/c2_coupons.sql
begin;

do $$
declare
  cust uuid := gen_random_uuid();
  cust2 uuid := gen_random_uuid();
  owner uuid := gen_random_uuid();
  v_store uuid := gen_random_uuid();
  v_store2 uuid := gen_random_uuid();
  prod uuid := gen_random_uuid();
  r record;
  msg text;
  failed boolean;
  ord uuid;
  ord2 uuid;
  bal integer;
  items jsonb;
  ref uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (cust, 'c2-cust@example.invalid', 'authenticated', 'authenticated'),
    (cust2, 'c2-cust2@example.invalid', 'authenticated', 'authenticated'),
    (owner, 'c2-owner@example.invalid', 'authenticated', 'authenticated');
  insert into public.users (id, role, full_name) values
    (cust, 'customer', 'C2 One'), (cust2, 'customer', 'C2 Two'), (owner, 'vendor', 'C2 Owner');
  insert into public.stores (id, owner_id, name, lat, lng, category_type, rating)
    values (v_store, owner, 'C2TEST store', 19.07, 72.87, 'restaurant', 4.0),
           (v_store2, owner, 'C2TEST store 2', 19.07, 72.87, 'restaurant', 4.0);
  insert into public.products (id, store_id, name, price) values (prod, v_store, 'C2TEST dish', 200);
  items := jsonb_build_array(jsonb_build_object('product_id', prod, 'quantity', 1, 'unit_price', 200, 'options', '[]'::jsonb));

  insert into public.coupons (code, kind, value, max_discount_paise, min_order_paise, total_limit, per_customer_limit, first_order_only)
    values ('C2PCT', 'percent', 10, 1500, 10000, 2, 1, false);
  insert into public.coupons (code, kind, value, store_id) values ('C2STORE', 'fixed', 5000, v_store2);
  insert into public.coupons (code, kind, value, first_order_only) values ('C2FIRST', 'fixed', 3000, true);
  insert into public.coupons (code, kind, value, is_active) values ('C2OFF', 'fixed', 1000, false);
  insert into public.coupons (code, kind, value, valid_until, valid_from)
    values ('C2OLD', 'fixed', 1000, now() - interval '1 day', now() - interval '2 days');
  insert into public.coupons (code, kind, value) values ('C2BIG', 'fixed', 99999);

  -- rule engine
  select * into r from public.coupon_check('c2pct', cust, v_store, 20000);
  if r.error_code is not null or r.discount_paise <> 1500 then raise exception 'cap: % %', r.error_code, r.discount_paise; end if;
  select * into r from public.coupon_check('C2PCT', cust, v_store, 5000);
  if r.error_code <> 'min_order' then raise exception 'min_order expected, got %', r.error_code; end if;
  select * into r from public.coupon_check('C2STORE', cust, v_store, 20000);
  if r.error_code <> 'wrong_store' then raise exception 'wrong_store expected'; end if;
  select * into r from public.coupon_check('C2OFF', cust, v_store, 20000);
  if r.error_code <> 'inactive' then raise exception 'inactive expected'; end if;
  select * into r from public.coupon_check('C2OLD', cust, v_store, 20000);
  if r.error_code <> 'expired' then raise exception 'expired expected'; end if;
  select * into r from public.coupon_check('NOPE', cust, v_store, 20000);
  if r.error_code <> 'not_found' then raise exception 'not_found expected'; end if;
  select * into r from public.coupon_check('C2BIG', cust, v_store, 20000);
  if r.discount_paise <> 20000 then raise exception 'discount must not exceed subtotal: %', r.discount_paise; end if;

  -- checkout with coupon: 200 - 15 (cap) + 30 fee = 215
  set local session_replication_role = replica;
  select * into r from public.checkout_place_order(cust, 'N', 'e@example.invalid', '+919999999999', 'Home', 'l1', null, 'c', 's', '400001',
    19.07, 72.87, v_store, 200, 30, 215, items, 'mock_cod', 0, 'ref', null, 'c2pct', false);
  set local session_replication_role = origin;
  ord := r.order_id;
  if r.discount <> 15 or r.total <> 215 then raise exception 'rpc totals % %', r.discount, r.total; end if;
  if (select amount from public.payments where order_id = ord) <> 215 then raise exception 'payment amount'; end if;
  if (select count(*) from public.coupon_redemptions where order_id = ord and status = 'applied') <> 1 then raise exception 'no redemption'; end if;

  -- per-customer limit
  select * into r from public.coupon_check('C2PCT', cust, v_store, 20000);
  if r.error_code <> 'already_used' then raise exception 'already_used expected, got %', r.error_code; end if;
  -- first-order-only after an order exists
  select * into r from public.coupon_check('C2FIRST', cust, v_store, 20000);
  if r.error_code <> 'first_order_only' then raise exception 'first_order_only expected, got %', r.error_code; end if;
  select * into r from public.coupon_check('C2FIRST', cust2, v_store, 20000);
  if r.error_code is not null then raise exception 'first order should pass for new customer'; end if;

  -- price mismatch raises PRICE_CHANGED and writes nothing
  failed := false;
  begin
    perform * from public.checkout_place_order(cust2, 'N', 'e@example.invalid', '+919999999999', 'Home', 'l1', null, 'c', 's', '400001',
      19.07, 72.87, v_store, 200, 30, 230, items, 'mock_cod', 0, 'ref', null, 'C2PCT', false);
  exception when others then
    get stacked diagnostics msg = message_text;
    failed := msg = 'PRICE_CHANGED';
  end;
  if not failed then raise exception 'PRICE_CHANGED expected, got %', msg; end if;

  -- total_limit 2: second customer redeems, a third use is refused
  set local session_replication_role = replica;
  select * into r from public.checkout_place_order(cust2, 'N', 'e@example.invalid', '+919999999999', 'Home', 'l1', null, 'c', 's', '400001',
    19.07, 72.87, v_store, 200, 30, 215, items, 'mock_cod', 0, 'ref', null, 'C2PCT', false);
  set local session_replication_role = origin;
  ord2 := r.order_id;
  select * into r from public.coupon_check('C2PCT', gen_random_uuid(), v_store, 20000);
  if r.error_code <> 'limit_reached' then raise exception 'limit_reached expected, got %', r.error_code; end if;

  -- cancelling releases the redemption, so the code is usable again
  update public.orders set status = 'cancelled' where id = ord2;
  select * into r from public.coupon_check('C2PCT', gen_random_uuid(), v_store, 20000);
  if r.error_code is not null then raise exception 'released redemption should free the slot, got %', r.error_code; end if;

  -- referral: cust2 referred by cust; reward only on the FIRST delivered order with subtotal >= 100
  insert into public.referrals (referrer_id, referred_id) values (cust, cust2) returning id into ref;
  set local session_replication_role = replica;
  select * into r from public.checkout_place_order(cust2, 'N', 'e@example.invalid', '+919999999999', 'Home', 'l1', null, 'c', 's', '400001',
    19.07, 72.87, v_store, 200, 30, 230, items, 'mock_cod', 0, 'ref', null, null, false);
  set local session_replication_role = origin;
  update public.orders set status = 'delivered' where id = r.order_id;
  if public.wallet_balance_paise(cust) <> 5000 or public.wallet_balance_paise(cust2) <> 5000 then
    raise exception 'referral credit expected 5000/5000, got %/%', public.wallet_balance_paise(cust), public.wallet_balance_paise(cust2);
  end if;
  if (select status from public.referrals where id = ref) <> 'credited' then raise exception 'referral not credited'; end if;

  -- spend credit: balance 5000, order 230 -> pays 180, ledger -5000? no: credit capped at balance (50)
  set local session_replication_role = replica;
  select * into r from public.checkout_place_order(cust2, 'N', 'e@example.invalid', '+919999999999', 'Home', 'l1', null, 'c', 's', '400001',
    19.07, 72.87, v_store, 200, 30, 180, items, 'mock_cod', 0, 'ref', null, null, true);
  set local session_replication_role = origin;
  if r.credit_used <> 50 or r.total <> 180 then raise exception 'credit spend % %', r.credit_used, r.total; end if;
  if public.wallet_balance_paise(cust2) <> 0 then raise exception 'balance should be 0'; end if;
  -- cancel refunds the credit exactly once
  update public.orders set status = 'cancelled' where id = r.order_id;
  if public.wallet_balance_paise(cust2) <> 5000 then raise exception 'refund expected'; end if;
  update public.orders set status = 'rejected' where id = r.order_id;
  if public.wallet_balance_paise(cust2) <> 5000 then raise exception 'refund must be once'; end if;

  -- referral reward is not paid twice
  if (select count(*) from public.wallet_ledger where referral_id = ref) <> 2 then raise exception 'ledger rows for referral'; end if;

  -- ledger is signed-by-kind
  failed := false;
  begin insert into public.wallet_ledger (customer_id, amount_paise, kind) values (cust, 100, 'spend');
  exception when check_violation then failed := true; end;
  if not failed then raise exception 'spend must be negative'; end if;

  -- referral code is stable and unique
  if public.ensure_referral_code(cust) <> public.ensure_referral_code(cust) then raise exception 'code not stable'; end if;
  if public.ensure_referral_code(cust) = public.ensure_referral_code(cust2) then raise exception 'codes collide'; end if;

  raise notice 'c2_coupons.sql: all checks passed';
end;
$$;

rollback;
