-- One default address per user (customer sign-up writes the registration address as the default).
create unique index if not exists addresses_one_default_per_user
  on public.addresses (user_id)
  where is_default and user_id is not null;
