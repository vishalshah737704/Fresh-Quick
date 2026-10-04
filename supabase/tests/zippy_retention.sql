-- Checks public.purge_zippy_chats against fake rows. Everything runs inside a
-- transaction that is rolled back, so nothing persists. Run (local stack only):
--   docker exec -i supabase_db_phase1-scaffold-db psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/zippy_retention.sql
-- Counts are checked for the fake rows only (deltas against a baseline).
begin;

do $$
declare
  uid uuid := gen_random_uuid();
  old_only uuid := gen_random_uuid();
  old_recent uuid := gen_random_uuid();
  empty_29 uuid := gen_random_uuid();
  empty_31 uuid := gen_random_uuid();
  empty_new uuid := gen_random_uuid();
  r record;
  n int;
  orders_before int;
  orders_after int;
  failed boolean;
begin
  insert into auth.users (id, email, aud, role)
  values (uid, 'zippy-retention-test@example.invalid', 'authenticated', 'authenticated');

  insert into public.zippy_conversations (id, user_id, title, created_at) values
    (old_only,   uid, 'RETENTIONTEST old only',          now() - interval '40 days'),
    (old_recent, uid, 'RETENTIONTEST old but active',    now() - interval '40 days'),
    (empty_29,   uid, 'RETENTIONTEST empty 29 days',     now() - interval '29 days'),
    (empty_31,   uid, 'RETENTIONTEST empty 31 days',     now() - interval '31 days'),
    (empty_new,  uid, 'RETENTIONTEST empty new',         now());
  insert into public.zippy_messages (conversation_id, role, content, created_at) values
    (old_only,   'user',      'old', now() - interval '39 days'),
    (old_only,   'assistant', 'old', now() - interval '39 days'),
    (old_recent, 'user',      'old', now() - interval '39 days'),
    (old_recent, 'user',      'new', now() - interval '1 day');
  insert into public.zippy_usage (bucket, window_start, hits) values
    ('retentiontest:old', now() - interval '3 days', 1),
    ('retentiontest:new', now() - interval '1 hour', 1);

  select count(*) into orders_before from public.orders;

  -- dry run: reports at least the fakes, deletes nothing
  select * into r from public.purge_zippy_chats(30, true);
  if r.conversations < 2 or r.messages < 2 or r.usage_rows < 1 then
    raise exception 'dry run counts too low: %', r;
  end if;
  select count(*) into n from public.zippy_conversations where title like 'RETENTIONTEST%';
  if n <> 5 then raise exception 'dry run deleted conversations (% left)', n; end if;
  select count(*) into n from public.zippy_usage where bucket like 'retentiontest:%';
  if n <> 2 then raise exception 'dry run deleted usage rows'; end if;

  -- invalid windows are rejected
  failed := false;
  begin perform public.purge_zippy_chats(0, true); exception when others then failed := true; end;
  if not failed then raise exception 'retention 0 was accepted'; end if;
  failed := false;
  begin perform public.purge_zippy_chats(3651, true); exception when others then failed := true; end;
  if not failed then raise exception 'retention 3651 was accepted'; end if;

  -- real purge
  select * into r from public.purge_zippy_chats(30, false);
  if r.conversations < 2 or r.messages < 2 then raise exception 'purge counts too low: %', r; end if;

  if exists (select 1 from public.zippy_conversations where id in (old_only, empty_31)) then
    raise exception 'expired conversations survived';
  end if;
  select count(*) into n from public.zippy_conversations where id in (old_recent, empty_29, empty_new);
  if n <> 3 then raise exception 'active or young conversations were deleted (% left)', n; end if;
  if exists (select 1 from public.zippy_messages where conversation_id = old_only) then
    raise exception 'messages of a purged conversation survived';
  end if;
  select count(*) into n from public.zippy_messages where conversation_id = old_recent;
  if n <> 2 then raise exception 'messages of a kept conversation were deleted'; end if;
  if exists (select 1 from public.zippy_usage where bucket = 'retentiontest:old') then
    raise exception 'old usage row survived';
  end if;
  if not exists (select 1 from public.zippy_usage where bucket = 'retentiontest:new') then
    raise exception 'new usage row was deleted';
  end if;

  select count(*) into orders_after from public.orders;
  if orders_before <> orders_after then raise exception 'orders changed'; end if;
  if not exists (select 1 from auth.users where id = uid) then raise exception 'user was deleted'; end if;

  raise notice 'zippy retention checks passed';
end;
$$;

rollback;
