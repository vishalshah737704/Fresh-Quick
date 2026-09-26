-- Piece 4 (item customization): option groups/options schema, order_items
-- special_instructions, order_item_options snapshot table, and an updated
-- checkout_place_order RPC that also writes the new option selections.

create table public.menu_item_option_groups (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  name text not null,
  min_select integer not null default 0 check (min_select >= 0),
  max_select integer not null check (max_select >= 1 and max_select >= min_select),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.menu_item_options (
  id uuid primary key default gen_random_uuid(),
  option_group_id uuid not null references public.menu_item_option_groups(id) on delete cascade,
  name text not null,
  price_delta_paise integer not null default 0 check (price_delta_paise >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_menu_item_option_groups_menu_item_id on public.menu_item_option_groups (menu_item_id);
create index idx_menu_item_options_option_group_id on public.menu_item_options (option_group_id);

alter table public.order_items add column special_instructions text;

create table public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  -- set null (not cascade) on delete: an order's history must survive a
  -- vendor later deleting the option that was selected at order time.
  menu_item_option_id uuid references public.menu_item_options(id) on delete set null,
  group_name text not null,
  option_name text not null,
  price_delta_paise integer not null check (price_delta_paise >= 0)
);

create index idx_order_item_options_order_item_id on public.order_item_options (order_item_id);

alter table public.menu_item_option_groups enable row level security;
alter table public.menu_item_options enable row level security;
alter table public.order_item_options enable row level security;

-- Public read, same shape as menu_items' existing public-read policy —
-- customers must be able to browse option groups/options unauthenticated.
create policy "public_can_read_option_groups" on public.menu_item_option_groups
  for select using (true);
create policy "public_can_read_options" on public.menu_item_options
  for select using (true);

-- Mirror order_items' existing owner/vendor-scoped read policies exactly.
create policy "owner_can_read_own_order_item_options" on public.order_item_options
  for select using (
    exists (
      select 1 from public.order_items
      join public.orders on orders.id = order_items.order_id
      where order_items.id = order_item_options.order_item_id
        and orders.customer_id = auth.uid()
    )
  );
create policy "vendor_can_read_own_restaurant_order_item_options" on public.order_item_options
  for select using (
    exists (
      select 1 from public.order_items
      join public.orders on orders.id = order_items.order_id
      join public.restaurants on restaurants.id = orders.restaurant_id
      where order_items.id = order_item_options.order_item_id
        and restaurants.owner_id = auth.uid()
    )
  );

-- No RLS write policy on any of the three new tables — every write goes
-- through service-role vendor API routes (option groups/options) or the
-- service-role checkout route (order_item_options), per this project's
-- standing rule against RLS write policies on service-role-only tables.

create or replace function public.checkout_place_order(
  p_customer_id uuid,
  p_address_label text,
  p_address_line1 text,
  p_address_lat numeric,
  p_address_lng numeric,
  p_restaurant_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_total numeric,
  p_items jsonb, -- array of {menu_item_id, quantity, unit_price, special_instructions, options: [{option_id, group_name, option_name, price_delta_paise}]}
  p_payment_method text,
  p_payment_status text,
  p_payment_amount numeric,
  p_payment_paid_at timestamptz
) returns table (order_id uuid, address_id uuid) as $$
declare
  v_address_id uuid;
  v_order_id uuid;
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

  insert into public.orders (customer_id, restaurant_id, delivery_address_id, status, subtotal, delivery_fee, total)
    values (p_customer_id, p_restaurant_id, v_address_id, 'placed', p_subtotal, p_delivery_fee, p_total)
    returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price, special_instructions)
      values (
        v_order_id,
        (v_item->>'menu_item_id')::uuid,
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
      p_payment_status,
      p_payment_amount,
      'MOCK-' || left(v_order_id::text, 8),
      p_payment_paid_at
    );

  return query select v_order_id, v_address_id;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.checkout_place_order from public, anon, authenticated;
grant execute on function public.checkout_place_order to service_role;
