-- Ensure pgcrypto is available for crypt()/gen_salt() used below.
create extension if not exists pgcrypto;

-- Demo vendor user + restaurant (fixed UUIDs for idempotency)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated',
  'authenticated',
  'vendor.demo@foodhub.local',
  crypt('demo1234', gen_salt('bf')),
  now(),
  '',
  '',
  '',
  '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  now(),
  now()
)
on conflict (id) do nothing;

-- Matching identity row, required by GoTrue for password sign-in to resolve.
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
values (
  '11111111-1111-1111-1111-111111111112',
  '11111111-1111-1111-1111-111111111111',
  'email',
  '11111111-1111-1111-1111-111111111111',
  jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111', 'email', 'vendor.demo@foodhub.local'),
  now(),
  now()
)
on conflict (provider_id, provider) do nothing;

insert into public.users (id, role, full_name, phone) values
  ('11111111-1111-1111-1111-111111111111', 'vendor', 'Demo Vendor', '9990000001')
on conflict (id) do nothing;

insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'restaurant', '123 Demo Street', 19.0760, 72.8777, true)
on conflict (id) do nothing;

insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, category_type) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Demo Kitchen', array['indian','fast_food'], '22222222-2222-2222-2222-222222222222', 19.0760, 72.8777, true, 25, 4.2, 'restaurant')
on conflict (id) do nothing;

-- image_url values are real food photos from Pexels (pexels.com), fetched once via
-- the Pexels Search API and hardcoded here rather than called live at runtime —
-- keeps the Pexels API key out of the browser and avoids a network dependency on
-- every `supabase db reset`.
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Paneer Butter Masala', 'Rich tomato gravy with paneer', 220, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/9609838/pexels-photo-9609838.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'Veg Fried Rice', 'Wok-tossed rice with vegetables', 150, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/3926124/pexels-photo-3926124.jpeg?auto=compress&cs=tinysrgb&h=350')
on conflict (id) do nothing;

-- Catalog expansion (post-Phase-8 redesign): 16 additional restaurants
-- across 12 cuisines, images from Pexels fetched via scripts/fetch-catalog-images.mjs
-- and hardcoded here (never called live at runtime), same pattern as Demo Kitchen above.
-- users + auth (per restaurant, must come before addresses/restaurants due to FKs)
-- Spice Route
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0100000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'spice-route@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0100000-1111-1111-1111-111111111111', 'email', 'a0100000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0100000-1111-1111-1111-111111111111', 'email', 'spice-route@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0100000-1111-1111-1111-111111111111', 'vendor', 'Spice Route Owner', null) on conflict (id) do nothing;
-- Punjabi Dhaba
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0200000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'punjabi-dhaba@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0200000-1111-1111-1111-111111111111', 'email', 'a0200000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0200000-1111-1111-1111-111111111111', 'email', 'punjabi-dhaba@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0200000-1111-1111-1111-111111111111', 'vendor', 'Punjabi Dhaba Owner', null) on conflict (id) do nothing;
-- Dosa Corner
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0300000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'dosa-corner@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0300000-1111-1111-1111-111111111111', 'email', 'a0300000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0300000-1111-1111-1111-111111111111', 'email', 'dosa-corner@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0300000-1111-1111-1111-111111111111', 'vendor', 'Dosa Corner Owner', null) on conflict (id) do nothing;
-- Golden Dragon
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0400000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'golden-dragon@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0400000-1111-1111-1111-111111111111', 'email', 'a0400000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0400000-1111-1111-1111-111111111111', 'email', 'golden-dragon@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0400000-1111-1111-1111-111111111111', 'vendor', 'Golden Dragon Owner', null) on conflict (id) do nothing;
-- Wok This Way
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0500000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'wok-this-way@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0500000-1111-1111-1111-111111111111', 'email', 'a0500000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0500000-1111-1111-1111-111111111111', 'email', 'wok-this-way@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0500000-1111-1111-1111-111111111111', 'vendor', 'Wok This Way Owner', null) on conflict (id) do nothing;
-- Bella Italia
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0600000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'bella-italia@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0600000-1111-1111-1111-111111111111', 'email', 'a0600000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0600000-1111-1111-1111-111111111111', 'email', 'bella-italia@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0600000-1111-1111-1111-111111111111', 'vendor', 'Bella Italia Owner', null) on conflict (id) do nothing;
-- Pasta Palace
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0700000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'pasta-palace@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0700000-1111-1111-1111-111111111111', 'email', 'a0700000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0700000-1111-1111-1111-111111111111', 'email', 'pasta-palace@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0700000-1111-1111-1111-111111111111', 'vendor', 'Pasta Palace Owner', null) on conflict (id) do nothing;
-- Burger Barn
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0800000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'burger-barn@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0800000-1111-1111-1111-111111111111', 'email', 'a0800000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0800000-1111-1111-1111-111111111111', 'email', 'burger-barn@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0800000-1111-1111-1111-111111111111', 'vendor', 'Burger Barn Owner', null) on conflict (id) do nothing;
-- Sweet Tooth
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0900000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'sweet-tooth@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0900000-1111-1111-1111-111111111111', 'email', 'a0900000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0900000-1111-1111-1111-111111111111', 'email', 'sweet-tooth@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0900000-1111-1111-1111-111111111111', 'vendor', 'Sweet Tooth Owner', null) on conflict (id) do nothing;
-- Juice Junction
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0a00000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'juice-junction@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0a00000-1111-1111-1111-111111111111', 'email', 'a0a00000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0a00000-1111-1111-1111-111111111111', 'email', 'juice-junction@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0a00000-1111-1111-1111-111111111111', 'vendor', 'Juice Junction Owner', null) on conflict (id) do nothing;
-- Taco Fiesta
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0b00000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'taco-fiesta@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0b00000-1111-1111-1111-111111111111', 'email', 'a0b00000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0b00000-1111-1111-1111-111111111111', 'email', 'taco-fiesta@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0b00000-1111-1111-1111-111111111111', 'vendor', 'Taco Fiesta Owner', null) on conflict (id) do nothing;
-- El Sombrero
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0c00000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'el-sombrero@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0c00000-1111-1111-1111-111111111111', 'email', 'a0c00000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0c00000-1111-1111-1111-111111111111', 'email', 'el-sombrero@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0c00000-1111-1111-1111-111111111111', 'vendor', 'El Sombrero Owner', null) on conflict (id) do nothing;
-- Bangkok Bites
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0d00000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'bangkok-bites@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0d00000-1111-1111-1111-111111111111', 'email', 'a0d00000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0d00000-1111-1111-1111-111111111111', 'email', 'bangkok-bites@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0d00000-1111-1111-1111-111111111111', 'vendor', 'Bangkok Bites Owner', null) on conflict (id) do nothing;
-- The Bread Basket
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0e00000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'the-bread-basket@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0e00000-1111-1111-1111-111111111111', 'email', 'a0e00000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0e00000-1111-1111-1111-111111111111', 'email', 'the-bread-basket@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0e00000-1111-1111-1111-111111111111', 'vendor', 'The Bread Basket Owner', null) on conflict (id) do nothing;
-- Green Bowl
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a0f00000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'green-bowl@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a0f00000-1111-1111-1111-111111111111', 'email', 'a0f00000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a0f00000-1111-1111-1111-111111111111', 'email', 'green-bowl@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a0f00000-1111-1111-1111-111111111111', 'vendor', 'Green Bowl Owner', null) on conflict (id) do nothing;
-- Fresh Fit
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'a1000000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'fresh-fit@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'a1000000-1111-1111-1111-111111111111', 'email', 'a1000000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'a1000000-1111-1111-1111-111111111111', 'email', 'fresh-fit@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('a1000000-1111-1111-1111-111111111111', 'vendor', 'Fresh Fit Owner', null) on conflict (id) do nothing;

-- addresses
insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values
  ('a0100000-2222-2222-2222-222222222222', 'a0100000-1111-1111-1111-111111111111', 'restaurant', 'Spice Route Location', 19.1, 72.9, true),
  ('a0200000-2222-2222-2222-222222222222', 'a0200000-1111-1111-1111-111111111111', 'restaurant', 'Punjabi Dhaba Location', 19.05, 72.85, true),
  ('a0300000-2222-2222-2222-222222222222', 'a0300000-1111-1111-1111-111111111111', 'restaurant', 'Dosa Corner Location', 19.12, 72.86, true),
  ('a0400000-2222-2222-2222-222222222222', 'a0400000-1111-1111-1111-111111111111', 'restaurant', 'Golden Dragon Location', 19.03, 72.91, true),
  ('a0500000-2222-2222-2222-222222222222', 'a0500000-1111-1111-1111-111111111111', 'restaurant', 'Wok This Way Location', 19.09, 72.83, true),
  ('a0600000-2222-2222-2222-222222222222', 'a0600000-1111-1111-1111-111111111111', 'restaurant', 'Bella Italia Location', 19.06, 72.93, true),
  ('a0700000-2222-2222-2222-222222222222', 'a0700000-1111-1111-1111-111111111111', 'restaurant', 'Pasta Palace Location', 19.14, 72.88, true),
  ('a0800000-2222-2222-2222-222222222222', 'a0800000-1111-1111-1111-111111111111', 'restaurant', 'Burger Barn Location', 19.01, 72.87, true),
  ('a0900000-2222-2222-2222-222222222222', 'a0900000-1111-1111-1111-111111111111', 'restaurant', 'Sweet Tooth Location', 19.11, 72.92, true),
  ('a0a00000-2222-2222-2222-222222222222', 'a0a00000-1111-1111-1111-111111111111', 'restaurant', 'Juice Junction Location', 19.02, 72.94, true),
  ('a0b00000-2222-2222-2222-222222222222', 'a0b00000-1111-1111-1111-111111111111', 'restaurant', 'Taco Fiesta Location', 19.13, 72.82, true),
  ('a0c00000-2222-2222-2222-222222222222', 'a0c00000-1111-1111-1111-111111111111', 'restaurant', 'El Sombrero Location', 19.04, 72.79, true),
  ('a0d00000-2222-2222-2222-222222222222', 'a0d00000-1111-1111-1111-111111111111', 'restaurant', 'Bangkok Bites Location', 19.15, 72.9, true),
  ('a0e00000-2222-2222-2222-222222222222', 'a0e00000-1111-1111-1111-111111111111', 'restaurant', 'The Bread Basket Location', 19, 72.89, true),
  ('a0f00000-2222-2222-2222-222222222222', 'a0f00000-1111-1111-1111-111111111111', 'restaurant', 'Green Bowl Location', 19.16, 72.84, true),
  ('a1000000-2222-2222-2222-222222222222', 'a1000000-1111-1111-1111-111111111111', 'restaurant', 'Fresh Fit Location', 19.07, 72.77, true)
on conflict (id) do nothing;

-- restaurants
insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, banner_url, category_type) values
  ('a0100000-3333-3333-3333-333333333333', 'a0100000-1111-1111-1111-111111111111', 'Spice Route', array['indian'], 'a0100000-2222-2222-2222-222222222222', 19.1, 72.9, true, 30, 4.4, 'https://images.pexels.com/photos/958547/pexels-photo-958547.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0200000-3333-3333-3333-333333333333', 'a0200000-1111-1111-1111-111111111111', 'Punjabi Dhaba', array['north_indian'], 'a0200000-2222-2222-2222-222222222222', 19.05, 72.85, true, 35, 4.3, 'https://images.pexels.com/photos/29148133/pexels-photo-29148133.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0300000-3333-3333-3333-333333333333', 'a0300000-1111-1111-1111-111111111111', 'Dosa Corner', array['south_indian'], 'a0300000-2222-2222-2222-222222222222', 19.12, 72.86, true, 20, 4.6, 'https://images.pexels.com/photos/20422123/pexels-photo-20422123.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0400000-3333-3333-3333-333333333333', 'a0400000-1111-1111-1111-111111111111', 'Golden Dragon', array['chinese'], 'a0400000-2222-2222-2222-222222222222', 19.03, 72.91, true, 30, 4.1, 'https://images.pexels.com/photos/35415466/pexels-photo-35415466.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0500000-3333-3333-3333-333333333333', 'a0500000-1111-1111-1111-111111111111', 'Wok This Way', array['chinese'], 'a0500000-2222-2222-2222-222222222222', 19.09, 72.83, true, 25, 4, 'https://images.pexels.com/photos/32860319/pexels-photo-32860319.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0600000-3333-3333-3333-333333333333', 'a0600000-1111-1111-1111-111111111111', 'Bella Italia', array['italian'], 'a0600000-2222-2222-2222-222222222222', 19.06, 72.93, true, 35, 4.5, 'https://images.pexels.com/photos/31637791/pexels-photo-31637791.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0700000-3333-3333-3333-333333333333', 'a0700000-1111-1111-1111-111111111111', 'Pasta Palace', array['italian'], 'a0700000-2222-2222-2222-222222222222', 19.14, 72.88, true, 30, 4.2, 'https://images.pexels.com/photos/17636472/pexels-photo-17636472.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0800000-3333-3333-3333-333333333333', 'a0800000-1111-1111-1111-111111111111', 'Burger Barn', array['fast_food'], 'a0800000-2222-2222-2222-222222222222', 19.01, 72.87, true, 20, 4, 'https://images.pexels.com/photos/4021994/pexels-photo-4021994.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0900000-3333-3333-3333-333333333333', 'a0900000-1111-1111-1111-111111111111', 'Sweet Tooth', array['desserts'], 'a0900000-2222-2222-2222-222222222222', 19.11, 72.92, true, 15, 4.7, 'https://images.pexels.com/photos/29517897/pexels-photo-29517897.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0a00000-3333-3333-3333-333333333333', 'a0a00000-1111-1111-1111-111111111111', 'Juice Junction', array['beverages'], 'a0a00000-2222-2222-2222-222222222222', 19.02, 72.94, true, 10, 4.3, 'https://images.pexels.com/photos/8215113/pexels-photo-8215113.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0b00000-3333-3333-3333-333333333333', 'a0b00000-1111-1111-1111-111111111111', 'Taco Fiesta', array['mexican'], 'a0b00000-2222-2222-2222-222222222222', 19.13, 72.82, true, 25, 4.4, 'https://images.pexels.com/photos/36498696/pexels-photo-36498696.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0c00000-3333-3333-3333-333333333333', 'a0c00000-1111-1111-1111-111111111111', 'El Sombrero', array['mexican'], 'a0c00000-2222-2222-2222-222222222222', 19.04, 72.79, true, 30, 4.1, 'https://images.pexels.com/photos/33897541/pexels-photo-33897541.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0d00000-3333-3333-3333-333333333333', 'a0d00000-1111-1111-1111-111111111111', 'Bangkok Bites', array['thai'], 'a0d00000-2222-2222-2222-222222222222', 19.15, 72.9, true, 30, 4.5, 'https://images.pexels.com/photos/37279442/pexels-photo-37279442.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0e00000-3333-3333-3333-333333333333', 'a0e00000-1111-1111-1111-111111111111', 'The Bread Basket', array['bakery'], 'a0e00000-2222-2222-2222-222222222222', 19, 72.89, true, 15, 4.6, 'https://images.pexels.com/photos/7405059/pexels-photo-7405059.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a0f00000-3333-3333-3333-333333333333', 'a0f00000-1111-1111-1111-111111111111', 'Green Bowl', array['healthy'], 'a0f00000-2222-2222-2222-222222222222', 19.16, 72.84, true, 20, 4.7, 'https://images.pexels.com/photos/27969847/pexels-photo-27969847.jpeg?auto=compress&cs=tinysrgb&h=500', 'restaurant'),
  ('a1000000-3333-3333-3333-333333333333', 'a1000000-1111-1111-1111-111111111111', 'Fresh Fit', array['healthy'], 'a1000000-2222-2222-2222-222222222222', 19.07, 72.77, true, 18, 4.3, null, 'restaurant')
on conflict (id) do nothing;

-- menu items
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('a0100000-4444-4444-4444-000000000001', 'a0100000-3333-3333-3333-333333333333', 'Butter Chicken', 'Creamy tomato curry with tender chicken', 260, 'Main Course', '{"is_veg": false}'::jsonb, true, 'https://images.pexels.com/photos/9738981/pexels-photo-9738981.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0100000-4444-4444-4444-000000000002', 'a0100000-3333-3333-3333-333333333333', 'Palak Paneer', 'Spinach gravy with cottage cheese cubes', 210, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/31249589/pexels-photo-31249589.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0100000-4444-4444-4444-000000000003', 'a0100000-3333-3333-3333-333333333333', 'Veg Biryani', 'Fragrant basmati rice with mixed vegetables', 190, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/9738983/pexels-photo-9738983.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0200000-4444-4444-4444-000000000001', 'a0200000-3333-3333-3333-333333333333', 'Chole Bhature', 'Spiced chickpeas with fried bread', 180, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/36388454/pexels-photo-36388454.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0200000-4444-4444-4444-000000000002', 'a0200000-3333-3333-3333-333333333333', 'Chicken Tikka', 'Char-grilled marinated chicken skewers', 280, 'Starter', '{"is_veg": false}'::jsonb, true, 'https://images.pexels.com/photos/6522616/pexels-photo-6522616.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0200000-4444-4444-4444-000000000003', 'a0200000-3333-3333-3333-333333333333', 'Mango Lassi', 'Chilled yogurt mango drink', 90, 'Beverage', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/14509267/pexels-photo-14509267.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0300000-4444-4444-4444-000000000001', 'a0300000-3333-3333-3333-333333333333', 'Masala Dosa', 'Crispy rice crepe with spiced potato filling', 130, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/20422138/pexels-photo-20422138.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0300000-4444-4444-4444-000000000002', 'a0300000-3333-3333-3333-333333333333', 'Idli Sambar', 'Steamed rice cakes with lentil stew', 100, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/20422128/pexels-photo-20422128.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0300000-4444-4444-4444-000000000003', 'a0300000-3333-3333-3333-333333333333', 'Medu Vada', 'Crispy lentil doughnuts', 90, 'Starter', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/20422135/pexels-photo-20422135.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0400000-4444-4444-4444-000000000001', 'a0400000-3333-3333-3333-333333333333', 'Kung Pao Chicken', 'Wok-tossed chicken with peanuts and chili', 240, 'Main Course', '{"is_veg": false}'::jsonb, true, 'https://images.pexels.com/photos/30708204/pexels-photo-30708204.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0400000-4444-4444-4444-000000000002', 'a0400000-3333-3333-3333-333333333333', 'Hakka Noodles', 'Stir-fried noodles with vegetables', 170, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/9045147/pexels-photo-9045147.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0400000-4444-4444-4444-000000000003', 'a0400000-3333-3333-3333-333333333333', 'Spring Rolls', 'Crispy vegetable-filled rolls', 120, 'Starter', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/35407775/pexels-photo-35407775.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0500000-4444-4444-4444-000000000001', 'a0500000-3333-3333-3333-333333333333', 'Manchurian', 'Fried vegetable balls in tangy sauce', 160, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/35071815/pexels-photo-35071815.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0500000-4444-4444-4444-000000000002', 'a0500000-3333-3333-3333-333333333333', 'Veg Fried Rice', 'Wok-tossed rice with vegetables', 150, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/3926124/pexels-photo-3926124.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0600000-4444-4444-4444-000000000001', 'a0600000-3333-3333-3333-333333333333', 'Margherita Pizza', 'Classic tomato, mozzarella, and basil', 280, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/31596394/pexels-photo-31596394.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0600000-4444-4444-4444-000000000002', 'a0600000-3333-3333-3333-333333333333', 'Pasta Alfredo', 'Creamy parmesan pasta', 240, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/11220208/pexels-photo-11220208.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0600000-4444-4444-4444-000000000003', 'a0600000-3333-3333-3333-333333333333', 'Tiramisu', 'Coffee-soaked layered dessert', 150, 'Dessert', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/19119979/pexels-photo-19119979.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0700000-4444-4444-4444-000000000001', 'a0700000-3333-3333-3333-333333333333', 'Lasagna', 'Layered pasta with meat and cheese', 260, 'Main Course', '{"is_veg": false}'::jsonb, true, 'https://images.pexels.com/photos/5724557/pexels-photo-5724557.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0700000-4444-4444-4444-000000000002', 'a0700000-3333-3333-3333-333333333333', 'Garlic Bread', 'Toasted bread with garlic butter', 110, 'Starter', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/8633662/pexels-photo-8633662.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0800000-4444-4444-4444-000000000001', 'a0800000-3333-3333-3333-333333333333', 'Cheeseburger', 'Grilled patty with melted cheese', 180, 'Main Course', '{"is_veg": false}'::jsonb, true, 'https://images.pexels.com/photos/28895968/pexels-photo-28895968.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0800000-4444-4444-4444-000000000002', 'a0800000-3333-3333-3333-333333333333', 'French Fries', 'Crispy golden fries', 90, 'Starter', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/4869290/pexels-photo-4869290.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0900000-4444-4444-4444-000000000001', 'a0900000-3333-3333-3333-333333333333', 'Chocolate Cake', 'Rich layered chocolate cake slice', 140, 'Dessert', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/18613262/pexels-photo-18613262.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0900000-4444-4444-4444-000000000002', 'a0900000-3333-3333-3333-333333333333', 'Gulab Jamun', 'Warm milk-solid dumplings in syrup', 100, 'Dessert', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/11887844/pexels-photo-11887844.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0900000-4444-4444-4444-000000000003', 'a0900000-3333-3333-3333-333333333333', 'Brownie', 'Fudgy chocolate brownie square', 120, 'Dessert', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/33312981/pexels-photo-33312981.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0a00000-4444-4444-4444-000000000001', 'a0a00000-3333-3333-3333-333333333333', 'Fresh Orange Juice', 'Freshly squeezed orange juice', 80, 'Beverage', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/2479242/pexels-photo-2479242.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0a00000-4444-4444-4444-000000000002', 'a0a00000-3333-3333-3333-333333333333', 'Iced Coffee', 'Chilled brewed coffee over ice', 100, 'Beverage', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/4869290/pexels-photo-4869290.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0b00000-4444-4444-4444-000000000001', 'a0b00000-3333-3333-3333-333333333333', 'Beef Tacos', 'Seasoned beef in soft corn tortillas', 220, 'Main Course', '{"is_veg": false}'::jsonb, true, 'https://images.pexels.com/photos/3264572/pexels-photo-3264572.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0b00000-4444-4444-4444-000000000002', 'a0b00000-3333-3333-3333-333333333333', 'Guacamole & Chips', 'Fresh avocado dip with tortilla chips', 130, 'Starter', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/4968297/pexels-photo-4968297.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0b00000-4444-4444-4444-000000000003', 'a0b00000-3333-3333-3333-333333333333', 'Quesadilla', 'Grilled tortilla with melted cheese', 190, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/5836439/pexels-photo-5836439.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0c00000-4444-4444-4444-000000000001', 'a0c00000-3333-3333-3333-333333333333', 'Chicken Quesadilla', 'Grilled tortilla with chicken and cheese', 210, 'Main Course', '{"is_veg": false}'::jsonb, true, 'https://images.pexels.com/photos/14930606/pexels-photo-14930606.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0c00000-4444-4444-4444-000000000002', 'a0c00000-3333-3333-3333-333333333333', 'Guacamole', 'Fresh mashed avocado dip', 110, 'Starter', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/5737254/pexels-photo-5737254.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0d00000-4444-4444-4444-000000000001', 'a0d00000-3333-3333-3333-333333333333', 'Pad Thai', 'Stir-fried rice noodles with peanuts', 210, 'Main Course', '{"is_veg": false}'::jsonb, true, 'https://images.pexels.com/photos/34723314/pexels-photo-34723314.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0d00000-4444-4444-4444-000000000002', 'a0d00000-3333-3333-3333-333333333333', 'Thai Green Curry', 'Coconut curry with vegetables', 230, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/9397205/pexels-photo-9397205.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0d00000-4444-4444-4444-000000000003', 'a0d00000-3333-3333-3333-333333333333', 'Thai Spring Rolls', 'Crispy rolls with sweet chili sauce', 130, 'Starter', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/12653308/pexels-photo-12653308.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0e00000-4444-4444-4444-000000000001', 'a0e00000-3333-3333-3333-333333333333', 'Croissant', 'Buttery flaky French pastry', 90, 'Bakery', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/27969785/pexels-photo-27969785.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0e00000-4444-4444-4444-000000000002', 'a0e00000-3333-3333-3333-333333333333', 'Sourdough Loaf', 'Freshly baked sourdough bread', 160, 'Bakery', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/8633662/pexels-photo-8633662.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0e00000-4444-4444-4444-000000000003', 'a0e00000-3333-3333-3333-333333333333', 'Cinnamon Roll', 'Warm spiced roll with icing', 110, 'Bakery', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/30666844/pexels-photo-30666844.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0f00000-4444-4444-4444-000000000001', 'a0f00000-3333-3333-3333-333333333333', 'Quinoa Salad Bowl', 'Quinoa with fresh vegetables and greens', 220, 'Main Course', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/5817516/pexels-photo-5817516.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0f00000-4444-4444-4444-000000000002', 'a0f00000-3333-3333-3333-333333333333', 'Grilled Chicken Salad', 'Grilled chicken over mixed greens', 250, 'Main Course', '{"is_veg": false}'::jsonb, true, 'https://images.pexels.com/photos/5192435/pexels-photo-5192435.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a0f00000-4444-4444-4444-000000000003', 'a0f00000-3333-3333-3333-333333333333', 'Avocado Toast', 'Sourdough with smashed avocado', 180, 'Starter', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/7936964/pexels-photo-7936964.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a1000000-4444-4444-4444-000000000001', 'a1000000-3333-3333-3333-333333333333', 'Protein Bowl', 'Grilled chicken, quinoa, and greens', 260, 'Main Course', '{"is_veg": false}'::jsonb, true, 'https://images.pexels.com/photos/6978186/pexels-photo-6978186.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('a1000000-4444-4444-4444-000000000002', 'a1000000-3333-3333-3333-333333333333', 'Fresh Fruit Salad', 'Seasonal fruit medley', 120, 'Dessert', '{"is_veg": true}'::jsonb, true, 'https://images.pexels.com/photos/7434292/pexels-photo-7434292.jpeg?auto=compress&cs=tinysrgb&h=350')
on conflict (id) do nothing;


-- Demo admin account for local testing (Phase 6).
do $$
declare
  admin_uid uuid;
begin
  if not exists (select 1 from public.users where role = 'admin') then
    admin_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      admin_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'admin@foodhub.local', crypt('admin-demo-password', gen_salt('bf')),
      now(), now(), now(),
      '', '', '', '',
      '{"provider":"email","providers":["email"]}', '{}'
    );
    insert into public.users (id, role, full_name)
    values (admin_uid, 'admin', 'Demo Admin');
  end if;
end $$;

-- Demo customer account for local testing (no self-signup needed to explore
-- the customer app with an already-populated order history/addresses).
do $$
declare
  customer_uid uuid;
begin
  if not exists (select 1 from public.users where role = 'customer') then
    customer_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      customer_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'customer@foodhub.local', crypt('demo1234', gen_salt('bf')),
      now(), now(), now(),
      '', '', '', '',
      '{"provider":"email","providers":["email"]}', '{}'
    );
    insert into public.users (id, role, full_name, phone)
    values (customer_uid, 'customer', 'Demo Customer', '9990001111');
  end if;
end $$;

-- Demo delivery partner account for local testing.
do $$
declare
  delivery_uid uuid;
begin
  if not exists (select 1 from public.users where role = 'delivery') then
    delivery_uid := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      delivery_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'delivery@foodhub.local', crypt('demo1234', gen_salt('bf')),
      now(), now(), now(),
      '', '', '', '',
      '{"provider":"email","providers":["email"]}', '{}'
    );
    insert into public.users (id, role, full_name, phone)
    values (delivery_uid, 'delivery', 'Demo Delivery Partner', '9990002222');
    insert into public.delivery_partners (user_id, is_online, vehicle_type)
    values (delivery_uid, false, 'bike');
  end if;
end $$;

-- Phase 3 (Content A): Grocery category -- 4 stores, each carrying the
-- same 20-item master catalog (matches real grocery-chain overlap),
-- reaching ~80 browsable items. Images from Pexels, fetched once via
-- scripts/fetch-catalog-images.mjs and hardcoded here.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'b0100000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'fresh-mart@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'b0100000-1111-1111-1111-111111111111', 'email', 'b0100000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'b0100000-1111-1111-1111-111111111111', 'email', 'fresh-mart@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('b0100000-1111-1111-1111-111111111111', 'vendor', 'Fresh Mart Owner', null) on conflict (id) do nothing;
insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values ('b0100000-2222-2222-2222-222222222222', 'b0100000-1111-1111-1111-111111111111', 'store', 'Andheri West, Mumbai', 19.1197, 72.8468, true) on conflict (id) do nothing;
insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, category_type, banner_url) values ('b0100000-3333-3333-3333-333333333333', 'b0100000-1111-1111-1111-111111111111', 'Fresh Mart', array[]::text[], 'b0100000-2222-2222-2222-222222222222', 19.1197, 72.8468, true, null, 4.3, 'grocery', 'https://images.pexels.com/photos/5887645/pexels-photo-5887645.jpeg?auto=compress&cs=tinysrgb&h=650&w=940') on conflict (id) do nothing;
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('b0100000-4444-4444-4444-000000000001', 'b0100000-3333-3333-3333-333333333333', 'Milk 1L', 'Fresh whole milk, 1 litre', 60, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/3735217/pexels-photo-3735217.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000002', 'b0100000-3333-3333-3333-333333333333', 'Brown Bread', 'Whole wheat sandwich loaf', 45, 'Bakery', '{}'::jsonb, true, 'https://images.pexels.com/photos/5657400/pexels-photo-5657400.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000003', 'b0100000-3333-3333-3333-333333333333', 'Farm Eggs (12pc)', 'Dozen fresh farm eggs', 90, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/39648252/pexels-photo-39648252.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000004', 'b0100000-3333-3333-3333-333333333333', 'Basmati Rice 1kg', 'Premium long-grain basmati rice', 120, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/14238105/pexels-photo-14238105.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000005', 'b0100000-3333-3333-3333-333333333333', 'Bananas 1dz', 'Fresh ripe bananas, dozen', 50, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/4399936/pexels-photo-4399936.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000006', 'b0100000-3333-3333-3333-333333333333', 'Tomatoes 1kg', 'Farm-fresh tomatoes', 40, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/36094858/pexels-photo-36094858.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000007', 'b0100000-3333-3333-3333-333333333333', 'Potato Chips', 'Classic salted potato chips', 30, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/13060679/pexels-photo-13060679.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000008', 'b0100000-3333-3333-3333-333333333333', 'Orange Juice 1L', '100% pure orange juice', 110, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/8679336/pexels-photo-8679336.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000009', 'b0100000-3333-3333-3333-333333333333', 'Butter 200g', 'Salted table butter', 90, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/7965940/pexels-photo-7965940.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000010', 'b0100000-3333-3333-3333-333333333333', 'Yogurt Cup 400g', 'Plain set yogurt', 55, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/7474043/pexels-photo-7474043.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000011', 'b0100000-3333-3333-3333-333333333333', 'Whole Wheat Flour 5kg', 'Atta for chapati/roti', 220, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/6287223/pexels-photo-6287223.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000012', 'b0100000-3333-3333-3333-333333333333', 'Toor Dal 1kg', 'Split pigeon peas', 130, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/34940646/pexels-photo-34940646.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000013', 'b0100000-3333-3333-3333-333333333333', 'Sugar 1kg', 'Refined white sugar', 45, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/21582446/pexels-photo-21582446.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000014', 'b0100000-3333-3333-3333-333333333333', 'Cooking Oil 1L', 'Refined sunflower oil', 160, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/4910159/pexels-photo-4910159.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000015', 'b0100000-3333-3333-3333-333333333333', 'Onions 1kg', 'Fresh red onions', 35, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/15754938/pexels-photo-15754938.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000016', 'b0100000-3333-3333-3333-333333333333', 'Potatoes 1kg', 'Fresh potatoes', 30, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/7774212/pexels-photo-7774212.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000017', 'b0100000-3333-3333-3333-333333333333', 'Green Tea Bags 25ct', 'Antioxidant green tea bags', 150, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/34876378/pexels-photo-34876378.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000018', 'b0100000-3333-3333-3333-333333333333', 'Instant Coffee 100g', 'Freeze-dried instant coffee', 220, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/14567766/pexels-photo-14567766.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000019', 'b0100000-3333-3333-3333-333333333333', 'Frozen Peas 500g', 'Green peas, frozen pack', 70, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/33764652/pexels-photo-33764652.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0100000-4444-4444-4444-000000000020', 'b0100000-3333-3333-3333-333333333333', 'Ice Cream Tub 700ml', 'Vanilla ice cream tub', 250, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/11501480/pexels-photo-11501480.jpeg?auto=compress&cs=tinysrgb&h=650&w=940')
on conflict (id) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'b0200000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'daily-basket@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'b0200000-1111-1111-1111-111111111111', 'email', 'b0200000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'b0200000-1111-1111-1111-111111111111', 'email', 'daily-basket@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('b0200000-1111-1111-1111-111111111111', 'vendor', 'Daily Basket Owner', null) on conflict (id) do nothing;
insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values ('b0200000-2222-2222-2222-222222222222', 'b0200000-1111-1111-1111-111111111111', 'store', 'Bandra East, Mumbai', 19.0632, 72.857, true) on conflict (id) do nothing;
insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, category_type, banner_url) values ('b0200000-3333-3333-3333-333333333333', 'b0200000-1111-1111-1111-111111111111', 'Daily Basket', array[]::text[], 'b0200000-2222-2222-2222-222222222222', 19.0632, 72.857, true, null, 4.1, 'grocery', 'https://images.pexels.com/photos/7451964/pexels-photo-7451964.jpeg?auto=compress&cs=tinysrgb&h=650&w=940') on conflict (id) do nothing;
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('b0200000-4444-4444-4444-000000000001', 'b0200000-3333-3333-3333-333333333333', 'Milk 1L', 'Fresh whole milk, 1 litre', 60, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/3735217/pexels-photo-3735217.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000002', 'b0200000-3333-3333-3333-333333333333', 'Brown Bread', 'Whole wheat sandwich loaf', 45, 'Bakery', '{}'::jsonb, true, 'https://images.pexels.com/photos/5657400/pexels-photo-5657400.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000003', 'b0200000-3333-3333-3333-333333333333', 'Farm Eggs (12pc)', 'Dozen fresh farm eggs', 90, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/39648252/pexels-photo-39648252.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000004', 'b0200000-3333-3333-3333-333333333333', 'Basmati Rice 1kg', 'Premium long-grain basmati rice', 120, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/14238105/pexels-photo-14238105.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000005', 'b0200000-3333-3333-3333-333333333333', 'Bananas 1dz', 'Fresh ripe bananas, dozen', 50, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/4399936/pexels-photo-4399936.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000006', 'b0200000-3333-3333-3333-333333333333', 'Tomatoes 1kg', 'Farm-fresh tomatoes', 40, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/36094858/pexels-photo-36094858.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000007', 'b0200000-3333-3333-3333-333333333333', 'Potato Chips', 'Classic salted potato chips', 30, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/13060679/pexels-photo-13060679.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000008', 'b0200000-3333-3333-3333-333333333333', 'Orange Juice 1L', '100% pure orange juice', 110, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/8679336/pexels-photo-8679336.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000009', 'b0200000-3333-3333-3333-333333333333', 'Butter 200g', 'Salted table butter', 90, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/7965940/pexels-photo-7965940.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000010', 'b0200000-3333-3333-3333-333333333333', 'Yogurt Cup 400g', 'Plain set yogurt', 55, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/7474043/pexels-photo-7474043.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000011', 'b0200000-3333-3333-3333-333333333333', 'Whole Wheat Flour 5kg', 'Atta for chapati/roti', 220, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/6287223/pexels-photo-6287223.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000012', 'b0200000-3333-3333-3333-333333333333', 'Toor Dal 1kg', 'Split pigeon peas', 130, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/34940646/pexels-photo-34940646.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000013', 'b0200000-3333-3333-3333-333333333333', 'Sugar 1kg', 'Refined white sugar', 45, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/21582446/pexels-photo-21582446.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000014', 'b0200000-3333-3333-3333-333333333333', 'Cooking Oil 1L', 'Refined sunflower oil', 160, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/4910159/pexels-photo-4910159.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000015', 'b0200000-3333-3333-3333-333333333333', 'Onions 1kg', 'Fresh red onions', 35, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/15754938/pexels-photo-15754938.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000016', 'b0200000-3333-3333-3333-333333333333', 'Potatoes 1kg', 'Fresh potatoes', 30, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/7774212/pexels-photo-7774212.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000017', 'b0200000-3333-3333-3333-333333333333', 'Green Tea Bags 25ct', 'Antioxidant green tea bags', 150, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/34876378/pexels-photo-34876378.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000018', 'b0200000-3333-3333-3333-333333333333', 'Instant Coffee 100g', 'Freeze-dried instant coffee', 220, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/14567766/pexels-photo-14567766.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000019', 'b0200000-3333-3333-3333-333333333333', 'Frozen Peas 500g', 'Green peas, frozen pack', 70, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/33764652/pexels-photo-33764652.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0200000-4444-4444-4444-000000000020', 'b0200000-3333-3333-3333-333333333333', 'Ice Cream Tub 700ml', 'Vanilla ice cream tub', 250, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/11501480/pexels-photo-11501480.jpeg?auto=compress&cs=tinysrgb&h=650&w=940')
on conflict (id) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'b0300000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'green-grocer@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'b0300000-1111-1111-1111-111111111111', 'email', 'b0300000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'b0300000-1111-1111-1111-111111111111', 'email', 'green-grocer@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('b0300000-1111-1111-1111-111111111111', 'vendor', 'Green Grocer Owner', null) on conflict (id) do nothing;
insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values ('b0300000-2222-2222-2222-222222222222', 'b0300000-1111-1111-1111-111111111111', 'store', 'Powai, Mumbai', 19.1176, 72.906, true) on conflict (id) do nothing;
insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, category_type, banner_url) values ('b0300000-3333-3333-3333-333333333333', 'b0300000-1111-1111-1111-111111111111', 'Green Grocer', array[]::text[], 'b0300000-2222-2222-2222-222222222222', 19.1176, 72.906, true, null, 4.4, 'grocery', 'https://images.pexels.com/photos/21044437/pexels-photo-21044437.jpeg?auto=compress&cs=tinysrgb&h=650&w=940') on conflict (id) do nothing;
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('b0300000-4444-4444-4444-000000000001', 'b0300000-3333-3333-3333-333333333333', 'Milk 1L', 'Fresh whole milk, 1 litre', 60, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/3735217/pexels-photo-3735217.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000002', 'b0300000-3333-3333-3333-333333333333', 'Brown Bread', 'Whole wheat sandwich loaf', 45, 'Bakery', '{}'::jsonb, true, 'https://images.pexels.com/photos/5657400/pexels-photo-5657400.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000003', 'b0300000-3333-3333-3333-333333333333', 'Farm Eggs (12pc)', 'Dozen fresh farm eggs', 90, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/39648252/pexels-photo-39648252.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000004', 'b0300000-3333-3333-3333-333333333333', 'Basmati Rice 1kg', 'Premium long-grain basmati rice', 120, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/14238105/pexels-photo-14238105.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000005', 'b0300000-3333-3333-3333-333333333333', 'Bananas 1dz', 'Fresh ripe bananas, dozen', 50, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/4399936/pexels-photo-4399936.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000006', 'b0300000-3333-3333-3333-333333333333', 'Tomatoes 1kg', 'Farm-fresh tomatoes', 40, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/36094858/pexels-photo-36094858.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000007', 'b0300000-3333-3333-3333-333333333333', 'Potato Chips', 'Classic salted potato chips', 30, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/13060679/pexels-photo-13060679.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000008', 'b0300000-3333-3333-3333-333333333333', 'Orange Juice 1L', '100% pure orange juice', 110, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/8679336/pexels-photo-8679336.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000009', 'b0300000-3333-3333-3333-333333333333', 'Butter 200g', 'Salted table butter', 90, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/7965940/pexels-photo-7965940.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000010', 'b0300000-3333-3333-3333-333333333333', 'Yogurt Cup 400g', 'Plain set yogurt', 55, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/7474043/pexels-photo-7474043.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000011', 'b0300000-3333-3333-3333-333333333333', 'Whole Wheat Flour 5kg', 'Atta for chapati/roti', 220, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/6287223/pexels-photo-6287223.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000012', 'b0300000-3333-3333-3333-333333333333', 'Toor Dal 1kg', 'Split pigeon peas', 130, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/34940646/pexels-photo-34940646.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000013', 'b0300000-3333-3333-3333-333333333333', 'Sugar 1kg', 'Refined white sugar', 45, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/21582446/pexels-photo-21582446.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000014', 'b0300000-3333-3333-3333-333333333333', 'Cooking Oil 1L', 'Refined sunflower oil', 160, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/4910159/pexels-photo-4910159.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000015', 'b0300000-3333-3333-3333-333333333333', 'Onions 1kg', 'Fresh red onions', 35, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/15754938/pexels-photo-15754938.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000016', 'b0300000-3333-3333-3333-333333333333', 'Potatoes 1kg', 'Fresh potatoes', 30, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/7774212/pexels-photo-7774212.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000017', 'b0300000-3333-3333-3333-333333333333', 'Green Tea Bags 25ct', 'Antioxidant green tea bags', 150, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/34876378/pexels-photo-34876378.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000018', 'b0300000-3333-3333-3333-333333333333', 'Instant Coffee 100g', 'Freeze-dried instant coffee', 220, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/14567766/pexels-photo-14567766.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000019', 'b0300000-3333-3333-3333-333333333333', 'Frozen Peas 500g', 'Green peas, frozen pack', 70, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/33764652/pexels-photo-33764652.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0300000-4444-4444-4444-000000000020', 'b0300000-3333-3333-3333-333333333333', 'Ice Cream Tub 700ml', 'Vanilla ice cream tub', 250, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/11501480/pexels-photo-11501480.jpeg?auto=compress&cs=tinysrgb&h=650&w=940')
on conflict (id) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'b0400000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'metro-grocery@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'b0400000-1111-1111-1111-111111111111', 'email', 'b0400000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'b0400000-1111-1111-1111-111111111111', 'email', 'metro-grocery@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('b0400000-1111-1111-1111-111111111111', 'vendor', 'Metro Grocery Owner', null) on conflict (id) do nothing;
insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values ('b0400000-2222-2222-2222-222222222222', 'b0400000-1111-1111-1111-111111111111', 'store', 'Malad West, Mumbai', 19.1863, 72.8493, true) on conflict (id) do nothing;
insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, category_type, banner_url) values ('b0400000-3333-3333-3333-333333333333', 'b0400000-1111-1111-1111-111111111111', 'Metro Grocery', array[]::text[], 'b0400000-2222-2222-2222-222222222222', 19.1863, 72.8493, true, null, 3.9, 'grocery', 'https://images.pexels.com/photos/34357798/pexels-photo-34357798.jpeg?auto=compress&cs=tinysrgb&h=650&w=940') on conflict (id) do nothing;
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('b0400000-4444-4444-4444-000000000001', 'b0400000-3333-3333-3333-333333333333', 'Milk 1L', 'Fresh whole milk, 1 litre', 60, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/3735217/pexels-photo-3735217.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000002', 'b0400000-3333-3333-3333-333333333333', 'Brown Bread', 'Whole wheat sandwich loaf', 45, 'Bakery', '{}'::jsonb, true, 'https://images.pexels.com/photos/5657400/pexels-photo-5657400.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000003', 'b0400000-3333-3333-3333-333333333333', 'Farm Eggs (12pc)', 'Dozen fresh farm eggs', 90, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/39648252/pexels-photo-39648252.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000004', 'b0400000-3333-3333-3333-333333333333', 'Basmati Rice 1kg', 'Premium long-grain basmati rice', 120, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/14238105/pexels-photo-14238105.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000005', 'b0400000-3333-3333-3333-333333333333', 'Bananas 1dz', 'Fresh ripe bananas, dozen', 50, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/4399936/pexels-photo-4399936.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000006', 'b0400000-3333-3333-3333-333333333333', 'Tomatoes 1kg', 'Farm-fresh tomatoes', 40, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/36094858/pexels-photo-36094858.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000007', 'b0400000-3333-3333-3333-333333333333', 'Potato Chips', 'Classic salted potato chips', 30, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/13060679/pexels-photo-13060679.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000008', 'b0400000-3333-3333-3333-333333333333', 'Orange Juice 1L', '100% pure orange juice', 110, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/8679336/pexels-photo-8679336.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000009', 'b0400000-3333-3333-3333-333333333333', 'Butter 200g', 'Salted table butter', 90, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/7965940/pexels-photo-7965940.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000010', 'b0400000-3333-3333-3333-333333333333', 'Yogurt Cup 400g', 'Plain set yogurt', 55, 'Dairy', '{}'::jsonb, true, 'https://images.pexels.com/photos/7474043/pexels-photo-7474043.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000011', 'b0400000-3333-3333-3333-333333333333', 'Whole Wheat Flour 5kg', 'Atta for chapati/roti', 220, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/6287223/pexels-photo-6287223.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000012', 'b0400000-3333-3333-3333-333333333333', 'Toor Dal 1kg', 'Split pigeon peas', 130, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/34940646/pexels-photo-34940646.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000013', 'b0400000-3333-3333-3333-333333333333', 'Sugar 1kg', 'Refined white sugar', 45, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/21582446/pexels-photo-21582446.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000014', 'b0400000-3333-3333-3333-333333333333', 'Cooking Oil 1L', 'Refined sunflower oil', 160, 'Staples', '{}'::jsonb, true, 'https://images.pexels.com/photos/4910159/pexels-photo-4910159.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000015', 'b0400000-3333-3333-3333-333333333333', 'Onions 1kg', 'Fresh red onions', 35, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/15754938/pexels-photo-15754938.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000016', 'b0400000-3333-3333-3333-333333333333', 'Potatoes 1kg', 'Fresh potatoes', 30, 'Produce', '{}'::jsonb, true, 'https://images.pexels.com/photos/7774212/pexels-photo-7774212.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000017', 'b0400000-3333-3333-3333-333333333333', 'Green Tea Bags 25ct', 'Antioxidant green tea bags', 150, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/34876378/pexels-photo-34876378.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000018', 'b0400000-3333-3333-3333-333333333333', 'Instant Coffee 100g', 'Freeze-dried instant coffee', 220, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/14567766/pexels-photo-14567766.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000019', 'b0400000-3333-3333-3333-333333333333', 'Frozen Peas 500g', 'Green peas, frozen pack', 70, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/33764652/pexels-photo-33764652.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0400000-4444-4444-4444-000000000020', 'b0400000-3333-3333-3333-333333333333', 'Ice Cream Tub 700ml', 'Vanilla ice cream tub', 250, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/11501480/pexels-photo-11501480.jpeg?auto=compress&cs=tinysrgb&h=650&w=940')
on conflict (id) do nothing;


-- Phase 3 (Content A): Convenience category -- 4 stores, each carrying
-- the same 20-item master catalog.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'b0500000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'quickstop@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'b0500000-1111-1111-1111-111111111111', 'email', 'b0500000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'b0500000-1111-1111-1111-111111111111', 'email', 'quickstop@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('b0500000-1111-1111-1111-111111111111', 'vendor', 'QuickStop Owner', null) on conflict (id) do nothing;
insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values ('b0500000-2222-2222-2222-222222222222', 'b0500000-1111-1111-1111-111111111111', 'store', 'Powai, Mumbai', 19.1176, 72.906, true) on conflict (id) do nothing;
insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, category_type, banner_url) values ('b0500000-3333-3333-3333-333333333333', 'b0500000-1111-1111-1111-111111111111', 'QuickStop', array[]::text[], 'b0500000-2222-2222-2222-222222222222', 19.1176, 72.906, true, null, 4.2, 'convenience', 'https://images.pexels.com/photos/34357798/pexels-photo-34357798.jpeg?auto=compress&cs=tinysrgb&h=650&w=940') on conflict (id) do nothing;
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('b0500000-4444-4444-4444-000000000001', 'b0500000-3333-3333-3333-333333333333', 'Bottled Water 1L', 'Purified drinking water', 20, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/31699476/pexels-photo-31699476.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000002', 'b0500000-3333-3333-3333-333333333333', 'Instant Noodles', 'Spicy instant noodle cup', 25, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/7490494/pexels-photo-7490494.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000003', 'b0500000-3333-3333-3333-333333333333', 'Chocolate Bar', 'Milk chocolate bar', 40, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/8794060/pexels-photo-8794060.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000004', 'b0500000-3333-3333-3333-333333333333', 'Energy Drink', 'Caffeinated energy drink, 250ml', 80, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/17423276/pexels-photo-17423276.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000005', 'b0500000-3333-3333-3333-333333333333', 'Newspaper', 'Daily English newspaper', 10, 'Reading', '{}'::jsonb, true, 'https://images.pexels.com/photos/28273689/pexels-photo-28273689.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000006', 'b0500000-3333-3333-3333-333333333333', 'Chewing Gum', 'Mint chewing gum pack', 15, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/17091666/pexels-photo-17091666.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000007', 'b0500000-3333-3333-3333-333333333333', 'Biscuits Pack', 'Assorted cream biscuits', 35, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/7509697/pexels-photo-7509697.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000008', 'b0500000-3333-3333-3333-333333333333', 'Ice Cream Cup', 'Vanilla ice cream cup, 100ml', 50, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/5217715/pexels-photo-5217715.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000009', 'b0500000-3333-3333-3333-333333333333', 'Potato Wafers', 'Crispy potato wafers', 30, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/34466116/pexels-photo-34466116.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000010', 'b0500000-3333-3333-3333-333333333333', 'Cola Can 300ml', 'Carbonated cola drink', 45, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/8266860/pexels-photo-8266860.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000011', 'b0500000-3333-3333-3333-333333333333', 'Lighter', 'Disposable pocket lighter', 25, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/16004958/pexels-photo-16004958.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000012', 'b0500000-3333-3333-3333-333333333333', 'Umbrella', 'Compact travel umbrella', 250, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/6872204/pexels-photo-6872204.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000013', 'b0500000-3333-3333-3333-333333333333', 'Phone Charging Cable', 'Micro-USB charging cable', 150, 'Electronics', '{}'::jsonb, true, 'https://images.pexels.com/photos/4072683/pexels-photo-4072683.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000014', 'b0500000-3333-3333-3333-333333333333', 'Notebook', '100-page ruled notebook', 40, 'Stationery', '{}'::jsonb, true, 'https://images.pexels.com/photos/12914430/pexels-photo-12914430.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000015', 'b0500000-3333-3333-3333-333333333333', 'Pen Pack', 'Pack of 5 ballpoint pens', 30, 'Stationery', '{}'::jsonb, true, 'https://images.pexels.com/photos/6969328/pexels-photo-6969328.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000016', 'b0500000-3333-3333-3333-333333333333', 'Batteries AA 4pk', 'Alkaline AA batteries', 90, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/7019805/pexels-photo-7019805.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000017', 'b0500000-3333-3333-3333-333333333333', 'Candy Pack', 'Assorted fruit candies', 25, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/8669985/pexels-photo-8669985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000018', 'b0500000-3333-3333-3333-333333333333', 'Popcorn Pack', 'Microwave popcorn, butter flavor', 45, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/6981622/pexels-photo-6981622.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000019', 'b0500000-3333-3333-3333-333333333333', 'Mineral Water 500ml', 'Small bottled water', 15, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/11860562/pexels-photo-11860562.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0500000-4444-4444-4444-000000000020', 'b0500000-3333-3333-3333-333333333333', 'Tissue Pack', 'Pocket tissue pack', 35, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/3873200/pexels-photo-3873200.jpeg?auto=compress&cs=tinysrgb&h=650&w=940')
on conflict (id) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'b0600000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'corner-store@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'b0600000-1111-1111-1111-111111111111', 'email', 'b0600000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'b0600000-1111-1111-1111-111111111111', 'email', 'corner-store@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('b0600000-1111-1111-1111-111111111111', 'vendor', 'Corner Store Owner', null) on conflict (id) do nothing;
insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values ('b0600000-2222-2222-2222-222222222222', 'b0600000-1111-1111-1111-111111111111', 'store', 'Malad West, Mumbai', 19.1863, 72.8493, true) on conflict (id) do nothing;
insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, category_type, banner_url) values ('b0600000-3333-3333-3333-333333333333', 'b0600000-1111-1111-1111-111111111111', 'Corner Store', array[]::text[], 'b0600000-2222-2222-2222-222222222222', 19.1863, 72.8493, true, null, 4, 'convenience', 'https://images.pexels.com/photos/29831547/pexels-photo-29831547.jpeg?auto=compress&cs=tinysrgb&h=650&w=940') on conflict (id) do nothing;
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('b0600000-4444-4444-4444-000000000001', 'b0600000-3333-3333-3333-333333333333', 'Bottled Water 1L', 'Purified drinking water', 20, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/31699476/pexels-photo-31699476.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000002', 'b0600000-3333-3333-3333-333333333333', 'Instant Noodles', 'Spicy instant noodle cup', 25, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/7490494/pexels-photo-7490494.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000003', 'b0600000-3333-3333-3333-333333333333', 'Chocolate Bar', 'Milk chocolate bar', 40, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/8794060/pexels-photo-8794060.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000004', 'b0600000-3333-3333-3333-333333333333', 'Energy Drink', 'Caffeinated energy drink, 250ml', 80, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/17423276/pexels-photo-17423276.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000005', 'b0600000-3333-3333-3333-333333333333', 'Newspaper', 'Daily English newspaper', 10, 'Reading', '{}'::jsonb, true, 'https://images.pexels.com/photos/28273689/pexels-photo-28273689.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000006', 'b0600000-3333-3333-3333-333333333333', 'Chewing Gum', 'Mint chewing gum pack', 15, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/17091666/pexels-photo-17091666.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000007', 'b0600000-3333-3333-3333-333333333333', 'Biscuits Pack', 'Assorted cream biscuits', 35, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/7509697/pexels-photo-7509697.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000008', 'b0600000-3333-3333-3333-333333333333', 'Ice Cream Cup', 'Vanilla ice cream cup, 100ml', 50, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/5217715/pexels-photo-5217715.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000009', 'b0600000-3333-3333-3333-333333333333', 'Potato Wafers', 'Crispy potato wafers', 30, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/34466116/pexels-photo-34466116.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000010', 'b0600000-3333-3333-3333-333333333333', 'Cola Can 300ml', 'Carbonated cola drink', 45, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/8266860/pexels-photo-8266860.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000011', 'b0600000-3333-3333-3333-333333333333', 'Lighter', 'Disposable pocket lighter', 25, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/16004958/pexels-photo-16004958.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000012', 'b0600000-3333-3333-3333-333333333333', 'Umbrella', 'Compact travel umbrella', 250, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/6872204/pexels-photo-6872204.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000013', 'b0600000-3333-3333-3333-333333333333', 'Phone Charging Cable', 'Micro-USB charging cable', 150, 'Electronics', '{}'::jsonb, true, 'https://images.pexels.com/photos/4072683/pexels-photo-4072683.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000014', 'b0600000-3333-3333-3333-333333333333', 'Notebook', '100-page ruled notebook', 40, 'Stationery', '{}'::jsonb, true, 'https://images.pexels.com/photos/12914430/pexels-photo-12914430.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000015', 'b0600000-3333-3333-3333-333333333333', 'Pen Pack', 'Pack of 5 ballpoint pens', 30, 'Stationery', '{}'::jsonb, true, 'https://images.pexels.com/photos/6969328/pexels-photo-6969328.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000016', 'b0600000-3333-3333-3333-333333333333', 'Batteries AA 4pk', 'Alkaline AA batteries', 90, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/7019805/pexels-photo-7019805.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000017', 'b0600000-3333-3333-3333-333333333333', 'Candy Pack', 'Assorted fruit candies', 25, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/8669985/pexels-photo-8669985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000018', 'b0600000-3333-3333-3333-333333333333', 'Popcorn Pack', 'Microwave popcorn, butter flavor', 45, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/6981622/pexels-photo-6981622.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000019', 'b0600000-3333-3333-3333-333333333333', 'Mineral Water 500ml', 'Small bottled water', 15, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/11860562/pexels-photo-11860562.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0600000-4444-4444-4444-000000000020', 'b0600000-3333-3333-3333-333333333333', 'Tissue Pack', 'Pocket tissue pack', 35, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/3873200/pexels-photo-3873200.jpeg?auto=compress&cs=tinysrgb&h=650&w=940')
on conflict (id) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'b0700000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', '247-shop@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'b0700000-1111-1111-1111-111111111111', 'email', 'b0700000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'b0700000-1111-1111-1111-111111111111', 'email', '247-shop@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('b0700000-1111-1111-1111-111111111111', 'vendor', '24/7 Shop Owner', null) on conflict (id) do nothing;
insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values ('b0700000-2222-2222-2222-222222222222', 'b0700000-1111-1111-1111-111111111111', 'store', 'Kandivali, Mumbai', 19.2094, 72.8526, true) on conflict (id) do nothing;
insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, category_type, banner_url) values ('b0700000-3333-3333-3333-333333333333', 'b0700000-1111-1111-1111-111111111111', '24/7 Shop', array[]::text[], 'b0700000-2222-2222-2222-222222222222', 19.2094, 72.8526, true, null, 4.3, 'convenience', 'https://images.pexels.com/photos/38347694/pexels-photo-38347694.jpeg?auto=compress&cs=tinysrgb&h=650&w=940') on conflict (id) do nothing;
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('b0700000-4444-4444-4444-000000000001', 'b0700000-3333-3333-3333-333333333333', 'Bottled Water 1L', 'Purified drinking water', 20, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/31699476/pexels-photo-31699476.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000002', 'b0700000-3333-3333-3333-333333333333', 'Instant Noodles', 'Spicy instant noodle cup', 25, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/7490494/pexels-photo-7490494.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000003', 'b0700000-3333-3333-3333-333333333333', 'Chocolate Bar', 'Milk chocolate bar', 40, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/8794060/pexels-photo-8794060.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000004', 'b0700000-3333-3333-3333-333333333333', 'Energy Drink', 'Caffeinated energy drink, 250ml', 80, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/17423276/pexels-photo-17423276.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000005', 'b0700000-3333-3333-3333-333333333333', 'Newspaper', 'Daily English newspaper', 10, 'Reading', '{}'::jsonb, true, 'https://images.pexels.com/photos/28273689/pexels-photo-28273689.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000006', 'b0700000-3333-3333-3333-333333333333', 'Chewing Gum', 'Mint chewing gum pack', 15, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/17091666/pexels-photo-17091666.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000007', 'b0700000-3333-3333-3333-333333333333', 'Biscuits Pack', 'Assorted cream biscuits', 35, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/7509697/pexels-photo-7509697.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000008', 'b0700000-3333-3333-3333-333333333333', 'Ice Cream Cup', 'Vanilla ice cream cup, 100ml', 50, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/5217715/pexels-photo-5217715.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000009', 'b0700000-3333-3333-3333-333333333333', 'Potato Wafers', 'Crispy potato wafers', 30, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/34466116/pexels-photo-34466116.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000010', 'b0700000-3333-3333-3333-333333333333', 'Cola Can 300ml', 'Carbonated cola drink', 45, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/8266860/pexels-photo-8266860.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000011', 'b0700000-3333-3333-3333-333333333333', 'Lighter', 'Disposable pocket lighter', 25, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/16004958/pexels-photo-16004958.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000012', 'b0700000-3333-3333-3333-333333333333', 'Umbrella', 'Compact travel umbrella', 250, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/6872204/pexels-photo-6872204.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000013', 'b0700000-3333-3333-3333-333333333333', 'Phone Charging Cable', 'Micro-USB charging cable', 150, 'Electronics', '{}'::jsonb, true, 'https://images.pexels.com/photos/4072683/pexels-photo-4072683.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000014', 'b0700000-3333-3333-3333-333333333333', 'Notebook', '100-page ruled notebook', 40, 'Stationery', '{}'::jsonb, true, 'https://images.pexels.com/photos/12914430/pexels-photo-12914430.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000015', 'b0700000-3333-3333-3333-333333333333', 'Pen Pack', 'Pack of 5 ballpoint pens', 30, 'Stationery', '{}'::jsonb, true, 'https://images.pexels.com/photos/6969328/pexels-photo-6969328.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000016', 'b0700000-3333-3333-3333-333333333333', 'Batteries AA 4pk', 'Alkaline AA batteries', 90, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/7019805/pexels-photo-7019805.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000017', 'b0700000-3333-3333-3333-333333333333', 'Candy Pack', 'Assorted fruit candies', 25, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/8669985/pexels-photo-8669985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000018', 'b0700000-3333-3333-3333-333333333333', 'Popcorn Pack', 'Microwave popcorn, butter flavor', 45, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/6981622/pexels-photo-6981622.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000019', 'b0700000-3333-3333-3333-333333333333', 'Mineral Water 500ml', 'Small bottled water', 15, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/11860562/pexels-photo-11860562.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0700000-4444-4444-4444-000000000020', 'b0700000-3333-3333-3333-333333333333', 'Tissue Pack', 'Pocket tissue pack', 35, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/3873200/pexels-photo-3873200.jpeg?auto=compress&cs=tinysrgb&h=650&w=940')
on conflict (id) do nothing;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, created_at, updated_at) values ('00000000-0000-0000-0000-000000000000', 'b0800000-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'metro-mart-express@foodhub.local', crypt('demo1234', gen_salt('bf')), now(), '', '', '', '', '{"provider":"email","providers":["email"]}'::jsonb, now(), now()) on conflict (id) do nothing;
insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at) values (gen_random_uuid(), 'b0800000-1111-1111-1111-111111111111', 'email', 'b0800000-1111-1111-1111-111111111111', jsonb_build_object('sub', 'b0800000-1111-1111-1111-111111111111', 'email', 'metro-mart-express@foodhub.local'), now(), now()) on conflict (provider_id, provider) do nothing;
insert into public.users (id, role, full_name, phone) values ('b0800000-1111-1111-1111-111111111111', 'vendor', 'Metro Mart Express Owner', null) on conflict (id) do nothing;
insert into public.addresses (id, user_id, label, line1, lat, lng, is_default) values ('b0800000-2222-2222-2222-222222222222', 'b0800000-1111-1111-1111-111111111111', 'store', 'Dadar, Mumbai', 19.0178, 72.8478, true) on conflict (id) do nothing;
insert into public.stores (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating, category_type, banner_url) values ('b0800000-3333-3333-3333-333333333333', 'b0800000-1111-1111-1111-111111111111', 'Metro Mart Express', array[]::text[], 'b0800000-2222-2222-2222-222222222222', 19.0178, 72.8478, true, null, 3.9, 'convenience', 'https://images.pexels.com/photos/36981899/pexels-photo-36981899.jpeg?auto=compress&cs=tinysrgb&h=650&w=940') on conflict (id) do nothing;
insert into public.products (id, store_id, name, description, price, category, product_attributes, is_available, image_url) values
  ('b0800000-4444-4444-4444-000000000001', 'b0800000-3333-3333-3333-333333333333', 'Bottled Water 1L', 'Purified drinking water', 20, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/31699476/pexels-photo-31699476.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000002', 'b0800000-3333-3333-3333-333333333333', 'Instant Noodles', 'Spicy instant noodle cup', 25, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/7490494/pexels-photo-7490494.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000003', 'b0800000-3333-3333-3333-333333333333', 'Chocolate Bar', 'Milk chocolate bar', 40, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/8794060/pexels-photo-8794060.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000004', 'b0800000-3333-3333-3333-333333333333', 'Energy Drink', 'Caffeinated energy drink, 250ml', 80, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/17423276/pexels-photo-17423276.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000005', 'b0800000-3333-3333-3333-333333333333', 'Newspaper', 'Daily English newspaper', 10, 'Reading', '{}'::jsonb, true, 'https://images.pexels.com/photos/28273689/pexels-photo-28273689.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000006', 'b0800000-3333-3333-3333-333333333333', 'Chewing Gum', 'Mint chewing gum pack', 15, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/17091666/pexels-photo-17091666.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000007', 'b0800000-3333-3333-3333-333333333333', 'Biscuits Pack', 'Assorted cream biscuits', 35, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/7509697/pexels-photo-7509697.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000008', 'b0800000-3333-3333-3333-333333333333', 'Ice Cream Cup', 'Vanilla ice cream cup, 100ml', 50, 'Frozen', '{}'::jsonb, true, 'https://images.pexels.com/photos/5217715/pexels-photo-5217715.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000009', 'b0800000-3333-3333-3333-333333333333', 'Potato Wafers', 'Crispy potato wafers', 30, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/34466116/pexels-photo-34466116.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000010', 'b0800000-3333-3333-3333-333333333333', 'Cola Can 300ml', 'Carbonated cola drink', 45, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/8266860/pexels-photo-8266860.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000011', 'b0800000-3333-3333-3333-333333333333', 'Lighter', 'Disposable pocket lighter', 25, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/16004958/pexels-photo-16004958.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000012', 'b0800000-3333-3333-3333-333333333333', 'Umbrella', 'Compact travel umbrella', 250, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/6872204/pexels-photo-6872204.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000013', 'b0800000-3333-3333-3333-333333333333', 'Phone Charging Cable', 'Micro-USB charging cable', 150, 'Electronics', '{}'::jsonb, true, 'https://images.pexels.com/photos/4072683/pexels-photo-4072683.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000014', 'b0800000-3333-3333-3333-333333333333', 'Notebook', '100-page ruled notebook', 40, 'Stationery', '{}'::jsonb, true, 'https://images.pexels.com/photos/12914430/pexels-photo-12914430.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000015', 'b0800000-3333-3333-3333-333333333333', 'Pen Pack', 'Pack of 5 ballpoint pens', 30, 'Stationery', '{}'::jsonb, true, 'https://images.pexels.com/photos/6969328/pexels-photo-6969328.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000016', 'b0800000-3333-3333-3333-333333333333', 'Batteries AA 4pk', 'Alkaline AA batteries', 90, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/7019805/pexels-photo-7019805.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000017', 'b0800000-3333-3333-3333-333333333333', 'Candy Pack', 'Assorted fruit candies', 25, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/8669985/pexels-photo-8669985.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000018', 'b0800000-3333-3333-3333-333333333333', 'Popcorn Pack', 'Microwave popcorn, butter flavor', 45, 'Snacks', '{}'::jsonb, true, 'https://images.pexels.com/photos/6981622/pexels-photo-6981622.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000019', 'b0800000-3333-3333-3333-333333333333', 'Mineral Water 500ml', 'Small bottled water', 15, 'Beverages', '{}'::jsonb, true, 'https://images.pexels.com/photos/11860562/pexels-photo-11860562.jpeg?auto=compress&cs=tinysrgb&h=650&w=940'),
  ('b0800000-4444-4444-4444-000000000020', 'b0800000-3333-3333-3333-333333333333', 'Tissue Pack', 'Pocket tissue pack', 35, 'Essentials', '{}'::jsonb, true, 'https://images.pexels.com/photos/3873200/pexels-photo-3873200.jpeg?auto=compress&cs=tinysrgb&h=650&w=940')
on conflict (id) do nothing;

