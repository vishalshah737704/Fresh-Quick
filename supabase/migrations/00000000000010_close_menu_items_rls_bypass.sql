-- Closes a leftover RLS write-policy bypass on menu_items, found live
-- during Phase 6's full-migration audit (2026-09-25). menu_items writes
-- have gone through service-role app/api/vendor/menu-items/* routes since
-- Phase 4, but migration 7's vendor_can_insert/update/delete_own_menu_items
-- policies were never removed — a vendor could bypass the route's own
-- validation (allowed image host, price > 0, integer-paise rounding) via
-- direct PostgREST with their own session token. Same bug class already
-- fixed for orders/restaurants in Phase 4's final review and for
-- delivery_partners in Phase 5's; menu_items was the one instance this
-- audit still found live. Damage was always scoped to the vendor's own
-- restaurant, never a cross-tenant leak, but the policies are unused
-- (every real write goes through the service-role route) so there's no
-- reason to keep them per the "no RLS write policy on a service-role-only
-- table" rule.

drop policy if exists "vendor_can_insert_own_menu_items" on public.menu_items;
drop policy if exists "vendor_can_update_own_menu_items" on public.menu_items;
drop policy if exists "vendor_can_delete_own_menu_items" on public.menu_items;
