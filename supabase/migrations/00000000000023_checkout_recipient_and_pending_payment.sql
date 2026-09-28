-- Recipient details: the person receiving the order can differ from the
-- logged-in account (ordering for someone else). Backfill existing rows
-- from the account's own name/email so the not-null constraint can apply
-- immediately without breaking existing seed orders.
alter table public.orders add column recipient_name text;
alter table public.orders add column recipient_email text;

update public.orders o
set recipient_name = coalesce(u.full_name, 'Unknown'),
    recipient_email = 'unknown@foodhub.local'
from public.users u
where u.id = o.customer_id and o.recipient_name is null;

alter table public.orders alter column recipient_name set not null;
alter table public.orders alter column recipient_email set not null;

-- Vendor-notification table: a real database fact instead of only an n8n
-- execution log. Insert-only via service-role (see notes on RLS below).
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.stores(id) on delete cascade,
  channel text not null default 'vendor_new_order',
  message text not null,
  created_at timestamptz not null default now()
);

create index idx_notifications_restaurant_id on public.notifications (restaurant_id);

alter table public.notifications enable row level security;

-- Read-only for the owning vendor. No insert/update/delete policy: every
-- write goes through the service-role-backed
-- /api/internal/orders/[id]/notify-vendor route (Task 3), never a direct
-- client write, per this repo's standing RLS rule (CLAUDE.md).
create policy "vendor_can_read_own_notifications" on public.notifications
  for select using (
    exists (
      select 1 from public.stores
      where stores.id = notifications.restaurant_id
      and stores.owner_id = auth.uid()
    )
  );

-- Fix: n8n_notify() has sent an empty body since Phase 7 -- every webhook
-- fires but n8n's workflows read `$json.body.record...`, which was always
-- undefined. Rebuild the body from the triggering row so the
-- already-wired triggers (created in 00000000000015_n8n_webhooks.sql)
-- actually carry usable data.
create or replace function public.n8n_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := tg_argv[0],
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'record', to_jsonb(new)
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', current_setting('app.n8n_internal_secret', true)
    ),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;

drop function if exists public.checkout_place_order(
  uuid, text, text, numeric, numeric, uuid, numeric, numeric, numeric,
  jsonb, text, text, numeric, timestamptz, text
);

create or replace function public.checkout_place_order(
  p_customer_id uuid,
  p_recipient_name text,
  p_recipient_email text,
  p_address_label text,
  p_address_line1 text,
  p_address_lat numeric,
  p_address_lng numeric,
  p_store_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_total numeric,
  p_items jsonb, -- array of {product_id, quantity, unit_price, special_instructions, options: [{option_id, group_name, option_name, price_delta_paise}]}
  p_payment_method text,
  p_payment_amount numeric,
  p_payment_reference text,
  p_delivery_note text default null
) returns table (order_id uuid, address_id uuid, payment_id uuid) as $$
declare
  v_address_id uuid;
  v_order_id uuid;
  v_payment_id uuid;
  v_item jsonb;
  v_order_item_id uuid;
  v_option jsonb;
begin
  insert into public.addresses (user_id, label, line1, lat, lng, is_default)
    values (
      p_customer_id,
      p_address_label,
      p_address_line1,
      p_address_lat,
      p_address_lng,
      false
    )
    returning id into v_address_id;

  insert into public.orders (customer_id, recipient_name, recipient_email, store_id, delivery_address_id, status, subtotal, delivery_fee, total, delivery_note)
    values (p_customer_id, p_recipient_name, p_recipient_email, p_store_id, v_address_id, 'placed', p_subtotal, p_delivery_fee, p_total, p_delivery_note)
    returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, product_id, quantity, unit_price, special_instructions)
      values (
        v_order_id,
        (v_item->>'product_id')::uuid,
        (v_item->>'quantity')::integer,
        (v_item->>'unit_price')::numeric,
        v_item->>'special_instructions'
      )
      returning id into v_order_item_id;

    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb))
    loop
      insert into public.order_item_options (order_item_id, menu_item_option_id, group_name, option_name, price_delta_paise)
        values (
          v_order_item_id,
          (v_option->>'option_id')::uuid,
          v_option->>'group_name',
          v_option->>'option_name',
          (v_option->>'price_delta_paise')::integer
        );
    end loop;
  end loop;

  insert into public.payments (order_id, method, status, amount, mock_reference, paid_at)
    values (
      v_order_id,
      p_payment_method,
      'pending',
      p_payment_amount,
      p_payment_reference,
      null
    )
    returning id into v_payment_id;

  return query select v_order_id, v_address_id, v_payment_id;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.checkout_place_order from public, anon, authenticated;
grant execute on function public.checkout_place_order to service_role;
