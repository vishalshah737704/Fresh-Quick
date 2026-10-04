# Ask Zippy: 30-day chat retention purge

Date: 2026-10-04. Approved to run autonomously by Vishal ("make your judgement"); decisions below were taken by the controller and are listed so they can be corrected.

## Intent

`knowledge/policy/privacy-terms-contact.md` says "orders and Zippy chats may be deleted after 30 days. Deletion is not automatic" because no purge job exists. Build the job so the promise is real for Zippy chats. Success: saved Zippy conversations and their messages are deleted automatically once they have had no activity for 30 days; nothing else is deleted; the job can be tried safely (dry run); the policy text says what actually happens.

## Decisions

1. **Scope: Zippy chats only.** Orders are NOT purged. They are business records the vendor, delivery and admin portals, customer order history and the n8n emails depend on (and migration 28 deliberately made orders outlive customers); deleting them after 30 days is a product decision that needs Vishal's explicit call. The policy keeps the existing soft wording for orders ("may be deleted ... contact support") and states the Zippy rule precisely.
2. **Rule:** a conversation is purged when its last activity is older than the retention window. Last activity = the newest message's `created_at`, or the conversation's `created_at` when it has no messages. Messages go with it (existing `on delete cascade`). A chat the user keeps using never expires.
3. **Window:** 30 days by default; env `ZIPPY_RETENTION_DAYS` (integer 1 to 3650; anything else falls back to 30). The window is validated server-side and passed as a parameter.
4. **Also purged:** `zippy_usage` rate-limit bucket rows older than 2 days (they only matter within their window; today they grow forever).
5. **Where it runs:** a SQL function `public.purge_zippy_chats(p_retention_days int, p_dry_run boolean)` (migration 32, `security definer`, `set search_path = ''`, execute granted to `service_role` only, revoked from public/anon/authenticated) returning `{conversations, messages, usage_rows}` counts (what was deleted, or would be in a dry run). Internal route `POST /api/internal/zippy/purge` guarded by the internal secret (same pattern as ingest and catalog-sync), body `{ "dryRun": true }` optional, returns the counts. n8n workflow 08 "Zippy Chat Retention" runs it nightly at 03:45 and has a webhook (`foodhub/zippy-purge`, dry run unless the body says `{"dryRun": false}`), imported and published by Vishal (never stop or restart the n8n container; see CLAUDE.md).
6. **Safety:** the purge only ever touches `zippy_conversations`, `zippy_messages` (by cascade) and `zippy_usage`; it never touches `auth.users`, orders, payments, carts, addresses or Zippy knowledge/catalog tables. A guard rejects a retention below 1 day. Deleted data is not recoverable, so the first scheduled run is preceded by a dry run.
7. **Docs and policy:** `knowledge/policy/privacy-terms-contact.md` and the glossary/FAQ wording say Zippy chats are deleted automatically 30 days after their last message; orders are kept (contact support to have data deleted). Both manuals' Ask Zippy chapters get the sentence if they mention retention; README, CLAUDE.md (the "no purge job exists" rule), MEMORY.md updated. Knowledge needs a re-ingest by Vishal after merge.

## Out of scope

Purging orders, payments, addresses, accounts; per-user "delete my chats" buttons; anonymizing instead of deleting.

## Testing

Unit: retention parsing/validation (pure), n8n workflow JSON guard test (like workflow 07's), route auth. Live against the local DB with fake rows: a conversation with only old messages (purged), one with an old conversation but a recent message (kept), a conversation with no messages older than the window (purged) and newer (kept), usage rows older/newer than 2 days, dry run deletes nothing and returns the counts, a non-internal caller gets 401, a retention of 0 is rejected; counts back to baseline afterwards and no real data touched (use only rows created by the test with a recognizable title prefix and a throwaway user).
