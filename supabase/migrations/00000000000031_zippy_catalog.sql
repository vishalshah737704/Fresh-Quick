-- Ask Zippy Z2: embedding index of stores and dishes, used only to DISCOVER candidates.
-- Prices, fees and open status are never embedded; they are read live. Like every
-- zippy_* table this is deny-all RLS (no client policies), service-role only.

create table public.zippy_catalog_chunks (
  kind text not null check (kind in ('store', 'product')),
  ref_id uuid not null,
  content text not null,
  content_hash text not null,
  embedding extensions.vector(1536) not null,
  updated_at timestamptz not null default now(),
  primary key (kind, ref_id)
);
create index zippy_catalog_chunks_embedding_idx
  on public.zippy_catalog_chunks using hnsw (embedding extensions.vector_cosine_ops);
alter table public.zippy_catalog_chunks enable row level security;

create or replace function public.match_zippy_catalog(
  query_embedding extensions.vector(1536),
  match_count int
)
returns table (kind text, ref_id uuid, content text, similarity float)
language sql
stable
set search_path = public, extensions
as $$
  select c.kind, c.ref_id, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.zippy_catalog_chunks c
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

revoke all on function public.match_zippy_catalog(extensions.vector, int)
  from public, anon, authenticated;
grant execute on function public.match_zippy_catalog(extensions.vector, int) to service_role;
