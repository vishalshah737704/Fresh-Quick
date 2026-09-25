-- Phase 7 n8n automation: Database Webhooks wiring, equivalent to what
-- Studio's Database > Webhooks UI would generate, but tracked in a
-- migration so it survives `supabase db reset`. See
-- docs/n8n-webhook-setup.md section 2 for the target table.
create extension if not exists pg_net with schema extensions;

create trigger n8n_order_placed
  after insert on public.orders
  for each row
  execute function supabase_functions.http_request(
    'http://host.docker.internal:5678/webhook/foodhub/order-placed',
    'POST',
    '{"Content-Type":"application/json","X-Internal-Secret":"local-dev-secret-value"}',
    '{}',
    '5000'
  );

create trigger n8n_payment_created
  after insert on public.payments
  for each row
  execute function supabase_functions.http_request(
    'http://host.docker.internal:5678/webhook/foodhub/payment-created',
    'POST',
    '{"Content-Type":"application/json","X-Internal-Secret":"local-dev-secret-value"}',
    '{}',
    '5000'
  );

create trigger n8n_order_status_changed
  after update of status on public.orders
  for each row
  execute function supabase_functions.http_request(
    'http://host.docker.internal:5678/webhook/foodhub/order-status-changed',
    'POST',
    '{"Content-Type":"application/json","X-Internal-Secret":"local-dev-secret-value"}',
    '{}',
    '5000'
  );

create trigger n8n_order_ready
  after update of status on public.orders
  for each row
  execute function supabase_functions.http_request(
    'http://host.docker.internal:5678/webhook/foodhub/order-ready',
    'POST',
    '{"Content-Type":"application/json","X-Internal-Secret":"local-dev-secret-value"}',
    '{}',
    '5000'
  );

create trigger n8n_order_delivery_status_changed
  after update of status on public.orders
  for each row
  execute function supabase_functions.http_request(
    'http://host.docker.internal:5678/webhook/foodhub/order-delivery-status-changed',
    'POST',
    '{"Content-Type":"application/json","X-Internal-Secret":"local-dev-secret-value"}',
    '{}',
    '5000'
  );
