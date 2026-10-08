-- Checks migration 39 (notifications). One transaction, rolled back.
--   docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/c4_notifications.sql
begin;

do $$
declare
  cust uuid := gen_random_uuid();
  owner uuid := gen_random_uuid();
  partner uuid := gen_random_uuid();
  v_store uuid := gen_random_uuid();
  prod uuid := gen_random_uuid();
  addr uuid := gen_random_uuid();
  ord uuid := gen_random_uuid();
  n integer;
begin
  insert into auth.users (id, email, aud, role) values
    (cust, 'c4-cust@example.invalid', 'authenticated', 'authenticated'),
    (owner, 'c4-owner@example.invalid', 'authenticated', 'authenticated'),
    (partner, 'c4-partner@example.invalid', 'authenticated', 'authenticated');
  insert into public.users (id, role, full_name) values
    (cust, 'customer', 'C4 Cust'), (owner, 'vendor', 'C4 Owner'), (partner, 'delivery', 'C4 Partner');
  insert into public.delivery_partners (user_id) values (partner);
  insert into public.stores (id, owner_id, name, lat, lng, category_type, rating)
    values (v_store, owner, 'C4TEST store', 19.07, 72.87, 'restaurant', 4.0);
  insert into public.addresses (id, user_id, line1, lat, lng) values (addr, cust, 'C4 street', 19.07, 72.87);

  -- n8n webhooks fire on orders triggers, so keep replica off only for the insert's n8n trigger? The inbox
  -- trigger must run, so it is created enabled for replica too is NOT possible; run with triggers on and
  -- accept the pg_net call (it fails silently when n8n has no matching workflow path).
  insert into public.orders (id, customer_id, store_id, delivery_address_id, status, subtotal, total, recipient_name, recipient_email, recipient_phone)
    values (ord, cust, v_store, addr, 'placed', 100, 100, 'C4', 'c4@example.invalid', '9999999999');

  select count(*) into n from public.user_notifications where user_id = cust and kind = 'order_placed';
  if n <> 1 then raise exception 'customer placed notification missing (%)', n; end if;
  select count(*) into n from public.user_notifications where user_id = owner and kind = 'new_order';
  if n <> 1 then raise exception 'vendor new_order notification missing (%)', n; end if;

  update public.orders set status = 'accepted' where id = ord;
  update public.orders set status = 'assigned', delivery_partner_id = partner where id = ord;
  select count(*) into n from public.user_notifications where user_id = cust and kind in ('order_accepted', 'order_assigned');
  if n <> 2 then raise exception 'status notifications missing (%)', n; end if;
  select count(*) into n from public.user_notifications where user_id = partner and kind = 'order_assigned';
  if n <> 1 then raise exception 'partner assignment notification missing (%)', n; end if;

  -- a preference switched off stops new inbox rows for that category
  insert into public.notification_preferences (user_id, order_updates) values (cust, false);
  update public.orders set status = 'picked_up' where id = ord;
  select count(*) into n from public.user_notifications where user_id = cust and kind = 'order_picked_up';
  if n <> 0 then raise exception 'order_updates=false must suppress the row'; end if;
  update public.notification_preferences set order_updates = true where user_id = cust;
  update public.orders set status = 'delivered' where id = ord;
  select count(*) into n from public.user_notifications where user_id = cust and kind = 'order_delivered';
  if n <> 1 then raise exception 'delivered notification missing'; end if;

  -- duplicates are ignored
  perform public.inbox_add(cust, 'order', 'order_delivered', 'x', 'y', ord);
  select count(*) into n from public.user_notifications where user_id = cust and kind = 'order_delivered';
  if n <> 1 then raise exception 'duplicate row created'; end if;

  raise notice 'c4_notifications.sql: all checks passed';
end;
$$;

rollback;
