-- Task 7 final safety-net grep caught a leftover from Task 20's
-- restaurants/menu_items -> stores/products rename: menu_item_option_groups
-- kept its FK column named menu_item_id even though it now references
-- public.products(id) (Postgres renames FKs by OID, not by column name).
-- Renaming for naming consistency with the rest of the products schema.

alter table public.menu_item_option_groups rename column menu_item_id to product_id;
