-- Admin "Automatic order acceptance" demo switch + the n8n triggers that drive it (workflow 09).
create table public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- RLS on with NO policies: only the service-role API routes read or write this table.
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

insert into public.app_settings (key, value)
values ('auto_order_acceptance', '{"enabled": false}'::jsonb);

create trigger n8n_auto_order_step_orders
  after update of status on public.orders
  for each row
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/auto-order-step');

create trigger n8n_auto_order_step_payments
  after insert or update of status on public.payments
  for each row
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/auto-order-step');
