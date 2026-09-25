-- Uber Eats-style redesign piece 2: real per-restaurant delivery fee and
-- optional promo text, replacing the flat DELIVERY_FEE_RUPEES constant.
-- 3000 paise = Rs 30, matching today's flat fee exactly so every existing
-- restaurant's checkout total is unchanged until a vendor edits it.
alter table public.restaurants
  add column delivery_fee_paise integer not null default 3000,
  add column promo_text text;

alter table public.restaurants
  add constraint restaurants_delivery_fee_paise_check check (delivery_fee_paise >= 0);
