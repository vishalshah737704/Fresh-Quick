-- Ask Zippy chat retention. Deletes saved Zippy conversations (their messages
-- go by on delete cascade) whose last activity is older than the retention
-- window, plus stale zippy_usage rate-limit rows (older than 2 days; the
-- longest rate-limit window is one day, so the live limiter never reads them).
-- It touches ONLY zippy_conversations, zippy_messages and zippy_usage: never
-- auth.users, orders, payments, carts, addresses or the knowledge/catalog
-- tables. Last activity = newest message created_at, or the conversation's own
-- created_at when it has no messages. A dry run (the default) deletes nothing
-- and returns the counts that WOULD be deleted. Called only by the service role.

create or replace function public.purge_zippy_chats(
  p_retention_days int,
  p_dry_run boolean default true
)
returns table (conversations int, messages int, usage_rows int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff timestamptz;
  expired uuid[];
  message_count int;
  usage_count int;
  conversation_count int;
begin
  if p_retention_days is null or p_retention_days < 1 or p_retention_days > 3650 then
    raise exception 'retention days must be between 1 and 3650';
  end if;
  cutoff := now() - make_interval(days => p_retention_days);

  select coalesce(array_agg(c.id), '{}')
    into expired
    from public.zippy_conversations c
   where coalesce(
           (select max(m.created_at) from public.zippy_messages m where m.conversation_id = c.id),
           c.created_at
         ) < cutoff;

  if p_dry_run then
    conversation_count := coalesce(cardinality(expired), 0);

    select count(*)::int into message_count
      from public.zippy_messages m
     where m.conversation_id = any (expired);

    select count(*)::int into usage_count
      from public.zippy_usage u
     where u.window_start < now() - interval '2 days';
  else
    -- Lock the candidates, then re-check idleness inside the delete so a chat
    -- that received a message since the scan above is never deleted.
    perform 1 from public.zippy_conversations c where c.id = any (expired) for update;

    select count(*)::int into message_count
      from public.zippy_messages m
     where m.conversation_id in (
       select c.id from public.zippy_conversations c
        where c.id = any (expired)
          and coalesce(
                (select max(m2.created_at) from public.zippy_messages m2 where m2.conversation_id = c.id),
                c.created_at
              ) < cutoff
     );

    delete from public.zippy_conversations c
     where c.id = any (expired)
       and coalesce(
             (select max(m.created_at) from public.zippy_messages m where m.conversation_id = c.id),
             c.created_at
           ) < cutoff;
    get diagnostics conversation_count = row_count;

    delete from public.zippy_usage u where u.window_start < now() - interval '2 days';
    get diagnostics usage_count = row_count;
  end if;

  return query select conversation_count, message_count, usage_count;
end;
$$;

revoke all on function public.purge_zippy_chats(int, boolean) from public, anon, authenticated;
grant execute on function public.purge_zippy_chats(int, boolean) to service_role;
