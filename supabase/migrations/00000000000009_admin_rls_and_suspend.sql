-- Phase 6: admin oversight. Table policy audit before adding anything
-- (per the CLAUDE.md rule added after Phase 5's live-verification find):
--   orders: customer own-read (m6), vendor own-restaurant read (m7),
--     delivery own-assigned read (m8). No admin read yet -- adding below.
--   restaurants: public read (m7), vendor own insert/update removed in
--     Phase 4's final review (unused, was a bypass) -- still just public
--     read. No admin-specific policy needed since it's already public
--     read; admin writes go through service-role routes only.
--   delivery_partners: own-row read (m8), customer-assigned-active read
--     (m8, status-scoped after Phase 5's final review). No admin read
--     yet -- adding below.
--   users: owner-only read (m3/m6). No admin read yet -- adding below
--     (needed so admin views can show customer/vendor/partner names).
-- No RLS write policies added anywhere -- every admin write goes through
-- a service-role route in app/api/admin/*.

alter table public.restaurants
  add column if not exists is_suspended boolean not null default false;

create policy "admin_can_read_all_orders" on public.orders
  for select using (
    exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

create policy "admin_can_read_all_delivery_partners" on public.delivery_partners
  for select using (
    exists (select 1 from public.users where users.id = auth.uid() and users.role = 'admin')
  );

create policy "admin_can_read_all_users" on public.users
  for select using (
    exists (select 1 from public.users u2 where u2.id = auth.uid() and u2.role = 'admin')
  );

-- Seed one demo admin account for local testing. This runs in a
-- migration (not seed.sql) because it needs auth.users, which
-- supabase db reset creates before running seed.sql -- matching how
-- Phase 1 seeded its demo vendor via migration-time inserts, not
-- seed.sql, for the same auth-ordering reason.
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
