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

-- No insert/update/delete policies: all writes go through the service-role
-- PUT /api/cart route. An unused RLS write policy would be a live PostgREST
-- bypass of that route's validation.
