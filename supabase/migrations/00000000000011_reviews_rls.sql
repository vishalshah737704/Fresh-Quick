-- Close the Phase 1 stub: reviews had `using (true)` letting anon/any
-- authenticated user read every review row including customer_id.
-- No review-writing feature exists yet (table has zero rows), so this
-- is a minimal tightening to authenticated-only, matching the pattern
-- other un-built-out tables use before their owning feature ships.
-- Full owner/public-scoped policy is still deferred until a real
-- review feature is built (see MEMORY.md).
drop policy "stub_allow_authenticated_read" on public.reviews;

create policy "stub_allow_authenticated_read_reviews" on public.reviews
  for select using (auth.role() = 'authenticated');
