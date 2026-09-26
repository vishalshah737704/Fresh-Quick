-- Adds a vendor "reject" action (mirrors "accept" but ends the order
-- instead of advancing it) and a "refunded" payment status for when a
-- rejected order's already-successful mock payment is reversed.
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('placed', 'accepted', 'preparing', 'ready', 'assigned', 'picked_up', 'delivered', 'cancelled', 'rejected'));

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check check (status in
  ('pending', 'success', 'failed', 'refunded'));
