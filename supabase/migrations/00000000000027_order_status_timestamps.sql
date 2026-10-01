-- Sub-project B: when each order reached accepted / picked_up / delivered.
-- One BEFORE UPDATE trigger stamps the column on the status change itself,
-- so every writer (vendor/delivery/internal routes, admin, n8n) is covered
-- without editing any route. Old orders stay null (UI renders nothing).
alter table public.orders add column accepted_at timestamptz;
alter table public.orders add column picked_up_at timestamptz;
alter table public.orders add column delivered_at timestamptz;

create or replace function public.orders_stamp_status_times()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'accepted' and new.accepted_at is null then
      new.accepted_at := now();
    elsif new.status = 'picked_up' and new.picked_up_at is null then
      new.picked_up_at := now();
    elsif new.status = 'delivered' and new.delivered_at is null then
      new.delivered_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_stamp_status_times on public.orders;
create trigger orders_stamp_status_times
  before update of status on public.orders
  for each row execute function public.orders_stamp_status_times();
