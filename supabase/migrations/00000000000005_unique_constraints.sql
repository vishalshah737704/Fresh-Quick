-- Enforce the spec's 1-to-1 relationships that were previously unenforced.

-- One review per order.
alter table public.reviews add constraint reviews_order_id_unique unique (order_id);

-- At most one *successful* payment per order. A blanket unique constraint on
-- order_id would break legitimate retry rows (failed/pending) after a
-- failed mock payment, so this is a partial unique index scoped to
-- status = 'success' instead.
create unique index payments_order_id_success_unique on public.payments (order_id) where status = 'success';
