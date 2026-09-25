-- Expands the cuisine taxonomy for the Fresh & Quick catalog redesign.
-- Same pattern as migration 4 (fixed reference data, on conflict do
-- nothing, safe to re-run).
insert into public.cuisine_taxonomy (slug, label) values
  ('mexican', 'Mexican'),
  ('thai', 'Thai'),
  ('bakery', 'Bakery'),
  ('healthy', 'Healthy')
on conflict (slug) do nothing;
