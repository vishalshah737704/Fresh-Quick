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

insert into public.restaurants (id, owner_id, name, cuisine_tags, address_id, lat, lng, is_open, avg_prep_minutes, rating) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Demo Kitchen', array['indian','fast_food'], '22222222-2222-2222-2222-222222222222', 19.0760, 72.8777, true, 25, 4.2)
on conflict (id) do nothing;

-- image_url values are real food photos from Pexels (pexels.com), fetched once via
-- the Pexels Search API and hardcoded here rather than called live at runtime —
-- keeps the Pexels API key out of the browser and avoids a network dependency on
-- every `supabase db reset`.
insert into public.menu_items (id, restaurant_id, name, description, price, category, is_veg, is_available, image_url) values
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'Paneer Butter Masala', 'Rich tomato gravy with paneer', 220, 'Main Course', true, true, 'https://images.pexels.com/photos/9609838/pexels-photo-9609838.jpeg?auto=compress&cs=tinysrgb&h=350'),
  ('55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333', 'Veg Fried Rice', 'Wok-tossed rice with vegetables', 150, 'Main Course', true, true, 'https://images.pexels.com/photos/3926124/pexels-photo-3926124.jpeg?auto=compress&cs=tinysrgb&h=350')
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
