-- Replace permissive read-all stub policies with owner-only policies now
-- that real customer PII (names, addresses, orders, payments) exists.

drop policy if exists "stub_allow_authenticated_read" on public.users;
create policy "owner_can_read_own_profile" on public.users
  for select using (auth.uid() = id);

drop policy if exists "stub_allow_authenticated_read" on public.addresses;
create policy "owner_can_read_own_addresses" on public.addresses
  for select using (auth.uid() = user_id);

drop policy if exists "stub_allow_authenticated_read" on public.orders;
create policy "owner_can_read_own_orders" on public.orders
  for select using (auth.uid() = customer_id);

drop policy if exists "stub_allow_authenticated_read" on public.payments;
create policy "owner_can_read_own_payments" on public.payments
  for select using (
    exists (
      select 1 from public.orders
      where orders.id = payments.order_id
      and orders.customer_id = auth.uid()
    )
  );
