-- Piece 5 (cart redesign): a whole-order note, distinct from
-- order_items.special_instructions (per-line notes, piece 4).
alter table public.orders add column delivery_note text;

-- Drop the old function signature to replace it with the new one
-- (signature changed: added p_delivery_note parameter)
drop function if exists public.checkout_place_order(
  uuid, text, text, numeric, numeric, uuid, numeric, numeric, numeric, jsonb, text, text, numeric, timestamptz
);

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
  p_items jsonb, -- array of {menu_item_id, quantity, unit_price, special_instructions, options: [{option_id, group_name, option_name, price_delta_paise}]}
  p_payment_method text,
  p_payment_status text,
  p_payment_amount numeric,
  p_payment_paid_at timestamptz,
  p_delivery_note text default null
) returns table (order_id uuid, address_id uuid) as $$
declare
  v_address_id uuid;
  v_order_id uuid;
  v_item jsonb;
  v_order_item_id uuid;
  v_option jsonb;
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

  insert into public.orders (customer_id, restaurant_id, delivery_address_id, status, subtotal, delivery_fee, total, delivery_note)
    values (p_customer_id, p_restaurant_id, v_address_id, 'placed', p_subtotal, p_delivery_fee, p_total, p_delivery_note)
    returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, menu_item_id, quantity, unit_price, special_instructions)
      values (
        v_order_id,
        (v_item->>'menu_item_id')::uuid,
        (v_item->>'quantity')::integer,
        (v_item->>'unit_price')::numeric,
        v_item->>'special_instructions'
      )
      returning id into v_order_item_id;

    for v_option in select * from jsonb_array_elements(coalesce(v_item->'options', '[]'::jsonb))
    loop
      insert into public.order_item_options (order_item_id, menu_item_option_id, group_name, option_name, price_delta_paise)
        values (
          v_order_item_id,
          (v_option->>'option_id')::uuid,
          v_option->>'group_name',
          v_option->>'option_name',
          (v_option->>'price_delta_paise')::integer
        );
    end loop;
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

revoke execute on function public.checkout_place_order from public, anon, authenticated;
grant execute on function public.checkout_place_order to service_role;
