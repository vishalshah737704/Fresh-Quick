-- C1: ratings and reviews. Written only through service-role API routes and the
-- security-definer functions below, so RLS is on with NO policies (an unused write
-- policy would be a direct PostgREST bypass). The old "authenticated can read" policy
-- from migration 11 is dropped: public reads go through allow-listed routes.

drop policy if exists "stub_allow_authenticated_read_reviews" on public.reviews;
drop policy if exists "stub_allow_authenticated_read" on public.reviews;

alter table public.reviews
  add column status text not null default 'visible' check (status in ('visible', 'hidden')),
  add column hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 300),
  add column hidden_at timestamptz,
  add column photo_path text,
  add column vendor_reply text check (vendor_reply is null or char_length(vendor_reply) <= 600),
  add column vendor_reply_at timestamptz,
  add column reported_at timestamptz,
  add column report_reason text check (report_reason is null or char_length(report_reason) <= 300),
  add column reported_by text check (reported_by is null or reported_by in ('customer', 'vendor')),
  add constraint reviews_comment_len check (comment is null or char_length(comment) <= 1000);

-- Orders already outlive their customer (migration 28); a public review does too.
alter table public.reviews alter column customer_id drop not null;
alter table public.reviews drop constraint reviews_customer_id_fkey;
alter table public.reviews
  add constraint reviews_customer_id_fkey
  foreign key (customer_id) references public.users (id) on delete set null;

create index idx_reviews_store_status_created on public.reviews (store_id, status, created_at desc);
create index idx_reviews_reported on public.reviews (reported_at) where reported_at is not null;

create table public.review_dishes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  stars integer not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  unique (review_id, product_id)
);
create index idx_review_dishes_product on public.review_dishes (product_id);

create table public.review_partner (
  review_id uuid primary key references public.reviews(id) on delete cascade,
  partner_id uuid references public.users(id) on delete set null,
  stars integer not null check (stars between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500)
);
create index idx_review_partner_partner on public.review_partner (partner_id);

alter table public.reviews enable row level security;
alter table public.review_dishes enable row level security;
alter table public.review_partner enable row level security;
revoke all on public.review_dishes, public.review_partner from anon, authenticated;
revoke all on public.reviews from anon, authenticated;

-- Aggregates are integer sums and counts over VISIBLE reviews; stores.rating stays the column everything reads.
alter table public.stores
  add column rating_sum integer not null default 0,
  add column rating_count integer not null default 0,
  add column seed_rating numeric;
update public.stores set seed_rating = rating;
alter table public.products
  add column rating_sum integer not null default 0,
  add column rating_count integer not null default 0;
alter table public.delivery_partners
  add column rating_sum integer not null default 0,
  add column rating_count integer not null default 0;

-- New stores get their entered rating as the seed, so hiding every review falls back to it.
create function public.stores_set_seed_rating() returns trigger language plpgsql as $$
begin
  if new.seed_rating is null then new.seed_rating := new.rating; end if;
  return new;
end $$;
create trigger stores_seed_rating before insert on public.stores
  for each row execute function public.stores_set_seed_rating();

create function public.recompute_store_rating(p_store_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Lock first, compute in a NEW statement: under READ COMMITTED a concurrent review's
  -- recompute then sees our committed row instead of overwriting it with a stale sum.
  perform 1 from public.stores where id = p_store_id for no key update;
  update public.stores s set
    rating_sum = coalesce((select sum(r.rating) from public.reviews r where r.store_id = s.id and r.status = 'visible'), 0),
    rating_count = (select count(*) from public.reviews r where r.store_id = s.id and r.status = 'visible')
  where s.id = p_store_id;
  update public.stores s set
    rating = case when s.rating_count > 0 then round(s.rating_sum::numeric / s.rating_count, 1) else coalesce(s.seed_rating, 0) end
  where s.id = p_store_id;
end $$;

create function public.recompute_product_rating(p_product_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.products where id = p_product_id for no key update;
  update public.products p set
    rating_sum = coalesce((select sum(rd.stars) from public.review_dishes rd join public.reviews r on r.id = rd.review_id
                           where rd.product_id = p.id and r.status = 'visible'), 0),
    rating_count = (select count(*) from public.review_dishes rd join public.reviews r on r.id = rd.review_id
                    where rd.product_id = p.id and r.status = 'visible')
  where p.id = p_product_id;
end $$;

create function public.recompute_partner_rating(p_partner_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.delivery_partners where user_id = p_partner_id for no key update;
  update public.delivery_partners dp set
    rating_sum = coalesce((select sum(rp.stars) from public.review_partner rp join public.reviews r on r.id = rp.review_id
                           where rp.partner_id = dp.user_id and r.status = 'visible'), 0),
    rating_count = (select count(*) from public.review_partner rp join public.reviews r on r.id = rp.review_id
                    where rp.partner_id = dp.user_id and r.status = 'visible')
  where dp.user_id = p_partner_id;
end $$;

create function public.recompute_review_aggregates(p_review_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
  v_product uuid;
  v_partner uuid;
begin
  select store_id into v_store from public.reviews where id = p_review_id;
  if v_store is null then return; end if;
  perform public.recompute_store_rating(v_store);
  for v_product in select product_id from public.review_dishes where review_id = p_review_id order by product_id loop
    perform public.recompute_product_rating(v_product);
  end loop;
  select partner_id into v_partner from public.review_partner where review_id = p_review_id;
  if v_partner is not null then perform public.recompute_partner_rating(v_partner); end if;
end $$;

-- Deleting a review (for example through the orders cascade) must also refresh the aggregates.
-- Each trigger recomputes its own target from current table state, so cascade firing order does not matter.
create function public.reviews_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_store_rating(old.store_id);
  return null;
end $$;
create function public.review_dishes_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_product_rating(old.product_id);
  return null;
end $$;
create function public.review_partner_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.partner_id is not null then perform public.recompute_partner_rating(old.partner_id); end if;
  return null;
end $$;
create trigger reviews_recompute_on_delete after delete on public.reviews
  for each row execute function public.reviews_deleted();
create trigger review_dishes_recompute_on_delete after delete on public.review_dishes
  for each row execute function public.review_dishes_deleted();
create trigger review_partner_recompute_on_delete after delete on public.review_partner
  for each row execute function public.review_partner_deleted();

create function public.reviews_status_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.recompute_review_aggregates(new.id);
  return new;
end $$;
create trigger reviews_recompute_on_status after update of status on public.reviews
  for each row when (old.status is distinct from new.status)
  execute function public.reviews_status_changed();

create function public.create_review(
  p_order_id uuid,
  p_customer_id uuid,
  p_store_stars integer,
  p_store_comment text,
  p_photo_path text,
  p_dishes jsonb,
  p_partner_stars integer,
  p_partner_comment text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_order record;
  v_review_id uuid;
  v_dish jsonb;
begin
  select id, customer_id, store_id, status, delivery_partner_id into v_order
    from public.orders where id = p_order_id for update;
  if not found or v_order.customer_id is distinct from p_customer_id then
    raise exception 'review_order_not_found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'delivered' then
    raise exception 'review_not_delivered' using errcode = 'P0001';
  end if;

  -- the unique (order_id) constraint raises 23505 for a second review
  insert into public.reviews (order_id, customer_id, store_id, rating, comment, photo_path)
    values (p_order_id, p_customer_id, v_order.store_id, p_store_stars, p_store_comment, p_photo_path)
    returning id into v_review_id;

  for v_dish in select * from jsonb_array_elements(coalesce(p_dishes, '[]'::jsonb)) loop
    if not exists (select 1 from public.order_items oi
                   where oi.order_id = p_order_id and oi.product_id = (v_dish ->> 'product_id')::uuid) then
      raise exception 'review_dish_not_in_order' using errcode = 'P0001';
    end if;
    insert into public.review_dishes (review_id, product_id, stars, comment)
      values (v_review_id, (v_dish ->> 'product_id')::uuid, (v_dish ->> 'stars')::integer, nullif(v_dish ->> 'comment', ''));
  end loop;

  if p_partner_stars is not null then
    if v_order.delivery_partner_id is null then
      raise exception 'review_no_partner' using errcode = 'P0001';
    end if;
    insert into public.review_partner (review_id, partner_id, stars, comment)
      values (v_review_id, v_order.delivery_partner_id, p_partner_stars, p_partner_comment);
  end if;

  perform public.recompute_review_aggregates(v_review_id);
  return v_review_id;
end $$;

revoke all on function public.create_review(uuid, uuid, integer, text, text, jsonb, integer, text) from public, anon, authenticated;
grant execute on function public.create_review(uuid, uuid, integer, text, text, jsonb, integer, text) to service_role;
revoke all on function public.recompute_store_rating(uuid), public.recompute_product_rating(uuid), public.recompute_partner_rating(uuid),
  public.reviews_deleted(), public.review_dishes_deleted(), public.review_partner_deleted(),
  public.stores_set_seed_rating(), public.reviews_status_changed() from public, anon, authenticated;
grant execute on function public.recompute_store_rating(uuid), public.recompute_product_rating(uuid), public.recompute_partner_rating(uuid) to service_role;
revoke all on function public.recompute_review_aggregates(uuid) from public, anon, authenticated;
grant execute on function public.recompute_review_aggregates(uuid) to service_role;

-- Private bucket for review photos: no storage policies, so only the service role reads or writes.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('review-photos', 'review-photos', false, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;
