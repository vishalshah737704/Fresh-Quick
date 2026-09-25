-- Wraps the checkout route's 4 sequential inserts (address, order,
-- order_items, payment) in a single transaction so a partial failure
-- can't orphan rows. Pre-insert validation (price re-check, reprice
-- guard, restaurant-open check) and the mock-payment success/failure
-- determination stay in the TypeScript route — this function only
-- performs the already-validated writes atomically. The follow-up
-- "mark order cancelled after payment failure" update also stays in
-- the route as a separate statement after this RPC returns (unchanged
-- from current behavior).
create or replace function public.checkout_place_order(
  p_customer_id uuid,
  p_address_label text,
  p_address_line1 text,
  p_address_lat numeric,
  p_address_lng numeric,
  p_restaurant_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_total numeric,
  p_items jsonb, -- array of {menu_item_id, quantity, unit_price}
  p_payment_method text,
  p_payment_status text,
  p_payment_amount numeric,
  p_payment_paid_at timestamptz
) returns table (order_id uuid, address_id uuid) as $$
declare
  v_address_id uuid;
  v_order_id uuid;
  v_item jsonb;
begin
  insert into public.addresses (user_id, label, line1, lat, lng, is_default)
    values (
      p_customer_id,
      p_address_label,
      p_address_line1,
      p_address_lat,
      p_address_lng,
      false
    )
    returning id into v_address_id;

  insert into public.orders (customer_id, restaurant_id, delivery_address_id, status, subtotal, delivery_fee, total)
    values (p_customer_id, p_restaurant_id, v_address_id, 'placed', p_subtotal, p_delivery_fee, p_total)
    returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price)
      values (
        v_order_id,
        (v_item->>'menu_item_id')::uuid,
        (v_item->>'quantity')::integer,
        (v_item->>'unit_price')::numeric
      );
  end loop;

  insert into public.payments (order_id, method, status, amount, mock_reference, paid_at)
    values (
      v_order_id,
      p_payment_method,
      p_payment_status,
      p_payment_amount,
      'MOCK-' || left(v_order_id::text, 8),
      p_payment_paid_at
    );

  return query select v_order_id, v_address_id;
end;
$$ language plpgsql security definer set search_path = '';

-- Supabase's default privileges auto-grant execute on new functions to
-- anon/authenticated/service_role; explicitly revoke from public and
-- anon (an anon-key session must never be able to call this and bypass
-- RLS via the anon role) and grant only to authenticated. service_role
-- keeps its default execute grant since this route's own server-side
-- client (lib/supabase-server.ts) authenticates as service_role and
-- must still be able to call this function.
revoke execute on function public.checkout_place_order from public;
revoke execute on function public.checkout_place_order from anon;
grant execute on function public.checkout_place_order to authenticated;
