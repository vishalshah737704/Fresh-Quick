-- Phase 7 n8n automation: Database Webhooks wiring, equivalent to what
-- Studio's Database > Webhooks UI would generate, but tracked in a
-- migration so it survives `supabase db reset`. See
-- docs/n8n-webhook-setup.md section 2 for the target table.
--
-- No secret value lives in this file. The shared secret is read at
-- request time from the `app.n8n_internal_secret` Postgres setting,
-- which must be set locally (not committed) before these triggers can
-- reach n8n — see docs/n8n-webhook-setup.md section 1.
create extension if not exists pg_net with schema extensions;

create or replace function public.n8n_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := tg_argv[0],
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Internal-Secret', current_setting('app.n8n_internal_secret', true)
    ),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;

create trigger n8n_order_placed
  after insert on public.orders
  for each row
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/order-placed');

create trigger n8n_payment_created
  after insert on public.payments
  for each row
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/payment-created');

create trigger n8n_order_status_changed
  after update of status on public.orders
  for each row
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/order-status-changed');

create trigger n8n_order_ready
  after update of status on public.orders
  for each row
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/order-ready');

create trigger n8n_order_delivery_status_changed
  after update of status on public.orders
  for each row
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/order-delivery-status-changed');
