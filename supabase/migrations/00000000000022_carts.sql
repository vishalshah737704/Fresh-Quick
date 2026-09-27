create table public.carts (
  user_id uuid primary key references public.users(id) on delete cascade,
  store_id uuid references public.stores(id) on delete set null,
  store_name text,
  items jsonb not null default '[]'::jsonb,
  order_note text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.carts enable row level security;

create policy "customer_can_read_own_cart" on public.carts
  for select using (auth.uid() = user_id);

create policy "customer_can_insert_own_cart" on public.carts
  for insert with check (auth.uid() = user_id);

create policy "customer_can_update_own_cart" on public.carts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "customer_can_delete_own_cart" on public.carts
  for delete using (auth.uid() = user_id);
