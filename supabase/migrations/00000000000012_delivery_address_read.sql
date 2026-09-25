-- Delivery partner can read the delivery address for an order currently
-- assigned to them, scoped to active statuses only (mirrors the
-- customer_can_read_assigned_partner_location expiry pattern in
-- migration 8 — access ends once the order is no longer active).
create policy "delivery_can_read_assigned_order_address" on public.addresses
  for select using (
    exists (
      select 1 from public.orders
      where orders.delivery_address_id = addresses.id
        and orders.delivery_partner_id = auth.uid()
        and orders.status in ('assigned', 'picked_up')
    )
  );
