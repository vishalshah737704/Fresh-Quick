-- Customer phone number captured at checkout so vendors, delivery partners,
-- admins and n8n can reach the recipient. Existing orders get the literal
-- placeholder 'Not provided' (same precedent as migration 23's recipient
-- backfill) so the column can be NOT NULL; the UI treats any value that
-- doesn't start with '+' as plain text.
alter table public.orders add column recipient_phone text;
update public.orders set recipient_phone = 'Not provided' where recipient_phone is null;
alter table public.orders alter column recipient_phone set not null;

-- Appending a parameter changes the function's identity, so the old
-- signature must be dropped (create or replace would leave an ambiguous
-- overload and break the revoke/grant below).
drop function if exists public.checkout_place_order(
  uuid, text, text, text, text, text, text, text, text, numeric, numeric, uuid,
  numeric, numeric, numeric, jsonb, text, numeric, text, text
);

create or replace function public.checkout_place_order(
  p_customer_id uuid,
  p_recipient_name text,
  p_recipient_email text,
  p_recipient_phone text,
  p_address_label text,
  p_address_line1 text,
  p_address_line2 text,
  p_address_city text,
  p_address_state text,
  p_address_pincode text,
  p_address_lat numeric,
  p_address_lng numeric,
  p_store_id uuid,
  p_subtotal numeric,
  p_delivery_fee numeric,
  p_total numeric,
  p_items jsonb, -- array of {product_id, quantity, unit_price, special_instructions, options: [{option_id, group_name, option_name, price_delta_paise}]}
  p_payment_method text,
  p_payment_amount numeric,
  p_payment_reference text,
  p_delivery_note text default null
) returns table (order_id uuid, address_id uuid, payment_id uuid) as $$
declare
  v_address_id uuid;
  v_order_id uuid;
  v_payment_id uuid;
  v_item jsonb;
  v_order_item_id uuid;
  v_option jsonb;
begin
  insert into public.addresses (user_id, label, line1, line2, city, state, pincode, lat, lng, is_default)
    values (
      p_customer_id,
      p_address_label,
      p_address_line1,
      p_address_line2,
      p_address_city,
      p_address_state,
      p_address_pincode,
      p_address_lat,
      p_address_lng,
      false
    )
    returning id into v_address_id;

  insert into public.orders (customer_id, recipient_name, recipient_email, recipient_phone, store_id, delivery_address_id, status, subtotal, delivery_fee, total, delivery_note)
    values (p_customer_id, p_recipient_name, p_recipient_email, p_recipient_phone, p_store_id, v_address_id, 'placed', p_subtotal, p_delivery_fee, p_total, p_delivery_note)
    returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.order_items (order_id, product_id, quantity, unit_price, special_instructions)
      values (
        v_order_id,
        (v_item->>'product_id')::uuid,
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
      'pending',
      p_payment_amount,
      p_payment_reference,
      null
    )
    returning id into v_payment_id;

  return query select v_order_id, v_address_id, v_payment_id;
end;
$$ language plpgsql security definer set search_path = '';

revoke execute on function public.checkout_place_order from public, anon, authenticated;
grant execute on function public.checkout_place_order to service_role;
