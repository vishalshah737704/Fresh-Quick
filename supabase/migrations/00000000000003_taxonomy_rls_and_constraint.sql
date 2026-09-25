-- cuisine_taxonomy table is normally created by seed.sql, but this migration
-- needs it to exist first (to enable RLS on it and to reference it from the
-- trigger below), and migrations always run before seed.sql. Create it here
-- too (idempotent, matches seed.sql's definition); seed.sql's own
-- `create table if not exists` becomes a no-op once this migration has run.
create table if not exists public.cuisine_taxonomy (
  slug text primary key,
  label text not null
);

-- Enable RLS on cuisine_taxonomy; it's public reference data, readable by
-- anyone, no writes exposed (matches the pattern used for restaurants/menu_items).
alter table public.cuisine_taxonomy enable row level security;
drop policy if exists "stub_allow_public_read" on public.cuisine_taxonomy;
create policy "stub_allow_public_read" on public.cuisine_taxonomy for select using (true);

-- Enforce that every tag in restaurants.cuisine_tags exists in
-- cuisine_taxonomy.slug (the taxonomy is fixed, not free text).
--
-- NOTE: this cannot be a CHECK constraint. Postgres does not allow
-- subqueries in CHECK constraints ("cannot use subquery in check
-- constraint") -- verified directly against this stack. A trigger is the
-- correct tool for a cross-table validation like this.
create or replace function public.validate_cuisine_tags()
returns trigger
language plpgsql
as $$
begin
  if new.cuisine_tags is not null and not (
    new.cuisine_tags <@ (select array_agg(slug) from public.cuisine_taxonomy)
  ) then
    raise exception 'cuisine_tags contains a slug not present in cuisine_taxonomy: %', new.cuisine_tags;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_cuisine_tags on public.restaurants;
create trigger trg_validate_cuisine_tags
  before insert or update of cuisine_tags on public.restaurants
  for each row
  execute function public.validate_cuisine_tags();
