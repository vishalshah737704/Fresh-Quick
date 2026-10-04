# Zippy Retention Purge Implementation Plan

> Spec (binding): `docs/superpowers/specs/2026-10-04-zippy-retention-design.md`. Execute with `superpowers:subagent-driven-development`.

**Global constraints:** node-testable modules cannot value-import siblings (node needs `.ts` extensions); route files and `server-only` modules are not importable by node tests; follow the existing internal-route pattern (`app/api/internal/zippy/catalog-sync/route.ts`, `lib/internal-auth.ts`); no package installs; never stage `tsconfig.json`, `.superpowers` or `md_version`; do NOT apply the migration to the local database (the controller applies and live-tests it); commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; run `node --test tests/*.test.mjs`, `npx tsc --noEmit` and `cd mobile && npx tsc --noEmit` before each commit. Never run the purge function against real data.

## Task 1: Migration, retention helper, internal route

Files: new `supabase/migrations/00000000000032_zippy_retention.sql`, new `lib/zippy/retention.ts` (pure, no imports: `parseRetentionDays(raw: unknown, fallback = 30): number` accepts integers 1 to 3650 (numbers or numeric strings), anything else returns the fallback; `parseDryRun(body: unknown): boolean` true unless the body is an object with `dryRun === false`; export `DEFAULT_RETENTION_DAYS = 30`), new `app/api/internal/zippy/purge/route.ts`, new `tests/zippy-retention.test.mjs`.
- SQL function exactly as in spec decision 5 and 6: `public.purge_zippy_chats(p_retention_days int, p_dry_run boolean default true) returns table (conversations int, messages int, usage_rows int)`; raise an exception when `p_retention_days < 1`; select the expired conversation ids (last activity = coalesce(max(message created_at), conversation created_at) older than `now() - make_interval(days => p_retention_days)`), count their messages, count `zippy_usage` rows with `window_start < now() - interval '2 days'`; when not a dry run delete the conversations (messages cascade) and the stale usage rows, in one statement-level transaction; `language plpgsql`, `security definer`, `set search_path = ''` with fully qualified names; `revoke all on function ... from public, anon, authenticated; grant execute ... to service_role;` (use the full argument list in revoke/grant). Header comment explains scope.
- Route: `POST`, `verifyInternalSecret`, body optional JSON (tolerate empty/invalid body = dry run), `days = parseRetentionDays(process.env.ZIPPY_RETENTION_DAYS)`, call `supabaseServer.rpc("purge_zippy_chats", { p_retention_days: days, p_dry_run: dryRun })`, return `{ dryRun, retentionDays: days, conversations, messages, usageRows }`; errors: log server-side, return 500 with a short message (no stack).
- Tests: parseRetentionDays (valid ints, numeric strings, 0, -1, 3651, 1.5, NaN, null, undefined, "abc" => fallback) and parseDryRun.

## Task 2: n8n workflow 08 and its guard test

Files: new `n8n/workflows/08-zippy-chat-retention.json`, new `tests/zippy-retention-n8n.test.mjs`, `docs/n8n-webhook-setup.md` (add a short section like the existing ones for 06/07).
- Mirror `07-zippy-catalog-sync.json`: webhook `foodhub/zippy-purge` (POST; unique webhookId), schedule trigger nightly `45 3 * * *`, one HTTP Request node POST `={{$env.APP_BASE_URL}}/api/internal/zippy/purge` with header `X-Internal-Secret` from `$env.N8N_INTERNAL_SECRET`. The webhook passes its body through (`sendBody` JSON `{ "dryRun": {{ $json.body && $json.body.dryRun === false ? false : true }} }`); the schedule branch must send `{"dryRun": false}`: use two small Set/Code-free options: either two HTTP nodes (one per trigger, dry run for webhook, real for schedule) or one node whose body expression distinguishes the trigger; choose two HTTP nodes for clarity. `"active": false`, no credentials, no secrets, notes explaining the dry-run default of the webhook and that the schedule really deletes.
- Guard test like `tests/zippy-catalog-n8n.test.mjs` adapted (triggers, paths, cron, urls, secret header via `$env`, no credentials/real tokens, webhook branch sends dryRun true by default and the schedule branch sends false).

## Task 3: Policy text and docs

Files: `knowledge/policy/privacy-terms-contact.md` (line ~44 retention bullet), `knowledge/glossary.md` / customer FAQ if they mention retention (grep), both manuals if they mention retention (edit in place; PDFs and TOC only if changed), README.md, CLAUDE.md (the rule saying no purge job exists and the soft wording: update it to the new truth), MEMORY.md entry.
- New policy wording: Zippy chats are deleted automatically 30 days after their last message; orders are kept and may be deleted on request (contact support, use the existing contact text unchanged). Keep Vishal's real contact text as is, do not duplicate it elsewhere. Knowledge facts must match the code. Note a re-ingest is needed after merge and that Vishal must import and publish workflow 08 (never stop or restart the n8n container) and run a dry run first (`Invoke-RestMethod -Method Post http://localhost:5678/webhook/foodhub/zippy-purge`).

## Task 4: Live verification (controller)

Apply migration 32 to the local DB with psql; fake throwaway rows only; scenarios in the spec's Testing section; internal-secret auth: the controller cannot read `.env*` or the n8n secret, so the route is tested live only for the 401 (no header) and via the SQL function directly with `psql`; the 200 path of the route is checked by Vishal after merge (dry-run webhook). Counts back to baseline.

## Task 5: Final review and PR

Final whole-branch review, one fix wave, scoped re-review, push, PR. Merge only on Vishal's "you merge it".
