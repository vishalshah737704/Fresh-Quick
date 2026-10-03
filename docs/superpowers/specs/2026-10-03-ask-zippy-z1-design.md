# Ask Zippy — Chatbot Design (Sub-project Z1: Foundation + Help Q&A)

Date: 2026-10-03. Status: draft for review.

## 1. Goal

"Ask Zippy" is an in-app AI assistant for Fresh & Quick, on the web portals (customer, vendor, delivery, admin) and the mobile app (customer, delivery). It answers questions about how to use the app, from a vector knowledge base, and is designed so later sub-projects can add live lookups, personal order data and actions.

Success for Z1: a user (signed in or not) opens the floating Zippy bubble, asks a how-to question, and gets a streamed, accurate answer grounded in the knowledge base. Unknown questions get an honest "I'm not sure" plus a pointer to the Help page (the app has no support contact; see Amendments). Signed-in users keep their chat history across web and mobile.

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Name | "Ask Zippy" (assistant: Zippy) |
| Ambition | Eventually a full agent: help Q&A, live lookups, own orders, actions (cancel, reorder, add to cart, place order and pay) |
| Build order | Z1 Foundation + Help Q&A, Z2 Live lookups, Z3 My orders, Z4 Actions. Each has its own spec, plan, build and merge to `main`. This document covers Z1 only |
| LLM | Claude API, server-side key |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dimensions), server-side key |
| Vector store | pgvector inside the existing local Supabase Postgres (no hosted services, per the project rule) |
| Chat logic location | Next.js API route `/api/zippy/chat`. n8n is used only for knowledge ingestion |
| Access | Everyone can ask help questions. Orders and actions (Z3, Z4) require sign-in |
| History | Saved per signed-in user. Visitors get a temporary in-memory chat |
| UI | Floating bubble opening a chat panel (web) or full-screen sheet (mobile) |
| Action safety (Z4) | Claude only proposes. A tap-to-confirm card calls the existing API with the user's token |

## 3. Knowledge sources

All source material is Markdown under `knowledge/` in the repo, so it is versioned and reviewable. Each file has front matter: `source` (manual, faq, guide, policy, menu), `audience` (all, customer, vendor, delivery, admin) and `title`.

Z1 content:
- User manuals (web and mobile), converted from the existing `.docx` files.
- A new FAQ written for Zippy (delivery fees, cancellation, payment, refunds, support contact), drafted for Vishal's review.
- Per-role guides for vendor, delivery partner and admin.
- Order lifecycle guide: what each of the 6 statuses means, and how the delivery animation and automatic completion behave.
- Troubleshooting (login, address, payment problems), a glossary, and privacy/terms/contact.

Restaurant and menu data is added in Z2 (it changes often and needs a re-sync), not Z1.

Never included: secrets, `.env` values, CLAUDE.md or MEMORY.md content, internal developer notes.

## 4. Architecture

```
Web bubble / Mobile sheet
   | optional Bearer token
   v
POST /api/zippy/chat   (Next.js, server-only)
  1. resolve caller (anonymous, or role + user id from the verified token)
  2. rate limit
  3. embed the question, search pgvector (audience in all + caller role)
  4. call Claude with the retrieved chunks, stream the reply
  5. persist messages for signed-in users

n8n "Zippy ingestion" workflow 06 (separate)
  webhook/cron trigger -> POST /api/internal/zippy/ingest
  (the app reads knowledge/*.md, chunks by heading, hash-checks, embeds with
  OpenAI and upserts; the OpenAI key stays in the app)
```

n8n calls back into the app with `host.docker.internal` and the internal-secret header, the same pattern as the existing workflows 03 to 05. No real credential id is committed.

## 5. Data model (migration 29)

- `zippy_chunks`: `id`, `source`, `audience`, `title`, `content`, `content_hash`, `embedding vector(1536)`, `updated_at`. RLS enabled with no client policies. Accessed only through service-role server code.
- `zippy_conversations`: `id`, `user_id` (references `auth.users`, cascade delete), `title`, `created_at`. RLS enabled with no client policies (service-role only).
- `zippy_messages`: `id`, `conversation_id`, `role` (user or assistant), `content`, `source_ids`, `created_at`. RLS enabled with no client policies (service-role only).
- `zippy_usage`: rate-limit counters keyed by user id or IP hash, with a time window.

Per project rules: no RLS write policies on tables written only by service-role routes; list existing policies on any table touched; no self-referential policies.

Search is a SQL function `match_zippy_chunks(query_embedding, caller_audiences, match_count)` using cosine distance and an HNSW index.

## 6. Chat behavior

- Retrieve the top 5 chunks, filtered to audience `all` plus the caller's role. Anonymous callers get `all` and `customer`.
- Claude answers only from the retrieved chunks and cites titles. If the best similarity is below a threshold, Zippy says it is not sure and points to support instead of guessing.
- Retrieved text is treated as data, never as instructions.
- Replies stream to the client.
- Limits: about 20 messages per minute and a daily cap per signed-in user, and per IP for visitors. Exceeding returns a friendly message.
- History: signed-in users get a conversation list and "New chat". Visitors' chats are not saved.

## 7. UI

- Web: orange Zippy bubble, bottom-right, on all four portals and the login pages. On customer pages it sits above the cart. The panel has the message list, input, three suggested-question chips, "New chat" and history for signed-in users.
- Mobile (Customer and Delivery): floating button opening a full-screen chat sheet with the same behavior.
- Styling uses `lib/branding.ts` and the existing tokens (`app/globals.css`, `mobile/theme.ts`). No hardcoded colors or names.
- Message types and labels are shared between web and mobile, with a parity test in the style of `tests/mobile-parity.test.mjs`.
- The web widget is mounted once in the root layout and tracks the session itself (see Amendments).

## 8. Security

- `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` live only in `.env.local`, with placeholders in `.env.example`. Server files import them behind the `server-only` guard.
- Caller identity comes only from a verified session token, never from the request body.
- Role-filtered retrieval means a customer never receives vendor or admin guides.
- The internal ingest and search routes require the internal secret.

## 9. Error handling

- OpenAI, Claude or database failure shows "Zippy is resting, please try again" (no support link; the app has none). Errors are logged server-side and never silently swallowed.
- Empty or very long input is rejected with a clear message and a length cap.

## 10. Testing and verification

- Unit tests: chunking, role filtering, similarity threshold, rate limiting, message-model parity.
- `npm run build`, `tsc`, lint.
- Live: curl the chat route (anonymous and signed-in), drive the bubble in Playwright on all four web portals, and run the mobile sheet on the phone.
- Quality set: about 30 known questions, each with its expected source chunk, run after every ingestion change.
- No test sends real Gmail, and test orders are not needed in Z1.

## 11. Out of scope for Z1

Live store and menu lookups (Z2), personal order data (Z3), any state-changing action (Z4), voice input, multi-language support, admin analytics for chats.

## 12. Open items for Vishal

- Provide an OpenAI API key and an Anthropic API key (never pasted into chat; added to `.env.local`).
- Review the drafted FAQ for factual accuracy.
- Confirm the daily message cap per user.

## 13. Amendments (2026-10-03, as built)

These record where the build departed from the sections above. Where cheap, the statement above was also corrected inline.

- **Ingestion (sections 4, 5).** n8n workflow 06 only triggers `POST /api/internal/zippy/ingest`. The app reads `knowledge/**/*.md`, chunks by heading, hashes, embeds and upserts. The app, not n8n, holds the OpenAI key. The route refuses to run (500, nothing deleted) when `knowledge/` is missing or empty.
- **RLS (section 5).** `zippy_conversations` and `zippy_messages` have no owner-read policies: deny-all, service-role only, reached through `/api/zippy/conversations`. `zippy_conversations` has a `title` column.
- **Front matter (section 3).** `source` is one of `manual | faq | guide | policy | menu`.
- **Widget placement (section 7).** The widget is mounted once in the ROOT layout, not in the route-group shells, and tracks the session itself. The bubble sits beside the basket sidebar only when a basket is shown, done in pure CSS via `data-basket-panel` and `:has()`.
- **No support link (sections 1, 6, 9).** The app has no support contact, terms, privacy page or refund window. Error text carries no support link; Zippy points to the Help page and never promises a human, phone or email.
- **Added routes.** `/api/internal/zippy/search` (retrieval for the eval script), `/api/zippy/conversations` and `/api/zippy/conversations/[id]` (history list and resume).
- **Migration 30.** `match_zippy_chunks` is altered to `set hnsw.iterative_scan = strict_order`, because the audience filter runs after the approximate HNSW scan and could otherwise return fewer than 5 rows for selective audiences (vendor, admin).
- **Mobile (sections 6, 7).** Mobile shows the full reply after a typing indicator (non-streaming, 60 s timeout). Web streams.
- **Rate limits (section 6).** Signed-in: 20/min and 100/day. Visitors: 10/min and 40/day per IP (rightmost `x-forwarded-for` entry), plus a global visitor backstop of 60/min and 1000/day. Adjustable in `lib/zippy/rate-limit.ts`.
- **History caps.** At most 50 history items, 8000 characters per item and 40000 characters in total over the last 10 turns. `max_tokens` is 1500.
- **Claude call.** Raw `fetch` (no SDK, because installing packages needs approval) to `claude-sonnet-5-5` with `thinking: {type: "between_tools"}`. Omitting `thinking` runs adaptive thinking at effort high, which consumes `max_tokens` and truncates replies. `ANTHROPIC_API_KEY` must be a workspace-scoped key on an account with credits; a credit-balance error comes back as HTTP 400 and is logged server-side.
- **Security note.** Visitors can send arbitrary prior `assistant` turns in `history` for their own chat. Accepted: it only influences their own conversation, and cost is capped by the rate limits.
