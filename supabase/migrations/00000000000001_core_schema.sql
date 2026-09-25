-- users: extends auth.users with app-specific profile + role
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'vendor', 'delivery', 'admin')),
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  label text,
  line1 text not null,
  lat numeric not null,
  lng numeric not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.restaurants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  cuisine_tags text[] not null default '{}',
  address_id uuid references public.addresses(id),
  lat numeric not null,
  lng numeric not null,
  is_open boolean not null default true,
  avg_prep_minutes integer not null default 30,
  rating numeric not null default 0,
  banner_url text,
  created_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  name text not null,
  description text,
  price numeric not null check (price >= 0),
  category text,
  is_veg boolean not null default false,
  is_available boolean not null default true,
  image_url text,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users(id),
  restaurant_id uuid not null references public.restaurants(id),
  delivery_partner_id uuid references public.users(id),
  delivery_address_id uuid not null references public.addresses(id),
  status text not null default 'placed' check (status in
    ('placed', 'accepted', 'preparing', 'ready', 'assigned', 'picked_up', 'delivered', 'cancelled')),
  subtotal numeric not null check (subtotal >= 0),
  delivery_fee numeric not null default 0 check (delivery_fee >= 0),
  total numeric not null check (total >= 0),
  placed_at timestamptz not null default now(),
  constraint total_matches_parts check (total = subtotal + delivery_fee)
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id),
  quantity integer not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0)
);

create table public.delivery_partners (
  user_id uuid primary key references public.users(id) on delete cascade,
  is_online boolean not null default false,
  current_lat numeric,
  current_lng numeric,
  last_ping_at timestamptz,
  vehicle_type text
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  method text not null check (method in ('mock_card', 'mock_upi', 'mock_cod')),
  status text not null default 'pending' check (status in ('pending', 'success', 'failed')),
  amount numeric not null check (amount >= 0),
  mock_reference text,
  paid_at timestamptz
);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.users(id),
  restaurant_id uuid not null references public.restaurants(id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- Enable RLS on every table (permissive stub policies; tightened per-role in later phases)
alter table public.users enable row level security;
alter table public.addresses enable row level security;
alter table public.restaurants enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.delivery_partners enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;

create policy "stub_allow_authenticated_read" on public.users for select using (auth.role() = 'authenticated');
create policy "stub_allow_authenticated_read" on public.addresses for select using (auth.role() = 'authenticated');
create policy "stub_allow_authenticated_read" on public.restaurants for select using (true);
create policy "stub_allow_authenticated_read" on public.menu_items for select using (true);
create policy "stub_allow_authenticated_read" on public.orders for select using (auth.role() = 'authenticated');
create policy "stub_allow_authenticated_read" on public.order_items for select using (auth.role() = 'authenticated');
create policy "stub_allow_authenticated_read" on public.delivery_partners for select using (auth.role() = 'authenticated');
create policy "stub_allow_authenticated_read" on public.payments for select using (auth.role() = 'authenticated');
create policy "stub_allow_authenticated_read" on public.reviews for select using (true);
