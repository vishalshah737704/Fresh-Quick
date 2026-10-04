# Ask Zippy in n8n: can ingestion and retrieval move out of Next.js?

Date: 2026-10-04. Question from Vishal: can Zippy ingestion be done completely in n8n using the AI Agent with PGVector, and can retrieval also use n8n instead of Next.js? This is a feasibility spike: the output is a recommendation, not code. Facts below were checked against the local n8n container (version 2.40.7) and the repository on 2026-10-04.

## Short answer

- **Ingestion in n8n: possible, but not recommended now.** It can be built entirely from n8n nodes, but it needs a schema change, loses the incremental (hash-based) updates the app has today, and needs a change to how the n8n container is started. The gain is small because n8n already orchestrates ingestion (workflows 06 and 07 only trigger the app).
- **Retrieval in n8n: possible for the knowledge search, not recommended for the chat itself.** Moving the whole chat into an n8n AI Agent would remove guarantees the app enforces in code and tests (identity from the session token, order privacy, cart and checkout cards, rate limits, the streaming protocol).
- **If the goal is to learn or demonstrate n8n's RAG nodes,** build a separate, parallel demo workflow on its own table (see "Option C"); it does not touch production Zippy.

## What n8n 2.40.7 has (verified in the container)

- Vector stores: **Postgres PGVector Store** (`VectorStorePGVector`) and **Supabase Vector Store** (`VectorStoreSupabase`, with insert and load variants), plus others.
- **OpenAI Embeddings** node (`text-embedding-3-small` selectable), **Default Data Loader**, **Recursive Character Text Splitter**, a **GitHub document loader**, a **JSON/binary input loader**.
- **AI Agent** node (V3) with tool, memory and vector-store-as-tool connections; a Chat Trigger with streaming support.
- The n8n container can reach the Supabase Postgres port (`host.docker.internal:54322` is reachable from inside the container).
- The PGVector node lets you set the table name, the column names (id, content, metadata, vector) and the distance strategy, and supports a metadata filter.

## How Zippy works today (what would have to be matched)

- Ingestion: workflow 06 posts to `/api/internal/zippy/ingest`; the app reads `knowledge/**/*.md`, chunks by heading, hashes each chunk, embeds only changed chunks (OpenAI key stays in the app) and upserts into `zippy_chunks` (columns `chunk_key` unique, `source`, `audience`, `title`, `content`, `content_hash`, `embedding`, `updated_at`, all NOT NULL), deleting chunks whose source disappeared. Workflow 07 does the same for the store and dish catalog (`zippy_catalog_chunks`), nightly.
- Retrieval: `POST /api/zippy/chat` embeds the question, calls `match_zippy_chunks(query_embedding, caller_audiences, count)` (audience filter by role) and the catalog match, hydrates live prices and open status from the database, then runs a bounded Claude tool loop with twelve tools (four catalog lookups, two order lookups, six cart and checkout tools), cart and checkout card builders, and now streams NDJSON events.

## Option A: ingestion fully in n8n

What it takes:
1. **Get the files into n8n.** The knowledge folder is not visible to the container. Either mount `knowledge/` into the container (the container is started with `--rm` and a fixed `docker run`, so this means recreating it by hand with an extra `-v`; never stop it casually) or read the files with the GitHub loader (needs a repository credential and only sees what is pushed).
2. **Schema.** The n8n PGVector node writes id, content, metadata and vector only. `zippy_chunks` has five more NOT NULL columns, so the insert would fail. Use a new table (for example `zippy_chunks_n8n` with `metadata jsonb` carrying `source`, `audience`, `title`) and change `match_zippy_chunks` and the retrieval code to read it, or add column defaults and triggers that derive the extra columns from `metadata`. Either way it is a migration plus a retrieval change.
3. **Audience filtering** must move into a metadata filter on the match function (the app filters by role in SQL today).
4. **Incremental updates and deletes.** The node has no content-hash skip: every run would re-embed all chunks (about 150 for knowledge, about 3000 for the catalog) or you would build the diff yourself with Code nodes. Removed files are not deleted unless you add a clear step.
5. **Catalog ingestion** (stores and dishes from Postgres, text built from names, descriptions, categories and cuisine labels, never prices) is a SQL node plus Code node job; doable.
6. **Secrets and tests.** The OpenAI key would live in an n8n credential instead of `.env.local`. The current chunking and ingestion logic has unit tests; an n8n workflow can only be tested by running it.

Verdict: feasible, roughly a day of work plus a migration, with less functionality than today (no hash skip, no delete) and more operational coupling (container mount, credentials). Not worth doing unless the aim is to remove OpenAI access from the app entirely.

## Option B: retrieval and chat in n8n

Two variants:
- **B1: only the knowledge search in n8n.** Next.js would call an n8n webhook that embeds the question and queries pgvector, then continue as today. This adds a network hop and a second place that must stay in sync with the schema and audience rules, with no new capability. Not recommended.
- **B2: the whole chat as an n8n AI Agent workflow.** n8n can host an agent with tools (HTTP Request nodes calling the app's internal routes) and a vector-store tool. What would be lost or have to be rebuilt:
  - **Identity and privacy.** The app derives the customer id only from the verified session token and filters every order query on it. n8n would have to verify the token (an extra call) and pass identity to tools; the internal secret makes n8n fully trusted, so any workflow bug becomes a privacy bug.
  - **Cart and checkout cards**, their validation, live checks, the one-card rules and the prompt rules are TypeScript with about 290 tests; they would need to stay in the app behind tool endpoints anyway.
  - **Streaming protocol** (NDJSON deltas, reset, done with cards) and the clients that consume it; n8n's streaming format differs.
  - **Rate limits, body caps, abort handling, conversation storage and the kill switches** all live in the route today.
  - **Latency and observability:** two hops, and failures show up in n8n executions instead of the app's logs.
- Verdict: not recommended. It is the highest-risk, lowest-reward change.

## Option C (recommended if you want to explore n8n RAG): a parallel demo

Build a separate workflow, not wired into the app: Manual or webhook trigger, GitHub or mounted-file loader for a few knowledge files, Default Data Loader, Recursive Character Text Splitter, OpenAI Embeddings, PGVector Store (insert) into a new table `zippy_n8n_demo`; a second workflow with a Chat Trigger, an AI Agent and the PGVector Store as a tool, answering from that table. It shows exactly what n8n can do, costs a few cents, and cannot affect production Zippy. If it proves valuable later, the schema and audience questions above are already answered.

## Recommendation

1. Keep chat, retrieval and tools in Next.js (decided by the privacy, card and protocol requirements).
2. Keep ingestion in the app with n8n as the scheduler/trigger (as workflows 06, 07 and now 08 do).
3. If you want hands-on n8n RAG, ask for Option C (separate table, separate workflows, no production impact).
