-- Phase 4: vendor-scoped RLS. Vendors may read/write only rows tied to a
-- restaurant they own (restaurants.owner_id = auth.uid()).

-- restaurants: vendor can read/update/insert their own row(s).
drop policy if exists "stub_allow_authenticated_read" on public.restaurants;
create policy "public_can_read_restaurants" on public.restaurants
  for select using (true);
create policy "vendor_can_insert_own_restaurant" on public.restaurants
  for insert with check (auth.uid() = owner_id);
create policy "vendor_can_update_own_restaurant" on public.restaurants
  for update using (auth.uid() = owner_id);

-- menu_items: public read (unchanged), vendor can write only their own
-- restaurant's items.
drop policy if exists "stub_allow_authenticated_read" on public.menu_items;
create policy "public_can_read_menu_items" on public.menu_items
  for select using (true);
create policy "vendor_can_insert_own_menu_items" on public.menu_items
  for insert with check (
    exists (
      select 1 from public.restaurants
      where restaurants.id = menu_items.restaurant_id
      and restaurants.owner_id = auth.uid()
    )
  );
create policy "vendor_can_update_own_menu_items" on public.menu_items
  for update using (
    exists (
      select 1 from public.restaurants
      where restaurants.id = menu_items.restaurant_id
      and restaurants.owner_id = auth.uid()
    )
  );
create policy "vendor_can_delete_own_menu_items" on public.menu_items
  for delete using (
    exists (
      select 1 from public.restaurants
      where restaurants.id = menu_items.restaurant_id
      and restaurants.owner_id = auth.uid()
    )
  );

-- orders: customers already own-read (Phase 3); add vendor own-restaurant
-- read + status-only update.
create policy "vendor_can_read_own_restaurant_orders" on public.orders
  for select using (
    exists (
      select 1 from public.restaurants
      where restaurants.id = orders.restaurant_id
      and restaurants.owner_id = auth.uid()
    )
  );
create policy "vendor_can_update_own_restaurant_orders" on public.orders
  for update using (
    exists (
      select 1 from public.restaurants
      where restaurants.id = orders.restaurant_id
      and restaurants.owner_id = auth.uid()
    )
  );

-- order_items: close the Phase 1 permissive stub. Customers may read line
-- items of their own orders; vendors may read line items of orders placed
-- against a restaurant they own.
drop policy if exists "stub_allow_authenticated_read" on public.order_items;
create policy "owner_can_read_own_order_items" on public.order_items
  for select using (
    exists (
      select 1 from public.orders
      where orders.id = order_items.order_id
      and orders.customer_id = auth.uid()
    )
  );
create policy "vendor_can_read_own_restaurant_order_items" on public.order_items
  for select using (
    exists (
      select 1 from public.orders
      join public.restaurants on restaurants.id = orders.restaurant_id
      where orders.id = order_items.order_id
      and restaurants.owner_id = auth.uid()
    )
  );
