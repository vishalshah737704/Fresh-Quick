-- Fixed cuisine taxonomy reference data. This is not demo data (unlike
-- seed.sql's content) -- it's required for the cuisine_tags trigger
-- (migration 003) to function correctly in every environment, including
-- `supabase db push` and `db reset --no-seed`, which don't run seed.sql.
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
