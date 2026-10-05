-- Customer's saved delivery location (mobile location picker). Written only via a service-role API route.
alter table public.users
  add column saved_lat numeric,
  add column saved_lng numeric,
  add column saved_label text;

alter table public.users
  add constraint users_saved_location_valid check (
    (saved_lat is null and saved_lng is null and saved_label is null)
    or (
      saved_lat is not null and saved_lng is not null and saved_label is not null
      and saved_lat between -90 and 90
      and saved_lng between -180 and 180
    )
  );
