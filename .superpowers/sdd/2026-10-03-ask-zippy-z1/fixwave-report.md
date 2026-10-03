
# Fix wave report

1. claude.ts: thinking {type:"between_tools"}, max_tokens 1500; sse.ts returns stopReason from message_delta; streamClaude throws on refusal or zero text deltas. 2 new... tests (stopReason) in zippy-prompt.test.mjs.
2. chat route: empty reply -> 502/nothing saved (non-stream); non-stream save wrapped in try/catch; stream empty reply -> ZIPPY_ERROR_MESSAGE, not saved.
3. Migration 30 applied via `npx supabase migration up --local`. The plain ALTER FUNCTION ... SET hnsw.iterative_scan failed first with `permission denied to set parameter "hnsw.iterative_scan" (SQLSTATE 42501)` because pgvector (0.8.2) is not loaded yet in the session. Fix kept iterative_scan: migration first runs `select '[1]'::extensions.vector;` to load the library. Evidence: proconfig = {search_path=public, extensions,hnsw.iterative_scan=strict_order}; count for ['admin','all'], 8 = 8; count for ['vendor'], 8 = 8. (Before applying the migration, the ALTER was also run directly once in psql with the same effect; migration is idempotent.)
4. mobile/lib/zippy.ts: 30 s AbortController timeout, timer cleared in finally; abort -> ZippyError(ZIPPY_ERROR_MESSAGE, 0).
5. caller.ts: profile query error (non PGRST116) and thrown errors -> 502; chat route maps 401 -> SIGN_IN_AGAIN_MESSAGE, else ZIPPY_ERROR_MESSAGE; conversations routes pass status through.
6. validate.ts: >50 history items or >8000 total chars rejected (+test); widget and ZippyFab slice(-MAX_HISTORY_MESSAGES).
7. request.signal forwarded to streamClaude/fetch; stream catch/close wrapped in try/catch; aborts not logged as model failures.

Verification: node --test tests/*.test.mjs = 132 pass, 0 fail; root and mobile `tsc --noEmit` clean.
