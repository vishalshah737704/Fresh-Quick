# Zippy Streaming Implementation Plan

> Spec (binding): `docs/superpowers/specs/2026-10-04-zippy-streaming-design.md`. Execute with `superpowers:subagent-driven-development`.

**Global constraints:** node-testable modules cannot value-import siblings (node needs `.ts` extensions, `tsconfig.json` forbids them); `agent.ts` and `tools.ts` are `server-only` and untestable by node; shared client files have byte-identical copies in `mobile/lib/` guarded by `tests/zippy-parity.test.mjs` (add the new parser to its list); no package installs; never stage `tsconfig.json`, `.superpowers` or `md_version`; commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; run `node --test tests/*.test.mjs`, `npx tsc --noEmit` and `cd mobile && npx tsc --noEmit` before each commit.

## Task 1: Agent loop events and streamed rounds

Files: `lib/zippy/agent-loop.ts`, `lib/zippy/agent.ts`, `tests/zippy-agent-loop.test.mjs`.
- `runAgentLoop` yields `AgentEvent = {type:"delta",text} | {type:"reset"} | {type:"final",text}`. `LoopDeps.runRound(messages, withTools, onDelta)` receives a callback for streamed text; the loop forwards deltas as `delta` events as they arrive (use an internal async queue so deltas are yielded while the round is still running), emits `reset` if the round streamed any text and ended with tool calls to run, and yields `final` with the round's full text on the last round. Same error behaviour as now (refusal, max_tokens with tool calls, empty final text, per-tool failure, call cap).
- `agent.ts` `runRound` uses `anthropic.messages.stream(params, {signal})`, `stream.on("text", onDelta)` and `await stream.finalMessage()`; `runAgent` yields the events.
- Update the existing loop tests to the new event shape and add: delta-then-final ordering, reset on a tool round that streamed text, no reset when no text was streamed, final text equals concatenated deltas of the last round, errors propagate.

## Task 2: Route, NDJSON encoder, validate

Files: `app/api/zippy/chat/route.ts`, new `lib/zippy/stream-events.ts` (pure: event types, `encodeEvent(event): string` (JSON + newline) and `createLineParser(): (chunk: string) => StreamEvent[]` that buffers partial lines, skips malformed lines, ignores unknown event types), `lib/zippy/validate.ts` (only if needed), tests `tests/zippy-stream-events.test.mjs`.
- Non-stream path: iterate `runAgent` and use the `final` event text. Stream path returns `application/x-ndjson` with `Cache-Control: no-store`, emits events as described in the spec (`delta`, `reset`, then `done` with `reply`, `conversationId`, `actions`, or `error` with the friendly message). Save the assistant message once from the final text after success; do not save on error/abort. `actionsEnabled` no longer includes `!stream` (update the comment). Remove the legacy plain-text stream branch and the `X-Zippy-Conversation-Id` header path. Keep disconnect handling (`request.signal`) and every existing error path/status.
- Tests for the encoder and parser (partial lines across chunks, malformed line skipped, unknown type ignored, done with actions).

## Task 3: Web client

Files: `lib/zippy/client-api.ts` (replace `streamChat`/`sendChat` usage so the widget streams; keep `sendChat` for tests/fallback), `components/zippy/ZippyWidget.tsx`.
- `streamChat({message, conversationId, history, location, cart, signal, onDelta, onReset})` posts `stream: true` with the cart snapshot, reads the body with the shared line parser, calls `onDelta`/`onReset`, resolves with `{reply, conversationId, actions}` from `done`, throws a `ZippyError` carrying the message on `error` events or a non-ok response.
- Widget: the assistant bubble grows as deltas arrive; `reset` clears it; `done` replaces the text with `reply` and attaches `actions`; errors keep the current error-bubble behaviour; cancel/new chat/history and Z4a/Z4b invariants unchanged (message ids, per-card state in the widget, no empty bubble, executed-ids). Show the thinking state until the first delta.
- tsc silent.

## Task 4: Mobile client

Files: `mobile/lib/zippy.ts`, `mobile/lib/stream-events.ts` (byte-identical copy of `lib/zippy/stream-events.ts`), `mobile/components/ZippyFab.tsx`, `tests/zippy-parity.test.mjs` (add the pair).
- `streamChat` using `import { fetch } from "expo/fetch"` with the same event handling and the same request body (`stream: true`, cart snapshot, location); on failure to obtain a readable stream fall back to the existing `sendChat`. Keep the 60 s timeout behaviour (abort controller).
- `ZippyFab` renders growing text, reset, done, error exactly as web; Z4a/Z4b invariants unchanged. tsc (mobile) silent.

## Task 5: Knowledge and docs

- If knowledge answers say Zippy replies appear all at once, correct them; check `knowledge/` and both manuals' Ask Zippy chapters for statements about waiting/one piece (edit in place with python-docx; PDFs regenerate with LibreOffice only if a manual changes; renumber static TOC only if page starts change). README/CLAUDE.md/MEMORY.md entries (and the stale 'answer arrives in one piece' sentence in CLAUDE.md's Z2 paragraph).

## Task 6: Live verification (controller)

curl the stream (incremental delta timing, done equals the concatenated final text), a lookup question (reset behaviour), a cart-card request (card in done), an error case (bad token for a signed-in request, missing message), an abort mid-stream (no saved assistant message), a real-browser run showing text growing and a Confirm card at the end; throwaway customer, cleanup to baseline counts (orders 2, order_items 5, payments 2, customers 3, auth_users 85). Never place an order.

## Task 7: Final review and PR

Final whole-branch review on the most capable model, one fix wave, scoped re-review, push, PR. Merge only on Vishal's "you merge it".
