-- Ensure pgcrypto is available for crypt()/gen_salt() used below.
create extension if not exists pgcrypto;

-- Fixed cuisine taxonomy, stored as a lookup table so it's queryable/filterable
create table if not exists public.cuisine_taxonomy (
  slug text primary key,
  label text not null
);

insert into public.cuisine_taxonomy (slug, label) values
  ('indian', 'Indian'),
  ('chinese', 'Chinese'),
  ('italian', 'Italian'),
  ('fast_food', 'Fast Food'),
  ('desserts', 'Desserts'),
  ('beverages', 'Beverages'),
  ('south_indian', 'South Indian'),
  ('north_indian', 'North Indian')
on conflict (slug) do nothing;

-- Demo vendor user + restaurant (fixed UUIDs for idempotency)
insert into auth.users (id, email, encrypted_password, email_confirmed_at)
values ('11111111-1111-1111-1111-111111111111', 'vendor.demo@foodhub.local', crypt('demo1234', gen_salt('bf')), now())
on conflict (id) do nothing;

insert into public.users (id, role, full_name, phone) values
  ('11111111-1111-1111-1111-111111111111', 'vendor', 'Demo Vendor', '9990000001')
on conflict (id) do nothing;

insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'restaurant', '123 Demo Street', 19.0760, 72.8777, true)
on conflict (id) do nothing;

insert into public.restaurants (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Demo Kitchen', array['indian','fast_food'], '22222222-2222-2222-2222-222222222222', 19.0760, 72.8777, true, 25, 4.2)
on conflict (id) do nothing;

insert into public.menu_items (id, restaurant_id, name, description, price, category, is_veg, is_available) values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Paneer Butter Masala', 'Rich tomato gravy with paneer', 220, 'Main Course', true, true),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'Veg Fried Rice', 'Wok-tossed rice with vegetables', 150, 'Main Course', true, true)
on conflict (id) do nothing;
