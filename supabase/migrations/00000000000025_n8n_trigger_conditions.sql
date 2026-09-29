-- Two related bugs found debugging a live checkout: a payment that failed
-- still triggered a vendor "new order" notification, and n8n's execution
-- log showed workflows 03/04/05 as "Success" for a cancelled order even
-- though nothing happened. Root cause: every order-status trigger fired
-- unconditionally on ANY update of orders.status, relying entirely on
-- each n8n workflow's own internal Filter node to no-op for statuses it
-- doesn't care about -- the Postgres trigger itself never checked.
--
-- Fix: add WHEN clauses so each trigger only fires n8n_notify() (a real
-- network call, 5s timeout) when the new status is actually relevant to
-- that workflow. This matches each workflow's own Filter node condition
-- (n8n/workflows/03/04/05 -- see docs/n8n-webhook-setup.md), so the
-- Postgres side now enforces the same rule the n8n side already assumed.

drop trigger if exists n8n_order_status_changed on public.orders;
create trigger n8n_order_status_changed
  after update of status on public.orders
  for each row
  when (new.status in ('accepted', 'preparing', 'ready'))
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/order-status-changed');

drop trigger if exists n8n_order_ready on public.orders;
create trigger n8n_order_ready
  after update of status on public.orders
  for each row
  when (new.status = 'ready')
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/order-ready');

drop trigger if exists n8n_order_delivery_status_changed on public.orders;
create trigger n8n_order_delivery_status_changed
  after update of status on public.orders
  for each row
  when (new.status in ('picked_up', 'delivered'))
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/order-delivery-status-changed');

-- The other real bug: "01 - Order Placed" (vendor notification) fired on
-- orders INSERT, which always happens before the payment outcome is
-- known (checkout creates the order optimistically, then resolves
-- payment over the next ~10s and cancels the order on failure -- see
-- lib/mock-payment.ts). A vendor got notified of a "new order" for an
-- order that failed payment and was cancelled moments later, with no
-- corresponding "never mind" signal. Move the trigger from orders-insert
-- to payments-status-becomes-success, so the vendor is only ever
-- notified once payment has actually succeeded.
drop trigger if exists n8n_order_placed on public.orders;

drop trigger if exists n8n_payment_success on public.payments;
create trigger n8n_payment_success
  after update of status on public.payments
  for each row
  when (new.status = 'success')
  execute function public.n8n_notify('http://host.docker.internal:5678/webhook/foodhub/order-placed');
