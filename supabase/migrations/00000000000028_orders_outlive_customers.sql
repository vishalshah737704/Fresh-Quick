-- Let orders (and the delivery addresses they point at) outlive the customer
-- account that placed them. Until now orders.customer_id was NOT NULL with a
-- NO ACTION foreign key and addresses.user_id was NOT NULL with ON DELETE
-- CASCADE, so no customer who had ever ordered could be deleted, and deleting
-- one would also have tried to delete addresses that orders still reference.
--
-- After this migration, deleting a customer (public.users row, normally via
-- auth.users) keeps every order, order item, payment, address and the
-- recipient name/email/phone snapshot on the order — those rows simply lose
-- their link to a login (customer_id / user_id become NULL).
--
-- No RLS policy is added or changed: the existing customer read policies compare
-- customer_id / user_id to auth.uid(), and a NULL never matches.

alter table public.orders alter column customer_id drop not null;
alter table public.orders drop constraint orders_customer_id_fkey;
alter table public.orders
  add constraint orders_customer_id_fkey
  foreign key (customer_id) references public.users (id) on delete set null;

alter table public.addresses alter column user_id drop not null;
alter table public.addresses drop constraint addresses_user_id_fkey;
alter table public.addresses
  add constraint addresses_user_id_fkey
  foreign key (user_id) references public.users (id) on delete set null;
