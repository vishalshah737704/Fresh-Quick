-- Phase 6: admin oversight. Table policy audit before adding anything
-- (per the CLAUDE.md rule added after Phase 5's live-verification find):
--   orders: customer own-read (m6), vendor own-restaurant read (m7),
--     delivery own-assigned read (m8).
--   restaurants: public read (m7), vendor own insert/update removed in
--     Phase 4's final review (unused, was a bypass) -- still just public
--     read. No admin-specific policy needed since it's already public
--     read; admin writes go through service-role routes only.
--   delivery_partners: own-row read (m8), customer-assigned-active read
--     (m8, status-scoped after Phase 5's final review).
--   users: owner-only read (m6).
-- No admin read policies added on orders/delivery_partners/users: a
-- self-referencing "is the caller an admin" policy on users caused
-- infinite recursion (Postgres can't evaluate a policy on a table that
-- queries that same table), found in Phase 6's final review. Every
-- /api/admin/* route already reads via the service-role client
-- (supabaseServer, which bypasses RLS), and the admin login/session only
-- ever reads the CALLING admin's own users row, already covered by the
-- existing owner_can_read_own_profile policy (m6). No admin write
-- policies added anywhere -- every admin write goes through a
-- service-role route in app/api/admin/*.

alter table public.restaurants
  add column if not exists is_suspended boolean not null default false;
