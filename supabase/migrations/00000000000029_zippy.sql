-- Ask Zippy (help chatbot) storage. All four tables are read and written only
-- by service-role API routes, so RLS is enabled with NO client policies:
-- anon/authenticated get nothing, service_role bypasses RLS.

create extension if not exists vector with schema extensions;

create table public.zippy_chunks (
  id uuid primary key default gen_random_uuid(),
  chunk_key text not null unique,
  source text not null check (source in ('manual', 'faq', 'guide', 'policy', 'menu')),
  audience text not null check (audience in ('all', 'customer', 'vendor', 'delivery', 'admin')),
  title text not null,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(1536) not null,
  updated_at timestamptz not null default now()
);
create index zippy_chunks_embedding_idx
  on public.zippy_chunks using hnsw (embedding extensions.vector_cosine_ops);
alter table public.zippy_chunks enable row level security;

create table public.zippy_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now()
);
create index zippy_conversations_user_idx
  on public.zippy_conversations (user_id, created_at desc);
alter table public.zippy_conversations enable row level security;

create table public.zippy_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.zippy_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
create index zippy_messages_conversation_idx
  on public.zippy_messages (conversation_id, created_at);
alter table public.zippy_messages enable row level security;

create table public.zippy_usage (
  bucket text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket, window_start)
);
alter table public.zippy_usage enable row level security;

create or replace function public.match_zippy_chunks(
  query_embedding extensions.vector(1536),
  caller_audiences text[],
  match_count int
)
returns table (id uuid, title text, content text, source text, similarity float)
language sql
stable
set search_path = public, extensions
as $$
  select c.id, c.title, c.content, c.source,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.zippy_chunks c
  where c.audience = any (caller_audiences)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- Atomically counts one hit in the current fixed window; false once over limit.
create or replace function public.zippy_hit(
  p_bucket text,
  p_window_seconds int,
  p_limit int
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  w timestamptz;
  h int;
begin
  w := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.zippy_usage as u (bucket, window_start, hits)
  values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = u.hits + 1
  returning u.hits into h;
  if random() < 0.01 then
    delete from public.zippy_usage where window_start < now() - interval '2 days';
  end if;
  return h <= p_limit;
end;
$$;

revoke all on function public.match_zippy_chunks(extensions.vector, text[], int)
  from public, anon, authenticated;
grant execute on function public.match_zippy_chunks(extensions.vector, text[], int) to service_role;
revoke all on function public.zippy_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.zippy_hit(text, int, int) to service_role;
