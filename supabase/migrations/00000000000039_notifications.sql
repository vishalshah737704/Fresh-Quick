-- C4: in-app notification inbox, per-user preferences and device tokens.
-- Written only by SECURITY DEFINER triggers and service-role API routes: RLS on, NO policies.

create table public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null check (category in ('order', 'wallet', 'promo', 'account')),
  kind text not null,
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 400),
  order_id uuid references public.orders(id) on delete cascade,
  read_at timestamptz,
  dispatched_at timestamptz,
  created_at timestamptz not null default now()
);
create index user_notifications_user_idx on public.user_notifications (user_id, created_at desc);
create index user_notifications_undispatched_idx on public.user_notifications (created_at) where dispatched_at is null;
create unique index user_notifications_once_per_order on public.user_notifications (user_id, order_id, kind) where order_id is not null;
alter table public.user_notifications enable row level security;

create table public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  order_updates boolean not null default true,
  wallet_updates boolean not null default true,
  promotions boolean not null default true,
  push boolean not null default true,
  sms boolean not null default false,
  whatsapp boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.notification_preferences enable row level security;

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null check (char_length(token) between 10 and 300),
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint device_tokens_token_key unique (token)
);
create index device_tokens_user_idx on public.device_tokens (user_id);
alter table public.device_tokens enable row level security;

-- Adds one inbox row, honouring the recipient's category preference. Silent no-op on duplicates.
create function public.inbox_add(
  p_user uuid, p_category text, p_kind text, p_title text, p_body text, p_order uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_on boolean := true;
begin
  if p_user is null then return; end if;
  select case p_category
           when 'order' then np.order_updates
           when 'wallet' then np.wallet_updates
           when 'promo' then np.promotions
           else true end
    into v_on from public.notification_preferences np where np.user_id = p_user;
  if v_on is false then return; end if;
  insert into public.user_notifications (user_id, category, kind, title, body, order_id)
    values (p_user, p_category, p_kind, left(p_title, 120), left(p_body, 400), p_order)
    on conflict do nothing;
end;
$$;
revoke execute on function public.inbox_add from public, anon, authenticated;
grant execute on function public.inbox_add to service_role;

create function public.orders_inbox_effects() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_store_name text;
  v_owner uuid;
  v_short text := upper(substr(new.id::text, 1, 8));
begin
  select s.name, s.owner_id into v_store_name, v_owner from public.stores s where s.id = new.store_id;
  if tg_op = 'INSERT' then
    perform public.inbox_add(new.customer_id, 'order', 'order_placed', 'Order placed',
      'Your order #' || v_short || ' from ' || coalesce(v_store_name, 'the store') || ' was placed.', new.id);
    perform public.inbox_add(v_owner, 'order', 'new_order', 'New order',
      'Order #' || v_short || ' is waiting for you to accept.', new.id);
    return new;
  end if;
  if new.status is distinct from old.status then
    perform public.inbox_add(new.customer_id, 'order', 'order_' || new.status,
      case new.status
        when 'accepted' then 'Order accepted'
        when 'preparing' then 'Being prepared'
        when 'ready' then 'Ready for pickup'
        when 'assigned' then 'Delivery partner assigned'
        when 'picked_up' then 'On the way'
        when 'delivered' then 'Delivered'
        when 'cancelled' then 'Order cancelled'
        when 'rejected' then 'Order rejected'
        else 'Order update' end,
      case new.status
        when 'accepted' then coalesce(v_store_name, 'The store') || ' accepted order #' || v_short || '.'
        when 'preparing' then coalesce(v_store_name, 'The store') || ' is preparing order #' || v_short || '.'
        when 'ready' then 'Order #' || v_short || ' is ready and waiting for a delivery partner.'
        when 'assigned' then 'A delivery partner will bring order #' || v_short || '.'
        when 'picked_up' then 'Order #' || v_short || ' is on its way to you.'
        when 'delivered' then 'Order #' || v_short || ' was delivered. Enjoy your meal!'
        when 'cancelled' then 'Order #' || v_short || ' was cancelled.'
        when 'rejected' then coalesce(v_store_name, 'The store') || ' could not accept order #' || v_short || '.'
        else 'Order #' || v_short || ' changed.' end,
      new.id);
    if new.status = 'assigned' and new.delivery_partner_id is not null then
      perform public.inbox_add(new.delivery_partner_id, 'order', 'order_assigned', 'New delivery',
        'Order #' || v_short || ' from ' || coalesce(v_store_name, 'the store') || ' is assigned to you.', new.id);
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_inbox_insert after insert on public.orders
  for each row execute function public.orders_inbox_effects();
create trigger orders_inbox_update after update of status on public.orders
  for each row execute function public.orders_inbox_effects();

-- Wallet credit events also land in the inbox (replaces migration 38's trigger function, same logic plus inbox_add).
create or replace function public.orders_c2_status_effects() returns trigger
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
      perform public.inbox_add(new.customer_id, 'wallet', 'credit_refunded', 'Wallet credit refunded',
        'Rs ' || new.credit_used::text || ' was returned to your wallet.', new.id);
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
        perform public.inbox_add(v_ref.referrer_id, 'wallet', 'referral_reward', 'You earned Rs 50',
          'A friend you referred got their first delivery. Rs 50 was added to your wallet.', null);
      end if;
      insert into public.wallet_ledger (customer_id, amount_paise, kind, referral_id, order_id, note)
        values (v_ref.referred_id, 5000, 'referral_bonus', v_ref.id, new.id, 'Welcome bonus for joining with a referral code')
        on conflict do nothing;
      perform public.inbox_add(v_ref.referred_id, 'wallet', 'referral_bonus', 'Welcome bonus: Rs 50',
        'Thanks for joining with a referral code. Rs 50 was added to your wallet.', null);
      update public.referrals set status = 'credited', credited_at = now() where id = v_ref.id;
    end if;
  end if;
  return new;
end;
$$;
