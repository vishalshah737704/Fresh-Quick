-- C3: customers can favorite stores. Written only through service-role API routes
-- (identity from the verified session token), so RLS is on with NO policies:
-- an unused write policy would be a direct PostgREST bypass.
create table public.favorite_stores (
  user_id uuid not null references public.users(id) on delete cascade,
  store_id uuid not null references public.stores(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

create index idx_favorite_stores_store_id on public.favorite_stores (store_id);

alter table public.favorite_stores enable row level security;
