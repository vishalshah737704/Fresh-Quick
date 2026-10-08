-- C2: coupons / promo codes, wallet credit ledger and referrals.
-- Every new table is written only through service-role API routes or SECURITY
-- DEFINER functions, so RLS is on and there are deliberately NO policies.

-- ---------------------------------------------------------------- coupons
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code = upper(code) and code ~ '^[A-Z0-9_-]{3,20}$'),
  description text check (description is null or char_length(description) <= 200),
  kind text not null check (kind in ('percent', 'fixed')),
  value integer not null check (value > 0),
  max_discount_paise integer check (max_discount_paise is null or max_discount_paise > 0),
  min_order_paise integer not null default 0 check (min_order_paise >= 0),
  store_id uuid references public.stores(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  total_limit integer check (total_limit is null or total_limit > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit > 0),
  first_order_only boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint coupons_percent_range check (kind <> 'percent' or value <= 100),
  constraint coupons_window check (valid_until is null or valid_until > valid_from)
);
create unique index coupons_code_key on public.coupons (upper(code));
create index coupons_store_id_idx on public.coupons (store_id);
alter table public.coupons enable row level security;

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  customer_id uuid not null references public.users(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  discount_paise integer not null check (discount_paise > 0),
  status text not null default 'applied' check (status in ('applied', 'released')),
  created_at timestamptz not null default now(),
  constraint coupon_redemptions_order_key unique (order_id)
);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id, status);
create index coupon_redemptions_customer_idx on public.coupon_redemptions (customer_id, coupon_id);
alter table public.coupon_redemptions enable row level security;

-- ------------------------------------------------------ referrals + wallet
alter table public.users add column referral_code text;
create unique index users_referral_code_key on public.users (referral_code);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.users(id) on delete cascade,
  referred_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'credited')),
  created_at timestamptz not null default now(),
  credited_at timestamptz,
  constraint referrals_referred_key unique (referred_id),
  constraint referrals_not_self check (referrer_id <> referred_id)
);
create index referrals_referrer_idx on public.referrals (referrer_id);
alter table public.referrals enable row level security;

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users(id) on delete cascade,
  amount_paise integer not null check (amount_paise <> 0),
  kind text not null check (kind in ('referral_reward', 'referral_bonus', 'spend', 'refund', 'adjustment')),
  order_id uuid references public.orders(id) on delete set null,
  referral_id uuid references public.referrals(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  constraint wallet_sign_by_kind check (
    (kind in ('spend') and amount_paise < 0) or (kind in ('referral_reward', 'referral_bonus', 'refund') and amount_paise > 0) or kind = 'adjustment'
  )
);
create index wallet_ledger_customer_idx on public.wallet_ledger (customer_id, created_at desc);
create unique index wallet_spend_once on public.wallet_ledger (order_id, kind) where kind in ('spend', 'refund');
create unique index wallet_referral_once on public.wallet_ledger (referral_id, kind) where kind in ('referral_reward', 'referral_bonus');
alter table public.wallet_ledger enable row level security;

-- ------------------------------------------------------- orders columns
alter table public.orders add column discount numeric not null default 0 check (discount >= 0);
alter table public.orders add column credit_used numeric not null default 0 check (credit_used >= 0);
alter table public.orders add column coupon_code text;
alter table public.orders drop constraint total_matches_parts;
alter table public.orders add constraint total_matches_parts
  check (total = subtotal + delivery_fee - discount - credit_used);

-- ---------------------------------------------------------------- helpers
create function public.wallet_balance_paise(p_customer uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount_paise), 0)::integer from public.wallet_ledger where customer_id = p_customer
$$;

create function public.ensure_referral_code(p_customer uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_code text;
  v_try integer := 0;
begin
  select referral_code into v_code from public.users where id = p_customer;
  if v_code is not null then return v_code; end if;
  loop
    v_try := v_try + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      update public.users set referral_code = v_code where id = p_customer and referral_code is null;
      select referral_code into v_code from public.users where id = p_customer;
      return v_code;
    exception when unique_violation then
      if v_try > 10 then raise; end if;
    end;
  end loop;
end;
$$;

-- The single rule engine: used by the checkout preview route and, after the
-- coupon row is locked, by checkout_place_order. Returns one row; error_code is
-- null when the coupon is usable.
create function public.coupon_check(p_code text, p_customer uuid, p_store uuid, p_subtotal_paise integer)
returns table (coupon_id uuid, discount_paise integer, error_code text, message text)
language plpgsql security definer set search_path = '' as $$
declare
  c public.coupons;
  v_discount integer;
  v_used integer;
  v_mine integer;
begin
  select * into c from public.coupons where upper(code) = upper(btrim(coalesce(p_code, '')));
  if not found then
    return query select null::uuid, 0, 'not_found'::text, 'That promo code does not exist.'::text; return;
  end if;
  if not c.is_active then
    return query select c.id, 0, 'inactive'::text, 'That promo code is not active.'::text; return;
  end if;
  if c.valid_from > now() then
    return query select c.id, 0, 'not_started'::text, 'That promo code is not valid yet.'::text; return;
  end if;
  if c.valid_until is not null and c.valid_until <= now() then
    return query select c.id, 0, 'expired'::text, 'That promo code has expired.'::text; return;
  end if;
  if c.store_id is not null and c.store_id is distinct from p_store then
    return query select c.id, 0, 'wrong_store'::text, 'That promo code works only at another store.'::text; return;
  end if;
  if p_subtotal_paise < c.min_order_paise then
    return query select c.id, 0, 'min_order'::text,
      ('Add items worth Rs ' || regexp_replace(to_char((c.min_order_paise - p_subtotal_paise) / 100.0, 'FM9999990.00'), '\.00$', '') || ' more to use this code.')::text;
    return;
  end if;
  select count(*) into v_used from public.coupon_redemptions r where r.coupon_id = c.id and r.status = 'applied';
  if c.total_limit is not null and v_used >= c.total_limit then
    return query select c.id, 0, 'limit_reached'::text, 'That promo code has been fully used.'::text; return;
  end if;
  select count(*) into v_mine from public.coupon_redemptions r
    where r.coupon_id = c.id and r.customer_id = p_customer and r.status = 'applied';
  if v_mine >= c.per_customer_limit then
    return query select c.id, 0, 'already_used'::text, 'You have already used that promo code.'::text; return;
  end if;
  if c.first_order_only and exists (
    select 1 from public.orders o where o.customer_id = p_customer and o.status not in ('cancelled', 'rejected')
  ) then
    return query select c.id, 0, 'first_order_only'::text, 'That promo code is for first orders only.'::text; return;
  end if;
  if c.kind = 'percent' then
    v_discount := floor(p_subtotal_paise::numeric * c.value / 100)::integer;
    if c.max_discount_paise is not null then v_discount := least(v_discount, c.max_discount_paise); end if;
  else
    v_discount := c.value;
  end if;
  v_discount := least(v_discount, p_subtotal_paise);
  if v_discount <= 0 then
    return query select c.id, 0, 'nothing_to_discount'::text, 'That promo code gives no discount on this order.'::text; return;
  end if;
  return query select c.id, v_discount, null::text, null::text;
end;
$$;

-- ------------------------------------------------------- checkout RPC
drop function if exists public.checkout_place_order(
  uuid, text, text, text, text, text, text, text, text, text, numeric, numeric, uuid,
  numeric, numeric, numeric, jsonb, text, numeric, text, text
);

create function public.checkout_place_order(
  p_customer_id uuid,
  p_recipient_name text,
  p_recipient_email text,
  p_recipient_phone text,
  p_address_label text,
  p_address_line1 text,
  p_address_line2 text,
  p_address_city text,
  p_address_state text,
  p_address_pincode text,
  p_address_lat numeric,
  p_address_lng numeric,
  p_store_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_total numeric, -- the total the caller expects AFTER discount and credit; a mismatch raises PRICE_CHANGED
  p_items jsonb,
  p_payment_method text,
  p_payment_amount numeric, -- ignored: the payment amount is the recomputed total
  p_payment_reference text,
  p_delivery_note text default null,
  p_coupon_code text default null,
  p_use_credit boolean default false
) returns table (order_id uuid, address_id uuid, payment_id uuid, discount numeric, credit_used numeric, total numeric) as $$
declare
  v_address_id uuid;
  v_order_id uuid;
  v_payment_id uuid;
  v_item jsonb;
  v_order_item_id uuid;
  v_option jsonb;
  v_subtotal_paise integer := round(p_subtotal * 100)::integer;
  v_fee_paise integer := round(p_delivery_fee * 100)::integer;
  v_coupon_id uuid;
  v_coupon_code text;
  v_discount_paise integer := 0;
  v_credit_paise integer := 0;
  v_balance integer;
  v_total_paise integer;
  chk record;
begin
  -- Lock order: coupon row first, then the customer row. Every checkout takes
  -- them in this order, so concurrent checkouts serialise instead of deadlocking.
  if p_coupon_code is not null and btrim(p_coupon_code) <> '' then
    select c.id, c.code into v_coupon_id, v_coupon_code
      from public.coupons c where upper(c.code) = upper(btrim(p_coupon_code)) for update;
    if v_coupon_id is null then
      raise exception 'COUPON:not_found:That promo code does not exist.';
    end if;
    select * into chk from public.coupon_check(v_coupon_code, p_customer_id, p_store_id, v_subtotal_paise);
    if chk.error_code is not null then
      raise exception 'COUPON:%:%', chk.error_code, chk.message;
    end if;
    v_discount_paise := chk.discount_paise;
  end if;

  perform 1 from public.users u where u.id = p_customer_id for update;
  v_total_paise := v_subtotal_paise + v_fee_paise - v_discount_paise;
  if p_use_credit then
    v_balance := public.wallet_balance_paise(p_customer_id);
    v_credit_paise := greatest(0, least(v_balance, v_total_paise));
  end if;
  v_total_paise := v_total_paise - v_credit_paise;

  if p_total is not null and round(p_total * 100)::integer <> v_total_paise then
    raise exception 'PRICE_CHANGED';
  end if;

  insert into public.addresses (user_id, label, line1, line2, city, state, pincode, lat, lng, is_default)
    values (p_customer_id, p_address_label, p_address_line1, p_address_line2, p_address_city,
            p_address_state, p_address_pincode, p_address_lat, p_address_lng, false)
    returning id into v_address_id;

  insert into public.orders (customer_id, recipient_name, recipient_email, recipient_phone, store_id, delivery_address_id,
                             status, subtotal, delivery_fee, discount, credit_used, coupon_code, total, delivery_note)
    values (p_customer_id, p_recipient_name, p_recipient_email, p_recipient_phone, p_store_id, v_address_id,
            'placed', p_subtotal, p_delivery_fee, v_discount_paise / 100.0, v_credit_paise / 100.0,
            case when v_discount_paise > 0 then v_coupon_code else null end, v_total_paise / 100.0, p_delivery_note)
    returning id into v_order_id;

  if v_discount_paise > 0 then
    insert into public.coupon_redemptions (coupon_id, customer_id, order_id, discount_paise)
      values (v_coupon_id, p_customer_id, v_order_id, v_discount_paise);
  end if;
  if v_credit_paise > 0 then
    insert into public.wallet_ledger (customer_id, amount_paise, kind, order_id, note)
      values (p_customer_id, -v_credit_paise, 'spend', v_order_id, 'Used at checkout');
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, product_id, quantity, unit_price, special_instructions)
      values (v_order_id, (v_item->>'product_id')::uuid, (v_item->>'quantity')::integer,
              (v_item->>'unit_price')::numeric, v_item->>'special_instructions')
      returning id into v_order_item_id;

    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb))
    loop
      insert into public.order_item_options (order_item_id, menu_item_option_id, group_name, option_name, price_delta_paise)
        values (v_order_item_id, (v_option->>'option_id')::uuid, v_option->>'group_name',
                v_option->>'option_name', (v_option->>'price_delta_paise')::integer);
    end loop;
  end loop;

  insert into public.payments (order_id, method, status, amount, mock_reference, paid_at)
    values (v_order_id, p_payment_method, 'pending', v_total_paise / 100.0, p_payment_reference, null)
    returning id into v_payment_id;

  return query select v_order_id, v_address_id, v_payment_id,
    (v_discount_paise / 100.0)::numeric, (v_credit_paise / 100.0)::numeric, (v_total_paise / 100.0)::numeric;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.checkout_place_order from public, anon, authenticated;
grant execute on function public.checkout_place_order to service_role;
revoke execute on function public.coupon_check from public, anon, authenticated;
grant execute on function public.coupon_check to service_role;
revoke execute on function public.wallet_balance_paise from public, anon, authenticated;
grant execute on function public.wallet_balance_paise to service_role;
revoke execute on function public.ensure_referral_code from public, anon, authenticated;
grant execute on function public.ensure_referral_code to service_role;

-- ------------------------------- release on cancel / referral reward triggers
create function public.orders_c2_status_effects() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ref public.referrals;
  v_credited integer;
begin
  if new.status in ('cancelled', 'rejected') and old.status not in ('cancelled', 'rejected') then
    update public.coupon_redemptions set status = 'released' where order_id = new.id and status = 'applied';
    if new.credit_used > 0 then
      insert into public.wallet_ledger (customer_id, amount_paise, kind, order_id, note)
        values (new.customer_id, round(new.credit_used * 100)::integer, 'refund', new.id, 'Order not completed')
        on conflict do nothing;
    end if;
  end if;

  if new.status = 'delivered' and old.status <> 'delivered' and new.customer_id is not null and new.subtotal >= 100 then
    select * into v_ref from public.referrals where referred_id = new.customer_id and status = 'pending' for update;
    if found and not exists (
      select 1 from public.orders o where o.customer_id = new.customer_id and o.status = 'delivered' and o.id <> new.id
    ) then
      select count(*) into v_credited from public.referrals where referrer_id = v_ref.referrer_id and status = 'credited';
      if v_credited < 10 then
        insert into public.wallet_ledger (customer_id, amount_paise, kind, referral_id, order_id, note)
          values (v_ref.referrer_id, 5000, 'referral_reward', v_ref.id, new.id, 'A friend you referred got their first delivery')
          on conflict do nothing;
      end if;
      insert into public.wallet_ledger (customer_id, amount_paise, kind, referral_id, order_id, note)
        values (v_ref.referred_id, 5000, 'referral_bonus', v_ref.id, new.id, 'Welcome bonus for joining with a referral code')
        on conflict do nothing;
      update public.referrals set status = 'credited', credited_at = now() where id = v_ref.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_c2_status_effects after update of status on public.orders
  for each row execute function public.orders_c2_status_effects();
