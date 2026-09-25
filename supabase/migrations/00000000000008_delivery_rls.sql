-- Phase 5: delivery-partner RLS. No write policies here — every write to
-- delivery_partners and orders (for delivery purposes) goes through a
-- service-role API route (see lib/delivery-auth.ts and app/api/delivery/*),
-- matching the Phase 4 lesson that an unused RLS write policy is a live
-- direct-PostgREST bypass, not defense in depth.

-- Phase 1's stub policy let ANY authenticated user read ANY delivery
-- partner's row, including live lat/lng — never dropped when later phases
-- tightened other tables (Phase 3 tightened users/addresses/orders/payments,
-- Phase 4 tightened order_items, but delivery_partners was untouched until
-- now). Confirmed live via Phase 5 verification: an unrelated customer
-- could read another customer's assigned partner's current_lat/current_lng.
drop policy if exists "stub_allow_authenticated_read" on public.delivery_partners;

create policy "delivery_can_read_own_partner_row" on public.delivery_partners
  for select using (auth.uid() = user_id);

create policy "customer_can_read_assigned_partner_location" on public.delivery_partners
  for select using (
    exists (
      select 1 from public.orders
      where orders.delivery_partner_id = delivery_partners.user_id
      and orders.customer_id = auth.uid()
    )
  );

create policy "delivery_can_read_own_assigned_orders" on public.orders
  for select using (auth.uid() = delivery_partner_id);
